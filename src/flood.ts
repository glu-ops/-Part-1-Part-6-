// 淹水官方參數（來源：臺南市東區水災防災地圖，編號 6703200）。
// 把地圖上的真實數據集中於此，供風險模型、圖層、圖例共用，取代先前的臆測數字。

// ── 南區參考雨量站：淹水警戒雨量門檻（mm）──
// 二級警戒（l2，黃色注意）/ 一級警戒（l1，紅色嚴重，門檻較高）。
export const RAIN_ALERT = {
  '1h':  { l2: 40,  l1: 50 },
  '3h':  { l2: 100, l1: 110 },
  '6h':  { l2: 130, l1: 150 },
  '12h': { l2: 160, l1: 200 },
  '24h': { l2: 210, l1: 250 },
} as const

export type RainWindow = keyof typeof RAIN_ALERT
export type WarnLevel = 'none' | 'l2' | 'l1'

export interface RainStat {
  rain_1h: number; rain_3h: number; rain_6h: number; rain_12h: number; rain_24h: number
}

const WINDOWS: { key: RainWindow; field: keyof RainStat }[] = [
  { key: '1h', field: 'rain_1h' }, { key: '3h', field: 'rain_3h' },
  { key: '6h', field: 'rain_6h' }, { key: '12h', field: 'rain_12h' },
  { key: '24h', field: 'rain_24h' },
]

/** 目前累積雨量達到的最高警戒等級，並回報是哪個時段、超出多少。 */
export function rainWarnLevel(f: RainStat): {
  level: WarnLevel; window?: RainWindow; value?: number; threshold?: number
} {
  const rank: Record<WarnLevel, number> = { none: 0, l2: 1, l1: 2 }
  let best: { level: WarnLevel; window?: RainWindow; value?: number; threshold?: number } = { level: 'none' }
  for (const w of WINDOWS) {
    const v = f[w.field]
    const th = RAIN_ALERT[w.key]
    const lv: WarnLevel = v >= th.l1 ? 'l1' : v >= th.l2 ? 'l2' : 'none'
    if (rank[lv] > rank[best.level]) {
      best = { level: lv, window: w.key, value: v, threshold: lv === 'l1' ? th.l1 : th.l2 }
    }
  }
  return best
}

/** 累積雨量相對「一級警戒」的最大比值（1.0 = 剛好達一級）。供風險分數正規化。 */
export function accumRatioToL1(f: RainStat): number {
  return Math.max(...WINDOWS.map(w => f[w.field] / RAIN_ALERT[w.key].l1))
}

// 淹水模式：區域風險改用「水深藍色階」呈現（顏色語言＝水），與感測器深度一致。
export const FLOOD_RISK_COLOR: Record<'low' | 'caution' | 'high' | 'danger', string> = {
  low: '#93c5fd', caution: '#60a5fa', high: '#2563eb', danger: '#1e3a8a',
}

// ── 淹水潛勢深度級距（一日雨量 450mm 情境），單位公尺，水藍漸層 ──
export interface DepthBand { min: number; max: number; label: string; color: string; fill: number }
export const FLOOD_DEPTH_BANDS: DepthBand[] = [
  { min: 0.25, max: 0.50, label: '0.25–0.50 m', color: '#93c5fd', fill: 0.20 },
  { min: 0.50, max: 1.00, label: '0.50–1.00 m', color: '#60a5fa', fill: 0.28 },
  { min: 1.00, max: 2.00, label: '1.00–2.00 m', color: '#3b82f6', fill: 0.36 },
  { min: 2.00, max: 3.00, label: '2.00–3.00 m', color: '#2563eb', fill: 0.44 },
  { min: 3.00, max: Infinity, label: '> 3.00 m', color: '#1e3a8a', fill: 0.55 },
]

/** 依水深（公尺）取對應級距；< 0.25m 視為無顯著積水回 null。 */
export function depthBand(meters: number): DepthBand | null {
  for (const b of FLOOD_DEPTH_BANDS) if (meters >= b.min && meters < b.max) return b
  return null
}

/** 里級淹水潛勢（zones.json 的 floodPotential 0..3）對應的代表深度文字。 */
export function floodPotentialDepthLabel(p: number): string {
  if (p >= 3) return '> 2 m'
  if (p === 2) return '1–2 m'
  if (p === 1) return '0.5–1 m'
  return '< 0.5 m'
}
