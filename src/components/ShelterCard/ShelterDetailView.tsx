import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, MapPin, Clock, Droplets,
  Utensils, Heart, Zap, Navigation, AlertTriangle,
  ShieldCheck, ShieldAlert, ShieldQuestion, ShieldOff,
  MessageCircle, AlertOctagon, X,
} from 'lucide-react'
import { useShelters, getSurgeRate } from '../../contexts/ShelterContext'
import { useUser } from '../../contexts/UserContext'
import { useMesh } from '../../contexts/MeshContext'
import { useI18n } from '../../i18n'
import {
  getOverallStatus, calcScore,
  walkMinutes, minutesToSaturation,
} from '../../utils/scoring'
import StatusBadge from './StatusBadge'
import ShelterAiStatusCard from './ShelterAiStatusCard'
import { DISASTER_ICON } from '../../disasters'
import { getResourceCapacityStatus, getShelterSupportTimes, supportTimeColor, supportTimeLabel } from '../../utils/shelterCapacity'
import type { EntryStatus, ResourceStatus, DisasterMode } from '../../types'

// 災害情境圖示（單色線條，繼承所在文字顏色）
function DIcon({ d, size = 13 }: { d: DisasterMode; size?: number }) {
  const Icon = DISASTER_ICON[d]
  return <Icon size={size} className="inline-block shrink-0" />
}

const ENTRY_STATUS_CFG: Record<EntryStatus, { Icon: typeof ShieldCheck; color: string }> = {
  official_open:   { Icon: ShieldCheck,    color: 'text-status-safe' },
  crowd_reported:  { Icon: ShieldAlert,    color: 'text-status-caution' },
  unverified:      { Icon: ShieldQuestion, color: 'text-white/55' },
  closed:          { Icon: ShieldOff,      color: 'text-status-danger' },
}

const RES_CFG = [
  { key: 'water'   as const, labelKey: 'res.water',   Icon: Droplets },
  { key: 'food'    as const, labelKey: 'res.food',    Icon: Utensils },
  { key: 'medical' as const, labelKey: 'res.medical', Icon: Heart    },
  { key: 'power'   as const, labelKey: 'res.power',   Icon: Zap      },
]
const REPORT_SEV_COLOR: Record<ResourceStatus, string> = {
  green: 'text-status-safe', yellow: 'text-status-caution', red: 'text-status-danger',
}

interface Props {
  shelterId: string
  /** page = 獨立頁面（/shelter/:id）；modal = 浮層（停留在地圖上，效果如 SOS 發送面板） */
  variant?: 'page' | 'modal'
  onClose?: () => void
}

/**
 * 避難所詳細資料：頁面版（路由）與浮層版（停留在 / 地圖背景上）共用同一份內容。
 */
export default function ShelterDetailView({ shelterId, variant = 'page', onClose }: Props) {
  const nav = useNavigate()
  const { shelters, reports } = useShelters()
  const { disaster, userLoc } = useUser()
  const { openSosComposer } = useMesh()
  const { t, rt } = useI18n()
  const isModal = variant === 'modal'

  const s = shelters.find(x => x.shelter_id === shelterId)
  if (!s) {
    const notFound = <p className="text-white/55">{t('detail.notFound')}</p>
    if (isModal) {
      return createPortal(
        <div className="fixed inset-0 z-[2000] flex items-end lg:items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
          <div className="glass w-full lg:max-w-md rounded-t-3xl lg:rounded-3xl p-8 flex justify-center" onClick={e => e.stopPropagation()}>{notFound}</div>
        </div>,
        document.body,
      )
    }
    return <div className="flex items-center justify-center h-screen">{notFound}</div>
  }

  const notSuitable = s.not_suitable_for.includes(disaster)
  const status = notSuitable ? 'danger' : getOverallStatus(s, disaster)
  const score  = calcScore(s, disaster)
  const occ    = Math.round((s.capacity.current_estimate / s.capacity.physical) * 100)
  const walkMin = walkMinutes(userLoc.lat, userLoc.lng, s.lat, s.lng)

  const surgeRate  = getSurgeRate(s.shelter_id)
  const arrivalOcc = Math.min(100, occ + walkMin * 3)
  const satMins    = minutesToSaturation(s, surgeRate)
  const arrivalStatus = arrivalOcc > 90 ? 'danger' : arrivalOcc > 70 ? 'caution' : 'safe'

  const liveReports = reports.filter(r => r.shelter_id === shelterId)
  const totalReports = liveReports.length + s.report_count
  const latestReport = liveReports[liveReports.length - 1]
  const supportTimes = getShelterSupportTimes(s)
  const resourceCapacityStatus = getResourceCapacityStatus(s)

  const entryCfg = ENTRY_STATUS_CFG[s.entry_status]
  const occColor = occ > 90 ? 'text-status-danger' : occ > 70 ? 'text-status-caution' : 'text-status-safe'
  const occBar   = occ > 90 ? 'bg-status-danger' : occ > 70 ? 'bg-status-caution' : 'bg-status-safe'
  const arrColor = arrivalStatus === 'safe' ? 'text-status-safe' : arrivalStatus === 'caution' ? 'text-status-caution' : 'text-status-danger'
  const arrBar   = arrivalStatus === 'safe' ? 'bg-status-safe' : arrivalStatus === 'caution' ? 'bg-status-caution' : 'bg-status-danger'

  // 不適用警告（頁面版自帶 mx/mt 邊距；浮層版置於有 padding 的捲動容器內）
  const naWarning = notSuitable && (
    <div className={`glass rounded-2xl p-4 flex gap-3 border border-status-danger/30 ${isModal ? '' : 'mx-4 mt-4'}`}>
      <AlertTriangle size={18} className="text-status-danger shrink-0 mt-0.5" />
      <div>
        <p className="text-status-danger font-semibold text-sm flex items-center gap-1.5">
          <DIcon d={disaster} size={14} /> {t('detail.naTitle', { disaster: t(`disaster.${disaster}`) })}
        </p>
        <p className="text-status-danger/70 text-xs mt-0.5">
          {t('detail.naDesc', { type: s.type_label })}
        </p>
      </div>
    </div>
  )

  const body = (
    <>
      {/* 綜合評分 */}
      <div className="glass rounded-2xl p-4">
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-xs text-white/45 uppercase tracking-wider">{t('detail.score')}</span>
          <span className="num text-3xl text-white">{score}<span className="text-sm font-normal text-white/40"> / 100</span></span>
        </div>
        <div className="h-2 bg-white/10 rounded-full overflow-hidden mb-1.5">
          <div className={`h-full rounded-full transition-all duration-700 ${status === 'safe' ? 'bg-status-safe' : status === 'caution' ? 'bg-status-caution' : 'bg-status-danger'}`} style={{ width: `${score}%` }} />
        </div>
        <div className="flex justify-between text-[10px] text-white/40">
          <span>{t('common.danger')} 0</span><span>{t('common.caution')} 30</span><span>{t('common.safe')} 60</span><span>100</span>
        </div>
      </div>

      {/* AI 即時監測（PDR §11）：有監測資料時顯示，無則自動隱藏 */}
      <ShelterAiStatusCard shelterId={s.shelter_id} />

      {/* 進入狀態 */}
      <div className="glass rounded-2xl p-4">
        <p className="text-xs text-white/45 uppercase tracking-wider mb-3">{t('detail.entryStatus')}</p>
        <div className="flex items-center gap-3">
          <entryCfg.Icon size={22} className={entryCfg.color} />
          <div>
            <p className={`font-semibold text-sm ${entryCfg.color}`}>{t(`entry.${s.entry_status}`)}</p>
            <p className="text-[11px] text-white/45 mt-0.5">{t('detail.lastUpdated', { time: rt(s.last_updated) })}</p>
          </div>
        </div>
      </div>

      {/* 容量資訊 */}
      <div className="glass rounded-2xl p-4">
        <p className="text-xs text-white/45 uppercase tracking-wider mb-3">{t('detail.capacityInfo')}</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          {[
            { label: t('detail.capacityPeople'), value: s.capacity_people ?? t('detail.unknown') },
            { label: t('detail.current'),    value: s.capacity.current_estimate },
            { label: t('detail.physical'),   value: s.capacity.physical },
            { label: t('detail.vulnerable'), value: s.capacity.vulnerable_capacity },
          ].map(({ label, value }) => (
            <div key={label} className="glass-cell rounded-xl p-3 text-center">
              <p className="num text-lg text-white">{value}</p>
              <p className="text-[10px] text-white/45 mt-0.5">{label}</p>
            </div>
          ))}
        </div>
        <div className="flex justify-between text-xs text-white/45 mb-1.5">
          <span>{t('home.occupancy')}</span>
          <span className={`num ${occColor}`}>{occ}%</span>
        </div>
        <div className="h-2 bg-white/10 rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${occBar}`} style={{ width: `${occ}%` }} />
        </div>
      </div>

      {/* 設施資訊 */}
      <div className="glass rounded-2xl p-4 space-y-3">
        <p className="text-xs text-white/45 uppercase tracking-wider">{t('detail.facilityInfo')}</p>
        {([
          { Icon: MapPin, label: t('detail.address'),     value: s.address },
          { Icon: Clock,  label: t('detail.endurance'),   value: `${s.endurance_hours} ${t('common.hours')}` },
          { Icon: Clock,  label: t('detail.structureAge'), value: `${s.structure_age} ${t('common.years')}${s.structure_age > 50 ? t('detail.agePenalty') : ''}` },
        ]).map(({ Icon, label, value }) => (
          <div key={label} className="flex items-start gap-3">
            <Icon size={15} className="text-white/45 mt-0.5 shrink-0" />
            <div className="flex-1 flex justify-between gap-4 min-w-0">
              <span className="text-white/55 text-sm shrink-0">{label}</span>
              <span className="text-white text-sm font-medium text-right truncate">{value}</span>
            </div>
          </div>
        ))}
        <div className="flex items-center gap-3 pt-1 border-t border-white/8">
          <MapPin size={15} className="text-white/60 shrink-0" />
          <div className="flex-1 flex justify-between">
            <span className="text-white/55 text-sm">{t('detail.walkFromHere')}</span>
            <span className="text-white num text-sm">{walkMin} {t('common.min')}</span>
          </div>
        </div>
      </div>

      {/* 物資 4 燈 */}
      <div className="glass rounded-2xl p-4">
        <p className="text-xs text-white/45 uppercase tracking-wider mb-3">{t('detail.resStatus')}</p>
        <div className="grid grid-cols-4 gap-2">
          {RES_CFG.map(({ key, labelKey, Icon }) => {
            const time = supportTimes[key]
            return (
              <div key={key} className="glass-cell rounded-xl p-3 flex flex-col items-center gap-1.5">
                <Icon size={18} className={supportTimeColor(time)} />
                <span className="text-[10px] text-white/45">{t(labelKey)}</span>
                <span className={`text-[11px] font-bold ${supportTimeColor(time)}`}>{supportTimeLabel(time, t('common.hours'))}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* 容量與資源評估 */}
      <div className="glass rounded-2xl p-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <p className="text-xs text-white/45 uppercase tracking-wider">{t('detail.capacityAssessment')}</p>
            <p className="text-sm text-white font-semibold mt-1">
              {s.resource_capacity_level ?? '-'}{s.overall_role ? ` · ${s.overall_role}` : ''}
            </p>
          </div>
          <span className="glass-cell rounded-full px-3 py-1 text-[11px] text-white/70 shrink-0">
            {t(`capacity.hint.${resourceCapacityStatus ?? 'unknown'}`)}
          </span>
        </div>

        <div className="grid gap-3">
          <div className="glass-cell rounded-xl p-3">
            <p className="text-[11px] text-white/45 mb-1">{t('detail.resourceConditions')}</p>
            <p className="text-sm text-white/85 leading-relaxed">{s.resource_conditions ?? t('detail.unknown')}</p>
          </div>
          <div className="glass-cell rounded-xl p-3">
            <p className="text-[11px] text-white/45 mb-1">{t('detail.entranceCapacity')}</p>
            <p className="text-sm text-white/85 leading-relaxed">{s.entrance_capacity ?? t('detail.unknown')}</p>
          </div>
          <div className="glass-cell rounded-xl p-3">
            <p className="text-[11px] text-white/45 mb-1">{t('detail.physicalCapacity')}</p>
            <p className="text-sm text-white/85 leading-relaxed">{s.physical_capacity ?? t('detail.unknown')}</p>
          </div>
          <div className="glass-cell rounded-xl p-3">
            <p className="text-[11px] text-white/45 mb-1">{t('detail.suitableUsers')}</p>
            <p className="text-sm text-white/85 leading-relaxed">{s.suitable_users ?? t('detail.unknown')}</p>
          </div>
          <div className="glass-cell rounded-xl p-3">
            <p className="text-[11px] text-white/45 mb-1">{t('detail.managementCapacity')}</p>
            <p className="text-sm text-white/85 leading-relaxed">{s.management_capacity ?? t('detail.unknown')}</p>
          </div>
          <div className="glass-cell rounded-xl p-3">
            <p className="text-[11px] text-white/45 mb-1">{t('detail.notes')}</p>
            <p className="text-sm text-white/85 leading-relaxed">{s.notes ?? t('detail.unknown')}</p>
          </div>
        </div>
      </div>

      {/* 適用災害 */}
      <div className="glass rounded-2xl p-4">
        <p className="text-xs text-white/45 uppercase tracking-wider mb-3">{t('detail.applicable')}</p>
        <div className="flex flex-wrap gap-2">
          {s.applicable_disasters.map(d => (
            <span key={d} className="glass-cell text-white/85 text-xs px-3 py-1 rounded-full inline-flex items-center gap-1.5">
              <DIcon d={d} /> {t(`disaster.${d}`)}
            </span>
          ))}
          {s.not_suitable_for.map(d => (
            <span key={d} className="glass-cell text-status-danger/60 text-xs px-3 py-1 rounded-full line-through inline-flex items-center gap-1.5">
              <DIcon d={d} /> {t(`disaster.${d}`)}
            </span>
          ))}
        </div>
      </div>

      {/* 抵達時預測 */}
      <div className="glass rounded-2xl p-4 border border-white/15">
        <div className="flex items-center gap-2 mb-3">
          <Clock size={14} className="text-white/70" />
          <p className="text-xs text-white/55 uppercase tracking-wider">{t('detail.arrivalPredict')}</p>
        </div>
        <div className="flex items-center gap-4 mb-3">
          <div className="num text-4xl text-white">{walkMin}<span className="text-base font-normal text-white/45">{t('common.minShort')}</span></div>
          <div className="flex-1">
            <p className="text-xs text-white/45 mb-1">{t('detail.arrivalCapAfter', { n: walkMin })}</p>
            <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${arrBar}`} style={{ width: `${arrivalOcc}%` }} />
            </div>
            <p className={`text-xs font-semibold mt-1 num ${arrColor}`}>
              {arrivalOcc}%
              {arrivalStatus === 'safe' && t('detail.capEnough')}
              {arrivalStatus === 'caution' && t('detail.capHigh')}
              {arrivalStatus === 'danger' && t('detail.capFull')}
            </p>
          </div>
        </div>

        {arrivalStatus === 'danger' && (
          <div className="glass-cell rounded-xl p-3 text-xs text-status-danger flex gap-2">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            {t('detail.arriveFullWarn')}
          </div>
        )}

        {satMins !== null && satMins !== Infinity && (
          <div className="mt-3 border-t border-white/8 pt-3">
            <div className="flex justify-between text-xs mb-1.5">
              <span className="text-white/55">{t('detail.satCountdown')}</span>
              <span className="text-status-caution num">{t('route.afterMin', { n: satMins })}</span>
            </div>
            <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full bg-status-caution rounded-full" style={{ width: `${Math.max(5, 100 - (satMins / 60) * 100)}%` }} />
            </div>
          </div>
        )}
        {satMins === null && (
          <div className="mt-3 border-t border-white/8 pt-3 text-xs text-status-danger font-semibold">
            {t('detail.satReached')}
          </div>
        )}
      </div>

      {/* 群眾回報 */}
      <div className="glass rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <MessageCircle size={14} className="text-white/55" />
            <p className="text-xs text-white/45 uppercase tracking-wider">{t('detail.crowdReport')}</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-white/45">
            <span>{t('detail.nReports', { n: totalReports })}</span>
            {latestReport && <span>{t('detail.latest', { time: rt(latestReport.reported_at) })}</span>}
          </div>
        </div>

        {liveReports.length === 0 ? (
          <p className="text-white/40 text-xs py-2">{t('detail.noLiveReport', { n: s.report_count })}</p>
        ) : (
          <div className="space-y-2">
            {liveReports.slice().reverse().map(r => (
              <div key={r.id} className="glass-cell rounded-xl p-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-[10px] glass-cell text-white/55 px-2 py-0.5 rounded-full">{t(`rt.${r.type}`)}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full glass-cell ${REPORT_SEV_COLOR[r.severity]}`}>{t(`report.sev.${r.severity}`)}</span>
                  <span className="text-[10px] text-white/40 ml-auto">{rt(r.reported_at)}</span>
                </div>
                <p className="text-sm text-white/85">{r.note}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )

  const actions = (
    <>
      <button
        onClick={() => openSosComposer({ category: 'shelterHelp', scope: 'commandCenter', shelter: { id: s.shelter_id, name: s.name, location: s.address } })}
        className="glass-cell text-status-danger font-semibold rounded-full py-3.5 px-4 flex items-center justify-center gap-1.5 active:scale-[.98] transition-all shrink-0"
        aria-label={t('sos.shelterHelpCta')}
      >
        <AlertOctagon size={18} />
        {t('sos.shelterHelpCta')}
      </button>
      <button
        onClick={() => nav(`/report?shelter=${s.shelter_id}`)}
        className="glass-cell text-white font-semibold rounded-full py-3.5 px-4 flex items-center justify-center gap-2 active:scale-[.98] transition-all shrink-0"
      >
        <MessageCircle size={18} />
        {t('detail.reportHere')}
      </button>
      <button
        onClick={() => nav(`/route?dest=${s.shelter_id}`)}
        className="flex-1 bg-white text-neutral-900 font-bold rounded-full py-3.5 flex items-center justify-center gap-2 hover:bg-white/90 active:scale-[.98] transition-all"
      >
        <Navigation size={18} />
        {t('detail.planRouteHere')}
      </button>
    </>
  )

  // 浮層版：停留在 / 地圖背景上，效果如「發出 SOS 求救」面板。
  // 以 portal 掛到 body，避免被 HomePage 的 fixed 容器困住、導致頂部被 Header 蓋住。
  if (isModal) {
    return createPortal(
      <div className="fixed inset-0 z-[2000] flex items-end lg:items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
        <div
          className="glass w-full lg:max-w-2xl max-h-[90vh] flex flex-col rounded-t-3xl lg:rounded-3xl overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          {/* 抬頭 */}
          <div className="border-b border-white/10 px-4 py-3 flex items-center gap-3 shrink-0">
            <div className="flex-1 min-w-0">
              <h1 className="text-white font-bold text-sm truncate">{s.name}</h1>
              <p className="text-white/45 text-xs">{s.type_label}</p>
            </div>
            <StatusBadge status={status} />
            <button onClick={onClose} className="text-white/55 hover:text-white p-1 -mr-1 shrink-0">
              <X size={20} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto no-scrollbar px-4 py-4 space-y-3">
            {naWarning}
            {body}
          </div>

          <div className="px-4 py-3 border-t border-white/10 flex gap-2 shrink-0">
            {actions}
          </div>
        </div>
      </div>,
      document.body,
    )
  }

  // 頁面版：獨立路由 /shelter/:id
  return (
    <div className="min-h-screen pb-44 pt-14 max-w-2xl mx-auto">
      {/* Page header */}
      <div className="glass border-b border-white/10 px-4 py-3 flex items-center gap-3">
        <button onClick={() => nav(-1)} className="text-white/55 hover:text-white p-1 -ml-1">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-white font-bold text-sm truncate">{s.name}</h1>
          <p className="text-white/45 text-xs">{s.type_label}</p>
        </div>
        <StatusBadge status={status} />
      </div>

      {naWarning}

      <div className="px-4 pt-4 space-y-3">
        {body}
      </div>

      {/* 底部 CTA */}
      <div className="fixed bottom-16 inset-x-0 px-4 pb-2 pt-6 bg-gradient-to-t from-[#1d1e22] via-[#1d1e22]/80 to-transparent max-w-2xl mx-auto flex gap-2">
        {actions}
      </div>
    </div>
  )
}
