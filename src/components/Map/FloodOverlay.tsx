import { Circle } from 'react-leaflet'
import { useShelters } from '../../contexts/ShelterContext'
import { useUser } from '../../contexts/UserContext'
import { TIME_HORIZON } from '../../disasters'

/**
 * 東區易淹水熱點（依台南市水利局 / NCDR 災害潛勢通報之歷史淹水點）。
 * sev = 積水深度 / 低漥程度代理（地下道最深）。淹水由低漥處向外擴散，
 * 擴散速度與最終範圍依 sev 加權 —— 取代舊版三個臆測圓圈。
 * 來源：wrb1.tainan.gov.tw（淹水潛勢）、台南市道路淹水感測（dashboard.tainan.gov.tw）。
 */
const FLOOD_SEEDS: { lat: number; lng: number; sev: number; name: string }[] = [
  { lat: 22.9952, lng: 120.2185, sev: 1.00, name: '東寧地下道' },
  { lat: 23.0008, lng: 120.2150, sev: 0.90, name: '民族地下道' },
  { lat: 23.0035, lng: 120.2160, sev: 0.90, name: '小東地下道' },
  { lat: 22.9780, lng: 120.2090, sev: 0.85, name: '大同路/大同地下道' },
  { lat: 22.9740, lng: 120.2160, sev: 0.80, name: '竹溪流域' },
  { lat: 22.9985, lng: 120.2210, sev: 0.70, name: '育樂街/勝利路' },
  { lat: 22.9905, lng: 120.2230, sev: 0.60, name: '長榮路/東榮街' },
]

export default function FloodOverlay() {
  const { timeOffset } = useShelters()
  const { disaster }   = useUser()

  if (disaster !== 'flood' || timeOffset === 0) return null

  const prog = Math.min(TIME_HORIZON.flood, timeOffset) / TIME_HORIZON.flood

  return (
    <>
      {FLOOD_SEEDS.map(s => {
        // 低漥越深 → 起始積水越大、擴散越快、最終範圍越大
        const radius = 90 + s.sev * prog * 1700
        const fill = 0.05 + s.sev * 0.13
        return (
          <Circle
            key={s.name}
            center={[s.lat, s.lng]}
            radius={radius}
            pathOptions={{
              color:       '#ffffff',
              fillColor:   '#ffffff',
              fillOpacity: fill,
              weight:      1,
              opacity:     0.4 + s.sev * 0.2,
              dashArray:   '4 6',
            }}
          />
        )
      })}
    </>
  )
}
