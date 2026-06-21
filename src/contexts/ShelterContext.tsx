import { createContext, useContext, useState, useMemo, useRef, useCallback } from 'react'
import type { ReactNode } from 'react'
import type { Shelter, CrowdReport, HandleStatus } from '../types'
import sheltersData from '../data/shelters.json'
import reportsData from '../data/reports.json'

// 處理狀態優先序（合併時取較進階者）
const STATUS_RANK: Record<HandleStatus, number> = { active: 0, received: 1, handling: 2, resolved: 3 }
function advancedStatus(a: HandleStatus = 'active', b: HandleStatus = 'active'): HandleStatus {
  return STATUS_RANK[a] >= STATUS_RANK[b] ? a : b
}

/**
 * 每分鐘湧入人數（人/分）。
 * 設計目標：t=15 時至少 3 個 marker 從 safe 降為 caution。
 */
const SURGE_RATES: Record<string, number> = {
  'TN-E-001': 15, 'TN-E-002': 8,  'TN-E-003': 10,
  'TN-E-004': 18, 'TN-E-005': 15, 'TN-E-006': 7,
  'TN-E-007': 9,  'TN-E-008': 12, 'TN-E-009': 1,
  'TN-E-010': 11, 'TN-E-011': 10, 'TN-E-012': 8,
  'TN-E-013': 8,  'TN-E-014': 10, 'TN-E-015': 9,
  'TN-E-016': 11,
}

export function getSurgeRate(shelterId: string): number {
  return SURGE_RATES[shelterId] ?? 8
}

// ── 持久化的本機使用者 ID（投票/作者身分；跨 reload 穩定） ──
const UID_KEY = 'guardian_uid'
export function getClientId(): string {
  let id = localStorage.getItem(UID_KEY)
  if (!id) { id = `u-${Math.random().toString(36).slice(2, 9)}`; localStorage.setItem(UID_KEY, id) }
  return id
}

const STORE_KEY = 'guardian_reports'

function normalize(r: Partial<CrowdReport> & { id: string }): CrowdReport {
  return {
    shelter_id: r.shelter_id ?? null,
    type: r.type ?? 'disaster',
    severity: r.severity ?? 'yellow',
    note: r.note ?? '',
    reported_at: r.reported_at ?? new Date().toISOString(),
    lat: r.lat ?? 0,
    lng: r.lng ?? 0,
    photos: r.photos ?? [],
    attachments: r.attachments ?? [],
    upVoters: r.upVoters ?? [],
    downVoters: r.downVoters ?? [],
    status: r.status ?? 'active',
    resolvedNote: r.resolvedNote,
    author: r.author,
    authorName: r.authorName,
    threadId: r.threadId ?? r.id,   // 缺省自成一串
    version: r.version ?? 1,
    id: r.id,
  }
}

function uniq(a: string[] = [], b: string[] = []): string[] {
  return [...new Set([...a, ...b])]
}

/** 合併兩筆同 id 回報：投票取聯集、狀態取較進階、版本取大 */
function mergeOne(a: CrowdReport, b: CrowdReport): CrowdReport {
  const newer = b.version >= a.version ? b : a
  return {
    ...newer,
    upVoters: uniq(a.upVoters, b.upVoters),
    downVoters: uniq(a.downVoters, b.downVoters),
    status: advancedStatus(a.status, b.status),
    resolvedNote: b.resolvedNote ?? a.resolvedNote,
    threadId: a.threadId ?? b.threadId ?? a.id,
    version: Math.max(a.version, b.version),
  }
}

export interface ReportThread {
  threadId: string
  reports: CrowdReport[]            // 依時間排序（舊→新）
  latest: CrowdReport              // 串中最新一筆
  status: HandleStatus             // 串的整體狀態（取最進階）
}

interface ShelterCtx {
  shelters: Shelter[]
  reports: CrowdReport[]            // 含已處理（tombstone），UI 自行過濾
  activeReports: CrowdReport[]      // status !== 'resolved'
  reportThreads: ReportThread[]    // 依 threadId 分組（同地點多人補充串）
  timeOffset: number
  setTimeOffset: (n: number) => void
  addReport: (r: CrowdReport) => boolean
  mergeReport: (r: CrowdReport) => { changed: boolean; merged: CrowdReport; prevStatus?: HandleStatus; isNew: boolean }
  voteReport: (id: string, dir: 'up' | 'down', voterId: string) => CrowdReport | null
  resolveReport: (id: string, note?: string) => CrowdReport | null
  setReportStatus: (id: string, status: HandleStatus, note?: string) => CrowdReport | null
  setThreadStatus: (threadId: string, status: HandleStatus, note?: string) => CrowdReport[]
}

const ShelterContext = createContext<ShelterCtx | null>(null)

export function ShelterProvider({ children }: { children: ReactNode }) {
  const [timeOffset, setTimeOffset] = useState(0)

  const [reports, setReports] = useState<CrowdReport[]>(() => {
    const byId = new Map<string, CrowdReport>()
    for (const r of reportsData as CrowdReport[]) byId.set(r.id, normalize(r))
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) ?? '[]') as CrowdReport[]
      for (const r of saved) {
        const n = normalize(r)
        byId.set(r.id, byId.has(r.id) ? mergeOne(byId.get(r.id)!, n) : n)
      }
    } catch { /* ignore */ }
    return [...byId.values()]
  })

  const reportsRef = useRef(reports)
  reportsRef.current = reports

  const persist = useCallback((next: CrowdReport[]) => {
    reportsRef.current = next
    setReports(next)
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(next))
      return true
    } catch {
      return false
    }
  }, [])

  const shelters = useMemo(() => {
    return (sheltersData as Shelter[]).map(s => {
      const surge = Math.floor(getSurgeRate(s.shelter_id) * timeOffset)
      return {
        ...s,
        capacity: {
          ...s.capacity,
          current_estimate: Math.min(s.capacity.physical, s.capacity.current_estimate + surge),
        },
      }
    })
  }, [timeOffset])

  const addReport = useCallback((r: CrowdReport) => {
    const n = normalize(r)
    const cur = reportsRef.current
    const i = cur.findIndex(x => x.id === n.id)
    if (i === -1) return persist([...cur, n])
    const next = [...cur]
    next[i] = mergeOne(cur[i], n)
    return persist(next)
  }, [persist])

  // 來自 Mesh 的回報 → 合併；回傳是否有變動（決定要不要再轉發）與前一狀態（供通知）
  const mergeReport = useCallback((incoming: CrowdReport) => {
    const n = normalize(incoming)
    const cur = reportsRef.current
    const i = cur.findIndex(r => r.id === n.id)
    if (i === -1) { persist([...cur, n]); return { changed: true, merged: n, isNew: true } }
    const prevStatus = cur[i].status
    const merged = mergeOne(cur[i], n)
    const changed = JSON.stringify(merged) !== JSON.stringify(cur[i])
    if (changed) { const next = [...cur]; next[i] = merged; persist(next) }
    return { changed, merged, prevStatus, isNew: false }
  }, [persist])

  const voteReport = useCallback((id: string, dir: 'up' | 'down', voterId: string): CrowdReport | null => {
    const cur = reportsRef.current
    const i = cur.findIndex(r => r.id === id)
    if (i === -1) return null
    const r = cur[i]
    const up = new Set(r.upVoters ?? []); const down = new Set(r.downVoters ?? [])
    if (dir === 'up') { down.delete(voterId); up.has(voterId) ? up.delete(voterId) : up.add(voterId) }
    else              { up.delete(voterId);  down.has(voterId) ? down.delete(voterId) : down.add(voterId) }
    const updated: CrowdReport = { ...r, upVoters: [...up], downVoters: [...down], version: r.version + 1 }
    const next = [...cur]; next[i] = updated; persist(next)
    return updated
  }, [persist])

  // 指揮中心推進處理狀態：active→received→handling→resolved
  const setReportStatus = useCallback((id: string, status: HandleStatus, note?: string): CrowdReport | null => {
    const cur = reportsRef.current
    const i = cur.findIndex(r => r.id === id)
    if (i === -1) return null
    const updated: CrowdReport = {
      ...cur[i], status,
      resolvedNote: status === 'resolved' ? (note ?? cur[i].resolvedNote) : cur[i].resolvedNote,
      version: cur[i].version + 1,
    }
    const next = [...cur]; next[i] = updated; persist(next)
    return updated
  }, [persist])

  // 整串推進狀態（同 threadId 的所有補充一起標記）→ 回傳更新後的回報供 Mesh 廣播
  const setThreadStatus = useCallback((threadId: string, status: HandleStatus, note?: string): CrowdReport[] => {
    const cur = reportsRef.current
    const updated: CrowdReport[] = []
    const next = cur.map(r => {
      if ((r.threadId ?? r.id) !== threadId) return r
      const u: CrowdReport = {
        ...r, status,
        resolvedNote: status === 'resolved' ? (note ?? r.resolvedNote) : r.resolvedNote,
        version: r.version + 1,
      }
      updated.push(u)
      return u
    })
    if (updated.length) persist(next)
    return updated
  }, [persist])

  // 標記已處理（resolved）— 保留歷史，僅地圖過濾
  const resolveReport = useCallback((id: string, note?: string): CrowdReport | null => {
    return setReportStatus(id, 'resolved', note)
  }, [setReportStatus])

  const activeReports = useMemo(() => reports.filter(r => r.status !== 'resolved'), [reports])

  // 依 threadId 分組成回報串（同地點/事件多人補充）
  const reportThreads = useMemo<ReportThread[]>(() => {
    const groups = new Map<string, CrowdReport[]>()
    for (const r of reports) {
      const key = r.threadId ?? r.id
      const arr = groups.get(key); if (arr) arr.push(r); else groups.set(key, [r])
    }
    const threads: ReportThread[] = []
    for (const [threadId, list] of groups) {
      const sorted = [...list].sort((a, b) => +new Date(a.reported_at) - +new Date(b.reported_at))
      const status = sorted.reduce<HandleStatus>((acc, r) => advancedStatus(acc, r.status), 'active')
      threads.push({ threadId, reports: sorted, latest: sorted[sorted.length - 1], status })
    }
    // 最新活動在前
    return threads.sort((a, b) => +new Date(b.latest.reported_at) - +new Date(a.latest.reported_at))
  }, [reports])

  return (
    <ShelterContext.Provider value={{
      shelters, reports, activeReports, reportThreads, timeOffset, setTimeOffset,
      addReport, mergeReport, voteReport, resolveReport, setReportStatus, setThreadStatus,
    }}>
      {children}
    </ShelterContext.Provider>
  )
}

export function useShelters() {
  const ctx = useContext(ShelterContext)
  if (!ctx) throw new Error('useShelters must be inside ShelterProvider')
  return ctx
}
