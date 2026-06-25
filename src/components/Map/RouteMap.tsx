import { useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet'
import L from 'leaflet'
import BuildingLayer from './BuildingLayer'
import { InvalidateOnMount } from './mapHelpers'
import type { LatLng } from '../../utils/geo'

// 起點：白色描邊圓點
const startIcon = L.divIcon({
  className: '',
  html: `<div style="width:16px;height:16px;border-radius:50%;background:#F4F1E6;border:3px solid rgba(255,255,255,.95);box-shadow:0 0 0 4px rgba(255,255,255,.18),0 0 14px rgba(255,255,255,.5);"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
})
// 終點：白色描邊圓點（中空）
const destIcon = L.divIcon({
  className: '',
  html: `<div style="width:18px;height:18px;border-radius:50%;background:rgba(255,255,255,.15);border:3px solid #ffffff;box-shadow:0 0 0 4px rgba(255,255,255,.15),0 0 16px rgba(255,255,255,.55);"></div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
})

function FitRoute({ points }: { points: [number, number][] }) {
  const map = useMap()
  useEffect(() => {
    if (points.length >= 2) {
      map.fitBounds(L.latLngBounds(points), { padding: [40, 40] })
    }
  }, [points, map])
  return null
}

interface Props {
  from: LatLng
  to: LatLng
  path: [number, number][] | null
}

export default function RouteMap({ from, to, path }: Props) {
  const fallback: [number, number][] = [
    [from.lat, from.lng],
    [to.lat, to.lng],
  ]
  const line = path && path.length >= 2 ? path : fallback
  const isReal = !!path

  return (
    <div className="w-full h-64 rounded-2xl overflow-hidden border border-white/10 relative">
      <MapContainer
        center={[from.lat, from.lng]}
        zoom={15}
        className="w-full h-full z-0"
        zoomControl={false}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          subdomains="abcd"
          attribution="© OpenStreetMap © CARTO"
          maxZoom={20}
        />
        <InvalidateOnMount />
        <BuildingLayer />
        <FitRoute points={line} />

        {/* 深色描邊（casing），讓白線在灰圖上有對比 */}
        <Polyline
          positions={line}
          pathOptions={{ color: '#050606', weight: 9, opacity: 0.5 }}
        />
        {/* 主路線：白色粗實線；備選/直線估算：白色虛線 */}
        <Polyline
          positions={line}
          pathOptions={{
            color: '#ffffff',
            weight: 5,
            opacity: isReal ? 0.95 : 0.7,
            dashArray: isReal ? undefined : '4 10',
            lineCap: 'round',
            lineJoin: 'round',
          }}
        />

        <Marker position={[from.lat, from.lng]} icon={startIcon} />
        <Marker position={[to.lat, to.lng]} icon={destIcon} />
      </MapContainer>
      <div className="map-vignette" />
    </div>
  )
}
