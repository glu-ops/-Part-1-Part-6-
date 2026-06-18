import { useI18n } from '../../i18n'
import type { OverallStatus } from '../../types'

const cfg: Record<OverallStatus, { dot: string; text: string; ring: string; key: string }> = {
  safe:    { dot: 'bg-status-safe',    text: 'text-status-safe',    ring: 'border-status-safe/40',    key: 'common.safe' },
  caution: { dot: 'bg-status-caution', text: 'text-status-caution', ring: 'border-status-caution/40', key: 'common.caution' },
  danger:  { dot: 'bg-status-danger',  text: 'text-status-danger',  ring: 'border-status-danger/40',  key: 'common.danger' },
}

export default function StatusBadge({ status }: { status: OverallStatus }) {
  const { t } = useI18n()
  const c = cfg[status]
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border bg-black/20 text-xs font-semibold ${c.text} ${c.ring}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot} animate-pulse`} />
      {t(c.key)}
    </span>
  )
}
