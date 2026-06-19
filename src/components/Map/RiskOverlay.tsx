import { useMemo } from 'react'
import { Circle, Popup } from 'react-leaflet'
import { useUser } from '../../contexts/UserContext'
import { useI18n } from '../../i18n'
import { assessAllZones, RISK_COLOR } from '../../utils/risk'
import type { ReasonCode } from '../../utils/risk'

const FILL: Record<string, number> = { low: 0.025, caution: 0.07, high: 0.1, danger: 0.14 }

export function formatReasons(reasons: ReasonCode[], t: (k: string, v?: Record<string, string | number>) => string): string {
  return reasons.map(r => t(`risk.r.${r.code}`, r.vars)).join('、')
}

/** 區域風險圖層：依風險等級著色 + 點擊顯示分數與原因（地震/淹水模式才顯示） */
export default function RiskOverlay() {
  const { disaster } = useUser()
  const { t } = useI18n()
  const risks = useMemo(() => assessAllZones(disaster), [disaster])

  return (
    <>
      {risks.map(r => (
        <Circle
          key={r.zone.id}
          center={[r.zone.center.lat, r.zone.center.lng]}
          radius={380}
          pathOptions={{
            color: RISK_COLOR[r.level],
            fillColor: RISK_COLOR[r.level],
            fillOpacity: FILL[r.level],
            weight: r.level === 'danger' || r.level === 'high' ? 4 : 2,
            opacity: r.level === 'danger' || r.level === 'high' ? 0.95 : 0.55,
            dashArray: r.level === 'danger' || r.level === 'high' ? '10 7' : '5 7',
          }}
        >
          <Popup>
            <div className="text-white" style={{ minWidth: 190 }}>
              <p className="text-[10px] text-white/45 uppercase tracking-wider mb-1">{t('home.legendZoneRisk')}</p>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm">{r.zone.name}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                  style={{ background: RISK_COLOR[r.level] + '33', color: RISK_COLOR[r.level] }}>
                  {t(`risk.level.${r.level}`)}
                </span>
                <span className="ml-auto text-[11px] text-white/55">{t('risk.scoreLabel')} {r.score}</span>
              </div>
              {r.intensityLabel && (
                <p className="text-[11px] text-white/55 mt-1">震度 {r.intensityLabel} · PGA {r.pga} gal</p>
              )}
              <p className="text-xs text-white/85 mt-1">
                <span className="font-semibold" style={{ color: RISK_COLOR[r.level] }}>{t(`risk.level.${r.level}`)}：</span>
                {formatReasons(r.reasons, t) || t('risk.noReason')}
              </p>
            </div>
          </Popup>
        </Circle>
      ))}
    </>
  )
}
