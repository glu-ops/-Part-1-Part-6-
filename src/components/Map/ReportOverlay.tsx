import { Marker, Tooltip } from 'react-leaflet'
import L from 'leaflet'
import { useShelters } from '../../contexts/ShelterContext'
import { useI18n } from '../../i18n'
import type { ResourceStatus } from '../../types'

const TYPE_EMOJI: Record<string, string> = {
  crowd: '🧍', road: '🛣', resource: '🍱', disaster: '🆘',
}

// 群眾回報為單色（白）菱形，嚴重度以不透明度區分（地圖唯一彩色保留給避難所）
const REPORT_ICONS: Record<ResourceStatus, L.DivIcon> = (() => {
  const make = (alpha: number) => L.divIcon({
    className: '',
    html: `<div style="width:18px;height:18px;background:rgba(255,255,255,${alpha});border:1.5px solid rgba(255,255,255,.9);border-radius:4px;transform:rotate(45deg);box-shadow:0 0 8px rgba(255,255,255,.4);"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    tooltipAnchor: [11, 0],
  })
  return {
    green:  make(0.25),
    yellow: make(0.5),
    red:    make(0.85),
  }
})()

export default function ReportOverlay() {
  const { reports } = useShelters()
  const { t, rt } = useI18n()

  return (
    <>
      {reports
        .filter(r => r.lat && r.lng)
        .map(r => (
          <Marker
            key={r.id}
            position={[r.lat, r.lng]}
            icon={REPORT_ICONS[r.severity]}
          >
            <Tooltip direction="right" offset={[12, 0]} opacity={1}>
              <div style={{ fontFamily: 'inherit', fontSize: 12, minWidth: 140 }}>
                <div style={{ fontWeight: 700, marginBottom: 2 }}>
                  {TYPE_EMOJI[r.type]} {t('home.legendReport')}
                </div>
                <div style={{ color: 'rgba(255,255,255,.5)', marginBottom: 4 }}>
                  {rt(r.reported_at)}
                </div>
                {r.note && <div>{r.note}</div>}
              </div>
            </Tooltip>
          </Marker>
        ))}
    </>
  )
}
