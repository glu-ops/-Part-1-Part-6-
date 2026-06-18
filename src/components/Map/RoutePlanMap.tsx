import { useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet'
import L from 'leaflet'
import ShelterMarker from './ShelterMarker'
import FloodOverlay from './FloodOverlay'
import { InvalidateOnMount } from './mapHelpers'
import { useShelters } from '../../contexts/ShelterContext'
import { useUser } from '../../contexts/UserContext'
import { getOverallStatus } from '../../utils/scoring'
import { DEFAULT_LOC } from '../../utils/geo'
import type { Shelter } from '../../types'

const userIcon = L.divIcon({
  className: '',
  html: `<div style="width:16px;height:16px;border-radius:50%;background:#f5f5f5;border:3px solid rgba(255,255,255,.95);box-shadow:0 0 0 4px rgba(255,255,255,.18),0 0 14px rgba(255,255,255,.5);"></div>`,
  iconSize: [16, 16], iconAnchor: [8, 8],
})
const destIcon = L.divIcon({
  className: '',
  html: `<div style="width:18px;height:18px;border-radius:50%;background:rgba(255,255,255,.15);border:3px solid #fff;box-shadow:0 0 0 4px rgba(255,255,255,.15),0 0 16px rgba(255,255,255,.55);"></div>`,
  iconSize: [18, 18], iconAnchor: [9, 9],
})

function Fit({ points }: { points: [number, number][] }) {
  const map = useMap()
  useEffect(() => {
    if (points.length >= 2) map.fitBounds(L.latLngBounds(points), { padding: [60, 60], maxZoom: 16 })
  }, [points, map])
  return null
}

interface Props {
  dest: Shelter | null
  path: [number, number][] | null
  onSelectDest: (s: Shelter) => void
}

export default function RoutePlanMap({ dest, path, onSelectDest }: Props) {
  const { shelters } = useShelters()
  const { disaster, userLoc } = useUser()

  const line = dest
    ? (path && path.length >= 2 ? path : [[userLoc.lat, userLoc.lng], [dest.lat, dest.lng]] as [number, number][])
    : null
  const isReal = !!path

  return (
    <div className="relative w-full h-full">
      <MapContainer
        center={[DEFAULT_LOC.lat, DEFAULT_LOC.lng]}
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
        <FloodOverlay />

        {shelters.map(s => {
          const notSuitable = s.not_suitable_for.includes(disaster)
          const status = notSuitable ? 'danger' : getOverallStatus(s, disaster)
          return (
            <ShelterMarker
              key={s.shelter_id}
              shelter={s}
              status={status}
              notSuitable={notSuitable}
              onClick={() => onSelectDest(s)}
            />
          )
        })}

        <Marker position={[userLoc.lat, userLoc.lng]} icon={userIcon} />
        {dest && <Marker position={[dest.lat, dest.lng]} icon={destIcon} />}

        {line && (
          <>
            <Polyline positions={line} pathOptions={{ color: '#111317', weight: 9, opacity: 0.5 }} />
            <Polyline positions={line} pathOptions={{
              color: '#ffffff', weight: 5, opacity: isReal ? 0.95 : 0.7,
              dashArray: isReal ? undefined : '4 10', lineCap: 'round', lineJoin: 'round',
            }} />
            <Fit points={line} />
          </>
        )}
      </MapContainer>
      <div className="map-texture" />
      <div className="map-vignette" />
    </div>
  )
}
