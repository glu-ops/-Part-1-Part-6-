import { Cpu, Droplets, Utensils, Heart, Zap, Package, ShieldCheck, AlertTriangle, Sparkles } from 'lucide-react'
import { useShelters } from '../../contexts/ShelterContext'
import { occupancyLabel, levelLabel, needIsCritical } from '../../utils/shelterAi'
import type { ResourceLevel, ShelterAIStatus } from '../../types'

const LEVEL_COLOR: Record<ResourceLevel, string> = {
  green: 'text-status-safe', yellow: 'text-status-caution', red: 'text-status-danger', unknown: 'text-white/35',
}

const RES = [
  { key: 'water'    as const, label: '飲水', Icon: Droplets },
  { key: 'food'     as const, label: '糧食', Icon: Utensils },
  { key: 'medical'  as const, label: '醫療', Icon: Heart },
  { key: 'power'    as const, label: '電力', Icon: Zap },
  { key: 'supplies' as const, label: '物資', Icon: Package },
]

function relTime(iso?: string): string {
  if (!iso) return '—'
  const m = Math.floor(Math.max(0, Date.now() - +new Date(iso)) / 60000)
  if (m < 1) return '剛剛'
  if (m < 60) return `${m} 分鐘前`
  return `${Math.floor(m / 60)} 小時前`
}

function sourceLabel(s: ShelterAIStatus): string {
  const src = s.aiMonitor.source
  if (src === 'command') return '指揮中心'
  if (src === 'staff') return '避難所人員'
  if (src === 'aiCamera') return 'AI Camera'
  return 'AI 自動監測'
}

// 待處理異常依嚴重度上色：warning 黃、critical 紅
const isWarn = (s: ShelterAIStatus) => s.abnormalSeverity === 'warning'
const attnText = (s: ShelterAIStatus) => isWarn(s) ? 'text-status-caution' : 'text-status-danger'

// 審核狀態 → 顯示文字與顏色（PDR §11）
function reviewView(s: ShelterAIStatus): { text: string; color: string } {
  switch (s.review) {
    case 'pending':   return { text: isWarn(s) ? '警戒，等待指揮中心確認' : '異常，等待指揮中心確認', color: attnText(s) }
    case 'confirmed': return { text: '指揮中心已確認', color: 'text-status-safe' }
    case 'corrected': return { text: '指揮中心已修正', color: 'text-status-safe' }
    default:          return { text: '正常，自動更新', color: 'text-white/55' }
  }
}

/**
 * 使用者端 AI 即時監測卡（PDR §11）：人數/收容率、5 類物資、急需、資料來源與審核狀態、最後更新。
 * 無 AI 監測資料或已被指揮中心忽略 → 不顯示（退回既有靜態/容量卡）。
 */
export default function ShelterAiStatusCard({ shelterId }: { shelterId: string }) {
  const { aiStatus } = useShelters()
  const s = aiStatus.get(shelterId)
  if (!s || s.review === 'ignored') return null

  const rv = reviewView(s)
  const occ = s.people.occupancyRate
  // 「待處理」才用紅色警示；已由指揮中心處理者視為平穩
  const needsAttention = s.abnormal && s.review === 'pending'

  return (
    <div className={`glass rounded-2xl p-4 border ${needsAttention ? (isWarn(s) ? 'border-status-caution/30' : 'border-status-danger/30') : 'border-white/10'}`}>
      <div className="flex items-center gap-2 mb-3">
        <Cpu size={14} className="text-white" />
        <p className="text-xs text-white/55 uppercase tracking-wider">AI 即時監測</p>
        <span className="ml-auto text-[10px] glass-cell text-white/70 px-2 py-0.5 rounded-full">
          資料來源：{sourceLabel(s)}
        </span>
      </div>

      {/* 目前人數 / 收容率 */}
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-xs text-white/45">目前人數</span>
        <span className="num text-white text-sm">
          約 {s.people.estimatedCount} / {s.people.capacity}
          <span className={`ml-2 text-xs ${occ >= 85 ? 'text-status-danger' : occ >= 70 ? 'text-status-caution' : 'text-status-safe'}`}>
            {occupancyLabel(occ)}
          </span>
        </span>
      </div>
      <div className="h-1.5 bg-white/10 rounded-full overflow-hidden mb-3">
        <div className={`h-full rounded-full ${occ >= 85 ? 'bg-status-danger' : occ >= 70 ? 'bg-status-caution' : 'bg-status-safe'}`}
          style={{ width: `${Math.min(100, occ)}%` }} />
      </div>

      {/* 5 類物資 */}
      <div className="grid grid-cols-5 gap-1.5 mb-3">
        {RES.map(({ key, label, Icon }) => {
          const lv = s.resources[key]
          const kind = key === 'power' ? 'power' : key === 'supplies' ? 'supplies' : undefined
          return (
            <div key={key} className="glass-cell rounded-xl p-2 flex flex-col items-center gap-1">
              <Icon size={15} className={LEVEL_COLOR[lv]} />
              <span className="text-[9px] text-white/45">{label}</span>
              <span className={`text-[10px] font-bold ${LEVEL_COLOR[lv]}`}>{levelLabel(lv, kind)}</span>
            </div>
          )
        })}
      </div>

      {/* AI 分析 */}
      {s.analysis && (
        <div className="glass-cell rounded-xl p-2.5 mb-3">
          <p className="text-[10px] text-white/60 flex items-center gap-1 mb-1"><Sparkles size={11} className="text-white" /> AI 分析</p>
          <p className="text-xs text-white/80 leading-relaxed">{s.analysis}</p>
        </div>
      )}

      {/* 急需項目 */}
      {s.urgentNeeds.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {s.urgentNeeds.map(n => (
            <span key={n} className={`text-[10px] glass-cell px-2 py-0.5 rounded-full ${needIsCritical(n) ? 'text-status-danger' : 'text-status-caution'}`}>{n}</span>
          ))}
        </div>
      )}

      {/* 狀態 + 最後更新 */}
      <div className="flex items-center gap-1.5 border-t border-white/8 pt-2.5">
        {needsAttention
          ? <AlertTriangle size={13} className={`${attnText(s)} shrink-0`} />
          : <ShieldCheck size={13} className="text-status-safe shrink-0" />}
        <span className={`text-[11px] font-medium ${rv.color}`}>{rv.text}</span>
        <span className="ml-auto text-[10px] text-white/40">可信度 {s.confidence}%・{relTime(s.updatedAt)}</span>
      </div>
    </div>
  )
}
