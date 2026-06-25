import { createContext, useContext, useState, useCallback, useRef, useMemo, useEffect } from 'react'
import type { ReactNode } from 'react'
import { AlertOctagon, CheckCircle, Megaphone } from 'lucide-react'
import { usePeerMesh } from '../hooks/usePeerMesh'
import type { MeshMessage } from '../hooks/usePeerMesh'
import { useSosStore } from '../hooks/useSosStore'
import { useSosSync } from '../hooks/useSosSync'
import { useAnnounceSync } from '../hooks/useAnnounceSync'
import { useShelters } from './ShelterContext'
import { useUser } from './UserContext'
import { useIdentity } from './IdentityContext'
import { useI18n } from '../i18n'
import { SOS_CATEGORY_META, SCOPE_TO_LAYER } from '../sos'
import SosComposer from '../components/Sos/SosComposer'
import type { CrowdReport, SosEvent, SosReply, SosStatus, SosReplyKind, Announcement } from '../types'
import { buildSosNotice, buildReportNotice, buildAnnounceNotice, resolveLocationName } from '../utils/notifications'
import type { Notice } from '../utils/notifications'

// 通知型別由 utils/notifications 定義；此處 re-export 供 NotificationBell 等沿用既有匯入路徑。
export type { Notice } from '../utils/notifications'

type MeshApi = ReturnType<typeof usePeerMesh>

/** SOS 發起草稿（類型 + 範圍 + 說明 + 可選避難所資訊） */
export interface SosDraft {
  category: import('../types').SosCategory
  scope: import('../types').SosScope
  text: string
  shelter?: { id: string; name: string; location: string }
}
/** 開啟發送面板時的預填（避難所卡片發起時帶入類型 / 避難所） */
export interface SosComposerPrefill {
  category?: import('../types').SosCategory
  scope?: import('../types').SosScope
  shelter?: { id: string; name: string; location: string }
}

interface MeshCtx extends MeshApi {
  sosFlashId: string | null
  // SOS 事件
  sosEvents: SosEvent[]
  raiseSos: (draft: SosDraft) => void
  replySos: (sosId: string, text: string, kind?: SosReplyKind) => void
  setSosStatus: (sosId: string, status: SosStatus, handledBy?: string) => void
  markSosSafe: (sosId: string) => void
  // SOS 發送面板（避難所卡片等處可帶預填開啟）
  openSosComposer: (prefill?: SosComposerPrefill) => void
  // 通知中心
  notices: Notice[]
  unreadCount: number
  markNoticesRead: () => void              // 全部標為已讀
  markNoticeRead: (notificationId: string) => void  // 單筆標為已讀（點擊時）
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
  const { mergeReport, reports, shelters } = useShelters()
  const { myId, name } = useIdentity()
  // 避難所查詢表：回報以 shelter_id 解析地點名稱（locationName fallback 用）
  const shelterById = useMemo(() => new Map(shelters.map(s => [s.shelter_id, s])), [shelters])
  const { t } = useI18n()
  const sos = useSosStore()

  // 供「連線時同步」用：含已處理（resolved）回報，讓重連的人也能收到「已處理」
  // 狀態並移除地圖 marker（僅同步最近 25 筆避免過大）
  const reportsRef = useRef(reports)
  reportsRef.current = reports

  const [toast, setToast] = useState<{ kind: 'sos' | 'done' | 'announce'; text: string } | null>(null)
  const [sosFlashId, setSosFlashId] = useState<string | null>(null)
  // 通知持久化（localStorage：關閉分頁重開仍保留；以節點 ID 為 key 區分身份）。
  // v2：新版 Notice schema（含 notificationId 等欄位），與舊 key 不相容故換 key 重新開始。
  const noticeKey = `guardian_notices_v2_${myId || 'anon'}`
  const [notices, setNotices] = useState<Notice[]>(() => {
    try { return JSON.parse(localStorage.getItem(noticeKey) ?? '[]') as Notice[] } catch { return [] }
  })
  useEffect(() => {
    try { localStorage.setItem(noticeKey, JSON.stringify(notices)) } catch { /* 容量不足忽略 */ }
  }, [notices, noticeKey])
  // 鏡像給副作用（toast / 地圖閃爍）判斷「是否已存在此通知」用，避免同一事件重複跳。
  const noticesRef = useRef(notices)
  noticesRef.current = notices
  const hasSeen = useCallback((notificationId: string) =>
    noticesRef.current.some(n => n.notificationId === notificationId), [])
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const showToast = useCallback((kind: 'sos' | 'done' | 'announce', text: string) => {
    setToast({ kind, text })
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 5000)
  }, [])

  // 加入一筆通知；以 notificationId 去重（同一事件動作只會有一筆，跨 broadcast/peer/polling/重連收斂）。
  const addNotice = useCallback((n: Notice) => {
    setNotices(prev => {
      if (prev.some(x => x.notificationId === n.notificationId)) return prev
      return [n, ...prev].slice(0, 80)
    })
  }, [])

  // ── 收到遠端回報 → 合併 + 通知（含詳細內容 + 定位） ──
  const onReport = useCallback((r: CrowdReport) => {
    // 是否為「補充」：合併前已存在同一回報串（threadId）→ 補充；否則為新回報。
    const threadId = r.threadId ?? r.id
    const wasThreadKnown = reportsRef.current.some(x => (x.threadId ?? x.id) === threadId)
    const { changed, merged, prevStatus, isNew } = mergeReport(r)
    if (!changed) return
    const sh = merged.shelter_id ? shelterById.get(merged.shelter_id) : undefined
    const locationName = resolveLocationName(t, { name: sh?.name, address: sh?.address, lat: merged.lat, lng: merged.lng })
    const notice = buildReportNotice(t, { report: merged, isNew, isSupplement: isNew && wasThreadKnown, prevStatus, locationName })
    if (!notice) return
    addNotice(notice)
    if (notice.action === 'resolved' && !hasSeen(notice.notificationId)) {
      showToast('done', t('report.resolvedToast', { id: merged.id.slice(0, 8) }))
    }
  }, [mergeReport, addNotice, showToast, hasSeen, shelterById, t])

  // ── 收到遠端 SOS 事件 → 合併 + 通知 + 閃爍（含詳細 + 定位） ──
  const onSosEvent = useCallback((s: SosEvent) => {
    const { changed, merged, prevStatus, isNew } = sos.mergeRemote(s)
    if (!changed) return
    const locationName = resolveLocationName(t, { name: merged.shelterName, address: merged.shelterLocation, lat: merged.lat, lng: merged.lng })
    const notice = buildSosNotice(t, { event: merged, isNew, prevStatus, locationName })
    if (!notice) return
    // 新求救：跳 toast + 地圖閃爍（以 notificationId 判斷，避免同一事件多來源重複跳）。
    if (notice.action === 'new' && !hasSeen(notice.notificationId)) {
      showToast('sos', t('mesh.sosReceived', { id: notice.targetOwnerName }))
      setSosFlashId(merged.senderId)
      setTimeout(() => setSosFlashId(null), 6000)
    }
    addNotice(notice)
  }, [sos, addNotice, showToast, hasSeen, t])

  // ── 套用一則公告 → 通知中心 (+toast)。以 notificationId 去重（P2P 與後端輪詢兩來源收斂）。
  //    補抓既有公告（後端首輪）toast=false：只進通知中心、不洗版跳 toast。──
  const applyAnnounce = useCallback((a: Announcement, opts?: { toast?: boolean }) => {
    const notice = buildAnnounceNotice(t, a)
    const isDup = hasSeen(notice.notificationId)
    addNotice(notice)
    if (!isDup && opts?.toast !== false) showToast('announce', a.text)
  }, [addNotice, showToast, hasSeen, t])
  // P2P 收到（即時）→ 一律 toast
  const onAnnounce = useCallback((a: Announcement) => applyAnnounce(a, { toast: true }), [applyAnnounce])

  // ── 新連線時推送：未結案 SOS + 進行中回報（讓對方/hub 補齊既有狀態） ──
  const getSyncMessages = useCallback((): MeshMessage[] => {
    const sosMsgs: MeshMessage[] = sos.getOpenEvents().map(e => ({
      msgId: genId(), type: 'sosEvent', eventId: e.id, version: e.version,
      sos: e, layer: e.layer, senderId: e.senderId, senderName: e.senderName, ts: Date.now(),
    }))
    // 回報含照片/附件可能較大，僅同步最近 25 筆（含 resolved 以同步「已處理」）
    const reportMsgs: MeshMessage[] = [...reportsRef.current]
      .sort((a, b) => +new Date(b.reported_at) - +new Date(a.reported_at))
      .slice(0, 25)
      .map(r => ({
        msgId: genId(), type: 'report' as const, eventId: r.id, version: r.version,
        report: r, senderId: r.author ?? myId, senderName: r.authorName, ts: Date.now(),
      }))
    return [...sosMsgs, ...reportMsgs]
  }, [sos, myId])

  const mesh = usePeerMesh({ fixedId: myId, myName: name, myPos: userLoc, onSosEvent, onReport, onAnnounce, getSyncMessages })

  // 共享資料來源同步（輪詢）：拉他人 SOS 增量 → 走同一套 onSosEvent 合併 / 通知 / 地圖。
  // 任何本機 SOS 動作都會 push 到後端，讓所有 Vercel 使用者同步看到。
  const { push: pushSos } = useSosSync(onSosEvent)
  // 公告共享後端輪詢：即使 P2P 沒連上、跨 Vercel 使用者也能收到指揮中心公告。
  useAnnounceSync(applyAnnounce)

  // 本機產生新版事件後：同時走 P2P（即時）與共享後端（跨使用者持久同步）。
  // 私人（layer A / private）只發給已連線者 → 不寫入共享後端，避免全站可見。
  const broadcastSos = useCallback((e: SosEvent) => {
    mesh.shareSosEvent(e)
    if (e.layer !== 'A') pushSos(e)
  }, [mesh, pushSos])

  // ── 對外 SOS 動作 ──
  const raiseSos = useCallback((draft: SosDraft) => {
    const meta = SOS_CATEGORY_META[draft.category]
    const event: SosEvent = {
      id: `sos-${genId()}`, senderId: myId, senderName: name || t('mesh.me'),
      layer: SCOPE_TO_LAYER[draft.scope], scope: draft.scope,
      category: draft.category, priority: meta.priority,
      lat: userLoc.lat, lng: userLoc.lng, text: draft.text.trim(),
      shelterId: draft.shelter?.id, shelterName: draft.shelter?.name, shelterLocation: draft.shelter?.location,
      ts: Date.now(), status: 'new', replies: [], version: 1,
    }
    sos.putLocal(event)
    broadcastSos(event)
  }, [myId, name, userLoc, sos, broadcastSos, t])

  const replySos = useCallback((sosId: string, text: string, kind?: SosReplyKind) => {
    const reply: SosReply = {
      id: genId(), fromId: myId, fromName: name || t('mesh.me'), text, ts: Date.now(),
      kind, offerHelp: kind === 'willing' || undefined,
    }
    const updated = sos.addReply(sosId, reply)
    if (updated) broadcastSos(updated)
  }, [myId, name, sos, broadcastSos, t])

  const setSosStatus = useCallback((sosId: string, status: SosStatus, handledBy?: string) => {
    const updated = sos.setStatus(sosId, status, handledBy ?? (name || t('mesh.me')))
    if (updated) broadcastSos(updated)
  }, [sos, broadcastSos, name, t])

  // 求救者本人標記「已安全」→ 結案、同步給所有相關節點與共享後端
  const markSosSafe = useCallback((sosId: string) => {
    const updated = sos.markSafe(sosId, name || t('mesh.me'))
    if (updated) broadcastSos(updated)
  }, [sos, broadcastSos, name, t])

  const markNoticesRead = useCallback(() => {
    setNotices(prev => prev.some(n => !n.read) ? prev.map(n => ({ ...n, read: true })) : prev)
  }, [])
  // 單筆已讀（點擊通知時）：只動到該筆，badge 隨未讀數即時更新。
  const markNoticeRead = useCallback((notificationId: string) => {
    setNotices(prev => prev.map(n => (n.notificationId === notificationId && !n.read) ? { ...n, read: true } : n))
  }, [])
  const unreadCount = useMemo(() => notices.filter(n => !n.read).length, [notices])

  // ── SOS 發送面板（可由避難所卡片等帶預填開啟）──
  const [composerPrefill, setComposerPrefill] = useState<SosComposerPrefill | null>(null)
  const openSosComposer = useCallback((prefill?: SosComposerPrefill) => {
    setComposerPrefill(prefill ?? {})
  }, [])

  return (
    <MeshContext.Provider value={{
      ...mesh, sosFlashId,
      sosEvents: sos.sosEvents, raiseSos, replySos, setSosStatus, markSosSafe, openSosComposer,
      notices, unreadCount, markNoticesRead, markNoticeRead,
    }}>
      {children}
      {composerPrefill && (
        <SosComposer
          prefill={composerPrefill}
          connectedCount={mesh.connectedCount}
          onSubmit={draft => { raiseSos(draft); setComposerPrefill(null) }}
          onClose={() => setComposerPrefill(null)}
        />
      )}
      {toast && (
        <div className={`fixed top-16 left-1/2 -translate-x-1/2 z-[2000] glass rounded-full px-4 py-2 text-sm font-semibold flex items-center gap-2 border max-w-[90vw] ${
          toast.kind === 'sos' ? 'text-status-danger border-status-danger/50 animate-pulse'
          : toast.kind === 'announce' ? 'text-status-caution border-status-caution/50'
          : 'text-status-safe border-status-safe/40'}`}>
          {toast.kind === 'sos' ? <AlertOctagon size={16} className="text-status-danger shrink-0" />
            : toast.kind === 'announce' ? <Megaphone size={16} className="text-status-caution shrink-0" />
            : <CheckCircle size={16} className="text-status-safe shrink-0" />}
          <span className="truncate">{toast.text}</span>
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
