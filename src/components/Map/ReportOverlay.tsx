import { Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import { useShelters, getClientId } from '../../contexts/ShelterContext'
import { useMesh } from '../../contexts/MeshContext'
import ReportCard from '../Report/ReportCard'
import type { ResourceStatus } from '../../types'

// 群眾回報為單色（白）菱形，嚴重度以不透明度區分（地圖唯一彩色保留給避難所）
const REPORT_ICONS: Record<ResourceStatus, L.DivIcon> = (() => {
  const make = (alpha: number) => L.divIcon({
    className: '',
    html: `<div style="width:18px;height:18px;background:rgba(255,255,255,${alpha});border:1.5px solid rgba(255,255,255,.9);border-radius:4px;transform:rotate(45deg);box-shadow:0 0 8px rgba(255,255,255,.4);"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    popupAnchor: [0, -10],
  })
  return { green: make(0.25), yellow: make(0.5), red: make(0.85) }
})()

export default function ReportOverlay() {
  const { activeReports, voteReport } = useShelters()
  const { shareReport } = useMesh()
  const cid = getClientId()

  return (
    <>
      {activeReports
        .filter(r => r.lat && r.lng)
        .map(r => (
          <Marker key={r.id} position={[r.lat, r.lng]} icon={REPORT_ICONS[r.severity]}>
            <Popup>
              <ReportCard
                report={r}
                clientId={cid}
                onVote={dir => { const u = voteReport(r.id, dir, cid); if (u) shareReport(u) }}
              />
            </Popup>
          </Marker>
        ))}
    </>
  )
}
