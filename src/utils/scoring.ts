import type { Shelter, OverallStatus, DisasterMode, UserRole } from '../types'

// re-export so pages don't need to import from two places
export type { Shelter }

/**
 * PRD 3.3 評分邏輯：
 * entry_status: official_open=30, crowd_reported=15, unverified=5
 * 每項資源: green=15, yellow=5（共4項最高60）
 * structure_age > 50: -20
 * occ > 0.8: -15
 * 總分 >= 60 → safe, 30-59 → caution, < 30 → danger
 */
export function calcScore(s: Shelter, disaster: DisasterMode): number {
  if (s.not_suitable_for.includes(disaster)) return 0

  let score = 0

  if (s.entry_status === 'official_open')       score += 30
  else if (s.entry_status === 'crowd_reported') score += 15
  else if (s.entry_status === 'unverified')     score += 5
  // closed → +0

  const { water, food, medical, power } = s.resources
  for (const r of [water, food, medical, power]) {
    if (r === 'green')  score += 15
    else if (r === 'yellow') score += 5
  }

  if (s.structure_age > 50) score -= 20

  const occ = s.capacity.current_estimate / s.capacity.physical
  if (occ > 0.8) score -= 15

  return Math.max(0, score)
}

export function getOverallStatus(s: Shelter, disaster: DisasterMode): OverallStatus {
  const score = calcScore(s, disaster)
  if (score >= 60) return 'safe'
  if (score >= 30) return 'caution'
  return 'danger'
}

/**
 * F1.4 角色修正分數：在基礎分上加減角色相關加權
 * elderly/disabled → 地下室 -15、弱勢容量不足 -5、醫療充足 +5
 * pregnant/child   → 醫療充足 +10、醫療不足 -10、弱勢容量不足 -5
 */
export function calcRoleScore(s: Shelter, disaster: DisasterMode, role: UserRole): number {
  const base = calcScore(s, disaster)
  if (base === 0) return 0

  let bonus = 0

  if (role === 'elderly' || role === 'disabled') {
    if (s.type === 'basement') bonus -= 15
    if (s.capacity.vulnerable_capacity < 30) bonus -= 5
    if (s.resources.medical === 'green') bonus += 5
  }

  if (role === 'pregnant' || role === 'child') {
    if (s.resources.medical === 'green') bonus += 10
    else if (s.resources.medical === 'red') bonus -= 10
    if (s.resources.water === 'green') bonus += 5
    if (s.capacity.vulnerable_capacity < 20) bonus -= 5
  }

  return Math.max(0, base + bonus)
}

/**
 * F2.4: 預計幾分鐘後容量達 90%（飽和）
 * 回傳 null 表示已飽和；回傳 Infinity 表示不會在 60 分鐘內飽和
 */
export function minutesToSaturation(s: Shelter, surgeRate: number): number | null {
  const threshold = s.capacity.physical * 0.9
  if (s.capacity.current_estimate >= threshold) return null
  const mins = Math.ceil((threshold - s.capacity.current_estimate) / surgeRate)
  return mins > 60 ? Infinity : mins
}

/** 依角色分數排序，分數相同時距離優先 */
export function sortByRole(
  shelters: Shelter[],
  disaster: DisasterMode,
  role: UserRole,
  fromLat: number,
  fromLng: number,
): Shelter[] {
  return [...shelters].sort((a, b) => {
    const scoreDiff = calcRoleScore(b, disaster, role) - calcRoleScore(a, disaster, role)
    if (scoreDiff !== 0) return scoreDiff
    return walkMinutes(fromLat, fromLng, a.lat, a.lng) - walkMinutes(fromLat, fromLng, b.lat, b.lng)
  })
}

export function resourceLabel(r: string): string {
  return r === 'green' ? '充足' : r === 'yellow' ? '有限' : '不足'
}

export function minutesAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (diff < 1)  return '剛剛'
  if (diff < 60) return `${diff} 分鐘前`
  return `${Math.floor(diff / 60)} 小時前`
}

/** Haversine 步行分鐘（步速 80 m/min） */
export function walkMinutes(
  fromLat: number, fromLng: number,
  toLat: number,   toLng: number,
): number {
  return travelMinutes(fromLat, fromLng, toLat, toLng, 'walk')
}

const SPEED_M_PER_MIN: Record<string, number> = {
  walk: 80,
  bike: 250,
  transit: 333,
  car: 500,
}

export function travelMinutes(
  fromLat: number, fromLng: number,
  toLat: number,   toLng: number,
  mode: string = 'walk',
): number {
  const R = 6371000
  const dLat = ((toLat - fromLat) * Math.PI) / 180
  const dLng = ((toLng - fromLng) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((fromLat * Math.PI) / 180) *
    Math.cos((toLat  * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2
  const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return Math.max(1, Math.round(dist / (SPEED_M_PER_MIN[mode] ?? 80)))
}
