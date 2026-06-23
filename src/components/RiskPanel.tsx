import { useMemo, useState } from 'react'
import { ShieldAlert, ChevronDown, CloudRain } from 'lucide-react'
import { useUser } from '../contexts/UserContext'
import { useI18n } from '../i18n'
import { assessAllZones, RISK_COLOR, hazardLive } from '../utils/risk'
import { rainWarnLevel } from '../flood'
import { formatReasons } from './Map/RiskOverlay'

/** 區域風險評估面板（地震/淹水模式）：依分數排序列出各區域等級與原因 */
export default function RiskPanel() {
  const { disaster } = useUser()
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const risks = useMemo(() => assessAllZones(disaster), [disaster])

  // 淹水模式：南區站官方累積雨量警戒（一級 / 二級）
  const warn = disaster === 'flood' ? rainWarnLevel(hazardLive.flood) : { level: 'none' as const }

  if (risks.length === 0) return null
  const alert = risks.filter(r => r.level === 'high' || r.level === 'danger').length
  const warnColor = warn.level === 'l1' ? '#ef4444' : '#f4b740'

  return (
    <div className="w-full">
      {/* 官方雨量警戒橫幅（達二級 / 一級才顯示） */}
      {warn.level !== 'none' && 'window' in warn && (
        <div className="glass rounded-2xl px-3 py-2 mb-2 flex items-center gap-2"
          style={{ border: `1px solid ${warnColor}66` }}>
          <CloudRain size={15} style={{ color: warnColor }} className="shrink-0" />
          <div className="min-w-0">
            <p className="text-[12px] font-bold" style={{ color: warnColor }}>
              {t(warn.level === 'l1' ? 'flood.warnL1' : 'flood.warnL2')}
            </p>
            <p className="text-[10px] text-white/55 num">
              {t('flood.warnDetail', { w: t(`flood.win.${warn.window}`), v: warn.value!, th: warn.threshold! })}
            </p>
          </div>
        </div>
      )}

      <button onClick={() => setOpen(o => !o)}
        className="w-full glass rounded-2xl px-3 py-2 flex items-center gap-2 text-sm text-white">
        <ShieldAlert size={15} className="text-white/80" />
        <span className="font-semibold">{t('risk.title')}</span>
        {alert > 0 && (
          <span className="text-[10px] bg-status-danger text-white rounded-full px-2 py-0.5 num">{alert}</span>
        )}
        <ChevronDown size={14} className={`ml-auto text-white/55 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="glass rounded-2xl mt-2 p-2 max-h-[52vh] overflow-y-auto no-scrollbar">
          <p className="text-[10px] text-white/40 px-2 pb-1.5">{t('risk.panelHint')}</p>
          <div className="space-y-1.5">
            {risks.map(r => (
              <div key={r.zone.id} className="glass-cell rounded-xl px-2.5 py-2">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: RISK_COLOR[r.level], boxShadow: `0 0 8px ${RISK_COLOR[r.level]}` }} />
                  <span className="text-sm text-white/90 font-medium">{r.zone.name}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                    style={{ background: RISK_COLOR[r.level] + '33', color: RISK_COLOR[r.level] }}>
                    {t(`risk.level.${r.level}`)}
                  </span>
                  <span className="ml-auto text-[11px] text-white/45 num">{r.score}</span>
                </div>
                <p className="text-[11px] text-white/60 mt-1 pl-[18px]">{formatReasons(r.reasons, t) || t('risk.noReason')}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
