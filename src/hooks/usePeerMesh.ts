import { useState, useEffect, useRef, useCallback } from 'react'
import type { LatLng } from '../utils/geo'
import type { CrowdReport } from '../types'
import { getKnownPeers, saveKnownPeer } from '../utils/identity'

// F2.7-E：寫死的救災指揮中心節點 ID（/rescue 用此 ID 起 Peer）
export const RESCUE_CENTER_ID = 'tainan-guardian-rescue'

// C 層接力初始 TTL（F2.7-F）
export const SOS_TTL = 5

// 位置共享更新頻率（F2.7-A）
const POS_INTERVAL_MS = 30_000

export type MeshMsgType = 'text' | 'quick' | 'sos' | 'position' | 'report' | 'profile' | 'system'
export type SosLayer = 'A' | 'B' | 'C'

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
  // ── 演變型訊息（回報）：用穩定 eventId + 遞增 version 去重，
  //    僅「更新版」才續傳（取代純 TTL 防循環），符合「持續通知事件演變」需求 ──
  eventId?: string
  version?: number
  report?: CrowdReport
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
  /** 收到 SOS 時的副作用（toast、marker 閃爍等） */
  onSos?: (m: MeshMessage, fromPeerId: string) => void
  /** 收到回報（新／演變版）→ 合併進本地 store */
  onReport?: (r: CrowdReport, fromPeerId: string) => void
}

function genId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Mesh P2P 核心（F2.7）：
 * - 固定身份：市民端以 sessionStorage 的固定 ID 起 Peer，reload 不變、可自動重連。
 * - 名片交換：連線即互換 {name}，UI 全程顯示名稱而非裸 ID。
 * - 多 peer 連線管理（Map<peerId, conn>），離線對象保留在清單灰顯。
 * - 位置共享：連上即送、之後每 30 秒廣播。
 * - 三層 SOS（使用者擇一發送，故同一接收者不會重複收到）：
 *   A 私人（已連線 peer）/ B 公共（寫死指揮中心）/ C 廣播（msgId 去重 + TTL 接力，並送指揮中心）。
 * - 指揮中心可沿原連線回覆（sendTo）。
 */
export function usePeerMesh({ fixedId, myName, myPos, onSos, onReport }: Options = {}) {
  const isRescue = fixedId === RESCUE_CENTER_ID

  const [myId, setMyId]       = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  // 市民端：以已知對象清單初始化（離線灰顯，待自動重連）。指揮中心：空白。
  const [peers, setPeers]     = useState<PeerInfo[]>(() =>
    isRescue ? [] : getKnownPeers().map(p => ({ id: p.id, name: p.name, connectedAt: '', online: false })),
  )
  const [messages, setMessages] = useState<MeshMessage[]>([])

  const peerRef        = useRef<any>(null)
  const connsRef       = useRef<Map<string, any>>(new Map())
  const rescueConnRef  = useRef<any>(null)        // B 層往指揮中心的連線（不列入 peers）
  const seenRef        = useRef<Set<string>>(new Set()) // C 層 SOS 去重
  const reportSeenRef  = useRef<Set<string>>(new Set())
  const versionsRef    = useRef<Map<string, number>>(new Map()) // 回報 eventId → 已見最新 version
  const greetedRef     = useRef<Set<string>>(new Set()) // 已發過「加入」系統訊息的 peer
  const myPosRef       = useRef<LatLng | null>(myPos ?? null)
  const myNameRef      = useRef(myName ?? '')
  const myIdRef        = useRef('')
  const onSosRef       = useRef(onSos)
  const onReportRef    = useRef(onReport)
  const registerRef    = useRef<(conn: any) => void>(() => {})

  useEffect(() => { myPosRef.current = myPos ?? null }, [myPos])
  useEffect(() => { myNameRef.current = myName ?? '' }, [myName])
  useEffect(() => { onSosRef.current = onSos }, [onSos])
  useEffect(() => { onReportRef.current = onReport }, [onReport])

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
      if (!isRescue) saveKnownPeer({ id: fromId, name })
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

    // 回報（演變型）：以 eventId + version 去重；僅更新版才處理 + 續傳
    if (msg.type === 'report' && msg.eventId && msg.report) {
      if (msg.msgId && reportSeenRef.current.has(msg.msgId)) return
      if (msg.msgId) reportSeenRef.current.add(msg.msgId)
      const seenV = versionsRef.current.get(msg.eventId) ?? -1
      if ((msg.version ?? 0) < seenV) return
      versionsRef.current.set(msg.eventId, Math.max(seenV, msg.version ?? 0))
      onReportRef.current?.(msg.report, fromId)
      if ((msg.ttl ?? 0) > 1) forward({ ...msg, ttl: (msg.ttl ?? 1) - 1 }, fromId) // 續傳演變
      return
    }

    // C 層接力去重
    if (msg.layer === 'C') {
      if (msg.msgId && seenRef.current.has(msg.msgId)) return
      if (msg.msgId) seenRef.current.add(msg.msgId)
    }

    setMessages(prev => [...prev, msg])
    if (msg.type === 'sos') onSosRef.current?.(msg, fromId)

    // 接力轉發（TTL-1，>0 才續傳）
    if (msg.layer === 'C' && (msg.ttl ?? 0) > 1) {
      forward({ ...msg, ttl: (msg.ttl ?? 1) - 1 }, fromId)
    }
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

    // 連上後互換名片 + 送一次位置（指揮中心不主動報名片，名稱由訊息 senderName 帶出）
    const intro = () => {
      if (!isRescue) { try { conn.send(profileMsg()) } catch { /* ignore */ } }
      const pos = myPosRef.current
      if (pos) { try { conn.send(posMsg(pos)) } catch { /* ignore */ } }
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
  useEffect(() => {
    let cancelled = false
    import('peerjs').then(({ Peer }) => {
      if (cancelled || peerRef.current) return
      const peer = fixedId ? new Peer(fixedId) : new Peer()
      peerRef.current = peer
      peer.on('open', (id: string) => {
        myIdRef.current = id; setMyId(id); setLoading(false); setError(null)
        // 自動重連已知對象（市民端）
        if (!isRescue) getKnownPeers().forEach(p => dialPeer(p.id, true))
      })
      peer.on('error', (err: any) => {
        setError(err?.type ?? err?.message ?? 'peer-error')
        setLoading(false)
      })
      peer.on('disconnected', () => { try { peer.reconnect() } catch { /* ignore */ } })
      peer.on('connection', (conn: any) => registerRef.current(conn))
    })
    return () => {
      cancelled = true
      peerRef.current?.destroy()
      peerRef.current = null
      connsRef.current.clear()
      rescueConnRef.current = null
    }
  }, [fixedId, isRescue, dialPeer])

  // ── 每 30 秒廣播位置 ──────────────────────────────────
  useEffect(() => {
    const iv = setInterval(() => {
      const pos = myPosRef.current
      if (!pos || connsRef.current.size === 0) return
      const m = posMsg(pos)
      connsRef.current.forEach(conn => { if (conn.open) { try { conn.send(m) } catch { /* ignore */ } } })
    }, POS_INTERVAL_MS)
    return () => clearInterval(iv)
  }, [posMsg])

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

  // B 層：送給寫死的指揮中心（必要時建立連線，並監聽其回覆）
  const sendToRescue = useCallback((m: MeshMessage) => {
    if (isRescue || !peerRef.current) return
    const existing = rescueConnRef.current
    if (existing && existing.open) { try { existing.send(m) } catch { /* ignore */ } return }
    try {
      const conn = peerRef.current.connect(RESCUE_CENTER_ID, { reliable: true })
      if (!conn) return
      rescueConnRef.current = conn
      // 接收指揮中心回覆（只取文字/系統訊息，不把指揮中心列入 peers）
      conn.on('data', (d: any) => {
        const r = d as MeshMessage
        if (r && (r.type === 'system' || r.type === 'text' || r.type === 'sos' || r.type === 'quick')) {
          setMessages(prev => [...prev, r])
        }
      })
      conn.on('open', () => { try { conn.send(m) } catch { /* ignore */ } })
      conn.on('error', () => { /* 指揮中心離線 → 靜默 */ })
    } catch { /* ignore */ }
  }, [isRescue])

  // F2.7-D/E/F：三層 SOS。使用者擇一發送 → 同一接收者只會收到一次。
  const sendSOS = useCallback((layer: SosLayer, text: string) => {
    const pos = myPosRef.current
    const make = () => baseMsg({ type: 'sos', layer, text, lat: pos?.lat, lng: pos?.lng })

    if (layer === 'A') {
      // 私人：只送已連線 peer（無接力）
      sendToAll(make())
    } else if (layer === 'B') {
      // 公共：只送救災指揮中心
      sendToRescue(make())
    } else {
      // 廣播：TTL 接力給整個 mesh，並一併送指揮中心
      const c = { ...make(), ttl: SOS_TTL }
      seenRef.current.add(c.msgId)   // 自己發的先標記已看，避免回傳重複處理
      sendToAll(c)
      sendToRescue({ ...make(), ttl: SOS_TTL })
    }
    // 本地回顯一則（讓自己也看到送出紀錄）
    pushLocal(make())
  }, [sendToAll, sendToRescue, pushLocal, baseMsg])

  // F2.8：分享 / 更新回報（含投票、處理結果）。版本遞增、跨節點接力同步。
  const shareReport = useCallback((r: CrowdReport) => {
    versionsRef.current.set(r.id, r.version)  // 自己發的標記為已見
    const m = baseMsg({ type: 'report', eventId: r.id, version: r.version, report: r, ttl: 8 })
    reportSeenRef.current.add(m.msgId)
    sendToAll(m)
    sendToRescue(m)   // 同時送指揮中心（B 層）
  }, [sendToAll, sendToRescue, baseMsg])

  return {
    myId, loading, error, peers, messages,
    connectedCount: peers.filter(p => p.online).length,
    isRescue,
    connect, sendText, sendQuick, sendSOS, sendTo, shareReport,
  }
}
