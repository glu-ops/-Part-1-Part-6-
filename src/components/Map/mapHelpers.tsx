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

/** 自動修正容器尺寸（手機/iPad 在 flex/RWD 版面下容器尺寸常較晚定，
 *  造成地圖灰屏或 marker 看不到）。多次延遲 + 視窗縮放 + 容器尺寸監看，確保重繪。 */
export function InvalidateOnMount() {
  const map = useMap()
  useEffect(() => {
    const fix = () => map.invalidateSize()
    const timers = [0, 200, 500, 1000].map(d => setTimeout(fix, d))
    window.addEventListener('resize', fix)
    window.addEventListener('orientationchange', fix)
    let ro: ResizeObserver | undefined
    try {
      if ('ResizeObserver' in window) {
        ro = new ResizeObserver(() => fix())
        ro.observe(map.getContainer())
      }
    } catch { /* ignore */ }
    return () => {
      timers.forEach(clearTimeout)
      window.removeEventListener('resize', fix)
      window.removeEventListener('orientationchange', fix)
      ro?.disconnect()
    }
  }, [map])
  return null
}
