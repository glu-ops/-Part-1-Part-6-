import { useState } from 'react'
import { UserCircle2 } from 'lucide-react'
import { useIdentity } from '../contexts/IdentityContext'
import { useI18n } from '../i18n'

/**
 * 首次進入時的命名 modal。未設定名稱前，覆蓋全螢幕擋住操作。
 * 設定後不再出現（名稱存於 sessionStorage，reload 仍保留）。
 */
export default function NameGate() {
  const { hasName, setName } = useIdentity()
  const { t } = useI18n()
  const [value, setValue] = useState('')

  if (hasName) return null

  const submit = () => {
    if (value.trim()) setName(value)
  }

  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/70 backdrop-blur-sm px-6">
      <div className="glass rounded-3xl p-6 w-full max-w-sm">
        <div className="flex flex-col items-center text-center mb-5">
          <div className="glass-cell rounded-2xl p-3 mb-3">
            <UserCircle2 size={32} className="text-white/80" />
          </div>
          <h2 className="text-lg font-bold text-white">{t('name.title')}</h2>
          <p className="text-xs text-white/50 mt-1">{t('name.hint')}</p>
        </div>

        <input
          autoFocus
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit() }}
          maxLength={16}
          placeholder={t('name.placeholder')}
          className="w-full glass-cell text-white text-base rounded-xl px-4 py-3 outline-none placeholder-white/35 text-center"
        />

        <button
          onClick={submit}
          disabled={!value.trim()}
          className="w-full bg-white disabled:opacity-30 text-neutral-900 font-bold rounded-full py-3 mt-4"
        >
          {t('name.confirm')}
        </button>
      </div>
    </div>
  )
}
