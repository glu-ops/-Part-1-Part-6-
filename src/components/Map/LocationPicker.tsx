import { useState } from 'react'
import { MapContainer, TileLayer, Marker } from 'react-leaflet'
import L from 'leaflet'
import { LocateFixed, Loader2 } from 'lucide-react'
import LocationSearch from './LocationSearch'
import ShelterMarker from './ShelterMarker'
import BuildingLayer from './BuildingLayer'
import ReportOverlay from './ReportOverlay'
import FloodOverlay from './FloodOverlay'
import MapLegend from './MapLegend'
import { FlyTo, ClickCapture, InvalidateOnMount } from './mapHelpers'
import { useUser } from '../../contexts/UserContext'
import { useShelters } from '../../contexts/ShelterContext'
import { useI18n } from '../../i18n'
import { getOverallStatus } from '../../utils/scoring'
import type { LatLng } from '../../utils/geo'

const pinIcon = L.divIcon({
  className: '',
  html: `<div style="
    width:24px;height:24px;transform:translateY(-8px);
    filter:drop-shadow(0 0 8px rgba(255,255,255,.5));
  ">
    <svg viewBox="0 0 24 24" width="24" height="24" fill="#F4F1E6" stroke="#101510" stroke-width="1.5">
      <path d="M12 2C8 2 5 5 5 9c0 5 7 13 7 13s7-8 7-13c0-4-3-7-7-7z"/>
      <circle cx="12" cy="9" r="2.5" fill="#101510" stroke="none"/>
    </svg>
  </div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 24],
})

interface Props {
  value: LatLng
  onChange: (loc: LatLng) => void
  /** 容器尺寸 class（預設小地圖） */
  className?: string
  /** 是否疊加避難所、群眾回報、災害範圍 */
  showContext?: boolean
}

/** 可點擊 / 搜尋 / 定位來選取座標的地圖 */
export default function LocationPicker({ value, onChange, className, showContext = false }: Props) {
  const { locateMe, locating, disaster } = useUser()
  const { shelters } = useShelters()
  const { t } = useI18n()
  const [showReports, setShowReports] = useState(true)   // 回報圖層開關（情境模式）

  return (
    <div className={`relative overflow-hidden ${className ?? 'w-full h-56 rounded-2xl border border-white/10'}`}>
      <MapContainer
        center={[value.lat, value.lng]}
        zoom={16}
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
        <ClickCapture onPick={onChange} />
        <FlyTo target={value} />

        {showContext && (
          <>
            <FloodOverlay />
            {showReports && <ReportOverlay />}
            {shelters.map(s => {
              const notSuitable = s.not_suitable_for.includes(disaster)
              const status = notSuitable ? 'danger' : getOverallStatus(s, disaster)
              return (
                <ShelterMarker key={s.shelter_id} shelter={s} status={status} notSuitable={notSuitable} onClick={() => {}} />
              )
            })}
          </>
        )}

        <Marker
          position={[value.lat, value.lng]}
          icon={pinIcon}
          draggable
          eventHandlers={{
            dragend: e => {
              const m = e.target as L.Marker
              const p = m.getLatLng()
              onChange({ lat: p.lat, lng: p.lng })
            },
          }}
        />
      </MapContainer>
      {showContext && <div className="map-vignette" />}
      {showContext && (
        <MapLegend
          shelters buildings floodDepth reports
          showReports={showReports} onToggleReports={() => setShowReports(v => !v)}
          className="absolute bottom-3 right-3 z-[500]"
        />
      )}

      {!showContext && (
        <>
          {/* 搜尋 */}
          <div className="absolute top-2 left-2 right-12 z-[1000]">
            <LocationSearch
              onSelect={r => onChange({ lat: r.lat, lng: r.lng })}
              placeholder={t('search.short')}
            />
          </div>

          {/* 使用目前位置 */}
          <button
            type="button"
            onClick={() => { locateMe().then(onChange).catch(() => {}) }}
            className="absolute bottom-2 right-2 z-[600] w-10 h-10 rounded-full glass flex items-center justify-center text-white active:scale-95 transition-transform"
            aria-label={t('common.myLocation')}
          >
            {locating
              ? <Loader2 size={16} className="animate-spin" />
              : <LocateFixed size={16} />}
          </button>
        </>
      )}
    </div>
  )
}
