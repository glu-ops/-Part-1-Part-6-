import { useState, useEffect, useRef, useCallback } from 'react'
import type { LatLng } from '../utils/geo'
import type { CrowdReport, SosEvent, SosLayer } from '../types'
import { getKnownPeers, saveKnownPeer } from '../utils/identity'

// F2.7-E：寫死的救災指揮中心節點 ID（/rescue 用此 ID 起 Peer）
export const RESCUE_CENTER_ID = 'tainan-guardian-rescue'

// SOS / 演變型事件接力初始 TTL（F2.7-F）
export const SOS_TTL = 6

// 位置共享更新頻率（F2.7-A）
const POS_INTERVAL_MS = 30_000

export type MeshMsgType = 'text' | 'quick' | 'sos' | 'position' | 'report' | 'profile' | 'system' | 'sosEvent'
export type { SosLayer }

export interface MeshMessage {
  msgId: string
  type: MeshMsgType
  layer?: SosLayer        // SOS 才有
  text?: string
  lat?: number
  lng?: number
  senderId: string        // 原始發送者（接力時不變）
  senderName?: string     // 發送者名稱（去正規化：每則訊息都帶，斷線後仍可顯示）
  ttl?: number            // 接力跳數
  ts: number
  // ── 演變型訊息（回報 / SOS）：用穩定 eventId + 遞增 version 去重，
  //    僅「更新版」才續傳（取代純 TTL 防循環），符合「持續通知事件演變」需求 ──
  eventId?: string
  version?: number
  report?: CrowdReport
  sos?: SosEvent
}

export interface PeerInfo {
  id: string
  connectedAt: string
  name?: string           // 對方名稱（由 profile 名片交換取得）
  online?: boolean        // 目前是否連線中（離線仍保留在清單，灰顯）
  lat?: number
  lng?: number
  posTs?: number
}

interface Options {
  /** 指定固定 ID（救災指揮中心用）；省略則 PeerJS 自動產生 */
  fixedId?: string
  /** 我的名稱（隨每則訊息附帶，供對方顯示） */
  myName?: string
  /** 我目前的位置（用於位置共享與 SOS 附帶座標） */
  myPos?: LatLng | null
  /** 收到 SOS 事件（新／演變版）→ 合併進 SOS store、toast、marker 閃爍等 */
  onSosEvent?: (s: SosEvent, fromPeerId: string) => void
  /** 收到回報（新／演變版）→ 合併進本地 store */
  onReport?: (r: CrowdReport, fromPeerId: string) => void
  /** 新連線建立時要推送給對方的同步訊息（未結案 SOS 等），達成重連同步 */
  getSyncMessages?: () => MeshMessage[]
}

function genId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Mesh P2P 核心（F2.7）：
 * - 固定身份：市民端以 localStorage 的固定 ID 起 Peer，關閉重開不變、可自動重連。
 * - 名片交換：連線即互換 {name}，UI 全程顯示名稱而非裸 ID。
 * - 多 peer 連線管理（Map<peerId, conn>），離線對象保留在清單灰顯。
 * - 位置共享：連上即送、之後每 30 秒廣播。
 * - 三層 SOS（使用者擇一發送，故同一接收者不會重複收到）：
 *   A 私人（已連線 peer）/ B 公共（寫死指揮中心）/ C 廣播（msgId 去重 + TTL 接力，並送指揮中心）。
 * - 指揮中心可沿原連線回覆（sendTo）。
 */
export function usePeerMesh({ fixedId, myName, myPos, onSosEvent, onReport, getSyncMessages }: Options = {}) {
  const isRescue = fixedId === RESCUE_CENTER_ID

  const [myId, setMyId]       = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  // 市民端：以已知對象清單初始化（離線灰顯，待自動重連）。指揮中心：空白。
  const [peers, setPeers]     = useState<PeerInfo[]>(() =>
    isRescue ? [] : getKnownPeers(fixedId ?? '').map(p => ({ id: p.id, name: p.name, connectedAt: '', online: false })),
  )
  // 聊天訊息持久化（localStorage：關閉分頁重開仍保留；以節點 ID 為 key 區分身份）
  const chatKey = `guardian_chat_${fixedId ?? 'anon'}`
  const [messages, setMessages] = useState<MeshMessage[]>(() => {
    try { return JSON.parse(localStorage.getItem(chatKey) ?? '[]') as MeshMessage[] } catch { return [] }
  })
  useEffect(() => {
    try { localStorage.setItem(chatKey, JSON.stringify(messages.slice(-200))) } catch { /* 容量不足忽略 */ }
  }, [messages, chatKey])

  const peerRef        = useRef<any>(null)
  const retryTimerRef  = useRef<ReturnType<typeof setTimeout> | undefined>(undefined) // 固定 ID 被占用 → 重試
  const connsRef       = useRef<Map<string, any>>(new Map())
  const rescueConnRef  = useRef<any>(null)        // B 層往指揮中心的連線（不列入 peers）
  const reportSeenRef  = useRef<Set<string>>(new Set()) // 演變型訊息 msgId 去重（report/sosEvent 共用）
  const greetedRef     = useRef<Set<string>>(new Set()) // 已發過「加入」系統訊息的 peer
  const myPosRef       = useRef<LatLng | null>(myPos ?? null)
  const myNameRef      = useRef(myName ?? '')
  const myIdRef        = useRef('')
  const onSosEventRef  = useRef(onSosEvent)
  const onReportRef    = useRef(onReport)
  const syncRef        = useRef(getSyncMessages)
  const registerRef    = useRef<(conn: any) => void>(() => {})
  const ensureRescueRef = useRef<() => void>(() => {})  // 市民端主動連指揮中心 hub

  useEffect(() => { myPosRef.current = myPos ?? null }, [myPos])
  useEffect(() => { myNameRef.current = myName ?? '' }, [myName])
  useEffect(() => { onSosEventRef.current = onSosEvent }, [onSosEvent])
  useEffect(() => { onReportRef.current = onReport }, [onReport])
  useEffect(() => { syncRef.current = getSyncMessages }, [getSyncMessages])

  // ── 內部工具 ──────────────────────────────────────────
  const upsertPeer = useCallback((id: string, patch?: Partial<PeerInfo>) => {
    setPeers(prev => {
      const i = prev.findIndex(p => p.id === id)
      if (i === -1) return [...prev, { id, connectedAt: new Date().toLocaleTimeString(), online: true, ...patch }]
      const next = [...prev]
      next[i] = { ...next[i], ...patch }
      return next
    })
  }, [])

  const pushLocal = useCallback((m: MeshMessage) => setMessages(prev => [...prev, m]), [])

  const pushSystem = useCallback((text: string) => {
    pushLocal({ msgId: genId(), type: 'system', text, senderId: 'system', ts: Date.now() })
  }, [pushLocal])

  const posMsg = useCallback((pos: LatLng): MeshMessage => ({
    msgId: genId(), type: 'position', lat: pos.lat, lng: pos.lng,
    senderId: myIdRef.current, senderName: myNameRef.current, ts: Date.now(),
  }), [])

  const profileMsg = useCallback((): MeshMessage => ({
    msgId: genId(), type: 'profile', senderId: myIdRef.current, senderName: myNameRef.current, ts: Date.now(),
  }), [])

  // C 層轉發給「其他」連線（防循環：已見過的 msgId 不再轉發）
  const forward = useCallback((msg: MeshMessage, exceptId: string) => {
    connsRef.current.forEach((conn, id) => {
      if (id !== exceptId && conn.open) { try { conn.send(msg) } catch { /* ignore */ } }
    })
  }, [])

  const handleData = useCallback((fromId: string, raw: any) => {
    const msg = raw as MeshMessage
    if (!msg || typeof msg !== 'object' || !msg.type) return

    // 名片交換：記住對方名稱（並持久化以利重連），首見時送系統訊息
    if (msg.type === 'profile') {
      const name = msg.senderName || fromId.slice(0, 6)
      upsertPeer(fromId, { name, online: true })
      if (!isRescue && fixedId) saveKnownPeer(fixedId, { id: fromId, name })
      if (!greetedRef.current.has(fromId)) {
        greetedRef.current.add(fromId)
        pushSystem(`${name} 已加入連線`)
      }
      return
    }

    // 位置更新：不進聊天、不轉發
    if (msg.type === 'position') {
      upsertPeer(fromId, { lat: msg.lat, lng: msg.lng, posTs: msg.ts, online: true })
      return
    }

    // 回報 / SOS（演變型）：純 msgId 去重 + ttl flooding。
    // 不再以 version 早退（version 是各節點本地遞增，並非全域單調 → 會誤丟有效的
    // safe/resolved/補充更新）。改由 store 合併（狀態取較進階、回覆/補充取聯集）保證收斂，
    // 並對每則收到的訊息「無條件續傳」給其他連線，讓狀態變化擴散到整個 mesh 與指揮中心 hub。
    if ((msg.type === 'report' && msg.eventId && msg.report) ||
        (msg.type === 'sosEvent' && msg.eventId && msg.sos)) {
      if (msg.msgId && reportSeenRef.current.has(msg.msgId)) return  // 同一則只處理/續傳一次
      if (msg.msgId) reportSeenRef.current.add(msg.msgId)
      if (msg.type === 'report' && msg.report) onReportRef.current?.(msg.report, fromId)
      else if (msg.sos) onSosEventRef.current?.(msg.sos, fromId)
      if ((msg.ttl ?? 0) > 1) forward({ ...msg, ttl: (msg.ttl ?? 1) - 1 }, fromId) // 續傳演變（gossip）
      return
    }

    // 一般聊天 / 系統訊息
    setMessages(prev => [...prev, msg])
  }, [upsertPeer, forward, pushSystem, isRescue])

  const registerConn = useCallback((conn: any) => {
    connsRef.current.set(conn.peer, conn)
    upsertPeer(conn.peer, { online: true })
    conn.on('data', (d: any) => handleData(conn.peer, d))
    conn.on('close', () => {
      connsRef.current.delete(conn.peer)
      // 保留在清單但標記離線（市民端可灰顯）；指揮中心則移除
      if (isRescue) setPeers(prev => prev.filter(p => p.id !== conn.peer))
      else upsertPeer(conn.peer, { online: false })
    })
    conn.on('error', () => { /* 單一連線錯誤不阻斷整體 */ })

    // 連上後互換名片 + 送一次位置 + 同步未結案 SOS（重連同步：對方拉得到歷史）
    const intro = () => {
      if (!isRescue) { try { conn.send(profileMsg()) } catch { /* ignore */ } }
      const pos = myPosRef.current
      if (pos) { try { conn.send(posMsg(pos)) } catch { /* ignore */ } }
      const sync = syncRef.current?.() ?? []
      for (const m of sync) { try { conn.send(m) } catch { /* ignore */ } }
    }
    if (conn.open) intro()
    else conn.on('open', intro)
  }, [upsertPeer, handleData, posMsg, profileMsg, isRescue])

  registerRef.current = registerConn

  // 內部撥號（重連用：靜默，不顯示錯誤）
  const dialPeer = useCallback((id: string, silent: boolean) => {
    if (!peerRef.current || !id || id === myIdRef.current || connsRef.current.has(id)) return
    if (!silent) setError(null)
    try {
      const conn = peerRef.current.connect(id, { reliable: true })
      if (!conn) { if (!silent) setError('conn-fail'); return }
      conn.on('open', () => registerRef.current(conn))
      conn.on('error', () => { if (!silent) setError('conn-fail') })
    } catch { if (!silent) setError('conn-fail') }
  }, [])

  // ── 初始化 Peer ───────────────────────────────────────
  // 固定 ID（指揮中心 / 自訂 ID）被占用（unavailable-id）時：可能是前一個持有者剛
  // 斷線、broker 尚未釋放（約 30–60 秒）。每 5 秒自動重試搶回，成功即上線、無需手動。
  const RETRY_MS = 5000
  useEffect(() => {
    let cancelled = false
    let PeerCtor: any = null

    const boot = () => {
      if (cancelled || peerRef.current || !PeerCtor) return
      // 未登入（無固定 ID）→ 不啟動節點，避免產生丟棄式的隨機身分
      if (!fixedId) { setLoading(false); return }
      const peer = new PeerCtor(fixedId)
      peerRef.current = peer
      peer.on('open', (id: string) => {
        myIdRef.current = id; setMyId(id); setLoading(false); setError(null)
        if (!isRescue) {
          getKnownPeers(fixedId).forEach(p => dialPeer(p.id, true))  // 自動重連此帳號的已知對象
          ensureRescueRef.current()                            // 主動連指揮中心 hub
        }
      })
      peer.on('error', (err: any) => {
        const type = err?.type ?? err?.message ?? 'peer-error'
        // 固定 ID 被占用：通常是前一個同 ID 節點剛斷線、broker 尚未釋放（約 30–60 秒），
        // 或 dev 模式 StrictMode 重複掛載所致。程式會自動重試搶回，期間以「連線中」呈現，
        // 不顯示為錯誤以免誤導使用者。
        if (type === 'unavailable-id' && fixedId && !cancelled) {
          setError(null)
          setLoading(true)
          try { peer.destroy() } catch { /* ignore */ }
          peerRef.current = null
          clearTimeout(retryTimerRef.current)
          retryTimerRef.current = setTimeout(boot, RETRY_MS)
          return
        }
        setError(type)
        setLoading(false)
      })
      peer.on('disconnected', () => { try { peer.reconnect() } catch { /* ignore */ } })
      peer.on('connection', (conn: any) => registerRef.current(conn))
    }

    import('peerjs').then(({ Peer }) => {
      if (cancelled) return
      PeerCtor = Peer
      boot()
    })
    return () => {
      cancelled = true
      clearTimeout(retryTimerRef.current)
      peerRef.current?.destroy()
      peerRef.current = null
      connsRef.current.clear()
      rescueConnRef.current = null
    }
  }, [fixedId, isRescue, dialPeer])

  // ── 每 30 秒廣播位置 + 維持指揮中心 hub 連線（hub 之前離線、之後上線可補連） ──
  useEffect(() => {
    const iv = setInterval(() => {
      if (!isRescue && peerRef.current && !rescueConnRef.current) ensureRescueRef.current()
      const pos = myPosRef.current
      if (!pos || connsRef.current.size === 0) return
      const m = posMsg(pos)
      connsRef.current.forEach(conn => { if (conn.open) { try { conn.send(m) } catch { /* ignore */ } } })
    }, POS_INTERVAL_MS)
    return () => clearInterval(iv)
  }, [posMsg, isRescue])

  // ── 對外 API ──────────────────────────────────────────
  const sendToAll = useCallback((m: MeshMessage) => {
    connsRef.current.forEach(conn => { if (conn.open) { try { conn.send(m) } catch { /* ignore */ } } })
  }, [])

  /** 沿既有連線送給特定 peer（指揮中心回覆用） */
  const sendTo = useCallback((peerId: string, m: MeshMessage) => {
    const conn = connsRef.current.get(peerId)
    if (conn && conn.open) { try { conn.send(m) } catch { /* ignore */ } }
  }, [])

  const connect = useCallback((targetId: string) => {
    dialPeer(targetId.trim(), false)
  }, [dialPeer])

  const baseMsg = useCallback((extra: Partial<MeshMessage>): MeshMessage => ({
    msgId: genId(), senderId: myIdRef.current, senderName: myNameRef.current, ts: Date.now(),
    ...extra,
  } as MeshMessage), [])

  const sendText = useCallback((text: string) => {
    if (!text.trim() || connsRef.current.size === 0) return
    const m = baseMsg({ type: 'text', text })
    sendToAll(m); pushLocal(m)
  }, [sendToAll, pushLocal, baseMsg])

  // F2.7-C：快捷訊息（附目前位置，送給所有 peer）
  const sendQuick = useCallback((text: string) => {
    const pos = myPosRef.current
    const m = baseMsg({ type: 'quick', text, lat: pos?.lat, lng: pos?.lng })
    sendToAll(m); pushLocal(m)
  }, [sendToAll, pushLocal, baseMsg])

  // 市民端與指揮中心的連線（hub）：用來收發回報/SOS 與回覆。
  // 指揮中心是全站轉發樞紐，市民開機就主動連上 → 別人的回報/SOS 經 hub 轉發給所有人。
  const ensureRescueConn = useCallback(() => {
    if (isRescue || !peerRef.current) return null
    if (rescueConnRef.current) return rescueConnRef.current   // 已存在（連線中或已連）
    let conn: any
    try { conn = peerRef.current.connect(RESCUE_CENTER_ID, { reliable: true }) } catch { return null }
    if (!conn) return null
    rescueConnRef.current = conn
    // 指揮中心送來的回報/SOS/回覆 → 走 handleData（去重、合併、再轉發給自己其他 peer）
    conn.on('data', (d: any) => handleData(RESCUE_CENTER_ID, d))
    conn.on('open', () => {
      // 連上 hub → 把本機未結案 SOS 與進行中回報推給 hub，讓 hub 與其他人補齊
      const sync = syncRef.current?.() ?? []
      for (const m of sync) { try { conn.send(m) } catch { /* ignore */ } }
    })
    conn.on('close', () => { if (rescueConnRef.current === conn) rescueConnRef.current = null })
    conn.on('error', () => { if (rescueConnRef.current === conn) rescueConnRef.current = null })
    return conn
  }, [isRescue, handleData])
  ensureRescueRef.current = ensureRescueConn

  const sendToRescue = useCallback((m: MeshMessage) => {
    const conn = ensureRescueConn()
    if (!conn) return
    if (conn.open) { try { conn.send(m) } catch { /* ignore */ } }
    else conn.on('open', () => { try { conn.send(m) } catch { /* ignore */ } })
  }, [ensureRescueConn])

  // F2.7-D/E/F：分享 / 演變 SOS 事件（建立、回覆、狀態更新都走這裡）。
  // 以 eventId+version 去重 → 同一次求救只顯示一次（修正重複）。依層級決定路由：
  //   A 私人＝只給已連線 peer；B 指揮中心＝送指揮中心；C 廣播＝全 mesh 接力＋指揮中心。
  const shareSosEvent = useCallback((s: SosEvent) => {
    const m = baseMsg({ type: 'sosEvent', eventId: s.id, version: s.version, sos: s, layer: s.layer, ttl: SOS_TTL })
    reportSeenRef.current.add(m.msgId)
    sendToAll(m)                       // 已連線者（A/B/C 皆送，B/C 另含接力 ttl）
    if (s.layer !== 'A') sendToRescue(m)  // B/C 一併送指揮中心
  }, [sendToAll, sendToRescue, baseMsg])

  // F2.8：分享 / 更新回報（含投票、處理結果）。版本遞增、跨節點接力同步。
  const shareReport = useCallback((r: CrowdReport) => {
    const m = baseMsg({ type: 'report', eventId: r.id, version: r.version, report: r, ttl: SOS_TTL })
    reportSeenRef.current.add(m.msgId)
    sendToAll(m)
    sendToRescue(m)   // 同時送指揮中心（B 層）
  }, [sendToAll, sendToRescue, baseMsg])

  return {
    myId, loading, error, peers, messages,
    connectedCount: peers.filter(p => p.online).length,
    isRescue,
    connect, sendText, sendQuick, shareSosEvent, sendTo, shareReport,
  }
}
