import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import {
  AlertTriangle, Navigation, Loader2, ExternalLink, CornerUpRight, RotateCw,
  Footprints, Bike, Bus, Car,
  User, PersonStanding, Baby, Accessibility, GraduationCap, HeartPulse,
} from 'lucide-react'
import { useShelters, getSurgeRate } from '../contexts/ShelterContext'
import { useUser } from '../contexts/UserContext'
import { useI18n } from '../i18n'
import { useIsDesktop } from '../hooks'
import { getOverallStatus, walkMinutes, calcRoleScore, sortByRole, minutesToSaturation } from '../utils/scoring'
import StatusBadge from '../components/ShelterCard/StatusBadge'
import RouteMap from '../components/Map/RouteMap'
import RoutePlanMap from '../components/Map/RoutePlanMap'
import { DISASTERS, DISASTER_ICON } from '../disasters'
import { getWalkingRoute, googleMapsDirUrl } from '../utils/geo'
import type { RouteResult } from '../utils/geo'
import type { UserRole } from '../types'

const TRAVEL = [
  { key: 'walk', Icon: Footprints, active: true },
  { key: 'bike', Icon: Bike, active: false },
  { key: 'transit', Icon: Bus, active: false },
  { key: 'car', Icon: Car, active: false },
]
const ROLE_ICON: Record<UserRole, typeof User> = {
  adult: User, elderly: PersonStanding, pregnant: HeartPulse,
  child: Baby, disabled: Accessibility, student: GraduationCap,
}
const ROLES = Object.keys(ROLE_ICON) as UserRole[]

export default function RoutePage() {
  const [params] = useSearchParams()
  const { shelters } = useShelters()
  const { disaster, role, userLoc, setRole, setDisaster } = useUser()
  const { t } = useI18n()
  const isDesktop = useIsDesktop()
  const nav = useNavigate()

  const [destId, setDestId] = useState(params.get('dest') ?? '')
  const [route, setRoute] = useState<RouteResult | null>(null)
  const [routeLoading, setRouteLoading] = useState(false)
  const [routeError, setRouteError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    const d = params.get('dest')
    if (d) setDestId(d)
  }, [params])

  const dest = shelters.find(s => s.shelter_id === destId)

  useEffect(() => {
    if (!dest) { setRoute(null); setRouteError(null); setRouteLoading(false); return }
    const ctrl = new AbortController()
    let active = true
    setRoute(null)
    setRouteLoading(true); setRouteError(null)
    getWalkingRoute(userLoc, { lat: dest.lat, lng: dest.lng }, ctrl.signal)
      .then(r => { if (active) setRoute(r) })
      .catch(e => {
        if (active && (e as Error).name !== 'AbortError') { setRoute(null); setRouteError(t('route.routeFail')) }
      })
      .finally(() => { if (active) setRouteLoading(false) })
    return () => { active = false; ctrl.abort() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dest, userLoc, reload])

  const routeWalkMin = route ? Math.max(1, Math.round(route.duration / 60)) : null
  const walkMin = dest ? (routeWalkMin ?? walkMinutes(userLoc.lat, userLoc.lng, dest.lat, dest.lng)) : null
  const destStatus = dest ? (dest.not_suitable_for.includes(disaster) ? 'danger' : getOverallStatus(dest, disaster)) : null

  const arrivalOcc = dest && walkMin != null
    ? Math.min(100, Math.round(((dest.capacity.current_estimate + getSurgeRate(dest.shelter_id) * walkMin) / dest.capacity.physical) * 100))
    : null
  const arrivalStatus = arrivalOcc != null
    ? (arrivalOcc > 90 ? 'danger' : arrivalOcc > 70 ? 'caution' : 'safe') : null

  const recommended = sortByRole(shelters, disaster, role, userLoc.lat, userLoc.lng)
    .filter(s => !s.not_suitable_for.includes(disaster)).slice(0, 3)
  const altShelter = arrivalStatus === 'danger' ? recommended.find(s => s.shelter_id !== destId) : null
  const isVulnerableRole = ['elderly', 'disabled', 'pregnant', 'child'].includes(role)
  const distKm = dest && route ? (route.distance / 1000).toFixed(1) : null

  // ── 左面板內容（行動與桌面共用） ──
  const panel = (
    <>
      <div className="px-4 pt-4 pb-2 shrink-0">
        <h1 className="text-xl font-bold text-white">{t('route.title')}</h1>
        <p className="text-xs text-white/45 mt-0.5">{t('route.currentRole', { role: t(`role.${role}`) })}</p>
      </div>

      <div className="flex-1 lg:overflow-y-auto no-scrollbar px-4 space-y-3 pb-3">
        {isVulnerableRole && (
          <div className="glass-soft rounded-2xl p-3 text-xs text-white/75">💡 {t(`tip.${role}`)}</div>
        )}

        {/* 起點 / 終點 */}
        <div className="glass-cell rounded-2xl p-4">
          <div className="flex gap-3">
            <div className="flex flex-col items-center pt-1">
              <span className="w-3 h-3 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,.6)]" />
              <span className="flex-1 my-1 border-l border-dashed border-white/30" />
              <span className="w-3 h-3 rounded-full border-2 border-white" />
            </div>
            <div className="flex-1 space-y-3">
              <div>
                <label className="text-[11px] text-white/45 block">{t('route.origin')}</label>
                <div className="text-sm text-white font-semibold flex items-center gap-1.5">
                  <Navigation size={13} className="text-white/70" />{t('common.myLocation')}
                </div>
              </div>
              <div className="border-t border-white/8 pt-3">
                <label className="text-[11px] text-white/45 block mb-1">{t('route.destination')}</label>
                <select
                  value={destId}
                  onChange={e => setDestId(e.target.value)}
                  className="w-full glass-cell text-white text-sm rounded-lg px-3 py-2 outline-none"
                >
                  <option value="">{t('route.selectShelter')}</option>
                  {shelters.map(s => (<option key={s.shelter_id} value={s.shelter_id}>{s.name}</option>))}
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* 移動方式 */}
        <div className="glass-cell rounded-2xl p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] text-white/45">{t('route.walkTime')}</span>
            {walkMin != null && <span className="text-[11px] text-white/70 num">{t('route.walkAbout', { n: walkMin })}</span>}
          </div>
          <div className="grid grid-cols-4 gap-2">
            {TRAVEL.map(({ key, Icon, active }) => (
              <div key={key} className={`flex items-center justify-center py-2.5 rounded-xl ${active ? 'bg-white text-neutral-900' : 'glass-cell text-white/35'}`}>
                <Icon size={18} />
              </div>
            ))}
          </div>
        </div>

        {/* 角色 / 災害模式 */}
        <div className="glass-cell rounded-2xl p-3 space-y-3">
          <div>
            <span className="text-[11px] text-white/45 block mb-2">{t('route.currentRole', { role: t(`role.${role}`) })}</span>
            <div className="grid grid-cols-6 gap-1.5">
              {ROLES.map(r => {
                const Icon = ROLE_ICON[r]
                return (
                  <button key={r} onClick={() => setRole(r)} title={t(`role.${r}`)}
                    className={`flex items-center justify-center py-2 rounded-lg ${role === r ? 'bg-white text-neutral-900' : 'glass-cell text-white/45'}`}>
                    <Icon size={15} />
                  </button>
                )
              })}
            </div>
          </div>
          <div>
            <span className="text-[11px] text-white/45 block mb-2">{t(`disaster.${disaster}`)}</span>
            <div className="grid grid-cols-4 gap-1.5">
              {DISASTERS.map(d => {
                const Icon = DISASTER_ICON[d]
                return (
                  <button key={d} onClick={() => setDisaster(d)} title={t(`disaster.${d}`)}
                    className={`flex items-center justify-center py-2 rounded-lg ${disaster === d ? 'bg-white text-neutral-900' : 'glass-cell text-white/45'}`}>
                    <Icon size={16} />
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* 距離 / 預估時間 */}
        {dest && walkMin != null && (
          <div className="glass-cell rounded-2xl p-4 flex gap-6">
            <div>
              <p className="text-[11px] text-white/45 mb-0.5">{t('route.routeDist')}</p>
              <p className="num text-white text-2xl">{distKm ?? '—'}<span className="text-sm font-normal text-white/45 ml-1">km</span></p>
            </div>
            <div>
              <p className="text-[11px] text-white/45 mb-0.5">{t('route.walkTime')}</p>
              <p className="num text-white text-2xl">{walkMin}<span className="text-sm font-normal text-white/45 ml-1">{t('common.min')}</span></p>
            </div>
            <div className="ml-auto self-center">
              {dest && destStatus && <StatusBadge status={destStatus} />}
            </div>
          </div>
        )}

        {/* 行動版：內嵌地圖 */}
        {dest && !isDesktop && (
          <div>
            <RouteMap from={userLoc} to={{ lat: dest.lat, lng: dest.lng }} path={route?.coordinates ?? null} />
            <div className="flex items-center justify-between mt-2 text-xs">
              {routeLoading ? (
                <span className="flex items-center gap-1.5 text-white/55"><Loader2 size={13} className="animate-spin" />{t('route.planning')}</span>
              ) : route ? (
                <span className="text-white/55">{t('route.routeDist')} <span className="num text-white">{route.distance < 1000 ? `${Math.round(route.distance)} m` : `${distKm} km`}</span></span>
              ) : (
                <span className="text-status-caution">{routeError ?? t('route.straightEst')}</span>
              )}
              <a href={googleMapsDirUrl(userLoc, { lat: dest.lat, lng: dest.lng })} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-white font-semibold shrink-0">{t('route.googleNav')} <ExternalLink size={12} /></a>
            </div>
          </div>
        )}

        {/* 步行指引 */}
        {route && route.steps.length > 0 && (
          <div className="glass-cell rounded-2xl p-4">
            <p className="text-xs text-white/45 uppercase tracking-wider mb-3">{t('route.walkGuide')}</p>
            <ol className="space-y-2.5">
              {route.steps.map((step, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="mt-0.5 w-6 h-6 rounded-full glass-cell text-white flex items-center justify-center shrink-0">
                    {i === route.steps.length - 1 ? <Navigation size={13} /> : <CornerUpRight size={13} />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white/85 leading-snug">{step.instruction}</p>
                    {step.distance > 0 && <p className="text-[11px] text-white/45 num">{step.distance} {t('common.meter')}</p>}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* 抵達時預測 */}
        {dest && walkMin != null && (() => {
          const satMins = minutesToSaturation(dest, getSurgeRate(dest.shelter_id))
          const arrColor = arrivalStatus === 'danger' ? 'text-status-danger' : arrivalStatus === 'caution' ? 'text-status-caution' : 'text-status-safe'
          return (
            <div className="glass-cell rounded-2xl p-4">
              <p className="text-xs text-white/45 uppercase tracking-wider mb-2">{t('route.arrivalPredict')}</p>
              <p className="text-sm text-white/85 mb-2">
                {t('route.arrivalCapacity', { n: walkMin })}<span className={`num ${arrColor}`}> {arrivalOcc}%</span>
              </p>
              {satMins === null && <p className="text-xs text-status-danger font-semibold">{t('route.saturated')}</p>}
              {satMins !== null && satMins !== Infinity && (
                <div>
                  <div className="flex justify-between text-xs text-white/55 mb-1">
                    <span>{t('route.satCountdown')}</span>
                    <span className="text-status-caution num">{t('route.afterMin', { n: satMins })}</span>
                  </div>
                  <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full bg-status-caution rounded-full" style={{ width: `${Math.min(100, (walkMin) / satMins * 100)}%` }} />
                  </div>
                </div>
              )}
              {satMins === Infinity && <p className="text-xs text-status-safe">{t('route.noSat')}</p>}
            </div>
          )
        })()}

        {/* 群體分流 */}
        {altShelter && dest && (
          <div className="glass-cell rounded-2xl p-4 border border-status-caution/30">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle size={15} className="text-status-caution" />
              <span className="text-status-caution font-semibold text-sm">{t('route.dispatchTitle')}</span>
            </div>
            <p className="text-xs text-white/75 mb-3">{t('route.dispatchDesc', { name: dest.name, role: t(`role.${role}`) })}</p>
            <button onClick={() => nav(`/shelter/${altShelter.shelter_id}`)}
              className="w-full bg-white text-neutral-900 font-bold rounded-full py-3 text-sm">
              {t('route.dispatchBtn', { name: altShelter.name, score: calcRoleScore(altShelter, disaster, role) })}
            </button>
          </div>
        )}

        {/* 依角色推薦 */}
        <div className="glass-cell rounded-2xl p-4">
          <p className="text-xs text-white/45 uppercase tracking-wider mb-3">{t('route.recommend', { role: t(`role.${role}`) })}</p>
          <div className="space-y-2">
            {recommended.map((s, idx) => {
              const wMin = walkMinutes(userLoc.lat, userLoc.lng, s.lat, s.lng)
              const rScore = calcRoleScore(s, disaster, role)
              const st = getOverallStatus(s, disaster)
              return (
                <div key={s.shelter_id}
                  className="flex items-center gap-3 glass-cell rounded-xl px-3 py-2.5 cursor-pointer hover:bg-white/10 transition-colors"
                  onClick={() => { setDestId(s.shelter_id); nav(`/route?dest=${s.shelter_id}`) }}>
                  <span className="text-white/40 num text-sm w-4 shrink-0">{idx + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">{s.name}</p>
                    <p className="text-white/45 text-xs">{t('route.recItem', { n: wMin, score: rScore })}</p>
                  </div>
                  <StatusBadge status={st} />
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* 重新規劃路線 */}
      <div className="px-4 py-3 shrink-0 border-t border-white/10">
        <button
          onClick={() => setReload(r => r + 1)}
          disabled={!dest || routeLoading}
          className="w-full bg-white disabled:opacity-30 text-neutral-900 font-bold rounded-full py-3 flex items-center justify-center gap-2"
        >
          {routeLoading ? <Loader2 size={16} className="animate-spin" /> : <RotateCw size={16} />}
          {t('route.title')}
        </button>
      </div>
    </>
  )

  return (
    <div className="lg:fixed lg:inset-0">
      {/* 桌面：右側全幅地圖 */}
      {isDesktop && (
        <div className="absolute inset-0">
          <RoutePlanMap
            dest={dest ?? null}
            path={route?.coordinates ?? null}
            onSelectDest={s => setDestId(s.shelter_id)}
          />
        </div>
      )}

      {/* 面板：行動=整頁捲動；桌面=左側浮動 */}
      <div className="min-h-screen pt-14 pb-24 max-w-2xl mx-auto flex flex-col
        lg:min-h-0 lg:pt-0 lg:pb-0 lg:max-w-none
        lg:absolute lg:left-4 lg:top-20 lg:bottom-4 lg:w-[380px] lg:z-[500]
        lg:glass lg:rounded-3xl lg:overflow-hidden">
        {panel}
      </div>
    </div>
  )
}
