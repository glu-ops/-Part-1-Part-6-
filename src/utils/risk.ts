// 區域災害風險評估（地震 / 淹水）。
// 定位：地震為「災後快速風險評估」（非預測發生時間地點）；淹水為即時/累積降雨評估。
// 資料：zones.json（東區里級區域 + 場址/淹水屬性）＋ hazard-live.json（即時災害輸入，本地模擬）。
import zonesData from '../data/zones.json'
import hazardLive from '../data/hazard-live.json'
import { distanceMeters } from './geo'
import { accumRatioToL1, rainWarnLevel } from '../flood'
import type { DisasterMode } from '../types'

export interface Zone {
  id: string
  name: string
  center: { lat: number; lng: number }
  floodPotential: number   // 0..3 淹水潛勢
  drainage: 'low' | 'med' | 'high'
  nearRiver: boolean
  coastal: boolean
  siteAmp: number          // 場址放大係數（軟弱地盤→PGA 放大）
  note?: string
}

export type RiskLevel = 'low' | 'caution' | 'high' | 'danger'

export interface ReasonCode { code: string; vars?: Record<string, string | number> }

export interface ZoneRisk {
  zone: Zone
  score: number            // 0..100
  level: RiskLevel
  reasons: ReasonCode[]
  // 地震模式附帶估算值（供顯示）
  intensityLabel?: string
  pga?: number
}

export const RISK_COLOR: Record<RiskLevel, string> = {
  low: '#889D73', caution: '#F5C776', high: '#F5C776', danger: '#B30303',
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

function toLevel(score: number): RiskLevel {
  if (score >= 75) return 'danger'
  if (score >= 55) return 'high'
  if (score >= 35) return 'caution'
  return 'low'
}

// ── 地震：簡化地動衰減（shakemap 式估算，非真實測站值） ──
function estimatePGA(mag: number, hypoKm: number, siteAmp: number): number {
  // ln(PGA gal) = 3.5 + 0.8M − 1.3 ln(R)；再乘場址放大
  const base = Math.exp(3.5 + 0.8 * mag - 1.3 * Math.log(Math.max(hypoKm, 1)))
  return Math.min(1200, base * siteAmp)
}

// CWA 震度階（新制，gal）→ 數值 + 標籤
function pgaToIntensity(pga: number): { value: number; label: string } {
  if (pga >= 800) return { value: 7, label: '7' }
  if (pga >= 440) return { value: 6.5, label: '6強' }
  if (pga >= 250) return { value: 6, label: '6弱' }
  if (pga >= 140) return { value: 5.5, label: '5強' }
  if (pga >= 80)  return { value: 5, label: '5弱' }
  if (pga >= 25)  return { value: 4, label: '4' }
  if (pga >= 8)   return { value: 3, label: '3' }
  if (pga >= 2.5) return { value: 2, label: '2' }
  return { value: 1, label: '1' }
}

export function assessEarthquake(zone: Zone): ZoneRisk {
  const q = hazardLive.earthquake
  const surfaceKm = distanceMeters(zone.center, q.epicenter) / 1000
  const hypoKm = Math.sqrt(surfaceKm ** 2 + q.depth_km ** 2)
  const pga = Math.round(estimatePGA(q.magnitude, hypoKm, zone.siteAmp))
  const intensity = pgaToIntensity(pga)
  const after = q.aftershocks_1h

  // 區域差異主要來自場址放大（軟弱地盤），故 PGA（連續、隨場址變化）權重高、
  // 規模（全區一致）權重低 —— 避免單一事件把全區壓成同一級。
  const intensityScore = (intensity.value / 7) * 25
  const magScore       = clamp01((q.magnitude - 4) / 3.5) * 10
  const distScore      = clamp01((50 - surfaceKm) / 50) * 15
  const depthScore     = clamp01((50 - q.depth_km) / 50) * 10
  const pgaScore       = clamp01(pga / 450) * 25
  const afterScore     = after >= 5 ? 10 : after >= 2 ? 5 : 0
  const score = Math.round(Math.min(100, intensityScore + magScore + distScore + depthScore + pgaScore + afterScore))

  const reasons: ReasonCode[] = []
  if (intensity.value >= 5) reasons.push({ code: 'intensity', vars: { v: intensity.label } })
  if (surfaceKm <= 12)      reasons.push({ code: 'nearEpi', vars: { d: surfaceKm.toFixed(0) } })
  if (q.depth_km <= 15)     reasons.push({ code: 'shallow', vars: { d: q.depth_km } })
  if (pga >= 140)           reasons.push({ code: 'pga', vars: { v: pga } })
  if (after >= 5)           reasons.push({ code: 'aftershock', vars: { n: after } })
  if (zone.siteAmp >= 1.3)  reasons.push({ code: 'siteAmp' })

  return { zone, score, level: toLevel(score), reasons: reasons.slice(0, 3), intensityLabel: intensity.label, pga }
}

export function assessFlood(zone: Zone): ZoneRisk {
  const f = hazardLive.flood
  // 累積雨量以南區站官方「一級警戒」門檻正規化（1.0 = 已達一級），取代先前任意分母
  const accumRatio = accumRatioToL1(f)
  const warn = rainWarnLevel(f)
  const rainNowScore   = clamp01(f.rain_now_mmhr / 80) * 15
  const accumScore     = clamp01(accumRatio) * 25
  const riverScore     = clamp01(f.river.level_ratio) * (zone.nearRiver ? 15 : 6)
  const drainageScore  = (zone.drainage === 'low' ? 1 : zone.drainage === 'med' ? 0.5 : 0.15) * 10
  const tideScore      = zone.coastal && f.tide_high ? clamp01(f.tide_ratio) * 10 : 0
  const pumpScore      = (f.pump_abnormal ? 6 : 0) + (f.gate_closed ? 4 : 0)
  const potentialScore = (zone.floodPotential / 3) * 15
  const score = Math.round(Math.min(100,
    rainNowScore + accumScore + riverScore + drainageScore + tideScore + pumpScore + potentialScore))

  const reasons: ReasonCode[] = []
  // 官方警戒等級（一級 / 二級）優先呈現，附觸發時段與雨量
  if (warn.level === 'l1')       reasons.push({ code: 'warnL1', vars: { w: warn.window!, v: warn.value! } })
  else if (warn.level === 'l2')  reasons.push({ code: 'warnL2', vars: { w: warn.window!, v: warn.value! } })
  if (f.rain_now_mmhr >= 50)                          reasons.push({ code: 'rainNow', vars: { v: f.rain_now_mmhr } })
  if (zone.nearRiver && f.river.level_ratio >= 0.85)  reasons.push({ code: 'river', vars: { name: f.river.name } })
  if (zone.floodPotential >= 2)                       reasons.push({ code: 'potential' })
  if (zone.drainage === 'low')                        reasons.push({ code: 'drainage' })
  if (f.pump_abnormal)                                reasons.push({ code: 'pump' })
  if (f.gate_closed)                                  reasons.push({ code: 'gate' })
  if (zone.coastal && f.tide_high)                    reasons.push({ code: 'tide' })

  return { zone, score, level: toLevel(score), reasons: reasons.slice(0, 3) }
}

/** 評估所有區域（依分數遞減排序）。war/epidemic 無模型 → 空陣列。 */
export function assessAllZones(disaster: DisasterMode): ZoneRisk[] {
  const zones = zonesData as Zone[]
  if (disaster === 'earthquake') return zones.map(assessEarthquake).sort((a, b) => b.score - a.score)
  if (disaster === 'flood')      return zones.map(assessFlood).sort((a, b) => b.score - a.score)
  return []
}

export { hazardLive }
