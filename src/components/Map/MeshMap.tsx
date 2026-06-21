import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import { DEFAULT_LOC } from '../../utils/geo'
import type { LatLng } from '../../utils/geo'
import { FlyTo, InvalidateOnMount } from './mapHelpers'
import { useI18n } from '../../i18n'
import type { PeerInfo } from '../../hooks/usePeerMesh'
import type { SosEvent } from '../../types'

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

// 白=SOS 位置（脈動光環凸顯求救）
const sosIcon = L.divIcon({
  className: '',
  html: `<div style="position:relative;width:14px;height:14px;">
    <span class="animate-ping" style="position:absolute;inset:-6px;border-radius:50%;background:rgba(255,255,255,.5);"></span>
    <div style="position:absolute;inset:0;border-radius:50%;
      background:#ffffff;border:2px solid rgba(255,255,255,.95);
      box-shadow:0 0 0 4px rgba(255,255,255,.25), 0 0 12px rgba(255,255,255,.85);"></div>
  </div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
})

interface FocusSos { id: string; nonce: number }

interface Props {
  myPos: LatLng
  peers: MeshPeerView[]
  flashId: string | null
  meLabel: string
  noPosLabel: string
  sosPoints?: SosEvent[]
  focusSos?: FocusSos | null
  /** 額外的地圖圖層 / marker（如指揮中心的回報點），須為 react-leaflet 子元件 */
  extra?: ReactNode
}

// 監聽 focusSos：飛到該 SOS 並開啟 popup
function SosFocuser({ focusSos, refs, points }: { focusSos?: FocusSos | null; refs: React.MutableRefObject<Map<string, L.Marker>>; points: SosEvent[] }) {
  const map = useMap()
  useEffect(() => {
    if (!focusSos) return
    const p = points.find(e => e.id === focusSos.id)
    if (!p || p.lat == null || p.lng == null) return
    const size = map.getSize()
    if (size.x === 0 || size.y === 0) return
    map.flyTo([p.lat, p.lng], 17, { duration: 0.8 })
    const t = setTimeout(() => refs.current.get(focusSos.id)?.openPopup(), 700)
    return () => clearTimeout(t)
  }, [focusSos, map, points, refs])
  return null
}

export default function MeshMap({ myPos, peers, flashId, meLabel, noPosLabel, sosPoints = [], focusSos, extra }: Props) {
  const { t } = useI18n()
  const located = peers.filter(p => p.lat != null && p.lng != null)
  const sosLocated = sosPoints.filter(s => s.lat != null && s.lng != null)
  const sosRefs = useRef<Map<string, L.Marker>>(new Map())

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
        <SosFocuser focusSos={focusSos} refs={sosRefs} points={sosLocated} />

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

        {/* SOS 點位（白色點，點擊看詳情） */}
        {sosLocated.map(s => (
          <Marker
            key={s.id}
            position={[s.lat!, s.lng!]}
            icon={sosIcon}
            ref={(m: L.Marker | null) => { if (m) sosRefs.current.set(s.id, m); else sosRefs.current.delete(s.id) }}
          >
            <Popup>
              <div className="text-xs" style={{ minWidth: 170 }}>
                <div className="font-bold text-[13px]">🆘 {s.senderName}</div>
                <div className="text-neutral-500 mt-0.5">{t(`mesh.layer.${s.layer}`)} · {s.safeBySelf ? t('sos.safe') : t(`status.handle.${s.status}`)}</div>
                <div className="text-neutral-500">{new Date(s.ts).toLocaleTimeString()}</div>
                {s.text && <div className="mt-1 text-neutral-700">{s.text}</div>}
                {s.replies.length > 0 && (
                  <div className="mt-1 border-t border-neutral-200 pt-1">
                    {s.replies.slice(-3).map(r => (
                      <div key={r.id} className="text-[11px] text-neutral-600"><b>{r.fromName}</b>：{r.text}</div>
                    ))}
                  </div>
                )}
                <div className="mt-1 text-[10px] text-neutral-400">📍 {s.lat!.toFixed(4)}, {s.lng!.toFixed(4)}</div>
              </div>
            </Popup>
          </Marker>
        ))}

        {extra}
      </MapContainer>
    </div>
  )
}
