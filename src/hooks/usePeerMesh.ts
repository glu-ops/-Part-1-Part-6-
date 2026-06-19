import { useState, useEffect, useRef, useCallback } from 'react'
import type { LatLng } from '../utils/geo'
import type { CrowdReport } from '../types'

// F2.7-E：寫死的救災指揮中心節點 ID（/rescue 用此 ID 起 Peer）
export const RESCUE_CENTER_ID = 'tainan-guardian-rescue'

// C 層接力初始 TTL（F2.7-F）
export const SOS_TTL = 5

// 位置共享更新頻率（F2.7-A）
const POS_INTERVAL_MS = 30_000

export type MeshMsgType = 'text' | 'quick' | 'sos' | 'position' | 'report'
export type SosLayer = 'A' | 'B' | 'C'

export interface MeshMessage {
  msgId: string
  type: MeshMsgType
  layer?: SosLayer        // SOS 才有
  text?: string
  lat?: number
  lng?: number
  senderId: string        // 原始發送者（接力時不變）
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
  lat?: number
  lng?: number
  posTs?: number
}

interface Options {
  /** 指定固定 ID（救災指揮中心用）；省略則 PeerJS 自動產生 */
  fixedId?: string
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
 * - 多 peer 連線管理（Map<peerId, conn>）
 * - 位置共享：連上即送、之後每 30 秒廣播
 * - 三層 SOS：A 私人（所有 peer）/ B 公共（寫死指揮中心）/ C 廣播（msgId 去重 + TTL 接力）
 */
export function usePeerMesh({ fixedId, myPos, onSos, onReport }: Options = {}) {
  const [myId, setMyId]       = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [peers, setPeers]     = useState<PeerInfo[]>([])
  const [messages, setMessages] = useState<MeshMessage[]>([])

  const peerRef        = useRef<any>(null)
  const connsRef       = useRef<Map<string, any>>(new Map())
  const rescueConnRef  = useRef<any>(null)        // B 層往指揮中心的連線（不列入 peers）
  const seenRef        = useRef<Set<string>>(new Set()) // C 層 SOS 去重
  const reportSeenRef  = useRef<Set<string>>(new Set())
  const versionsRef    = useRef<Map<string, number>>(new Map()) // 回報 eventId → 已見最新 version
  const myPosRef       = useRef<LatLng | null>(myPos ?? null)
  const myIdRef        = useRef('')
  const onSosRef       = useRef(onSos)
  const onReportRef    = useRef(onReport)
  const registerRef    = useRef<(conn: any) => void>(() => {})

  useEffect(() => { myPosRef.current = myPos ?? null }, [myPos])
  useEffect(() => { onSosRef.current = onSos }, [onSos])
  useEffect(() => { onReportRef.current = onReport }, [onReport])

  // ── 內部工具 ──────────────────────────────────────────
  const upsertPeer = useCallback((id: string, patch?: Partial<PeerInfo>) => {
    setPeers(prev => {
      const i = prev.findIndex(p => p.id === id)
      if (i === -1) return [...prev, { id, connectedAt: new Date().toLocaleTimeString(), ...patch }]
      const next = [...prev]
      next[i] = { ...next[i], ...patch }
      return next
    })
  }, [])

  const posMsg = useCallback((pos: LatLng): MeshMessage => ({
    msgId: genId(), type: 'position', lat: pos.lat, lng: pos.lng, senderId: myIdRef.current, ts: Date.now(),
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

    // 位置更新：不進聊天、不轉發
    if (msg.type === 'position') {
      upsertPeer(fromId, { lat: msg.lat, lng: msg.lng, posTs: msg.ts })
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
  }, [upsertPeer, forward])

  const registerConn = useCallback((conn: any) => {
    connsRef.current.set(conn.peer, conn)
    upsertPeer(conn.peer)
    conn.on('data', (d: any) => handleData(conn.peer, d))
    conn.on('close', () => {
      connsRef.current.delete(conn.peer)
      setPeers(prev => prev.filter(p => p.id !== conn.peer))
    })
    conn.on('error', () => { /* 單一連線錯誤不阻斷整體 */ })
    // 連上立即送一次位置
    const pos = myPosRef.current
    if (pos) { try { conn.send(posMsg(pos)) } catch { /* ignore */ } }
  }, [upsertPeer, handleData, posMsg])

  registerRef.current = registerConn

  // ── 初始化 Peer ───────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    import('peerjs').then(({ Peer }) => {
      if (cancelled || peerRef.current) return
      const peer = fixedId ? new Peer(fixedId) : new Peer()
      peerRef.current = peer
      peer.on('open', (id: string) => { myIdRef.current = id; setMyId(id); setLoading(false); setError(null) })
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
  }, [fixedId])

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

  const pushLocal = useCallback((m: MeshMessage) => setMessages(prev => [...prev, m]), [])

  const connect = useCallback((targetId: string) => {
    const id = targetId.trim()
    if (!peerRef.current || !id || id === myIdRef.current || connsRef.current.has(id)) return
    setError(null)
    try {
      const conn = peerRef.current.connect(id, { reliable: true })
      conn.on('open', () => registerRef.current(conn))
      conn.on('error', () => setError('conn-fail'))
    } catch { setError('conn-fail') }
  }, [])

  const sendText = useCallback((text: string) => {
    if (!text.trim() || connsRef.current.size === 0) return
    const m: MeshMessage = { msgId: genId(), type: 'text', text, senderId: myIdRef.current, ts: Date.now() }
    sendToAll(m); pushLocal(m)
  }, [sendToAll, pushLocal])

  // F2.7-C：快捷訊息（附目前位置，送給所有 peer）
  const sendQuick = useCallback((text: string) => {
    const pos = myPosRef.current
    const m: MeshMessage = {
      msgId: genId(), type: 'quick', text,
      lat: pos?.lat, lng: pos?.lng, senderId: myIdRef.current, ts: Date.now(),
    }
    sendToAll(m); pushLocal(m)
  }, [sendToAll, pushLocal])

  // B 層：送給寫死的指揮中心（必要時建立連線）
  const sendToRescue = useCallback((m: MeshMessage) => {
    if (fixedId === RESCUE_CENTER_ID || !peerRef.current) return
    const existing = rescueConnRef.current
    if (existing && existing.open) { try { existing.send(m) } catch { /* ignore */ } return }
    try {
      const conn = peerRef.current.connect(RESCUE_CENTER_ID, { reliable: true })
      if (!conn) return
      rescueConnRef.current = conn
      conn.on('open', () => { try { conn.send(m) } catch { /* ignore */ } })
      conn.on('error', () => { /* 指揮中心離線 → 靜默 */ })
    } catch { /* ignore */ }
  }, [fixedId])

  // F2.7-D/E/F：三層 SOS，使用者只按一次
  const triggerSOS = useCallback((text: string) => {
    const pos = myPosRef.current
    const base = { text, lat: pos?.lat, lng: pos?.lng, senderId: myIdRef.current, ts: Date.now() }

    // A 私人層 → 所有已連線 peer
    sendToAll({ ...base, msgId: genId(), type: 'sos', layer: 'A' })

    // C 廣播層 → TTL 接力（自己發的先標記為已看，避免回傳重複處理）
    const c: MeshMessage = { ...base, msgId: genId(), type: 'sos', layer: 'C', ttl: SOS_TTL }
    seenRef.current.add(c.msgId)
    sendToAll(c)

    // B 公共層 → 救災指揮中心
    sendToRescue({ ...base, msgId: genId(), type: 'sos', layer: 'B' })

    // 本地顯示一則
    pushLocal({ ...base, msgId: genId(), type: 'sos', layer: 'A' })
  }, [sendToAll, sendToRescue, pushLocal])

  // F2.8：分享 / 更新回報（含投票、處理結果）。版本遞增、跨節點接力同步。
  const shareReport = useCallback((r: CrowdReport) => {
    versionsRef.current.set(r.id, r.version)  // 自己發的標記為已見
    const m: MeshMessage = {
      msgId: genId(), type: 'report', eventId: r.id, version: r.version,
      report: r, ttl: 8, senderId: myIdRef.current, ts: Date.now(),
    }
    reportSeenRef.current.add(m.msgId)
    sendToAll(m)
    sendToRescue(m)   // 同時送指揮中心（B 層）
  }, [sendToAll, sendToRescue])

  return {
    myId, loading, error, peers, messages,
    connectedCount: peers.length,
    isRescue: fixedId === RESCUE_CENTER_ID,
    connect, sendText, sendQuick, triggerSOS, shareReport,
  }
}
