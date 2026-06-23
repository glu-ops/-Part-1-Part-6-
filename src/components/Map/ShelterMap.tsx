import { useState, useEffect } from 'react'
import { MapContainer, TileLayer, Marker } from 'react-leaflet'
import L from 'leaflet'
import { LocateFixed, Loader2 } from 'lucide-react'
import ShelterMarker from './ShelterMarker'
import BuildingLayer from './BuildingLayer'
import FloodSensorOverlay from './FloodSensorOverlay'
import FloodFacilityOverlay from './FloodFacilityOverlay'
import RiskOverlay from './RiskOverlay'
import ReportOverlay from './ReportOverlay'
import LocationSearch from './LocationSearch'
import { FlyTo, InvalidateOnMount } from './mapHelpers'
import { useShelters } from '../../contexts/ShelterContext'
import { useUser } from '../../contexts/UserContext'
import { useFocus } from '../../contexts/FocusContext'
import { useI18n } from '../../i18n'
import { getOverallStatus } from '../../utils/scoring'
import { DEFAULT_LOC } from '../../utils/geo'
import type { LatLng } from '../../utils/geo'
import type { Shelter } from '../../types'

const DEFAULT_ZOOM = 15

// 白色光點 — 使用者位置（單色 + 柔光暈）
const userIcon = L.divIcon({
  className: '',
  html: `<div style="
    width:14px;height:14px;border-radius:50%;
    background:#f5f5f5;
    border:3px solid rgba(255,255,255,.95);
    box-shadow:0 0 0 4px rgba(255,255,255,.18), 0 0 14px rgba(255,255,255,.55);
  "></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
})

interface Props {
  onSelect: (s: Shelter) => void
  /** 淹水模式：是否顯示防汛據點圖層（由圖例開關控制） */
  showFacilities?: boolean
  /** 是否顯示群眾回報圖層（由圖例開關控制，所有災害模式適用） */
  showReports?: boolean
}

export default function ShelterMap({ onSelect, showFacilities = true, showReports = true }: Props) {
  const { shelters } = useShelters()
  const { disaster, userLoc, locating, geoError, locateMe } = useUser()
  const { target } = useFocus()
  const { t } = useI18n()
  const [flyTarget, setFlyTarget] = useState<LatLng | null>(null)
  const [reportFocus, setReportFocus] = useState<{ id: string; nonce: number } | null>(null)

  useEffect(() => {
    setFlyTarget({ ...userLoc })
  }, [userLoc])

  // 通知中心點擊回報 → 飛到該位置並開啟回報串資訊卡
  useEffect(() => {
    if (target?.kind !== 'report') return
    setFlyTarget({ lat: target.lat, lng: target.lng })
    setReportFocus({ id: target.id, nonce: target.nonce })
  }, [target])

  return (
    <div className="relative w-full h-full">
      <MapContainer
        center={[DEFAULT_LOC.lat, DEFAULT_LOC.lng]}
        zoom={DEFAULT_ZOOM}
        className="w-full h-full z-0"
        zoomControl={false}
        attributionControl={true}
      >
        {/* 灰階單色底圖（CARTO dark_all：乾淨深色，無建築物） */}
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          subdomains="abcd"
          attribution="© OpenStreetMap © CARTO"
          maxZoom={20}
        />

        <InvalidateOnMount />
        <BuildingLayer />
        <RiskOverlay />
        {showFacilities && <FloodFacilityOverlay />}
        <FloodSensorOverlay />
        {showReports && <ReportOverlay focus={reportFocus} />}

        <Marker position={[userLoc.lat, userLoc.lng]} icon={userIcon} />

        <FlyTo target={flyTarget} zoom={16} />

        {shelters.map(s => {
          const notSuitable = s.not_suitable_for.includes(disaster)
          const status = notSuitable ? 'danger' : getOverallStatus(s, disaster)
          return (
            <ShelterMarker
              key={s.shelter_id}
              shelter={s}
              status={status}
              notSuitable={notSuitable}
              onClick={() => onSelect(s)}
            />
          )
        })}
      </MapContainer>

      {/* 等高線網格紋理 + 暈影（地形掃描質感） */}
      <div className="map-texture" />
      <div className="map-vignette" />

      {/* 搜尋地點 */}
      <div className="absolute top-16 left-3 right-3 z-[1000] lg:top-20 lg:left-4 lg:right-auto lg:w-80">
        <LocationSearch
          onSelect={r => setFlyTarget({ lat: r.lat, lng: r.lng })}
        />
        {geoError && (
          <p className="mt-1.5 text-[11px] text-white/70 glass rounded-lg px-2 py-1 inline-block">
            {geoError}
          </p>
        )}
      </div>

      {/* 回到我的位置 */}
      <button
        onClick={locateMe}
        className="absolute bottom-32 right-3 z-[600] w-12 h-12 rounded-full glass flex items-center justify-center text-white active:scale-95 transition-transform lg:bottom-4 lg:right-[72px]"
        aria-label={t('home.relocate')}
      >
        {locating
          ? <Loader2 size={20} className="animate-spin" />
          : <LocateFixed size={20} />}
      </button>
    </div>
  )
}
