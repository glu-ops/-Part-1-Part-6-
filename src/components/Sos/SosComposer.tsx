import { useState } from 'react'
import { X, Send, AlertOctagon, Home, Users, ShieldCheck, Megaphone, MapPin } from 'lucide-react'
import { useI18n } from '../../i18n'
import {
  SOS_CATEGORIES, SOS_CATEGORY_META, SOS_SCOPES, PRIORITY_BADGE, PRIORITY_COLOR,
} from '../../sos'
import type { SosCategory, SosScope } from '../../types'
import type { SosDraft, SosComposerPrefill } from '../../contexts/MeshContext'

const SCOPE_ICON: Record<SosScope, typeof Users> = {
  private: Users, commandCenter: ShieldCheck, broadcast: Megaphone,
}

interface Props {
  prefill: SosComposerPrefill
  connectedCount: number
  onSubmit: (draft: SosDraft) => void
  onClose: () => void
}

/** SOS 發送面板：選類型（8 類）＋ 範圍（私人/指揮中心/廣播）＋ 說明（medium/low 必填）。 */
export default function SosComposer({ prefill, connectedCount, onSubmit, onClose }: Props) {
  const { t } = useI18n()
  const [category, setCategory] = useState<SosCategory>(prefill.category ?? 'lifeThreat')
  const [scope, setScope] = useState<SosScope>(prefill.scope ?? 'commandCenter')
  const [text, setText] = useState('')

  const meta = SOS_CATEGORY_META[category]
  const descMissing = meta.needsDesc && !text.trim()
  const shelter = prefill.shelter

  const submit = () => {
    if (descMissing) return
    onSubmit({ category, scope, text, shelter: category === 'shelterHelp' ? shelter : undefined })
  }

  return (
    <div className="fixed inset-0 z-[3000] flex items-end lg:items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="glass w-full lg:max-w-md max-h-[88vh] overflow-y-auto no-scrollbar rounded-t-3xl lg:rounded-3xl p-5"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-4">
          <AlertOctagon size={20} className="text-status-danger" />
          <h2 className="text-base font-bold text-white">{t('sos.composer.title')}</h2>
          <button onClick={onClose} className="ml-auto text-white/50 hover:text-white p-1"><X size={18} /></button>
        </div>

        {/* 類型 */}
        <p className="text-xs text-white/45 uppercase tracking-wider mb-2">{t('sos.composer.type')}</p>
        <div className="grid grid-cols-2 gap-2 mb-4">
          {SOS_CATEGORIES.map(cat => {
            const m = SOS_CATEGORY_META[cat]
            const Icon = m.icon
            const active = category === cat
            return (
              <button key={cat} onClick={() => setCategory(cat)}
                className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-left border transition-colors ${
                  active ? 'border-white/70 bg-white/10' : 'border-white/10 glass-cell'}`}>
                <Icon size={16} style={{ color: PRIORITY_COLOR[m.priority] }} className="shrink-0" />
                <span className="text-xs font-medium text-white/90 leading-tight flex-1">{t(`sos.cat.${cat}`)}</span>
                <span className={`text-[8px] px-1 py-0.5 rounded-full shrink-0 ${PRIORITY_BADGE[m.priority]}`}>{t(`sos.prio.${m.priority}`)}</span>
              </button>
            )
          })}
        </div>

        {/* 避難所協助：自動帶入的避難所資訊 */}
        {category === 'shelterHelp' && shelter && (
          <div className="glass-cell rounded-xl px-3 py-2 mb-4 flex items-center gap-2">
            <Home size={14} className="text-white/70 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-white/90 font-medium truncate">{shelter.name}</p>
              <p className="text-[10px] text-white/45 truncate flex items-center gap-1"><MapPin size={9} />{shelter.location}</p>
            </div>
          </div>
        )}

        {/* 範圍 */}
        <p className="text-xs text-white/45 uppercase tracking-wider mb-2">{t('sos.composer.scope')}</p>
        <div className="grid grid-cols-3 gap-2 mb-4">
          {SOS_SCOPES.map(sc => {
            const Icon = SCOPE_ICON[sc]
            const active = scope === sc
            return (
              <button key={sc} onClick={() => setScope(sc)}
                className={`flex flex-col items-center gap-1 rounded-xl py-2.5 border transition-colors ${
                  active ? 'border-white/70 bg-white/10' : 'border-white/10 glass-cell'}`}>
                <Icon size={16} className="text-white/85" />
                <span className="text-[11px] font-semibold text-white/90">{t(`sos.scope.${sc}`)}</span>
                <span className="text-[9px] text-white/45">{t(`sos.scope.${sc}.desc`)}</span>
              </button>
            )
          })}
        </div>
        {scope === 'private' && connectedCount === 0 && (
          <p className="text-[10px] text-status-caution mb-3 -mt-1">{t('sos.composer.noPeers')}</p>
        )}

        {/* 說明 */}
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-white/45 uppercase tracking-wider">{t('sos.composer.desc')}</p>
          <span className="text-[10px] text-white/40">{meta.needsDesc ? t('sos.composer.required') : t('sos.composer.optional')}</span>
        </div>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          rows={3}
          placeholder={meta.needsDesc ? t('sos.composer.descPlaceholder') : t('sos.composer.descPlaceholderOpt')}
          className="w-full glass-cell text-white text-sm rounded-xl px-3 py-2.5 outline-none placeholder-white/30 resize-none mb-4"
        />

        <button onClick={submit} disabled={descMissing}
          className="w-full bg-status-danger disabled:opacity-30 text-white font-bold rounded-2xl py-3.5 flex items-center justify-center gap-2 active:scale-[.98] transition-transform">
          <Send size={18} />{t('sos.composer.send')}
        </button>
        {meta.oneTap && (
          <p className="text-[10px] text-white/40 mt-2 text-center">{t('sos.composer.oneTapHint')}</p>
        )}
      </div>
    </div>
  )
}
