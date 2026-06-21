import { ThumbsUp, ThumbsDown, CheckCircle2, ShieldCheck, Inbox, Loader2, User, FileText } from 'lucide-react'
import { useI18n } from '../../i18n'
import type { CrowdReport, HandleStatus } from '../../types'

const SEV_COLOR: Record<string, string> = {
  green: 'text-status-safe', yellow: 'text-status-caution', red: 'text-status-danger',
}

const STATUS_META: Record<Exclude<HandleStatus, 'active'>, { cls: string; Icon: typeof Inbox }> = {
  received: { cls: 'bg-status-caution/20 text-status-caution', Icon: Inbox },
  handling: { cls: 'bg-status-caution/20 text-status-caution', Icon: Loader2 },
  resolved: { cls: 'bg-status-safe/20 text-status-safe', Icon: CheckCircle2 },
}

interface Props {
  report: CrowdReport
  clientId: string
  onVote?: (dir: 'up' | 'down') => void
  /** 指揮中心：推進處理狀態（received/handling/resolved） */
  onStatus?: (status: HandleStatus) => void
  compact?: boolean
}

/** 群眾回報資料卡：類型/嚴重度、回報者、照片、查證投票、三段處理狀態 */
export default function ReportCard({ report: r, clientId, onVote, onStatus, compact }: Props) {
  const { t, rt } = useI18n()
  const up = r.upVoters ?? []; const down = r.downVoters ?? []
  const myUp = up.includes(clientId); const myDown = down.includes(clientId)
  const status = r.status ?? 'active'
  const resolved = status === 'resolved'
  const statusMeta = status !== 'active' ? STATUS_META[status] : null

  return (
    <div className={`text-white ${compact ? '' : 'space-y-2'}`} style={{ minWidth: 200 }}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] glass-cell text-white/70 px-2 py-0.5 rounded-full">{t(`rt.${r.type}`)}</span>
        <span className={`text-[10px] px-2 py-0.5 rounded-full glass-cell ${SEV_COLOR[r.severity]}`}>{t(`report.sev.${r.severity}`)}</span>
        {statusMeta && (
          <span className={`text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1 ${statusMeta.cls}`}>
            <statusMeta.Icon size={10} />{t(`status.handle.${status}`)}
          </span>
        )}
        <span className="text-[10px] text-white/40 ml-auto">{rt(r.reported_at)}</span>
      </div>

      {r.authorName && (
        <p className="text-[11px] text-white/45 flex items-center gap-1 mt-1"><User size={10} />{r.authorName}</p>
      )}

      {r.note && <p className="text-sm text-white/90 mt-1">{r.note}</p>}

      {r.photos && r.photos.length > 0 && (
        <div className="grid grid-cols-3 gap-1.5 mt-1.5">
          {r.photos.slice(0, 3).map((src, i) => (
            <img key={i} src={src} alt="" className="w-full aspect-square object-cover rounded-lg" />
          ))}
        </div>
      )}

      {/* 附件：圖片 / 影片 / 檔案 */}
      {r.attachments && r.attachments.length > 0 && (
        <div className="grid grid-cols-3 gap-1.5 mt-1.5">
          {r.attachments.map((a, i) => (
            a.kind === 'image' ? (
              <img key={i} src={a.url} alt={a.name} className="w-full aspect-square object-cover rounded-lg" />
            ) : a.kind === 'video' ? (
              <video key={i} src={a.url} controls className="w-full aspect-square object-cover rounded-lg bg-black" />
            ) : (
              <a key={i} href={a.url} download={a.name} title={a.name}
                className="w-full aspect-square rounded-lg glass-cell flex flex-col items-center justify-center gap-1 text-white/70 p-1">
                <FileText size={18} />
                <span className="text-[9px] truncate w-full text-center">{a.name}</span>
              </a>
            )
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
      </div>

      {/* 指揮中心：三段狀態推進 */}
      {onStatus && !resolved && (
        <div className="flex items-center gap-1.5 mt-2">
          {status === 'active' && (
            <button onClick={() => onStatus('received')} className="text-[10px] glass-cell px-2 py-1 rounded-full text-status-caution flex items-center gap-1">
              <Inbox size={11} />{t('status.markReceived')}
            </button>
          )}
          {status !== 'handling' && (
            <button onClick={() => onStatus('handling')} className="text-[10px] glass-cell px-2 py-1 rounded-full text-status-caution flex items-center gap-1">
              <Loader2 size={11} />{t('status.markHandling')}
            </button>
          )}
          <button onClick={() => onStatus('resolved')} className="text-[10px] bg-status-safe/20 text-status-safe px-2 py-1 rounded-full flex items-center gap-1 ml-auto">
            <CheckCircle2 size={11} />{t('status.markResolved')}
          </button>
        </div>
      )}
    </div>
  )
}
