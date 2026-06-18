import { useEffect } from 'react'
import { useMap, useMapEvents } from 'react-leaflet'
import type { LatLng } from '../../utils/geo'

/** 當 target 改變時，平滑移動地圖到該座標 */
export function FlyTo({ target, zoom }: { target: LatLng | null; zoom?: number }) {
  const map = useMap()
  useEffect(() => {
    if (!target) return
    // 防呆：地圖容器隱藏 / 尺寸為 0 時呼叫 flyTo 會出錯
    const size = map.getSize()
    if (size.x === 0 || size.y === 0) return
    map.flyTo([target.lat, target.lng], zoom ?? map.getZoom(), { duration: 0.8 })
  }, [target, zoom, map])
  return null
}

/** 點擊地圖時回傳座標 */
export function ClickCapture({ onPick }: { onPick: (loc: LatLng) => void }) {
  useMapEvents({
    click(e) {
      onPick({ lat: e.latlng.lat, lng: e.latlng.lng })
    },
  })
  return null
}

/** 自動修正容器尺寸（避免地圖在隱藏後尺寸錯亂） */
export function InvalidateOnMount() {
  const map = useMap()
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 200)
    return () => clearTimeout(t)
  }, [map])
  return null
}
