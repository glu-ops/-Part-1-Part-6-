import { useEffect, useRef } from 'react'
import { useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import type { GeoJsonObject } from 'geojson'

const MIN_ZOOM = 14 // 縮放太遠時隱藏（避免一次畫上萬棟）
const SRC = '/buildings-east.json' // 靜態檔（PWA 已 precache → 可離線）

// 灰色建築輪廓（貼合深色地圖；無彩色）
const STYLE: L.PathOptions = {
  color: 'rgba(150, 158, 166, 0.78)',
  weight: 0.8,
  fillColor: '#9aa1a8',
  fillOpacity: 0.08,
  interactive: false,
}
const HIDDEN: L.PathOptions = { ...STYLE, opacity: 0, fillOpacity: 0 }

// ── 模組級快取：靜態檔只抓 / 解析一次，四張地圖共用 ──────────────────────
let cache: GeoJsonObject | null = null
let inflight: Promise<GeoJsonObject> | null = null

function loadBuildings(): Promise<GeoJsonObject> {
  if (cache) return Promise.resolve(cache)
  if (!inflight) {
    inflight = fetch(SRC)
      .then(r => {
        if (!r.ok) throw new Error(`buildings ${r.status}`)
        return r.json()
      })
      .then((data: GeoJsonObject) => {
        cache = data
        return data
      })
      .catch(err => {
        inflight = null // 失敗可重試
        throw err
      })
  }
  return inflight
}

// ────────────────────────────────────────────────────────────────────────
export default function BuildingLayer() {
  const map = useMap()
  const layerRef = useRef<L.GeoJSON | null>(null)

  useEffect(() => {
    let alive = true
    // 專用 canvas renderer：上萬棟多邊形也能流暢繪製（含小地圖）
    const renderer = L.canvas({ padding: 0.5 })
    const layer = L.geoJSON(undefined, {
      interactive: false,
      // renderer 屬 PathOptions，放進 style 套用到每個 feature
      style: () => ({ ...(map.getZoom() >= MIN_ZOOM ? STYLE : HIDDEN), renderer }),
    })
    layer.addTo(map)
    layerRef.current = layer

    loadBuildings()
      .then(data => {
        if (!alive) return
        layer.addData(data)
        layer.setStyle(map.getZoom() >= MIN_ZOOM ? STYLE : HIDDEN)
      })
      .catch(err => console.warn('[BuildingLayer]', err?.message))

    return () => {
      alive = false
      map.removeLayer(layer)
      layerRef.current = null
    }
  }, [map])

  // 縮放時切換顯示 / 隱藏（不重新載入資料）
  useMapEvents({
    zoomend() {
      layerRef.current?.setStyle(map.getZoom() >= MIN_ZOOM ? STYLE : HIDDEN)
    },
  })

  return null
}
