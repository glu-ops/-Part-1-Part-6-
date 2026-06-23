import type {
  Shelter, ShelterAIStatus, ResourceLevel, AIReviewStatus, AbnormalSeverity,
  AIMonitorMode, AIMonitorStatus, ShelterStatusSource,
} from '../types'

/**
 * AI Camera 避難所監測節點 — 共用邏輯（PDR §7~§9, §12）。
 * 負責：triage（自動更新 vs 送指揮中心）、急需項目推導、模擬讀數產生、記錄組裝。
 * 不含 UI、不含網路；純函式，方便測試與重用。
 */

// ── 門檻（PDR §8/§9）──
export const CONFIDENCE_MIN = 85   // 可信度 ≥ 此值才可自動更新
export const OCCUPANCY_ALERT = 85  // 收容率 ≥ 此值視為接近額滿 → 需指揮中心關注
const SURGE_DELTA_RATIO = 0.25     // 人數單次變化超過容量此比例 → 視為大幅變化

// ── 權威順序（PDR §12）：command > staff > aiCamera > aiSimulation > crowd > system ──
export const SOURCE_RANK: Record<ShelterStatusSource, number> = {
  command: 5, staff: 4, aiCamera: 3, aiSimulation: 2, crowd: 1, system: 0,
}
// 同 shelterId 取較新：version 大者勝；version 相同則權威來源勝。
// AI 資料不可覆蓋較新的指揮中心 / 工作人員資料。
export function aiStatusIsNewer(incoming: ShelterAIStatus, existing: ShelterAIStatus): boolean {
  if (incoming.version !== existing.version) return incoming.version > existing.version
  // 同版本：僅當來源權威「嚴格較高」才覆蓋（如指揮中心壓過 AI）；相同來源視為回聲、忽略。
  return (SOURCE_RANK[incoming.aiMonitor.source] ?? 0) > (SOURCE_RANK[existing.aiMonitor.source] ?? 0)
}

// 全部 16 所皆部署 AI 監測節點；待監測的避難所清單由 context 的 shelters 動態提供。

// ── 範例照片（simulation 引擎依避難所挑照；真跑 /api/vision 辨識，無 token/離線時 fallback 演算法）──
// 放在 public/demo/shelter/ 下，部署後可由 /demo/shelter/*.jpg 取得。
// 對應關係見下方 DEMO_PROFILES（劇本所用照）與 CALM_PHOTOS（一般所用照）。
export const SAMPLE_PHOTOS: string[] = [
  '/demo/shelter/normal-1.jpg',      // 一般正常
  '/demo/shelter/supplies.jpg',      // 物資充足
  '/demo/shelter/crowded.jpg',       // 接近額滿 → TN-E-009
  '/demo/shelter/food-low.jpg',      // 糧食不足 → TN-E-004
  '/demo/shelter/water-low.jpg',     // 飲水偏低 → TN-E-001
  '/demo/shelter/dark-power-out.jpg',// 電力不穩/中斷 → TN-E-008
]

// 人潮密度燈號 → 粗估人數（PDR §7.1：AI 出燈號，人數由密度區間推估）。
// green 寬鬆(30–60%) / yellow 擁擠(60–85%) / red 接近額滿(85–100%)。
// prevCount 提供時於區間內靠近前值，避免每次跳動過大。
export function estimateCountFromOccupancy(
  level: ResourceLevel, capacity: number, prevCount?: number,
): number {
  const band: Record<string, [number, number]> = {
    green: [0.3, 0.6], yellow: [0.6, 0.85], red: [0.85, 1.0], unknown: [0.4, 0.7],
  }
  const [lo, hi] = band[level] ?? band.unknown
  const loN = Math.round(lo * capacity)
  const hiN = Math.round(hi * capacity)
  if (prevCount != null && prevCount >= loN && prevCount <= hiN) {
    const jitter = Math.round((Math.random() - 0.5) * capacity * 0.05)
    return Math.max(loN, Math.min(hiN, prevCount + jitter))
  }
  return loN + Math.round(Math.random() * (hiN - loN))
}

// 收容率 → 收容狀態文字（使用者端顯示用）
export function occupancyLabel(rate: number): string {
  if (rate >= 100) return '已額滿'
  if (rate >= OCCUPANCY_ALERT) return '接近額滿'
  if (rate >= 70) return '偏滿'
  return '可收容'
}

// 資源等級 → 文字（PDR §7.2~§7.6；power 用「中斷」、supplies 用「充足」）
const LEVEL_LABEL: Record<ResourceLevel, string> = { green: '正常', yellow: '偏低', red: '不足', unknown: '未知' }
export function levelLabel(level: ResourceLevel, kind?: 'power' | 'supplies'): string {
  if (level === 'red' && kind === 'power') return '中斷'
  if (level === 'green' && kind === 'supplies') return '充足'
  return LEVEL_LABEL[level]
}

type ResKey = keyof ShelterAIStatus['resources']
const RES_NEED_LABEL: Record<ResKey, { red: string; yellow: string }> = {
  water:    { red: '缺水',     yellow: '飲水偏少' },
  food:     { red: '缺糧',     yellow: '糧食偏少' },
  medical:  { red: '缺醫療',   yellow: '醫療偏少' },
  power:    { red: '電力中斷', yellow: '電力不穩' },
  supplies: { red: '缺物資',   yellow: '物資偏少' },
}

// 急需項目是否為「危急（紅）」等級；偏少 / 不穩屬「警戒（黃）」等級。
// 用於顯示時上色，避免黃色等級也染成紅色（紅色只給真正缺乏）。
export function needIsCritical(need: string): boolean {
  return !(need.includes('偏') || need.includes('不穩'))
}

// 由人潮與資源產生一句 AI 狀況分析（vision 無 note 或走模擬 fallback 時使用）
export function summarizeReading(occupancyRate: number, resources: ShelterAIStatus['resources']): string {
  const parts: string[] = []
  parts.push(occupancyRate >= OCCUPANCY_ALERT ? '人潮接近額滿' : occupancyRate >= 70 ? '人潮偏多' : '人潮寬鬆')
  const reds = deriveUrgentNeeds(resources).filter(n => !n.includes('偏'))
  if (reds.length) parts.push(reds.join('、'))
  else {
    const yellows = (Object.keys(resources) as (keyof ShelterAIStatus['resources'])[]).filter(k => resources[k] === 'yellow')
    parts.push(yellows.length ? '部分物資偏少' : '物資大致正常')
  }
  return parts.join('，') + '。'
}

// 由資源燈號推導「急需項目」清單（紅優先、黃其次）
export function deriveUrgentNeeds(resources: ShelterAIStatus['resources']): string[] {
  const needs: string[] = []
  for (const k of Object.keys(resources) as ResKey[]) {
    const lv = resources[k]
    if (lv === 'red') needs.push(RES_NEED_LABEL[k].red)
  }
  for (const k of Object.keys(resources) as ResKey[]) {
    const lv = resources[k]
    if (lv === 'yellow') needs.push(RES_NEED_LABEL[k].yellow)
  }
  return needs
}

// 各資源的異常原因文字：red=危急、yellow=警戒
const RES_REASON: Record<ResKey, { red: string; yellow: string }> = {
  water:    { red: '飲水不足',     yellow: '飲水偏低' },
  food:     { red: '糧食不足',     yellow: '糧食偏低' },
  medical:  { red: '醫療不足',     yellow: '醫療偏低' },
  power:    { red: '電力異常',     yellow: '電力不穩' },
  supplies: { red: '物資嚴重不足', yellow: '物資偏低' },
}

/**
 * 異常判定（PDR §9，擴充黃色警戒）：哪些狀況不可自動更新、需送東區救災指揮中心。
 * 紅色 / 接近額滿 / 離線 → critical（危急）；黃色資源偏低 / 可信度偏低 → warning（警戒）。
 * prevCount 提供時，額外檢查人數是否短時間大幅變化。
 */
export function assessAbnormal(
  s: Pick<ShelterAIStatus, 'people' | 'resources' | 'confidence' | 'aiMonitor'>,
  prevCount?: number,
): { abnormal: boolean; reasons: string[]; severity?: AbnormalSeverity } {
  const critical: string[] = []
  const warning: string[] = []
  if (s.people.occupancyRate >= OCCUPANCY_ALERT) critical.push('收容率接近額滿')
  for (const k of Object.keys(s.resources) as ResKey[]) {
    const lv = s.resources[k]
    if (lv === 'red') critical.push(RES_REASON[k].red)
    else if (lv === 'yellow') warning.push(RES_REASON[k].yellow)
  }
  if (s.aiMonitor.status === 'offline' || s.aiMonitor.status === 'error') critical.push('AI Camera 離線')
  if (s.confidence < CONFIDENCE_MIN) warning.push('AI 可信度偏低')
  if (prevCount != null && s.people.capacity > 0) {
    const delta = Math.abs(s.people.estimatedCount - prevCount) / s.people.capacity
    if (delta > SURGE_DELTA_RATIO) warning.push('人數短時間大幅變化')
  }
  const reasons = [...critical, ...warning]
  const severity: AbnormalSeverity | undefined = critical.length ? 'critical' : warning.length ? 'warning' : undefined
  return { abnormal: reasons.length > 0, reasons, severity }
}

// 可自動更新（PDR §8）：可信度足夠且無異常
export function canAutoUpdate(abnormal: boolean, confidence: number): boolean {
  return !abnormal && confidence >= CONFIDENCE_MIN
}

// 審核狀態：異常 → pending（等指揮中心）；否則 auto（系統自動更新）
export function deriveReview(abnormal: boolean, confidence: number): AIReviewStatus {
  return canAutoUpdate(abnormal, confidence) ? 'auto' : 'pending'
}

// ── 組裝一筆完整 ShelterAIStatus（由原始讀數 + 容量 → 補齊 triage / 急需 / review）──
export interface RawReading {
  estimatedCount: number
  resources: ShelterAIStatus['resources']
  confidence: number              // 0–100
  peopleConfidence?: number       // 人數估計可信度，預設同 confidence
  monitorStatus?: AIMonitorStatus // 預設 online
  note?: string                   // AI 狀況分析文字（vision note）；缺則自動生成摘要
}

export function buildAiStatus(opts: {
  shelterId: string
  capacity: number
  reading: RawReading
  source: ShelterStatusSource
  mode: AIMonitorMode
  prevCount?: number
  prevVersion?: number
  now?: number
}): ShelterAIStatus {
  const { shelterId, capacity, reading, source, mode, prevCount, prevVersion = 0 } = opts
  const nowMs = opts.now ?? Date.now()
  const iso = new Date(nowMs).toISOString()
  const occupancyRate = capacity > 0 ? Math.round((reading.estimatedCount / capacity) * 100) : 0
  const monitorStatus: AIMonitorStatus = reading.monitorStatus ?? 'online'

  const people = {
    estimatedCount: reading.estimatedCount,
    capacity,
    occupancyRate,
    confidence: Math.round(reading.peopleConfidence ?? reading.confidence),
  }
  const aiMonitor = { status: monitorStatus, mode, source, lastReportAt: iso }
  const { abnormal, reasons, severity } = assessAbnormal(
    { people, resources: reading.resources, confidence: reading.confidence, aiMonitor },
    prevCount,
  )

  return {
    shelterId,
    aiMonitor,
    people,
    resources: reading.resources,
    urgentNeeds: deriveUrgentNeeds(reading.resources),
    analysis: reading.note?.trim() || summarizeReading(occupancyRate, reading.resources),
    abnormal,
    abnormalReasons: reasons,
    abnormalSeverity: severity,
    confidence: Math.round(reading.confidence),
    review: deriveReview(abnormal, reading.confidence),
    detectedAt: iso,
    updatedAt: iso,
    version: prevVersion + 1,
  }
}

// ── 演算法模擬讀數（fallback：無 vision token / 離線時用）──
// demo 設計：精選 4 所呈現「不同類型」異常（紅黃混合），其餘維持安全正常，
// 避免畫面同時出現太多異常、也不讓異常全是人數爆滿。
type DemoProfile = { occ: [number, number]; res?: Partial<ShelterAIStatus['resources']>; photo?: string }
const CLEAN_OCC: [number, number] = [0.35, 0.68]
const DEMO_PROFILES: Record<string, DemoProfile> = {
  'TN-E-009': { occ: [0.90, 1.0], photo: '/demo/shelter/crowded.jpg' },                         // 接近額滿（紅）
  'TN-E-004': { occ: [0.45, 0.65], res: { food: 'red' }, photo: '/demo/shelter/food-low.jpg' }, // 糧食不足（紅）
  'TN-E-001': { occ: [0.40, 0.60], res: { water: 'yellow' }, photo: '/demo/shelter/water-low.jpg' }, // 飲水偏低（黃）
  'TN-E-008': { occ: [0.45, 0.65], res: { power: 'yellow' }, photo: '/demo/shelter/dark-power-out.jpg' }, // 電力不穩（黃）
}

// 為某避難所挑一張範例照：有 demo 劇本者用對應照，其餘用一般照。
const CALM_PHOTOS = ['/demo/shelter/normal-1.jpg', '/demo/shelter/supplies.jpg']
export function samplePhotoFor(shelterId: string, i: number): string {
  return DEMO_PROFILES[shelterId]?.photo ?? CALM_PHOTOS[Math.abs(i) % CALM_PHOTOS.length]
}

export function simulateRawReading(shelter: Shelter, prev?: ShelterAIStatus): RawReading {
  const cap = shelter.capacity.physical
  const profile = DEMO_PROFILES[shelter.shelter_id]
  const [lo, hi] = profile?.occ ?? CLEAN_OCC
  const loN = Math.round(lo * cap)
  const hiN = Math.round(hi * cap)
  const base = prev?.people.estimatedCount ?? shelter.capacity.current_estimate
  const next = base + Math.round((Math.random() - 0.45) * cap * 0.04)   // 小幅漂移製造變化
  const estimatedCount = Math.max(loN, Math.min(hiN, next))             // 夾回目標區間

  // 預設全綠（正常），再套用 demo 劇本的特定資源狀況
  const resources: ShelterAIStatus['resources'] = {
    water: 'green', food: 'green', medical: 'green', power: 'green', supplies: 'green',
    ...(profile?.res ?? {}),
  }
  const confidence = 92 + Math.floor(Math.random() * 8)   // 一律高可信度，不以可信度製造異常
  return { estimatedCount, resources, confidence }
}
