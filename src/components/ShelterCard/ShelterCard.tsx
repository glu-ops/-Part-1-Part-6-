import { useNavigate } from 'react-router-dom'
import { MapPin, Clock, Users, Droplets, Utensils, Heart, Zap, ChevronRight } from 'lucide-react'
import type { Shelter, OverallStatus } from '../../types'
import StatusBadge from './StatusBadge'
import { useI18n } from '../../i18n'

interface Props {
  shelter: Shelter
  status: OverallStatus
  distanceM?: number
  walkMin?: number
  compact?: boolean
}

const resIcons = { water: Droplets, food: Utensils, medical: Heart, power: Zap }
const resLabelKey = { water: 'res.water', food: 'res.food', medical: 'res.medical', power: 'res.power' }
const resColor = { green: 'text-status-safe', yellow: 'text-status-caution', red: 'text-status-danger' }

export default function ShelterCard({ shelter: s, status, distanceM, walkMin, compact = false }: Props) {
  const nav = useNavigate()
  const { t, rt } = useI18n()
  const occ = Math.round((s.capacity.current_estimate / s.capacity.physical) * 100)
  const occColor = occ > 90 ? 'text-status-danger' : occ > 70 ? 'text-status-caution' : 'text-status-safe'
  const occBar   = occ > 90 ? 'bg-status-danger' : occ > 70 ? 'bg-status-caution' : 'bg-status-safe'

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
            const val = s.resources[key]
            return (
              <div key={key} className="flex flex-col items-center gap-0.5">
                <Icon size={14} className={resColor[val]} />
                <span className="text-[10px] text-white/45">{t(resLabelKey[key])}</span>
                <span className={`text-[10px] font-medium ${resColor[val]}`}>{t(`res.${val}`)}</span>
              </div>
            )
          })}
        </div>
      )}

      <p className="text-[10px] text-white/40 mt-3">{t('home.lastUpdated', { time: rt(s.last_updated), n: s.report_count })}</p>
    </div>
  )
}
