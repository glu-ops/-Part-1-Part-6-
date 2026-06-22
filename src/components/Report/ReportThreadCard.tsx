import { Inbox, Loader2, CheckCircle2, Layers } from 'lucide-react'
import { useI18n } from '../../i18n'
import ReportCard from './ReportCard'
import type { ReportThread } from '../../contexts/ShelterContext'
import type { HandleStatus } from '../../types'

const STATUS_CLS: Record<Exclude<HandleStatus, 'active'>, string> = {
  received: 'bg-status-caution/20 text-status-caution',
  handling: 'bg-status-caution/20 text-status-caution',
  resolved: 'bg-status-safe/20 text-status-safe',
}

interface Props {
  thread: ReportThread
  clientId: string
  onVote?: (reportId: string, dir: 'up' | 'down') => void
  /** 指揮中心：整串推進狀態 */
  onThreadStatus?: (status: HandleStatus) => void
}

/**
 * 回報串卡：同一 threadId 的多人補充合併顯示（依時間，不覆蓋原資料）。
 * 每筆 update 透過 ReportCard 顯示名字 / 時間 / 文字 / 附件。
 */
export default function ReportThreadCard({ thread, clientId, onVote, onThreadStatus }: Props) {
  const { t } = useI18n()
  const { latest, reports, status } = thread
  const statusCls = status !== 'active' ? STATUS_CLS[status] : null

  return (
    <div className="text-white">
      {/* 串標題 */}
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <span className="text-[10px] glass-cell text-white/70 px-2 py-0.5 rounded-full">{t(`rt.${latest.type}`)}</span>
        {reports.length > 1 && (
          <span className="text-[10px] glass-cell text-white/55 px-2 py-0.5 rounded-full flex items-center gap-1">
            <Layers size={10} />{t('report.threadCount', { n: reports.length })}
          </span>
        )}
        {statusCls && <span className={`text-[10px] px-2 py-0.5 rounded-full ${statusCls}`}>{t(`status.handle.${status}`)}</span>}
      </div>

      {/* 各筆補充（時間序，oldest→newest） */}
      <div className="space-y-2 max-h-[40vh] overflow-y-auto thin-scrollbar pr-1">
        {reports.map((r, i) => (
          <div key={r.id} className={i > 0 ? 'border-t border-white/10 pt-2' : ''}>
            <ReportCard report={r} clientId={clientId} onVote={onVote ? dir => onVote(r.id, dir) : undefined} compact />
          </div>
        ))}
      </div>

      {/* 指揮中心：整串狀態推進 */}
      {onThreadStatus && status !== 'resolved' && (
        <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-white/10">
          {status === 'active' && (
            <button onClick={() => onThreadStatus('received')} className="text-[10px] glass-cell px-2 py-1 rounded-full text-status-caution flex items-center gap-1">
              <Inbox size={11} />{t('status.markReceived')}
            </button>
          )}
          {status !== 'handling' && (
            <button onClick={() => onThreadStatus('handling')} className="text-[10px] glass-cell px-2 py-1 rounded-full text-status-caution flex items-center gap-1">
              <Loader2 size={11} />{t('status.markHandling')}
            </button>
          )}
          <button onClick={() => onThreadStatus('resolved')} className="text-[10px] bg-status-safe/20 text-status-safe px-2 py-1 rounded-full flex items-center gap-1 ml-auto">
            <CheckCircle2 size={11} />{t('status.markResolved')}
          </button>
        </div>
      )}
    </div>
  )
}
