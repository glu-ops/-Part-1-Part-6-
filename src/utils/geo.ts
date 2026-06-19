// 地理位置工具：預設位置、地點搜尋（Nominatim）、路線規劃（OSRM）

export interface LatLng {
  lat: number
  lng: number
}

// 預設位置（台南東區中心）— 取得不到 GPS 時的後備座標
export const DEFAULT_LOC: LatLng = { lat: 22.993, lng: 120.22 }

/** 兩點間直線距離（公尺，Haversine） */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const R = 6371000
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2
  return Math.round(R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s)))
}

// 台南範圍，讓搜尋結果偏向在地（左, 上, 右, 下 = 西經,北緯,東經,南緯）
const TAINAN_VIEWBOX = '120.05,23.10,120.40,22.85'

export interface GeocodeResult {
  name: string
  lat: number
  lng: number
}

/** 以 Nominatim（OpenStreetMap）搜尋地點名稱，回傳候選清單 */
export async function geocode(query: string, signal?: AbortSignal): Promise<GeocodeResult[]> {
  const q = query.trim()
  if (!q) return []

  const url =
    'https://nominatim.openstreetmap.org/search' +
    `?q=${encodeURIComponent(q)}` +
    '&format=json&addressdetails=0&limit=6&countrycodes=tw' +
    `&viewbox=${TAINAN_VIEWBOX}&bounded=0&accept-language=zh-TW`

  const res = await fetch(url, {
    signal,
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`地點搜尋失敗（${res.status}）`)

  const data = (await res.json()) as Array<{
    display_name: string
    lat: string
    lon: string
  }>

  return data.map(d => ({
    name: d.display_name,
    lat: parseFloat(d.lat),
    lng: parseFloat(d.lon),
  }))
}

export interface RouteStep {
  instruction: string
  distance: number // 公尺
}

export interface RouteResult {
  coordinates: [number, number][] // [lat, lng] 供 Leaflet 使用
  distance: number // 公尺
  duration: number // 秒
  steps: RouteStep[]
}

const MANEUVER_LABEL: Record<string, string> = {
  turn: '轉彎',
  'new name': '直行',
  depart: '出發',
  arrive: '抵達目的地',
  merge: '匯入',
  'on ramp': '上匝道',
  'off ramp': '下匝道',
  fork: '岔路',
  'end of road': '路口',
  continue: '繼續直行',
  roundabout: '圓環',
  rotary: '圓環',
}
const MODIFIER_LABEL: Record<string, string> = {
  left: '向左',
  right: '向右',
  'slight left': '稍微向左',
  'slight right': '稍微向右',
  'sharp left': '向左急轉',
  'sharp right': '向右急轉',
  straight: '直行',
  uturn: '迴轉',
}

/** 以 OSRM 公共服務取得步行路線（含轉彎指示） */
export async function getWalkingRoute(
  from: LatLng,
  to: LatLng,
  signal?: AbortSignal,
): Promise<RouteResult> {
  const url =
    'https://router.project-osrm.org/route/v1/walking/' +
    `${from.lng},${from.lat};${to.lng},${to.lat}` +
    '?overview=full&geometries=geojson&steps=true'

  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`路線規劃失敗（${res.status}）`)

  const data = await res.json()
  if (data.code !== 'Ok' || !data.routes?.length) {
    throw new Error('找不到路線')
  }

  const route = data.routes[0]
  const coordinates: [number, number][] = route.geometry.coordinates.map(
    (c: [number, number]) => [c[1], c[0]],
  )

  const steps: RouteStep[] = []
  for (const leg of route.legs ?? []) {
    for (const step of leg.steps ?? []) {
      const type: string = step.maneuver?.type ?? ''
      const modifier: string = step.maneuver?.modifier ?? ''
      const road = step.name ? `沿 ${step.name} ` : ''
      let instruction = MANEUVER_LABEL[type] ?? '前進'
      if (modifier && MODIFIER_LABEL[modifier]) {
        instruction = `${MODIFIER_LABEL[modifier]}${type === 'turn' ? '轉' : ''}`
      }
      if (type === 'depart') instruction = '從目前位置出發'
      if (type === 'arrive') instruction = '抵達目的地'
      steps.push({
        instruction: `${road}${instruction}`.trim(),
        distance: Math.round(step.distance ?? 0),
      })
    }
  }

  return {
    coordinates,
    distance: route.distance,
    duration: route.duration,
    steps,
  }
}

/** 產生外部 Google 地圖步行導航連結 */
export function googleMapsDirUrl(from: LatLng, to: LatLng): string {
  return (
    'https://www.google.com/maps/dir/?api=1' +
    `&origin=${from.lat},${from.lng}` +
    `&destination=${to.lat},${to.lng}` +
    '&travelmode=walking'
  )
}
