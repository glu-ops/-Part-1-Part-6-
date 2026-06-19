import { ThumbsUp, ThumbsDown, CheckCircle2, ShieldCheck } from 'lucide-react'
import { useI18n } from '../../i18n'
import type { CrowdReport } from '../../types'

const SEV_COLOR: Record<string, string> = {
  green: 'text-status-safe', yellow: 'text-status-caution', red: 'text-status-danger',
}

interface Props {
  report: CrowdReport
  clientId: string
  onVote?: (dir: 'up' | 'down') => void
  onResolve?: () => void           // 指揮中心：標記已處理
  compact?: boolean
}

/** 群眾回報資料卡：類型/嚴重度、照片、查證投票（讚/倒讚）、處理狀態 */
export default function ReportCard({ report: r, clientId, onVote, onResolve, compact }: Props) {
  const { t, rt } = useI18n()
  const up = r.upVoters ?? []; const down = r.downVoters ?? []
  const myUp = up.includes(clientId); const myDown = down.includes(clientId)
  const resolved = r.status === 'resolved'

  return (
    <div className={`text-white ${compact ? '' : 'space-y-2'}`} style={{ minWidth: 200 }}>
      <div className="flex items-center gap-2">
        <span className="text-[10px] glass-cell text-white/70 px-2 py-0.5 rounded-full">{t(`rt.${r.type}`)}</span>
        <span className={`text-[10px] px-2 py-0.5 rounded-full glass-cell ${SEV_COLOR[r.severity]}`}>{t(`report.sev.${r.severity}`)}</span>
        {resolved && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-status-safe/20 text-status-safe flex items-center gap-1">
            <CheckCircle2 size={10} />{t('report.resolved')}
          </span>
        )}
        <span className="text-[10px] text-white/40 ml-auto">{rt(r.reported_at)}</span>
      </div>

      {r.note && <p className="text-sm text-white/90 mt-1">{r.note}</p>}

      {r.photos && r.photos.length > 0 && (
        <div className="grid grid-cols-3 gap-1.5 mt-1.5">
          {r.photos.slice(0, 3).map((src, i) => (
            <img key={i} src={src} alt="" className="w-full aspect-square object-cover rounded-lg" />
          ))}
        </div>
      )}

      {resolved && r.resolvedNote && (
        <p className="text-[11px] text-status-safe/80 mt-1 flex items-start gap-1">
          <ShieldCheck size={12} className="mt-0.5 shrink-0" />{r.resolvedNote}
        </p>
      )}

      {/* 查證投票 */}
      <div className="flex items-center gap-2 mt-2">
        <button onClick={() => onVote?.('up')} disabled={!onVote || resolved}
          className={`flex items-center gap-1 text-xs glass-cell rounded-full px-2.5 py-1 disabled:opacity-50 ${myUp ? 'text-status-safe' : 'text-white/70'}`}>
          <ThumbsUp size={13} />{up.length}
        </button>
        <button onClick={() => onVote?.('down')} disabled={!onVote || resolved}
          className={`flex items-center gap-1 text-xs glass-cell rounded-full px-2.5 py-1 disabled:opacity-50 ${myDown ? 'text-status-danger' : 'text-white/70'}`}>
          <ThumbsDown size={13} />{down.length}
        </button>
        <span className="text-[10px] text-white/40 ml-1">{t('report.verifyHint')}</span>
        {onResolve && !resolved && (
          <button onClick={onResolve}
            className="ml-auto text-[11px] bg-status-safe/90 text-neutral-900 font-semibold rounded-full px-3 py-1 flex items-center gap-1">
            <CheckCircle2 size={12} />{t('report.markResolved')}
          </button>
        )}
      </div>
    </div>
  )
}
