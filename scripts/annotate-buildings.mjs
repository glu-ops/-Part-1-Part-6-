// 為東區建築輪廓計算「地震結構風險指數」（幾何啟發式）。
//
// 重要：buildings-east.json 僅含 OSM 輪廓，無真實結構屬性（樓層/屋齡/軟層/箍筋）。
// 本腳本只用「可從輪廓幾何實際算出」的特徵，作為已知致災因子的代理變數，
// 並明確標示為「風險推估」而非逐棟真實鑑定。依據（2016 美濃地震維冠大樓 5 大缺失）：
//   - 平面不規則 / 轉角過多  → 多邊形頂點數、矩形度（面積/外接矩形）
//   - 高瘦 / 高寬比          → 平面長寬比（slenderness）
//   - 軟弱底層（騎樓街屋）    → 小面積連棟透天的代理：小基地面積
//   - 鄰棟碰撞（連棟密集）    → 鄰近建物密度
// 來源：city.gvm.com.tw/article/83422、zh.wikipedia.org 維冠金龍大樓
import { readFileSync, writeFileSync } from 'node:fs'

const SRC = 'public/buildings-east.json'
const geo = JSON.parse(readFileSync(SRC, 'utf8'))

// 緯度約 22.99：每度換算公尺
const LAT0 = 22.99
const M_PER_DEG_LAT = 110574
const M_PER_DEG_LNG = 111320 * Math.cos((LAT0 * Math.PI) / 180)

function metrics(ring) {
  // ring: [[lng,lat], ...]，閉合
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  let area2 = 0
  let cx = 0, cy = 0
  const n = ring.length - 1
  for (let i = 0; i < n; i++) {
    const [x, y] = ring[i]
    if (x < minX) minX = x; if (x > maxX) maxX = x
    if (y < minY) minY = y; if (y > maxY) maxY = y
    const [x2, y2] = ring[i + 1]
    const cross = x * y2 - x2 * y
    area2 += cross
    cx += (x + x2) * cross
    cy += (y + y2) * cross
  }
  const areaDeg = Math.abs(area2) / 2
  const centroid = area2 !== 0
    ? [cx / (3 * area2), cy / (3 * area2)]
    : [(minX + maxX) / 2, (minY + maxY) / 2]

  const wM = (maxX - minX) * M_PER_DEG_LNG
  const hM = (maxY - minY) * M_PER_DEG_LAT
  // 面積換算（緯經向不同尺度）
  const areaM = areaDeg * M_PER_DEG_LAT * M_PER_DEG_LNG
  const longSide = Math.max(wM, hM)
  const shortSide = Math.max(Math.min(wM, hM), 1)
  const aspect = longSide / shortSide
  const bboxArea = Math.max(wM * hM, 1)
  const rectangularity = Math.min(1, areaM / bboxArea) // 1=矩形，越低越不規則
  return { areaM, aspect, rectangularity, vertices: n, centroid }
}

const feats = geo.features
const cells = new Map() // 空間格網（約 60m）做鄰棟密度
const GRID_DEG = 0.00055
const key = (x, y) => `${Math.floor(x / GRID_DEG)},${Math.floor(y / GRID_DEG)}`

const info = feats.map(f => {
  const ring = f.geometry?.coordinates?.[0]
  if (!ring || ring.length < 4) return null
  const m = metrics(ring)
  const k = key(m.centroid[0], m.centroid[1])
  if (!cells.has(k)) cells.set(k, [])
  cells.get(k).push(m.centroid)
  return m
})

function neighborCount(c) {
  // 統計約 30m 內鄰棟（查當前格與相鄰 8 格）
  const gx = Math.floor(c[0] / GRID_DEG), gy = Math.floor(c[1] / GRID_DEG)
  let count = 0
  const R2 = 30 // m
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
    const arr = cells.get(`${gx + dx},${gy + dy}`)
    if (!arr) continue
    for (const o of arr) {
      const ddx = (o[0] - c[0]) * M_PER_DEG_LNG
      const ddy = (o[1] - c[1]) * M_PER_DEG_LAT
      if (ddx * ddx + ddy * ddy <= R2 * R2) count++
    }
  }
  return Math.max(0, count - 1) // 扣掉自己
}

const clamp01 = v => Math.max(0, Math.min(1, v))
let annotated = 0

feats.forEach((f, i) => {
  const m = info[i]
  if (!m) { f.properties = {}; return }

  // 各因子 0..1
  const fSoft   = clamp01((140 - m.areaM) / 110)            // 小基地(<~140m²)→ 街屋/騎樓軟層代理
  const fSlender = clamp01((m.aspect - 1.8) / 3.2)          // 高寬比>1.8 起算
  const fCorner = clamp01((1 - m.rectangularity - 0.12) / 0.5) + clamp01((m.vertices - 6) / 12)
  const fCornerN = clamp01(fCorner)
  const fPound  = clamp01((neighborCount(m.centroid) - 2) / 8) // 連棟密集→碰撞

  const risk = clamp01(0.30 * fSoft + 0.30 * fCornerN + 0.20 * fSlender + 0.20 * fPound)

  const flags = []
  if (fSoft > 0.5)    flags.push('soft')    // 軟弱底層（騎樓街屋）
  if (fCornerN > 0.5) flags.push('corner')  // 平面不規則 / 轉角過多
  if (fSlender > 0.5) flags.push('slender') // 高寬比偏高
  if (fPound > 0.5)   flags.push('pound')   // 連棟碰撞風險

  f.properties = { r: +risk.toFixed(3), f: flags }
  annotated++
})

writeFileSync(SRC, JSON.stringify(geo))
const dist = feats.map(f => f.properties?.r ?? 0)
const hi = dist.filter(r => r >= 0.6).length
console.log(`✓ 已標註 ${annotated}/${feats.length} 棟；高風險(≥0.6) ${hi} 棟 → ${SRC}`)
