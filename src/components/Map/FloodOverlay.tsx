import { Circle } from 'react-leaflet'
import { useShelters } from '../../contexts/ShelterContext'
import { useUser } from '../../contexts/UserContext'

// 東區低漥積水中心（大港地區）
const FLOOD_CENTERS: [number, number][] = [
  [22.975, 120.240],
  [22.982, 120.255],
  [22.969, 120.232],
]

export default function FloodOverlay() {
  const { timeOffset } = useShelters()
  const { disaster }   = useUser()

  if (disaster !== 'flood' || timeOffset === 0) return null

  // 半徑從 200m 線性擴大到 2200m（30 分鐘）
  const baseRadius = 200 + (timeOffset / 30) * 2000

  return (
    <>
      {FLOOD_CENTERS.map(([lat, lng], i) => (
        <Circle
          key={i}
          center={[lat, lng]}
          radius={baseRadius * (1 - i * 0.15)}
          pathOptions={{
            color:       '#ffffff',
            fillColor:   '#ffffff',
            fillOpacity: 0.10 - i * 0.02,
            weight:      1,
            opacity:     0.45,
            dashArray:   '4 6',
          }}
        />
      ))}
    </>
  )
}
