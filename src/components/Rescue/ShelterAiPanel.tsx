import { useState } from 'react'
import {
  Cpu, Radio, ChevronDown, X, Check, Pencil, AlertTriangle,
  Droplets, Utensils, Heart, Zap, Package, Sparkles, ShieldCheck,
} from 'lucide-react'
import { useShelters } from '../../contexts/ShelterContext'
import { useShelterAiSync } from '../../hooks/useShelterAiSync'
import { useShelterAiMonitor } from '../../hooks/useShelterAiMonitor'
import { occupancyLabel, levelLabel, needIsCritical } from '../../utils/shelterAi'
import type { ResourceLevel, ShelterAIStatus } from '../../types'

const LEVEL_COLOR: Record<ResourceLevel, string> = {
  green: 'text-status-safe', yellow: 'text-status-caution', red: 'text-status-danger', unknown: 'text-white/35',
}
const LEVEL_DOT: Record<ResourceLevel, string> = {
  green: 'bg-status-safe', yellow: 'bg-status-caution', red: 'bg-status-danger', unknown: 'bg-white/25',
}
// 編輯表單中被選取的等級按鈕樣式
const LEVEL_BTN_ACTIVE: Record<'green' | 'yellow' | 'red', string> = {
  green: 'bg-status-safe/20 text-status-safe', yellow: 'bg-status-caution/20 text-status-caution', red: 'bg-status-danger/20 text-status-danger',
}
const RES = [
  { key: 'water'    as const, label: '飲水', Icon: Droplets, kind: undefined as 'power' | 'supplies' | undefined },
  { key: 'food'     as const, label: '糧食', Icon: Utensils, kind: undefined },
  { key: 'medical'  as const, label: '醫療', Icon: Heart,    kind: undefined },
  { key: 'power'    as const, label: '電力', Icon: Zap,      kind: 'power' as const },
  { key: 'supplies' as const, label: '物資', Icon: Package,  kind: 'supplies' as const },
]

function occColor(rate: number): string {
  return rate >= 85 ? 'text-status-danger' : rate >= 70 ? 'text-status-caution' : 'text-status-safe'
}
function occBar(rate: number): string {
  return rate >= 85 ? 'bg-status-danger' : rate >= 70 ? 'bg-status-caution' : 'bg-status-safe'
}
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
function attnBorder(s: ShelterAIStatus): string { return isWarn(s) ? 'border-status-caution/50' : 'border-status-danger/50' }
function attnText(s: ShelterAIStatus): string { return isWarn(s) ? 'text-status-caution' : 'text-status-danger' }

function reviewView(s: ShelterAIStatus): { text: string; color: string } {
  switch (s.review) {
    case 'pending':   return { text: isWarn(s) ? '警戒，等待指揮中心確認' : '異常，等待指揮中心確認', color: attnText(s) }
    case 'confirmed': return { text: '指揮中心已確認', color: 'text-status-safe' }
    case 'corrected': return { text: '指揮中心已修正', color: 'text-status-safe' }
    case 'ignored':   return { text: '已忽略（誤報）', color: 'text-white/45' }
    default:          return { text: '正常，自動更新', color: 'text-white/55' }
  }
}

/**
 * 指揮中心「AI 監測」面板（PDR §10）：
 *  - 監測節點啟停（simulation 自動輪播辨識，全部 16 所）
 *  - 避難所狀態磚牆：每所一張磚，異常者紅框優先
 *  - 點磚 → 中央卡片：完整人數 / 5 類物資 / AI 分析 + 確認/修正/忽略（PDR §9）
 */
export default function ShelterAiPanel() {
  const { shelters, aiStatus, aiAlerts, reviewAiStatus } = useShelters()
  const { push } = useShelterAiSync()
  const [monitorOn, setMonitorOn] = useState(true)
  const [open, setOpen] = useState(true)
  const [selId, setSelId] = useState<string | null>(null)
  // 編輯模式：指揮中心修正人數 + 5 類物資
  const [editing, setEditing] = useState(false)
  const [eCount, setECount] = useState(0)
  const [eRes, setERes] = useState<ShelterAIStatus['resources']>({ water: 'green', food: 'green', medical: 'green', power: 'green', supplies: 'green' })
  useShelterAiMonitor(monitorOn)

  // 「待處理」= 異常且尚未經指揮中心處理（已確認/修正/忽略者不再算待處理）
  const needsAttention = (s?: ShelterAIStatus) => !!s && s.abnormal && s.review === 'pending'

  // 待處理者排前，方便指揮中心優先處理
  const ordered = [...shelters].sort((a, b) => {
    const ax = needsAttention(aiStatus.get(a.shelter_id)) ? 0 : 1
    const bx = needsAttention(aiStatus.get(b.shelter_id)) ? 0 : 1
    return ax - bx
  })
  const sel = selId ? aiStatus.get(selId) : undefined
  const selShelter = selId ? shelters.find(s => s.shelter_id === selId) : undefined

  const closeModal = () => { setEditing(false); setSelId(null) }

  // 確認 / 忽略（不改數值）
  const review = (s: ShelterAIStatus, kind: 'confirmed' | 'ignored') => {
    const updated = reviewAiStatus(s.shelterId, kind)
    if (updated) push(updated)
  }

  // 進入編輯：預填目前人數與物資
  const startEdit = (s: ShelterAIStatus) => {
    setECount(s.people.estimatedCount)
    setERes({ ...s.resources })
    setEditing(true)
  }

  // 儲存修正：人數 + 5 類物資 → 標記為指揮中心修正（corrected）並同步
  const saveEdit = () => {
    if (!sel) return
    const count = Math.max(0, Math.min(sel.people.capacity, Math.round(eCount) || 0))
    const updated = reviewAiStatus(sel.shelterId, 'corrected', { estimatedCount: count, resources: eRes })
    if (updated) push(updated)
    setEditing(false)
  }

  return (
    <div className="glass rounded-2xl px-4 py-3 mb-3">
      {/* 抬頭 */}
      <div className="flex items-center gap-2">
        <Cpu size={15} className="text-white" />
        <p className="text-xs text-white/55 uppercase tracking-wider">AI 監測節點</p>
        <span className="text-[10px] text-white/35">{shelters.length} 所</span>
        {aiAlerts.length > 0 && (
          <span className="text-[10px] font-bold bg-status-danger text-white rounded-full px-2 py-0.5">
            {aiAlerts.length} 異常待處理
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setMonitorOn(v => !v)}
            className={`text-xs font-semibold rounded-full px-3 py-1.5 flex items-center gap-1.5 transition-colors ${
              monitorOn ? 'bg-white/10 text-white/75' : 'glass-cell text-white/55'}`}>
            <Radio size={11} className={monitorOn ? 'animate-pulse' : ''} />
            {monitorOn ? '監測中' : '已暫停'}
          </button>
          <button onClick={() => setOpen(v => !v)} className="text-white/45 hover:text-white p-1">
            <ChevronDown size={16} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      {/* 避難所狀態磚牆 */}
      {open && (
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 max-h-[340px] overflow-y-auto thin-scrollbar pr-0.5">
          {ordered.map(shelter => {
            const s = aiStatus.get(shelter.shelter_id)
            return (
              <button
                key={shelter.shelter_id}
                onClick={() => setSelId(shelter.shelter_id)}
                className={`glass-cell rounded-xl p-2.5 text-left active:scale-[.98] transition-all border ${
                  needsAttention(s) ? attnBorder(s!) : 'border-transparent'}`}>
                <div className="flex items-center gap-1 mb-1.5">
                  <span className="text-[11px] font-semibold text-white truncate flex-1">{shelter.name}</span>
                  {needsAttention(s) && <AlertTriangle size={12} className={`${attnText(s!)} shrink-0`} />}
                </div>
                {s ? (
                  <>
                    <div className="flex items-baseline justify-between text-[10px] mb-1">
                      <span className="text-white/45">{s.people.estimatedCount}/{s.people.capacity}</span>
                      <span className={occColor(s.people.occupancyRate)}>{s.people.occupancyRate}%</span>
                    </div>
                    <div className="h-1 bg-white/10 rounded-full overflow-hidden mb-2">
                      <div className={`h-full rounded-full ${occBar(s.people.occupancyRate)}`} style={{ width: `${Math.min(100, s.people.occupancyRate)}%` }} />
                    </div>
                    <div className="flex items-center gap-1">
                      {RES.map(({ key }) => (
                        <span key={key} className={`w-2 h-2 rounded-full ${LEVEL_DOT[s.resources[key]]}`} />
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="text-[10px] text-white/30 py-2">尚未回報</p>
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* 中央卡片：單一避難所完整資訊 + AI 分析 + 指揮中心動作 */}
      {sel && selShelter && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={closeModal}>
          <div
            className="glass rounded-2xl p-5 w-full max-w-md max-h-[85vh] overflow-y-auto thin-scrollbar"
            onClick={e => e.stopPropagation()}>
            {/* 卡片抬頭 */}
            <div className="flex items-start gap-3 mb-4">
              <div className="flex-1 min-w-0">
                <h3 className="text-white font-bold text-base">{selShelter.name}</h3>
                <p className="text-[11px] text-white/45 mt-0.5">
                  {editing ? '指揮中心修正中…' : `資料來源：${sourceLabel(sel)}・可信度 ${sel.confidence}%・${relTime(sel.updatedAt)}`}
                </p>
              </div>
              <button onClick={closeModal} className="text-white/45 hover:text-white p-1 -mr-1 -mt-1">
                <X size={18} />
              </button>
            </div>

            {/* 人數 / 收容率：檢視 vs 編輯 */}
            {editing ? (
              <div className="glass-cell rounded-xl p-3 mb-3">
                <label className="text-xs text-white/45 block mb-1.5">目前人數（容量 {sel.people.capacity}）</label>
                <input
                  type="number" min={0} max={sel.people.capacity} value={eCount}
                  onChange={e => setECount(Number(e.target.value))}
                  className="w-full glass rounded-lg px-3 py-2 text-white text-sm outline-none num" />
              </div>
            ) : (
              <div className="glass-cell rounded-xl p-3 mb-3">
                <div className="flex items-baseline justify-between mb-1.5">
                  <span className="text-xs text-white/45">目前人數</span>
                  <span className="num text-white text-lg">
                    {sel.people.estimatedCount} <span className="text-xs text-white/40">/ {sel.people.capacity}</span>
                    <span className={`ml-2 text-xs ${occColor(sel.people.occupancyRate)}`}>{occupancyLabel(sel.people.occupancyRate)}</span>
                  </span>
                </div>
                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${occBar(sel.people.occupancyRate)}`} style={{ width: `${Math.min(100, sel.people.occupancyRate)}%` }} />
                </div>
              </div>
            )}

            {/* 5 類物資：檢視 vs 編輯（每類可設正常/偏低/不足） */}
            {editing ? (
              <div className="space-y-1.5 mb-3">
                {RES.map(({ key, label, Icon, kind }) => (
                  <div key={key} className="flex items-center gap-2">
                    <Icon size={14} className="text-white/55 shrink-0" />
                    <span className="text-xs text-white/55 w-8 shrink-0">{label}</span>
                    <div className="flex gap-1 flex-1">
                      {(['green', 'yellow', 'red'] as const).map(lv => (
                        <button key={lv} onClick={() => setERes(r => ({ ...r, [key]: lv }))}
                          className={`flex-1 text-[10px] font-semibold rounded-lg py-1.5 transition-colors ${
                            eRes[key] === lv ? LEVEL_BTN_ACTIVE[lv] : 'glass text-white/40'}`}>
                          {levelLabel(lv, kind)}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-5 gap-1.5 mb-3">
                {RES.map(({ key, label, Icon, kind }) => {
                  const lv = sel.resources[key]
                  return (
                    <div key={key} className="glass-cell rounded-xl p-2 flex flex-col items-center gap-1">
                      <Icon size={16} className={LEVEL_COLOR[lv]} />
                      <span className="text-[9px] text-white/45">{label}</span>
                      <span className={`text-[10px] font-bold ${LEVEL_COLOR[lv]}`}>{levelLabel(lv, kind)}</span>
                    </div>
                  )
                })}
              </div>
            )}

            {/* AI 分析（編輯時隱藏） */}
            {!editing && (
              <div className="glass-cell rounded-xl p-3 mb-3">
                <p className="text-[11px] text-white/60 flex items-center gap-1.5 mb-1.5">
                  <Sparkles size={12} className="text-white" /> AI 即時分析
                </p>
                <p className="text-sm text-white/85 leading-relaxed">{sel.analysis || '監測中…'}</p>
                {needsAttention(sel) && sel.abnormalReasons.length > 0 && (
                  <p className={`text-[11px] mt-2 ${attnText(sel)}`}>⚠ {sel.abnormalReasons.join('、')}</p>
                )}
                {sel.urgentNeeds.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {sel.urgentNeeds.map(n => (
                      <span key={n} className={`text-[10px] glass px-2 py-0.5 rounded-full ${needIsCritical(n) ? 'text-status-danger' : 'text-status-caution'}`}>{n}</span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 狀態列（編輯時隱藏） */}
            {!editing && (
              <div className="flex items-center gap-1.5 mb-3">
                {needsAttention(sel)
                  ? <AlertTriangle size={14} className={`${attnText(sel)} shrink-0`} />
                  : <ShieldCheck size={14} className="text-status-safe shrink-0" />}
                <span className={`text-xs font-medium ${reviewView(sel).color}`}>{reviewView(sel).text}</span>
              </div>
            )}

            {editing ? (
              <div className="flex gap-2">
                <button onClick={saveEdit}
                  className="flex-1 bg-white text-neutral-900 font-bold rounded-lg py-2 text-xs flex items-center justify-center gap-1">
                  <Check size={14} />儲存修正
                </button>
                <button onClick={() => setEditing(false)}
                  className="flex-1 glass-cell text-white/55 font-semibold rounded-lg py-2 text-xs">取消</button>
              </div>
            ) : sel.abnormal && sel.review === 'pending' ? (
              <div className="flex gap-2">
                <button onClick={() => review(sel, 'confirmed')}
                  className="flex-1 bg-white text-neutral-900 font-bold rounded-lg py-2 text-xs flex items-center justify-center gap-1">
                  <Check size={14} />確認
                </button>
                <button onClick={() => startEdit(sel)}
                  className="flex-1 glass-cell text-white font-semibold rounded-lg py-2 text-xs flex items-center justify-center gap-1">
                  <Pencil size={12} />修正
                </button>
                <button onClick={() => review(sel, 'ignored')}
                  className="flex-1 glass-cell text-white/55 font-semibold rounded-lg py-2 text-xs flex items-center justify-center gap-1">
                  <X size={14} />忽略
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <p className="text-[11px] text-white/40 flex-1">
                  {sel.reviewedBy ? `由 ${sel.reviewedBy} 處理` : '狀態正常，系統自動更新'}
                </p>
                <button onClick={() => startEdit(sel)}
                  className="glass-cell text-white font-semibold rounded-lg px-3 py-1.5 text-xs flex items-center gap-1 shrink-0">
                  <Pencil size={12} />修正狀態
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
