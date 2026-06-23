import { Circle, Popup } from 'react-leaflet'
import { useShelters } from '../../contexts/ShelterContext'
import { useUser } from '../../contexts/UserContext'
import { useI18n } from '../../i18n'
import { TIME_HORIZON } from '../../disasters'
import { depthBand } from '../../flood'

/**
 * 東區易淹水熱點（依台南市水利局 / NCDR 淹水潛勢與道路淹水感測之歷史淹水點）。
 * maxDepth = 該點潛勢最大積水深度（公尺，地下道最深，可 >3m）。積水由低漥處隨時間
 * 上升並向外擴散；著色直接套用官方「淹水潛勢深度級距」(0.25→>3m)，使用者一眼看出深度。
 * 用於路線規劃 / 選點地圖（提供淹水情境）；主地圖 ShelterMap 改以區域風險+感測器呈現。
 * 來源：wrb1.tainan.gov.tw（淹水潛勢）、dashboard.tainan.gov.tw（道路淹水感測）。
 */
const FLOOD_SEEDS: { lat: number; lng: number; maxDepth: number; name: string }[] = [
  { lat: 22.9952, lng: 120.2185, maxDepth: 3.5, name: '東寧地下道' },
  { lat: 23.0008, lng: 120.2150, maxDepth: 3.2, name: '民族地下道' },
  { lat: 23.0035, lng: 120.2160, maxDepth: 3.0, name: '小東地下道' },
  { lat: 22.9780, lng: 120.2090, maxDepth: 2.4, name: '大同路/大同地下道' },
  { lat: 22.9740, lng: 120.2160, maxDepth: 2.0, name: '竹溪流域' },
  { lat: 22.9985, lng: 120.2210, maxDepth: 1.2, name: '育樂街/勝利路' },
  { lat: 22.9905, lng: 120.2230, maxDepth: 0.8, name: '長榮路/東榮街' },
]

export default function FloodOverlay() {
  const { timeOffset } = useShelters()
  const { disaster }   = useUser()
  const { t } = useI18n()

  if (disaster !== 'flood' || timeOffset === 0) return null

  const prog = Math.min(TIME_HORIZON.flood, timeOffset) / TIME_HORIZON.flood

  return (
    <>
      {FLOOD_SEEDS.map(s => {
        const depth = s.maxDepth * prog
        const band = depthBand(depth)
        if (!band) return null
        const radius = 90 + (s.maxDepth / 3.5) * prog * 1700
        return (
          <Circle
            key={s.name}
            center={[s.lat, s.lng]}
            radius={radius}
            pathOptions={{
              color:       band.color,
              fillColor:   band.color,
              fillOpacity: band.fill,
              weight:      1.5,
              opacity:     0.85,
            }}
          >
            <Popup>
              <div className="text-white" style={{ minWidth: 150 }}>
                <p className="font-bold text-sm">{s.name}</p>
                <p className="text-xs mt-1">
                  <span className="font-semibold" style={{ color: band.color === '#1e3a8a' ? '#93c5fd' : band.color }}>
                    {t('flood.depthNow')} {depth.toFixed(2)} m
                  </span>
                </p>
                <p className="text-[11px] text-white/55 mt-0.5">{t('flood.band')}：{band.label}</p>
              </div>
            </Popup>
          </Circle>
        )
      })}
    </>
  )
}
