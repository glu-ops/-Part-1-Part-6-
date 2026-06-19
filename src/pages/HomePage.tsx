import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Droplets, Utensils, Heart, Zap, Navigation, X, Clock, Users, MapPin } from 'lucide-react'
import ShelterMap from '../components/Map/ShelterMap'
import RiskPanel from '../components/RiskPanel'
import StatusBadge from '../components/ShelterCard/StatusBadge'
import { useShelters } from '../contexts/ShelterContext'
import { useUser } from '../contexts/UserContext'
import { useI18n } from '../i18n'
import { getOverallStatus, walkMinutes } from '../utils/scoring'
import { TIME_HORIZON, SIM_LABEL_KEY } from '../disasters'
import type { Shelter, OverallStatus } from '../types'

const RES = [
  { key: 'water' as const,   Icon: Droplets, labelKey: 'res.water' },
  { key: 'food' as const,    Icon: Utensils, labelKey: 'res.food' },
  { key: 'medical' as const, Icon: Heart,    labelKey: 'res.medical' },
  { key: 'power' as const,   Icon: Zap,      labelKey: 'res.power' },
]
const RES_COLOR = {
  green:  'text-status-safe',
  yellow: 'text-status-caution',
  red:    'text-status-danger',
}

function distM(lat: number, lng: number, from: { lat: number; lng: number }): number {
  return Math.round(Math.sqrt((lat - from.lat) ** 2 + (lng - from.lng) ** 2) * 111320)
}

// 環形進度圖
function Ring({ pct, status }: { pct: number; status: OverallStatus }) {
  const color = status === 'safe' ? '#22c55e' : status === 'caution' ? '#f4b740' : '#ef4444'
  const r = 26
  const c = 2 * Math.PI * r
  return (
    <div className="relative w-[68px] h-[68px] shrink-0">
      <svg viewBox="0 0 68 68" className="w-full h-full -rotate-90">
        <circle cx="34" cy="34" r={r} fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="6" />
        <circle
          cx="34" cy="34" r={r} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)}
          style={{ transition: 'stroke-dashoffset .6s ease' }}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center num text-base text-white">{pct}<span className="text-[10px] font-normal text-white/50">%</span></span>
    </div>
  )
}

export default function HomePage() {
  const { shelters, timeOffset, setTimeOffset } = useShelters()
  const { disaster, userLoc } = useUser()
  const { t } = useI18n()
  const nav = useNavigate()
  const [selected, setSelected] = useState<Shelter | null>(null)

  // 切換災害時重置時間軸（各災害時間尺度不同）
  useEffect(() => { setTimeOffset(0) }, [disaster, setTimeOffset])

  const horizon = TIME_HORIZON[disaster]
  const step = Math.max(1, Math.round(horizon / 36))
  const fmtTime = (n: number) => {
    if (n === 0) return t('common.now')
    if (n < 60) return t('home.afterMin', { n })
    const h = Math.floor(n / 60), m = n % 60
    return m ? t('home.afterHM', { h, m }) : t('home.afterHour', { h })
  }

  const dangerCount = shelters.filter(s => {
    if (s.not_suitable_for.includes(disaster)) return true
    return getOverallStatus(s, disaster) === 'danger'
  }).length

  const selStatus: OverallStatus | null = selected
    ? (selected.not_suitable_for.includes(disaster) ? 'danger' : getOverallStatus(selected, disaster))
    : null
  const selNotSuitable = selected ? selected.not_suitable_for.includes(disaster) : false
  const selDist = selected ? distM(selected.lat, selected.lng, userLoc) : 0
  const selWalk = selected ? walkMinutes(userLoc.lat, userLoc.lng, selected.lat, selected.lng) : 0
  const selOcc  = selected ? Math.round((selected.capacity.current_estimate / selected.capacity.physical) * 100) : 0

  return (
    <div className="fixed inset-0 overflow-hidden">
      {/* 地圖背景（滿版，浮層 UI 疊於其上） */}
      <ShelterMap onSelect={setSelected} />

      {/* 區域風險評估面板（地震/淹水） */}
      <RiskPanel />

      {/* 災害警告列（浮動 chip） */}
      {dangerCount > 0 && (
        <div className="absolute z-[500] top-16 left-1/2 -translate-x-1/2 lg:top-20 glass rounded-full px-4 py-1.5 flex items-center gap-2 text-xs text-status-danger whitespace-nowrap max-w-[calc(100vw-1.5rem)] overflow-hidden">
          <span className="w-1.5 h-1.5 rounded-full bg-status-danger animate-pulse flex-shrink-0" />
          <span className="truncate">{t('home.dangerBanner', { disaster: t(`disaster.${disaster}`), n: dangerCount })}</span>
        </div>
      )}

      {/* 右上：災害蔓延預測 / 時間模擬 */}
      <div className="absolute top-32 right-3 z-[500] glass rounded-2xl px-3 py-2.5 w-44 lg:top-20 lg:right-4">
        <p className="text-[11px] text-white/55 mb-0.5">{t('home.timeSim')}</p>
        <p className="text-[10px] text-white/40 mb-1.5">{t(SIM_LABEL_KEY[disaster])}</p>
        <input
          type="range" min={0} max={horizon} step={step} value={timeOffset}
          onChange={e => setTimeOffset(+e.target.value)}
          className="w-full h-1 cursor-pointer"
        />
        <p className="text-[11px] text-white/80 text-right mt-1 num">{fmtTime(timeOffset)}</p>
      </div>

      {/* 左下：圖例 + 統計 */}
      <div className="absolute bottom-20 left-3 z-[500] glass rounded-2xl px-3 py-2.5 space-y-1.5 lg:bottom-4 lg:left-4">
          {([
            { color: '#22c55e', status: 'safe' as const,    key: 'common.safe' },
            { color: '#f4b740', status: 'caution' as const, key: 'common.caution' },
            { color: '#ef4444', status: 'danger' as const,  key: 'common.dangerOrNa' },
          ]).map(l => {
            const count = shelters.filter(s => {
              if (s.not_suitable_for.includes(disaster)) return l.status === 'danger'
              return getOverallStatus(s, disaster) === l.status
            }).length
            return (
              <div key={l.key} className="flex items-center gap-2 text-[11px] text-white/75">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: l.color, boxShadow: `0 0 8px ${l.color}` }} />
                <span>{t(l.key)}</span>
                <span className="ml-auto text-white/45 num text-[11px]">{count}</span>
              </div>
            )
          })}
          <div className="flex items-center gap-2 text-[11px] text-white/65 pt-1 border-t border-white/10">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 bg-white/90" style={{ boxShadow: '0 0 8px rgba(255,255,255,.6)' }} />
            <span>{t('home.legendMine')}</span>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-white/65">
            <span className="w-2.5 h-2.5 flex-shrink-0 bg-white/70 rotate-45" />
            <span>{t('home.legendReport')}</span>
          </div>
          {disaster === 'flood' && timeOffset > 0 && (
            <div className="flex items-center gap-2 text-[11px] text-white/65">
              <span className="w-2.5 h-2.5 flex-shrink-0 border border-white/60 bg-white/15" />
              <span>{t('home.legendFlood')}</span>
            </div>
          )}
          {disaster === 'earthquake' && (
            <>
              <div className="flex items-center gap-2 text-[11px] text-white/65 pt-1 border-t border-white/10">
                <span className="w-2.5 h-2.5 flex-shrink-0" style={{ background: '#ef4444' }} />
                <span>{t('home.legendCollapse')}</span>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-white/65">
                <span className="w-2.5 h-2.5 flex-shrink-0" style={{ background: '#f97316' }} />
                <span>{t('home.legendAtRisk')}</span>
              </div>
            </>
          )}
        </div>

      {/* ─── 避難所資訊卡（行動：底部浮卡；桌面：右側浮卡） ─── */}
      {selected && selStatus && (
        <div className="absolute z-[500] glass rounded-3xl sheet-enter
          bottom-16 inset-x-2
          lg:bottom-auto lg:top-1/2 lg:-translate-y-1/2 lg:right-4 lg:left-auto lg:inset-x-auto lg:w-[360px]">
          <div className="flex justify-center pt-2 pb-1 lg:hidden">
            <div className="w-10 h-1 rounded-full bg-white/20" />
          </div>

          <div className="px-4 pb-4 pt-3">
            {/* 標題列 + 環形圖 */}
            <div className="flex items-start gap-3 mb-3">
              <Ring pct={selOcc} status={selStatus} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <StatusBadge status={selStatus} />
                  {selNotSuitable && (
                    <span className="text-[10px] glass-cell text-white/60 px-2 py-0.5 rounded-full">
                      {t('common.notApplicable')}
                    </span>
                  )}
                </div>
                <h2 className="text-white font-bold text-base mt-1 leading-tight">{selected.name}</h2>
                <p className="text-white/45 text-xs">{selected.type_label}</p>
              </div>
              <button onClick={() => setSelected(null)} className="text-white/40 hover:text-white p-1 -mr-1 flex-shrink-0">
                <X size={18} />
              </button>
            </div>

            {/* 距離 / 步行 / 容量 */}
            <div className="flex gap-4 text-xs text-white/65 mb-3">
              <span className="flex items-center gap-1">
                <MapPin size={12} className="text-white/50" />
                <span className="num text-white/85">{selDist < 1000 ? `${selDist}` : `${(selDist / 1000).toFixed(1)}`}</span>
                {selDist < 1000 ? 'm' : 'km'}
              </span>
              <span className="flex items-center gap-1">
                <Clock size={12} className="text-white/50" />{t('home.walkMin', { n: selWalk })}
              </span>
              <span className="flex items-center gap-1">
                <Users size={12} className="text-white/50" />
                <span className="num text-white/85">{selected.capacity.current_estimate}/{selected.capacity.physical}</span>
              </span>
            </div>

            {/* 物資 4 燈 */}
            <div className="grid grid-cols-4 gap-2 mb-3">
              {RES.map(({ key, Icon, labelKey }) => {
                const val = selected.resources[key]
                return (
                  <div key={key} className="flex flex-col items-center gap-1 glass-cell rounded-xl py-2">
                    <Icon size={15} className={RES_COLOR[val]} />
                    <span className="text-[10px] text-white/45">{t(labelKey)}</span>
                    <span className={`text-[10px] font-semibold ${RES_COLOR[val]}`}>{t(`res.${val}`)}</span>
                  </div>
                )
              })}
            </div>

            {/* 操作按鈕（膠囊形狀） */}
            <div className="flex gap-2">
              <button
                onClick={() => nav(`/shelter/${selected.shelter_id}`)}
                className="flex-1 glass-cell text-white text-sm rounded-full py-3 font-semibold hover:bg-white/10 transition-colors"
              >
                {t('home.detail')}
              </button>
              <button
                onClick={() => nav(`/route?dest=${selected.shelter_id}`)}
                className="flex-1 bg-white text-neutral-900 text-sm rounded-full py-3 font-bold flex items-center justify-center gap-1.5 hover:bg-white/90 transition-colors"
              >
                <Navigation size={15} />{t('home.planRoute')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
