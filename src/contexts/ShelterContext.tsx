import { createContext, useContext, useState, useMemo } from 'react'
import type { ReactNode } from 'react'
import type { Shelter, CrowdReport } from '../types'
import sheltersData from '../data/shelters.json'
import reportsData from '../data/reports.json'

/**
 * 每分鐘湧入人數（人/分）。
 * 設計目標：t=15 時至少 3 個 marker 從 safe 降為 caution：
 *   TN-E-006 (cap 200, cur 60)  → 60+7×15=165 → 82.5% → occ penalty → safe→caution ✓
 *   TN-E-010 (cap 320, cur 95)  → 95+11×15=260 → 81.3% → safe→caution ✓
 *   TN-E-016 (cap 240, cur 30)  → 30+11×15=195 → 81.3% → safe→caution ✓
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

interface ShelterCtx {
  shelters: Shelter[]
  reports: CrowdReport[]
  timeOffset: number
  setTimeOffset: (n: number) => void
  addReport: (r: CrowdReport) => void
}

const ShelterContext = createContext<ShelterCtx | null>(null)

export function ShelterProvider({ children }: { children: ReactNode }) {
  const [timeOffset, setTimeOffset] = useState(0)
  const [localReports, setLocalReports] = useState<CrowdReport[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('guardian_reports') ?? '[]')
    } catch {
      return []
    }
  })

  const reports = useMemo(
    () => [...(reportsData as CrowdReport[]), ...localReports],
    [localReports],
  )

  const shelters = useMemo(() => {
    return (sheltersData as Shelter[]).map(s => {
      const surge = Math.floor(getSurgeRate(s.shelter_id) * timeOffset)
      return {
        ...s,
        capacity: {
          ...s.capacity,
          current_estimate: Math.min(
            s.capacity.physical,
            s.capacity.current_estimate + surge,
          ),
        },
      }
    })
  }, [timeOffset])

  function addReport(r: CrowdReport) {
    const updated = [...localReports, r]
    setLocalReports(updated)
    localStorage.setItem('guardian_reports', JSON.stringify(updated))
  }

  return (
    <ShelterContext.Provider value={{ shelters, reports, timeOffset, setTimeOffset, addReport }}>
      {children}
    </ShelterContext.Provider>
  )
}

export function useShelters() {
  const ctx = useContext(ShelterContext)
  if (!ctx) throw new Error('useShelters must be inside ShelterProvider')
  return ctx
}
