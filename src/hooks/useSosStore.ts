import { useState, useRef, useCallback, useMemo } from 'react'
import type { SosEvent, SosReply, SosStatus } from '../types'
import { SOS_STATUS_RANK, isSosClosed } from '../sos'

// SOS 事件持久化（同源各分頁共用；指揮中心重整後可重讀歷史）
const STORE_KEY = 'guardian_sos'

const STATUS_RANK = SOS_STATUS_RANK

function uniqReplies(a: SosReply[] = [], b: SosReply[] = []): SosReply[] {
  const byId = new Map<string, SosReply>()
  for (const r of [...a, ...b]) byId.set(r.id, r)
  return [...byId.values()].sort((x, y) => x.ts - y.ts)
}

/** 合併兩筆同 id 的 SOS：狀態取較進階、回覆取聯集、版本取大 */
function mergeOne(a: SosEvent, b: SosEvent): SosEvent {
  const newer = b.version >= a.version ? b : a
  const status = STATUS_RANK[a.status] >= STATUS_RANK[b.status] ? a.status : b.status
  return {
    ...newer,
    status,
    replies: uniqReplies(a.replies, b.replies),
    handledBy: b.handledBy ?? a.handledBy,
    safeBySelf: a.safeBySelf || b.safeBySelf,
    version: Math.max(a.version, b.version),
  }
}

function load(): SosEvent[] {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) ?? '[]') as SosEvent[]
    return Array.isArray(saved) ? saved.map(s => ({ ...s, replies: s.replies ?? [] })) : []
  } catch {
    return []
  }
}

export interface SosMergeResult {
  changed: boolean
  merged: SosEvent
  prevStatus?: SosStatus
  isNew: boolean
}

/**
 * SOS 事件 store（純前端持久化 + 合併）。
 * 由 MeshContext 與 RescueCenterPage 各自實例化，分別接到自己的 usePeerMesh。
 * 重要 SOS 以 localStorage 持久化，不只依賴即時接收 → 重連可重讀。
 */
export function useSosStore() {
  const [sosEvents, setSosEvents] = useState<SosEvent[]>(load)
  const ref = useRef(sosEvents)
  ref.current = sosEvents

  const persist = useCallback((next: SosEvent[]) => {
    ref.current = next
    setSosEvents(next)
    try { localStorage.setItem(STORE_KEY, JSON.stringify(next)) } catch { /* 容量不足忽略 */ }
  }, [])

  /** 本地建立 / 更新一筆 SOS（自己發起或推進狀態），回傳最終事件供 Mesh 分享 */
  const putLocal = useCallback((e: SosEvent): SosEvent => {
    const cur = ref.current
    const i = cur.findIndex(x => x.id === e.id)
    if (i === -1) { persist([...cur, e]); return e }
    const merged = mergeOne(cur[i], e)
    const next = [...cur]; next[i] = merged; persist(next)
    return merged
  }, [persist])

  /** 來自 Mesh 的 SOS（新或演變版）→ 合併；回傳是否有變動 */
  const mergeRemote = useCallback((incoming: SosEvent): SosMergeResult => {
    const e = { ...incoming, replies: incoming.replies ?? [] }
    const cur = ref.current
    const i = cur.findIndex(x => x.id === e.id)
    if (i === -1) { persist([...cur, e]); return { changed: true, merged: e, isNew: true } }
    const prevStatus = cur[i].status
    const merged = mergeOne(cur[i], e)
    const changed = JSON.stringify(merged) !== JSON.stringify(cur[i])
    if (changed) { const next = [...cur]; next[i] = merged; persist(next) }
    return { changed, merged, prevStatus, isNew: false }
  }, [persist])

  /** 追加一則回覆（綁定原 SOS）→ 回傳新版事件供分享 */
  const addReply = useCallback((sosId: string, reply: SosReply): SosEvent | null => {
    const cur = ref.current
    const i = cur.findIndex(x => x.id === sosId)
    if (i === -1) return null
    const updated: SosEvent = {
      ...cur[i],
      replies: uniqReplies(cur[i].replies, [reply]),
      version: cur[i].version + 1,
    }
    const next = [...cur]; next[i] = updated; persist(next)
    return updated
  }, [persist])

  /** 推進處理狀態（指揮中心 / 接手者）→ 回傳新版事件供分享 */
  const setStatus = useCallback((sosId: string, status: SosStatus, handledBy?: string): SosEvent | null => {
    const cur = ref.current
    const i = cur.findIndex(x => x.id === sosId)
    if (i === -1) return null
    const updated: SosEvent = {
      ...cur[i], status,
      handledBy: handledBy ?? cur[i].handledBy,
      version: cur[i].version + 1,
    }
    const next = [...cur]; next[i] = updated; persist(next)
    return updated
  }, [persist])

  /** 求救者本人標記「已安全」（結案，從即時列表/地圖移除、保留歷史） */
  const markSafe = useCallback((sosId: string, byName: string): SosEvent | null => {
    const cur = ref.current
    const i = cur.findIndex(x => x.id === sosId)
    if (i === -1) return null
    const updated: SosEvent = {
      ...cur[i], status: 'safe', safeBySelf: true,
      handledBy: cur[i].handledBy ?? byName,
      version: cur[i].version + 1,
    }
    const next = [...cur]; next[i] = updated; persist(next)
    return updated
  }, [persist])

  /** 未結案（非 safe/resolved）的 SOS，用於重連同步 */
  const openEvents = useMemo(() => sosEvents.filter(e => !isSosClosed(e.status)), [sosEvents])
  const openEventsRef = useRef(openEvents)
  openEventsRef.current = openEvents

  /** 取目前未結案事件（給 Mesh 在新連線時推送，stable function） */
  const getOpenEvents = useCallback(() => openEventsRef.current, [])

  return { sosEvents, putLocal, mergeRemote, addReply, setStatus, markSafe, getOpenEvents }
}
