import { useEffect, useRef } from 'react'
import { useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import type { GeoJsonObject, Feature } from 'geojson'
import { useUser } from '../../contexts/UserContext'
import { useShelters } from '../../contexts/ShelterContext'
import { TIME_HORIZON } from '../../disasters'

const MIN_ZOOM = 14 // 縮放太遠時隱藏（避免一次畫上萬棟）
const SRC = '/buildings-east.json' // 靜態檔（PWA 已 precache → 可離線）

// 灰色建築輪廓（貼合深色地圖；無彩色）
const BASE: L.PathOptions = {
  color: 'rgba(150, 158, 166, 0.38)',
  weight: 0.6,
  fillColor: '#9aa1a8',
  fillOpacity: 0.035,
}
const HIDDEN: L.PathOptions = { ...BASE, opacity: 0, fillOpacity: 0 }

/**
 * 地震為「震後即時快照」：t=0 即顯示主震受損建物（高風險先倒）。
 * 時間軸代表「餘震累積」：t 越後門檻越低 → 餘震造成更多建物受損。
 * properties.r 為幾何啟發式風險指數（見 scripts/annotate-buildings.mjs）。
 * t=0 門檻 0.62（主震約前 6%）；t=180（3 小時餘震）門檻 0.45。
 */
function quakeThreshold(t: number): number {
  return 0.62 - (Math.min(TIME_HORIZON.earthquake, t) / TIME_HORIZON.earthquake) * 0.17
}

function quakeStyle(risk: number, t: number): L.PathOptions {
  const thr = quakeThreshold(t)
  if (risk >= thr) {
    // 倒塌 / 嚴重受損
    return { color: '#2D0E0E', weight: 1.1, fillColor: '#B30303', fillOpacity: 0.62, opacity: 0.95 }
  }
  if (risk >= thr - 0.1) {
    // 高風險（受損中）
    return { color: '#F5C776', weight: 0.9, fillColor: '#F5C776', fillOpacity: 0.34, opacity: 0.85 }
  }
  return BASE
}

// ── 模組級快取：靜態檔只抓 / 解析一次，多張地圖共用 ──────────────────────
let cache: GeoJsonObject | null = null
let inflight: Promise<GeoJsonObject> | null = null

function loadBuildings(): Promise<GeoJsonObject> {
  if (cache) return Promise.resolve(cache)
  if (!inflight) {
    inflight = fetch(SRC)
      .then(r => { if (!r.ok) throw new Error(`buildings ${r.status}`); return r.json() })
      .then((data: GeoJsonObject) => { cache = data; return data })
      .catch(err => { inflight = null; throw err })
  }
  return inflight
}

// ────────────────────────────────────────────────────────────────────────
export default function BuildingLayer() {
  const map = useMap()
  const { disaster } = useUser()
  const { timeOffset } = useShelters()
  const layerRef = useRef<L.GeoJSON | null>(null)
  const rendererRef = useRef<L.Canvas | null>(null)

  // 依目前 disaster/timeOffset 算單一 feature 樣式
  const styleFor = useRef<(f?: Feature) => L.PathOptions>(() => BASE)
  styleFor.current = (f?: Feature) => {
    if (map.getZoom() < MIN_ZOOM) return { ...HIDDEN, renderer: rendererRef.current! }
    const base = disaster === 'earthquake'
      ? quakeStyle((f?.properties as { r?: number } | undefined)?.r ?? 0, timeOffset)
      : BASE
    return { ...base, renderer: rendererRef.current!, interactive: false }
  }

  // 建立圖層（只一次）
  useEffect(() => {
    const renderer = L.canvas({ padding: 0.5 })
    rendererRef.current = renderer
    const layer = L.geoJSON(undefined, {
      interactive: false,
      style: (f) => styleFor.current(f as Feature),
    })
    layer.addTo(map)
    layerRef.current = layer

    loadBuildings()
      .then(data => {
        if (layerRef.current !== layer) return
        layer.addData(data)
        layer.setStyle(f => styleFor.current(f as Feature))
      })
      .catch(err => console.warn('[BuildingLayer]', err?.message))

    return () => { map.removeLayer(layer); layerRef.current = null }
  }, [map])

  // disaster / 時間軸改變 → 重新上色
  useEffect(() => {
    layerRef.current?.setStyle(f => styleFor.current(f as Feature))
  }, [disaster, timeOffset])

  // 縮放時切換顯示 / 隱藏
  useMapEvents({
    zoomend() { layerRef.current?.setStyle(f => styleFor.current(f as Feature)) },
  })

  return null
}
