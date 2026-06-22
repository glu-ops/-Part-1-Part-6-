import { useState } from 'react'
import { AlertOctagon, MapPin, HeartHandshake, Send, ChevronDown, ShieldCheck, Home } from 'lucide-react'
import { useI18n } from '../../i18n'
import {
  SOS_CATEGORY_META, SOS_QUICK_REPLIES, COMMAND_STATUS_FLOW,
  PRIORITY_BADGE, LAYER_TO_SCOPE, isSosClosed,
} from '../../sos'
import type { SosEvent, SosStatus, SosReplyKind } from '../../types'

const STATUS_STYLE: Record<SosStatus, string> = {
  new:        'bg-status-danger/25 text-status-danger',
  received:   'bg-status-caution/25 text-status-caution',
  processing: 'bg-status-caution/25 text-status-caution',
  helped:     'bg-sky-500/25 text-sky-300',
  safe:       'bg-status-safe/25 text-status-safe',
  resolved:   'bg-status-safe/25 text-status-safe',
}

interface Props {
  events: SosEvent[]
  myId: string
  onReply: (sosId: string, text: string, kind?: SosReplyKind) => void
  /** 指揮中心 / 救援端可推進狀態；市民端省略 */
  onStatus?: (sosId: string, status: SosStatus) => void
  /** 求救者本人標記「已安全」；指揮中心端省略 */
  onSelfSafe?: (sosId: string) => void
}

/** SOS 事件看板：每筆求救只顯示一次（去重），含類型、優先級、狀態、綁定回覆串 */
export default function SosBoard({ events, myId, onReply, onStatus, onSelfSafe }: Props) {
  const { t } = useI18n()
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [open, setOpen] = useState(true)

  const sorted = [...events].sort((a, b) => {
    const ar = isSosClosed(a.status) ? 1 : 0, br = isSosClosed(b.status) ? 1 : 0
    if (ar !== br) return ar - br            // 未結案在前
    return b.ts - a.ts                        // 新的在前
  })
  const activeN = events.filter(e => !isSosClosed(e.status)).length

  return (
    <div className="glass-cell rounded-2xl p-3 mb-3 shrink-0">
      <button onClick={() => setOpen(o => !o)} className="flex items-center gap-2 w-full">
        <AlertOctagon size={14} className="text-status-danger" />
        <span className="text-xs font-semibold text-white/80">{t('sos.boardTitle')}</span>
        {activeN > 0 && <span className="text-[10px] bg-status-danger text-white rounded-full px-1.5 py-0.5">{activeN}</span>}
        <ChevronDown size={14} className={`ml-auto text-white/45 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="mt-2 space-y-2 max-h-[34vh] overflow-y-auto no-scrollbar">
          {sorted.length === 0 ? (
            <p className="text-[11px] text-white/40 py-3 text-center">{t('sos.boardEmpty')}</p>
          ) : sorted.map(e => {
            const mine = e.senderId === myId
            const closed = isSosClosed(e.status)
            const meta = SOS_CATEGORY_META[e.category]
            const CatIcon = meta?.icon ?? AlertOctagon
            const scope = LAYER_TO_SCOPE[e.layer]
            return (
              <div key={e.id} className={`rounded-xl px-3 py-2 border ${closed ? 'border-white/10 opacity-70' : 'border-status-danger/30'} bg-white/[.03]`}>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-sm font-semibold text-white">{e.senderName}{mine ? `（${t('mesh.me')}）` : ''}</span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${PRIORITY_BADGE[e.priority]}`}>{t(`sos.prio.${e.priority}`)}</span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${STATUS_STYLE[e.status]}`}>{t(`sos.status.${e.status}`)}</span>
                  <span className="text-[10px] text-white/35 ml-auto">{new Date(e.ts).toLocaleTimeString()}</span>
                </div>

                {/* 類型 + 範圍 */}
                <p className="text-[11px] text-white/70 mt-1 flex items-center gap-1.5 flex-wrap">
                  <CatIcon size={11} className="text-white/55" />{t(`sos.cat.${e.category}`)}
                  <span className="text-white/30">·</span>
                  <span className="text-white/50">{t(`sos.scope.${scope}`)}</span>
                </p>

                {e.shelterName && (
                  <p className="text-[10px] text-white/55 mt-0.5 flex items-center gap-1">
                    <Home size={9} />{e.shelterName}{e.shelterLocation ? `（${e.shelterLocation}）` : ''}
                  </p>
                )}

                {e.text && <p className="text-xs text-white/85 mt-1">🆘 {e.text}</p>}
                <p className="text-[10px] text-white/45 mt-0.5 flex items-center gap-1">
                  <MapPin size={9} />{e.lat != null ? `${e.lat.toFixed(4)}, ${e.lng?.toFixed(4)}` : t('mesh.noPos')}
                  {e.handledBy && <span className="text-white/35">· {t('sos.handledBy', { who: e.handledBy })}</span>}
                </p>

                {/* 回覆串（綁定此 SOS） */}
                {e.replies.length > 0 && (
                  <div className="mt-1.5 space-y-1 border-l-2 border-white/10 pl-2">
                    {e.replies.map(r => (
                      <p key={r.id} className="text-[11px] text-white/70">
                        {(r.kind === 'willing' || r.offerHelp) && <HeartHandshake size={10} className="inline mr-1 text-status-safe" />}
                        <span className="font-medium text-white/85">{r.fromName}</span>：{r.text}
                      </p>
                    ))}
                  </div>
                )}

                {/* 操作：非本人才顯示快捷協助；本人可標記「已安全」；未結案才可回覆 */}
                {!closed && (
                  <div className="mt-2 space-y-1.5">
                    {!mine && (
                      <div className="flex flex-wrap gap-1.5">
                        {SOS_QUICK_REPLIES.map(({ kind, icon: Icon, i18nKey }) => (
                          <button key={kind} onClick={() => onReply(e.id, t(i18nKey), kind)}
                            className="text-[11px] bg-status-safe/20 text-status-safe rounded-full px-2.5 py-1 flex items-center gap-1 active:scale-95 transition-transform">
                            <Icon size={12} />{t(i18nKey)}
                          </button>
                        ))}
                      </div>
                    )}
                    {mine && onSelfSafe && (
                      <button onClick={() => onSelfSafe(e.id)}
                        className="text-[11px] bg-status-safe/90 text-neutral-900 font-semibold rounded-full px-2.5 py-1 flex items-center gap-1 active:scale-95 transition-transform">
                        <ShieldCheck size={12} />{t('sos.markSafe')}
                      </button>
                    )}
                    <div className="flex gap-1.5">
                      <input
                        value={draft[e.id] ?? ''}
                        onChange={ev => setDraft(p => ({ ...p, [e.id]: ev.target.value }))}
                        onKeyDown={ev => { if (ev.key === 'Enter' && (draft[e.id] ?? '').trim()) { onReply(e.id, draft[e.id], 'custom'); setDraft(p => ({ ...p, [e.id]: '' })) } }}
                        placeholder={t('sos.replyPlaceholder')}
                        className="flex-1 glass-cell text-white text-xs rounded-full px-3 py-1.5 outline-none placeholder-white/30" />
                      <button onClick={() => { if ((draft[e.id] ?? '').trim()) { onReply(e.id, draft[e.id], 'custom'); setDraft(p => ({ ...p, [e.id]: '' })) } }}
                        disabled={!(draft[e.id] ?? '').trim()}
                        className="bg-white disabled:opacity-30 text-neutral-900 p-1.5 rounded-full shrink-0"><Send size={12} /></button>
                    </div>
                    {/* 救援端：推進狀態（已收到 / 處理中 / 已派人 / 已結案） */}
                    {onStatus && (
                      <div className="flex flex-wrap gap-1.5">
                        {COMMAND_STATUS_FLOW.map(st => (
                          <button key={st} onClick={() => onStatus(e.id, st)} disabled={e.status === st}
                            className={`text-[10px] px-2 py-1 rounded-full disabled:opacity-30 ${
                              st === 'resolved' ? 'bg-status-safe/20 text-status-safe' : 'glass-cell text-status-caution'}`}>
                            {t(`sos.mark.${st}`)}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
