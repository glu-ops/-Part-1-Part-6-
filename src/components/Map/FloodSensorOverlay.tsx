import { Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import { useShelters } from '../../contexts/ShelterContext'
import { useUser } from '../../contexts/UserContext'
import { useI18n } from '../../i18n'
import { TIME_HORIZON } from '../../disasters'
import { depthBand } from '../../flood'
import sensorData from '../../data/flood-sensors.json'

interface FloodSensor { id: string; name: string; lat: number; lng: number; base_cm: number }
const SENSORS = (sensorData.sensors as FloodSensor[])

// 感測器圖示：水滴外框 + 依水深級距填色（無讀數時灰色中空）
function sensorIcon(color: string | null, cm: number): L.DivIcon {
  const c = color ?? '#94a3b8'
  return L.divIcon({
    className: '',
    html: `<div style="display:flex;flex-direction:column;align-items:center;">
      <div style="width:16px;height:16px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);
        background:${color ? c : 'transparent'};border:2px solid ${c};
        box-shadow:0 0 7px ${color ? c : 'transparent'};"></div>
      <span style="font-size:9px;font-weight:700;color:#fff;background:rgba(0,0,0,.55);
        border-radius:6px;padding:0 3px;margin-top:1px;white-space:nowrap;">${cm}cm</span>
    </div>`,
    iconSize: [16, 26], iconAnchor: [8, 16], popupAnchor: [0, -16],
  })
}

/** 淹水感測器圖層：依時間軸顯示各點即時水深，超過深度級距以顏色示警（淹水模式才顯示）。 */
export default function FloodSensorOverlay() {
  const { timeOffset } = useShelters()
  const { disaster }   = useUser()
  const { t } = useI18n()

  if (disaster !== 'flood') return null
  const prog = Math.min(TIME_HORIZON.flood, timeOffset) / TIME_HORIZON.flood

  return (
    <>
      {SENSORS.map(s => {
        const cm = Math.round(s.base_cm * prog)
        const band = depthBand(cm / 100)
        return (
          <Marker key={s.id} position={[s.lat, s.lng]} icon={sensorIcon(band?.color ?? null, cm)}>
            <Popup>
              <div className="text-white" style={{ minWidth: 160 }}>
                <p className="text-[10px] text-white/45 uppercase tracking-wider mb-0.5">{t('flood.sensor')}</p>
                <p className="font-bold text-sm">{s.name}</p>
                <p className="text-xs mt-1">
                  <span className="font-semibold" style={{ color: band?.color === '#1e3a8a' ? '#93c5fd' : (band?.color ?? '#94a3b8') }}>
                    {t('flood.depthNow')} {cm} cm
                  </span>
                </p>
                <p className="text-[11px] text-white/55 mt-0.5">
                  {band ? `${t('flood.band')}：${band.label}` : t('flood.normal')}
                </p>
              </div>
            </Popup>
          </Marker>
        )
      })}
    </>
  )
}
