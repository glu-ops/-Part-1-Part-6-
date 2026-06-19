import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import { DEFAULT_LOC } from '../../utils/geo'
import type { LatLng } from '../../utils/geo'
import { FlyTo, InvalidateOnMount } from './mapHelpers'
import type { PeerInfo } from '../../hooks/usePeerMesh'

export interface MeshPeerView extends PeerInfo {
  nearestLabel?: string   // 「距 X 所 N 公尺」
  nearby?: boolean        // < 200m
}

// 藍=我
const meIcon = L.divIcon({
  className: '',
  html: `<div style="
    width:16px;height:16px;border-radius:50%;
    background:#3b82f6;border:3px solid rgba(255,255,255,.95);
    box-shadow:0 0 0 4px rgba(59,130,246,.25), 0 0 14px rgba(59,130,246,.7);
  "></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
})

// 橘=對方；flashing 時加 ping 光環
function peerIcon(flashing: boolean) {
  return L.divIcon({
    className: '',
    html: `<div style="position:relative;width:16px;height:16px;">
      ${flashing ? '<span class="animate-ping" style="position:absolute;inset:-6px;border-radius:50%;background:rgba(249,115,22,.55);"></span>' : ''}
      <div style="position:absolute;inset:0;border-radius:50%;
        background:#f97316;border:3px solid rgba(255,255,255,.95);
        box-shadow:0 0 0 4px rgba(249,115,22,.22), 0 0 12px rgba(249,115,22,.65);"></div>
    </div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  })
}

interface Props {
  myPos: LatLng
  peers: MeshPeerView[]
  flashId: string | null
  meLabel: string
  noPosLabel: string
}

export default function MeshMap({ myPos, peers, flashId, meLabel, noPosLabel }: Props) {
  const located = peers.filter(p => p.lat != null && p.lng != null)
  return (
    <div className="relative w-full h-full rounded-2xl overflow-hidden">
      <MapContainer
        center={[myPos.lat || DEFAULT_LOC.lat, myPos.lng || DEFAULT_LOC.lng]}
        zoom={15}
        className="w-full h-full z-0"
        zoomControl={false}
        attributionControl={false}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          subdomains="abcd"
          maxZoom={20}
        />
        <InvalidateOnMount />
        <FlyTo target={myPos} zoom={15} />

        <Marker position={[myPos.lat, myPos.lng]} icon={meIcon}>
          <Popup>{meLabel}</Popup>
        </Marker>

        {located.map(p => (
          <Marker key={p.id} position={[p.lat!, p.lng!]} icon={peerIcon(p.id === flashId)}>
            <Popup>
              <div className="text-xs">
                <div className="font-semibold">{p.name || `${p.id.slice(0, 8)}…`}</div>
                {p.name && <div className="font-mono text-[10px] text-neutral-400">{p.id.slice(0, 10)}…</div>}
                {p.nearestLabel ?? noPosLabel}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  )
}
