import { createContext, useContext, useState, useCallback, useRef, useMemo, useEffect } from 'react'
import type { ReactNode } from 'react'
import { AlertOctagon, CheckCircle } from 'lucide-react'
import { usePeerMesh } from '../hooks/usePeerMesh'
import type { MeshMessage } from '../hooks/usePeerMesh'
import { useSosStore } from '../hooks/useSosStore'
import { useShelters } from './ShelterContext'
import { useUser } from './UserContext'
import { useIdentity } from './IdentityContext'
import { useI18n } from '../i18n'
import type { CrowdReport, SosEvent, SosLayer, SosReply, HandleStatus } from '../types'

type MeshApi = ReturnType<typeof usePeerMesh>

export interface Notice {
  id: string
  kind: 'report-new' | 'report-status' | 'sos-new' | 'sos-status' | 'sos-reply' | 'sos-safe'
  text: string                 // 摘要主行
  ts: number
  read: boolean
  // 詳細內容（通知中心展開顯示）
  reporter?: string            // 回報者 / 求救者名稱
  typeLabel?: string           // 回報類型
  statusLabel?: string         // 目前狀態
  latest?: string              // 最新補充 / 回覆 / 內容
  // 點擊定位用
  refKind?: 'report' | 'sos'
  refId?: string
  lat?: number
  lng?: number
}

interface MeshCtx extends MeshApi {
  sosFlashId: string | null
  // SOS 事件
  sosEvents: SosEvent[]
  raiseSos: (layer: SosLayer, text: string) => void
  replySos: (sosId: string, text: string, offerHelp?: boolean) => void
  setSosStatus: (sosId: string, status: HandleStatus, handledBy?: string) => void
  markSosSafe: (sosId: string) => void
  // 通知中心
  notices: Notice[]
  unreadCount: number
  markNoticesRead: () => void
}

const MeshContext = createContext<MeshCtx | null>(null)

function genId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * 全 App 共用的 Mesh 節點（市民端）：
 * - 回報與 SOS 事件在任何頁面即時 P2P 同步並持久化。
 * - SOS 升級為可追蹤事件（狀態＋回覆串），不再混入聊天。
 * - 狀態變化集中在這裡產生「通知中心」項目（Header 鈴鐺）。
 */
export function MeshProvider({ children }: { children: ReactNode }) {
  const { userLoc } = useUser()
  const { mergeReport, activeReports } = useShelters()
  const { myId, name } = useIdentity()
  const { t } = useI18n()
  const sos = useSosStore()

  // 供「連線時同步」用：未結案 SOS + 進行中回報（後者上限避免過大）
  const activeReportsRef = useRef(activeReports)
  activeReportsRef.current = activeReports

  const [toast, setToast] = useState<{ kind: 'sos' | 'done'; text: string } | null>(null)
  const [sosFlashId, setSosFlashId] = useState<string | null>(null)
  // 通知持久化（localStorage：關閉分頁重開仍保留；以節點 ID 為 key 區分身份）
  const noticeKey = `guardian_notices_${myId || 'anon'}`
  const [notices, setNotices] = useState<Notice[]>(() => {
    try { return JSON.parse(localStorage.getItem(noticeKey) ?? '[]') as Notice[] } catch { return [] }
  })
  useEffect(() => {
    try { localStorage.setItem(noticeKey, JSON.stringify(notices)) } catch { /* 容量不足忽略 */ }
  }, [notices, noticeKey])
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const showToast = useCallback((kind: 'sos' | 'done', text: string) => {
    setToast({ kind, text })
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 5000)
  }, [])

  const addNotice = useCallback((n: Omit<Notice, 'id' | 'ts' | 'read'>) => {
    setNotices(prev => [{ id: genId(), ts: Date.now(), read: false, ...n }, ...prev].slice(0, 50))
  }, [])

  // ── 收到遠端回報 → 合併 + 通知（含詳細內容 + 定位） ──
  const onReport = useCallback((r: CrowdReport) => {
    const { changed, merged, prevStatus, isNew } = mergeReport(r)
    if (!changed) return
    const who = merged.authorName || t('notice.someone')
    const typeLabel = t(`rt.${merged.type}`)
    const base = {
      reporter: who, typeLabel, statusLabel: t(`status.handle.${merged.status ?? 'active'}`),
      latest: merged.note, refKind: 'report' as const, refId: merged.threadId ?? merged.id,
      lat: merged.lat, lng: merged.lng,
    }
    if (isNew) {
      addNotice({ kind: 'report-new', text: t('notice.reportNew', { who, type: typeLabel }), ...base })
    } else if (prevStatus && prevStatus !== merged.status) {
      addNotice({ kind: 'report-status', text: t('notice.reportStatus', { type: typeLabel, status: t(`status.handle.${merged.status}`) }), ...base })
      if (merged.status === 'resolved') showToast('done', t('report.resolvedToast', { id: merged.id.slice(0, 8) }))
    }
  }, [mergeReport, addNotice, showToast, t])

  // ── 收到遠端 SOS 事件 → 合併 + 通知 + 閃爍（含詳細 + 定位） ──
  const onSosEvent = useCallback((s: SosEvent) => {
    const { changed, merged, prevStatus, isNew } = sos.mergeRemote(s)
    if (!changed) return
    const who = merged.senderName || t('notice.someone')
    const latestReply = merged.replies.length ? merged.replies[merged.replies.length - 1] : null
    const base = {
      reporter: who, typeLabel: t(`mesh.layer.${merged.layer}`),
      statusLabel: merged.safeBySelf ? t('sos.safe') : t(`status.handle.${merged.status}`),
      latest: latestReply ? `${latestReply.fromName}：${latestReply.text}` : merged.text,
      refKind: 'sos' as const, refId: merged.id, lat: merged.lat, lng: merged.lng,
    }
    if (isNew) {
      showToast('sos', t('mesh.sosReceived', { id: who }))
      setSosFlashId(merged.senderId)
      setTimeout(() => setSosFlashId(null), 6000)
      addNotice({ kind: 'sos-new', text: t('notice.sosNew', { who }), ...base })
    } else if (merged.status === 'resolved' && merged.safeBySelf) {
      addNotice({ kind: 'sos-safe', text: t('notice.sosSafe', { who }), ...base })
    } else if (prevStatus && prevStatus !== merged.status) {
      addNotice({ kind: 'sos-status', text: t('notice.sosStatus', { who, status: t(`status.handle.${merged.status}`) }), ...base })
    } else {
      // 狀態未變但有演變 → 視為新回覆（有人願意幫忙等）
      addNotice({ kind: 'sos-reply', text: t('notice.sosReply', { who }), ...base })
    }
  }, [sos, addNotice, showToast, t])

  // ── 新連線時推送：未結案 SOS + 進行中回報（讓對方/hub 補齊既有狀態） ──
  const getSyncMessages = useCallback((): MeshMessage[] => {
    const sosMsgs: MeshMessage[] = sos.getOpenEvents().map(e => ({
      msgId: genId(), type: 'sosEvent', eventId: e.id, version: e.version,
      sos: e, layer: e.layer, senderId: e.senderId, senderName: e.senderName, ts: Date.now(),
    }))
    // 回報含照片/附件可能較大，僅同步最近 20 筆進行中回報
    const reportMsgs: MeshMessage[] = activeReportsRef.current.slice(-20).map(r => ({
      msgId: genId(), type: 'report', eventId: r.id, version: r.version,
      report: r, senderId: r.author ?? myId, senderName: r.authorName, ts: Date.now(),
    }))
    return [...sosMsgs, ...reportMsgs]
  }, [sos, myId])

  const mesh = usePeerMesh({ fixedId: myId, myName: name, myPos: userLoc, onSosEvent, onReport, getSyncMessages })

  // ── 對外 SOS 動作 ──
  const raiseSos = useCallback((layer: SosLayer, text: string) => {
    const event: SosEvent = {
      id: `sos-${genId()}`, senderId: myId, senderName: name || t('mesh.me'),
      layer, lat: userLoc.lat, lng: userLoc.lng, text, ts: Date.now(),
      status: 'active', replies: [], version: 1,
    }
    sos.putLocal(event)
    mesh.shareSosEvent(event)
  }, [myId, name, userLoc, sos, mesh, t])

  const replySos = useCallback((sosId: string, text: string, offerHelp?: boolean) => {
    const reply: SosReply = { id: genId(), fromId: myId, fromName: name || t('mesh.me'), text, ts: Date.now(), offerHelp }
    const updated = sos.addReply(sosId, reply)
    if (updated) mesh.shareSosEvent(updated)
  }, [myId, name, sos, mesh, t])

  const setSosStatus = useCallback((sosId: string, status: HandleStatus, handledBy?: string) => {
    const updated = sos.setStatus(sosId, status, handledBy ?? (name || t('mesh.me')))
    if (updated) mesh.shareSosEvent(updated)
  }, [sos, mesh, name, t])

  // 求救者本人標記「已安全」→ 結案、廣播給所有相關節點
  const markSosSafe = useCallback((sosId: string) => {
    const updated = sos.markSafe(sosId, name || t('mesh.me'))
    if (updated) mesh.shareSosEvent(updated)
  }, [sos, mesh, name, t])

  const markNoticesRead = useCallback(() => {
    setNotices(prev => prev.some(n => !n.read) ? prev.map(n => ({ ...n, read: true })) : prev)
  }, [])
  const unreadCount = useMemo(() => notices.filter(n => !n.read).length, [notices])

  return (
    <MeshContext.Provider value={{
      ...mesh, sosFlashId,
      sosEvents: sos.sosEvents, raiseSos, replySos, setSosStatus, markSosSafe,
      notices, unreadCount, markNoticesRead,
    }}>
      {children}
      {toast && (
        <div className={`fixed top-16 left-1/2 -translate-x-1/2 z-[2000] glass rounded-full px-4 py-2 text-sm font-semibold flex items-center gap-2 border ${
          toast.kind === 'sos' ? 'text-status-danger border-status-danger/50 animate-pulse' : 'text-status-safe border-status-safe/40'}`}>
          {toast.kind === 'sos' ? <AlertOctagon size={16} className="text-status-danger" /> : <CheckCircle size={16} className="text-status-safe" />}
          {toast.text}
        </div>
      )}
    </MeshContext.Provider>
  )
}

export function useMesh() {
  const ctx = useContext(MeshContext)
  if (!ctx) throw new Error('useMesh must be inside MeshProvider')
  return ctx
}
