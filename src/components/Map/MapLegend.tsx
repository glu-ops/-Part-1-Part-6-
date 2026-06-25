import { useState, useMemo } from 'react'
import { ChevronDown, Check } from 'lucide-react'
import { useShelters } from '../../contexts/ShelterContext'
import { useUser } from '../../contexts/UserContext'
import { useI18n } from '../../i18n'
import { assessAllZones, RISK_COLOR } from '../../utils/risk'
import type { RiskLevel } from '../../utils/risk'
import { FLOOD_DEPTH_BANDS, FLOOD_RISK_COLOR } from '../../flood'
import { FACILITY_META } from './FloodFacilityOverlay'
import type { FacilityType } from './FloodFacilityOverlay'
import { getOverallStatus } from '../../utils/scoring'

/**
 * 全系統共用地圖圖例（浮動可收合面板）。各地圖依「實際畫了哪些圖層」帶入對應 section，
 * 圖例內容（避難所狀態數、區域風險、建物、淹水深度/感測器/據點、回報、路線、我的位置）
 * 隨災害模式自動切換。可選的開關（回報 / 防汛據點）由上層傳 state + handler 控制圖層顯示。
 */
export interface MapLegendSections {
  shelters?: boolean
  zoneRisk?: boolean       // 區域風險（地震虛線環 / 淹水藍色塊）
  buildings?: boolean      // 逐棟受損（地震）
  floodDepth?: boolean     // 淹水深度級距（淹水）
  floodSensor?: boolean    // 淹水感測器圖示（淹水）
  facilities?: boolean     // 防汛據點（淹水）
  reports?: boolean        // 群眾回報
  route?: boolean          // 路線（起點 / 終點 / 建議路線）
  mine?: boolean           // 我的位置
}

interface Props extends MapLegendSections {
  /** 容器定位 class（預設左下） */
  className?: string
  showReports?: boolean
  onToggleReports?: () => void
  showFacilities?: boolean
  onToggleFacilities?: () => void
}

function Toggle({ on }: { on: boolean }) {
  return (
    <span className={`flex items-center justify-center flex-shrink-0 rounded-[3px] border ${on ? 'bg-white/80 border-white/80' : 'border-white/40'}`} style={{ width: 11, height: 11 }}>
      {on && <Check size={8} className="text-neutral-900" strokeWidth={3.5} />}
    </span>
  )
}

export default function MapLegend({
  className, shelters: showShelters, zoneRisk, buildings, floodDepth, floodSensor, facilities,
  reports, route, mine, showReports = true, onToggleReports, showFacilities = true, onToggleFacilities,
}: Props) {
  const { shelters } = useShelters()
  const { disaster } = useUser()
  const { t } = useI18n()
  const [open, setOpen] = useState(true)

  const zoneRisks = useMemo(() => (zoneRisk ? assessAllZones(disaster) : []), [zoneRisk, disaster])
  const zoneCounts = useMemo(() => {
    const c: Record<RiskLevel, number> = { low: 0, caution: 0, high: 0, danger: 0 }
    zoneRisks.forEach(r => { c[r.level]++ })
    return c
  }, [zoneRisks])

  const isFlood = disaster === 'flood'
  const isQuake = disaster === 'earthquake'

  return (
    <div className={className ?? 'absolute bottom-20 left-3 z-[500] lg:bottom-4 lg:left-4'}>
      <div className="glass rounded-2xl px-3 py-2.5 w-44 max-h-[55vh] overflow-y-auto no-scrollbar">
        <button onClick={() => setOpen(o => !o)} className="flex items-center gap-2 w-full text-[11px] font-semibold text-white/75">
          <span>{t('legend.title')}</span>
          <ChevronDown size={13} className={`ml-auto text-white/45 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>

        {open && (
          <div className="space-y-2.5 mt-2">
            {/* 避難所：發光圓點 */}
            {showShelters && (
              <div className="space-y-1">
                <p className="text-[9px] text-white/35 uppercase tracking-wider">{t('legend.shelters')}</p>
                {([
                  { color: '#889D73', status: 'safe' as const,    key: 'common.safe' },
                  { color: '#F5C776', status: 'caution' as const, key: 'common.caution' },
                  { color: '#B30303', status: 'danger' as const,  key: 'common.dangerOrNa' },
                ]).map(l => {
                  const count = shelters.filter(s =>
                    s.not_suitable_for.includes(disaster) ? l.status === 'danger' : getOverallStatus(s, disaster) === l.status,
                  ).length
                  return (
                    <div key={l.key} className="flex items-center gap-2 text-[11px] text-white/70">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: l.color, boxShadow: `0 0 8px ${l.color}` }} />
                      <span>{t(l.key)}</span>
                      <span className="ml-auto text-white/40 num">{count}</span>
                    </div>
                  )
                })}
              </div>
            )}

            {/* 區域風險：地震=虛線環；淹水=藍色塊 */}
            {zoneRisk && zoneRisks.length > 0 && (
              <div className="space-y-1 pt-1.5 border-t border-white/10">
                <p className="text-[9px] text-white/35 uppercase tracking-wider">
                  {isFlood ? t('legend.floodZoneRisk') : t('legend.zoneRisk')}
                </p>
                {(['danger', 'high', 'caution', 'low'] as RiskLevel[]).map(lvl => (
                  <div key={lvl} className="flex items-center gap-2 text-[11px] text-white/70">
                    {isFlood
                      ? <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: FLOOD_RISK_COLOR[lvl], boxShadow: `0 0 6px ${FLOOD_RISK_COLOR[lvl]}99` }} />
                      : <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 border-2 border-dashed" style={{ borderColor: RISK_COLOR[lvl] }} />}
                    <span>{t(`risk.level.${lvl}`)}</span>
                    <span className="ml-auto text-white/40 num">{zoneCounts[lvl]}</span>
                  </div>
                ))}
              </div>
            )}

            {/* 建物受損（地震） */}
            {buildings && isQuake && (
              <div className="space-y-1 pt-1.5 border-t border-white/10">
                <p className="text-[9px] text-white/35 uppercase tracking-wider">{t('legend.buildings')}</p>
                <div className="flex items-center gap-2 text-[11px] text-white/70">
                  <span className="w-2.5 h-2.5 flex-shrink-0 rounded-[2px]" style={{ background: '#B30303' }} />
                  <span>{t('home.legendCollapse')}</span>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-white/70">
                  <span className="w-2.5 h-2.5 flex-shrink-0 rounded-[2px]" style={{ background: '#F5C776' }} />
                  <span>{t('home.legendAtRisk')}</span>
                </div>
              </div>
            )}

            {/* 淹水深度級距 + 感測器（淹水） */}
            {floodDepth && isFlood && (
              <div className="space-y-1 pt-1.5 border-t border-white/10">
                <p className="text-[9px] text-white/35 uppercase tracking-wider">{t('legend.floodDepth')}</p>
                {FLOOD_DEPTH_BANDS.map(b => (
                  <div key={b.label} className="flex items-center gap-2 text-[11px] text-white/70">
                    <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: b.color, boxShadow: `0 0 6px ${b.color}99` }} />
                    <span className="num">{b.label}</span>
                  </div>
                ))}
                {floodSensor && (
                  <div className="flex items-center gap-2 text-[11px] text-white/70 pt-0.5">
                    <span className="flex-shrink-0" style={{ width: 10, height: 10, background: '#60a5fa', borderRadius: '50% 50% 50% 0', transform: 'rotate(-45deg)' }} />
                    <span>{t('flood.sensor')}</span>
                  </div>
                )}
              </div>
            )}

            {/* 防汛據點（淹水）：可開關 */}
            {facilities && isFlood && (
              <div className="space-y-1 pt-1.5 border-t border-white/10">
                {onToggleFacilities ? (
                  <button onClick={onToggleFacilities} className="flex items-center gap-1.5 w-full text-[9px] text-white/35 uppercase tracking-wider">
                    <Toggle on={showFacilities} />
                    <span>{t('legend.floodFacility')}</span>
                  </button>
                ) : (
                  <p className="text-[9px] text-white/35 uppercase tracking-wider">{t('legend.floodFacility')}</p>
                )}
                <div className={onToggleFacilities && !showFacilities ? 'opacity-35' : ''}>
                  {(Object.keys(FACILITY_META) as FacilityType[]).map(type => (
                    <div key={type} className="flex items-center gap-2 text-[11px] text-white/70">
                      <span className="flex items-center justify-center flex-shrink-0 font-bold"
                        style={{ width: 14, height: 14, borderRadius: 4, fontSize: 9, color: FACILITY_META[type].color, border: `1px solid ${FACILITY_META[type].color}`, background: 'rgba(10,22,40,.6)' }}>
                        {FACILITY_META[type].char}
                      </span>
                      <span>{t(`flood.fac.${type}`)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 路線 */}
            {route && (
              <div className="space-y-1 pt-1.5 border-t border-white/10">
                <p className="text-[9px] text-white/35 uppercase tracking-wider">{t('legend.route')}</p>
                <div className="flex items-center gap-2 text-[11px] text-white/70">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 bg-white/90" style={{ boxShadow: '0 0 8px rgba(255,255,255,.6)' }} />
                  <span>{t('legend.routeOrigin')}</span>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-white/70">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 border-2 border-white" />
                  <span>{t('legend.routeDest')}</span>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-white/70">
                  <span className="flex-shrink-0 rounded-full bg-white" style={{ width: 14, height: 3 }} />
                  <span>{t('legend.routeLine')}</span>
                </div>
              </div>
            )}

            {/* 其他：我的位置 / 回報（可開關） */}
            {(mine || reports) && (
              <div className="space-y-1 pt-1.5 border-t border-white/10">
                <p className="text-[9px] text-white/35 uppercase tracking-wider">{t('legend.other')}</p>
                {mine && (
                  <div className="flex items-center gap-2 text-[11px] text-white/70">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 bg-white/90" style={{ boxShadow: '0 0 8px rgba(255,255,255,.6)' }} />
                    <span>{t('home.legendMine')}</span>
                  </div>
                )}
                {reports && (onToggleReports ? (
                  <button onClick={onToggleReports} className="flex items-center gap-2 w-full text-[11px] text-white/70">
                    <Toggle on={showReports} />
                    <span className="w-2.5 h-2.5 flex-shrink-0 bg-white/70 rotate-45" />
                    <span className={showReports ? '' : 'opacity-50'}>{t('home.legendReport')}</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-2 text-[11px] text-white/70">
                    <span className="w-2.5 h-2.5 flex-shrink-0 bg-white/70 rotate-45" />
                    <span>{t('home.legendReport')}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
