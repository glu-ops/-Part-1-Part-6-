import { Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import { useUser } from '../../contexts/UserContext'
import { useI18n } from '../../i18n'
import facilityData from '../../data/flood-facilities.json'

export type FacilityType = 'eoc' | 'backup' | 'pump' | 'water' | 'supply' | 'heli'
interface Facility { id: string; type: FacilityType; name: string; lat: number; lng: number }
const FACILITIES = facilityData.facilities as Facility[]

// 每類據點：單字標記 + 代表色（避免彩色 emoji，沿用 App 單色＋形狀風格）
export const FACILITY_META: Record<FacilityType, { char: string; color: string }> = {
  eoc:    { char: '指', color: '#F5C776' },
  backup: { char: '備', color: '#B30303' },
  pump:   { char: '泵', color: '#6F8E89' },
  water:  { char: '水', color: '#5F7D76' },
  supply: { char: '物', color: '#889D73' },
  heli:   { char: '機', color: '#889D73' },
}

function facilityIcon(type: FacilityType): L.DivIcon {
  const { char, color } = FACILITY_META[type]
  return L.divIcon({
    className: '',
    html: `<div style="width:20px;height:20px;border-radius:6px;
      background:rgba(10,22,40,.78);border:1.5px solid ${color};
      box-shadow:0 0 7px ${color}80;display:flex;align-items:center;justify-content:center;
      color:${color};font-size:11px;font-weight:700;line-height:1;">${char}</div>`,
    iconSize: [20, 20], iconAnchor: [10, 10], popupAnchor: [0, -10],
  })
}

/** 防汛 / 救災據點圖層（淹水模式才顯示）：取水、物資、抽水站、直升機點、指揮 / 備援中心。 */
export default function FloodFacilityOverlay() {
  const { disaster } = useUser()
  const { t } = useI18n()

  if (disaster !== 'flood') return null

  return (
    <>
      {FACILITIES.map(f => (
        <Marker key={f.id} position={[f.lat, f.lng]} icon={facilityIcon(f.type)}>
          <Popup>
            <div className="text-white" style={{ minWidth: 150 }}>
              <p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: FACILITY_META[f.type].color }}>
                {t(`flood.fac.${f.type}`)}
              </p>
              <p className="font-bold text-sm">{f.name}</p>
            </div>
          </Popup>
        </Marker>
      ))}
    </>
  )
}
