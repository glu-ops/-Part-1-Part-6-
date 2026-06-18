// 一次性抓取台南東區建築物輪廓，存成靜態 GeoJSON（供離線 + 瞬間載入）
import { writeFileSync } from 'node:fs'

// 東區範圍（涵蓋全部避難所 + 周邊巷弄，留足邊界）S,W,N,E
const BBOX = '22.958,120.190,23.015,120.268'

const query =
  `[out:json][timeout:180];` +
  `(way["building"](${BBOX});` +
  `relation["building"]["type"="multipolygon"](${BBOX}););` +
  `out geom;`

// 多個鏡像，依序嘗試（公共服務偶爾忙碌）
const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
]

function ringFrom(geometry) {
  const ring = geometry.map(p => [+p.lon.toFixed(6), +p.lat.toFixed(6)])
  const f = ring[0], l = ring[ring.length - 1]
  if (f[0] !== l[0] || f[1] !== l[1]) ring.push([f[0], f[1]])
  return ring
}

function toGeoJSON(data) {
  const features = []
  for (const el of data.elements ?? []) {
    if (el.type === 'way' && el.geometry && el.geometry.length >= 3) {
      features.push({
        type: 'Feature',
        properties: {},
        geometry: { type: 'Polygon', coordinates: [ringFrom(el.geometry)] },
      })
    } else if (el.type === 'relation' && el.members) {
      for (const m of el.members) {
        if (m.role === 'outer' && m.geometry && m.geometry.length >= 3) {
          features.push({
            type: 'Feature',
            properties: {},
            geometry: { type: 'Polygon', coordinates: [ringFrom(m.geometry)] },
          })
        }
      }
    }
  }
  return { type: 'FeatureCollection', features }
}

async function tryFetch(url) {
  console.log('→ 嘗試', url)
  const res = await fetch(url, {
    method: 'POST',
    body: 'data=' + encodeURIComponent(query),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

let raw = null
for (const url of ENDPOINTS) {
  try {
    raw = await tryFetch(url)
    break
  } catch (e) {
    console.warn('  失敗：', e.message)
  }
}
if (!raw) {
  console.error('所有鏡像皆失敗')
  process.exit(1)
}

const geojson = toGeoJSON(raw)
const out = 'public/buildings-east.json'
writeFileSync(out, JSON.stringify(geojson))
console.log(`✓ 已存 ${geojson.features.length} 棟建築 → ${out}`)
