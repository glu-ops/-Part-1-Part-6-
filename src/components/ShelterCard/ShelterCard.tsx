import { useNavigate } from 'react-router-dom'
import { MapPin, Clock, Users, Droplets, Utensils, Heart, Zap, ChevronRight, AlertOctagon } from 'lucide-react'
import type { Shelter, OverallStatus } from '../../types'
import StatusBadge from './StatusBadge'
import { useI18n } from '../../i18n'
import { useMesh } from '../../contexts/MeshContext'
import { getShelterSupportTimes, supportTimeColor, supportTimeLabel } from '../../utils/shelterCapacity'

interface Props {
  shelter: Shelter
  status: OverallStatus
  distanceM?: number
  walkMin?: number
  compact?: boolean
}

const resIcons = { water: Droplets, food: Utensils, medical: Heart, power: Zap }
const resLabelKey = { water: 'res.water', food: 'res.food', medical: 'res.medical', power: 'res.power' }
export default function ShelterCard({ shelter: s, status, distanceM, walkMin, compact = false }: Props) {
  const nav = useNavigate()
  const { t, rt } = useI18n()
  const { openSosComposer } = useMesh()
  const occ = Math.round((s.capacity.current_estimate / s.capacity.physical) * 100)
  const occColor = occ > 90 ? 'text-status-danger' : occ > 70 ? 'text-status-caution' : 'text-status-safe'
  const occBar   = occ > 90 ? 'bg-status-danger' : occ > 70 ? 'bg-status-caution' : 'bg-status-safe'
  const supportTimes = getShelterSupportTimes(s)

  return (
    <div
      className="glass rounded-2xl p-4 cursor-pointer hover:border-white/25 transition-colors active:scale-[.99]"
      onClick={() => nav(`/shelter/${s.shelter_id}`)}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <StatusBadge status={status} />
          </div>
          <h3 className="text-white font-bold text-sm leading-tight truncate">{s.name}</h3>
          <p className="text-white/45 text-xs mt-0.5 truncate">{s.type_label}</p>
        </div>
        <ChevronRight size={16} className="text-white/35 shrink-0 mt-1" />
      </div>

      <div className="flex items-center gap-3 text-xs text-white/55 mb-3">
        {distanceM != null && (
          <span className="flex items-center gap-1">
            <MapPin size={11} className="text-white/50" />
            <span className="num text-white/80">{distanceM < 1000 ? `${distanceM}m` : `${(distanceM / 1000).toFixed(1)}km`}</span>
          </span>
        )}
        {walkMin != null && (
          <span className="flex items-center gap-1">
            <Clock size={11} />{t('home.walkMin', { n: walkMin })}
          </span>
        )}
        <span className="flex items-center gap-1">
          <Users size={11} />
          <span className="num text-white/80">{s.capacity.current_estimate}/{s.capacity.physical}</span>
        </span>
        {s.capacity_people && (
          <span className="text-white/45">{s.capacity_people}</span>
        )}
      </div>

      <div className="mb-3">
        <div className="flex justify-between text-xs text-white/45 mb-1">
          <span>{t('home.occupancy')}</span>
          <span className={`num ${occColor}`}>{occ}%</span>
        </div>
        <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${occBar}`} style={{ width: `${occ}%` }} />
        </div>
      </div>

      {!compact && (
        <div className="grid grid-cols-4 gap-2">
          {(Object.keys(resIcons) as Array<keyof typeof resIcons>).map(key => {
            const Icon = resIcons[key]
            const time = supportTimes[key]
            return (
              <div key={key} className="flex flex-col items-center gap-0.5">
                <Icon size={14} className={supportTimeColor(time)} />
                <span className="text-[10px] text-white/45">{t(resLabelKey[key])}</span>
                <span className={`text-[10px] font-medium ${supportTimeColor(time)}`}>{supportTimeLabel(time, t('common.hours'))}</span>
              </div>
            )
          })}
        </div>
      )}

      <div className="flex items-center justify-between mt-3 gap-2">
        <p className="text-[10px] text-white/40 flex-1 min-w-0 truncate">{t('home.lastUpdated', { time: rt(s.last_updated), n: s.report_count })}</p>
        <button
          onClick={e => {
            e.stopPropagation()
            openSosComposer({ category: 'shelterHelp', scope: 'commandCenter', shelter: { id: s.shelter_id, name: s.name, location: s.address } })
          }}
          className="shrink-0 text-[10px] font-semibold text-status-danger glass-cell rounded-full px-2.5 py-1 flex items-center gap-1 active:scale-95 transition-transform"
        >
          <AlertOctagon size={11} />{t('sos.shelterHelpCta')}
        </button>
      </div>
    </div>
  )
}
