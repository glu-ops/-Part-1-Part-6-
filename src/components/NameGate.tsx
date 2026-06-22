import { useState } from 'react'
import { UserCircle2, AtSign } from 'lucide-react'
import { useIdentity } from '../contexts/IdentityContext'
import { useI18n } from '../i18n'
import { sanitizeId } from '../utils/identity'

/**
 * 首次進入時的命名 modal。未設定名稱前，覆蓋全螢幕擋住操作。
 * 除名稱外可自訂 ID（選填）：好記、好分享，換裝置可用同一組重新登入。
 * 設定後不再出現（名稱存於 localStorage，關閉重開仍保留）。
 */
export default function NameGate() {
  const { hasName, setName } = useIdentity()
  const { t } = useI18n()
  const [value, setValue] = useState('')
  const [id, setId] = useState('')

  if (hasName) return null

  const cleanId = sanitizeId(id)
  const idInvalid = id.trim().length > 0 && !cleanId

  const submit = () => {
    if (value.trim() && !idInvalid) setName(value, id.trim() ? id : undefined)
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

        {/* 名稱 */}
        <input
          autoFocus
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit() }}
          maxLength={16}
          placeholder={t('name.placeholder')}
          className="w-full glass-cell text-white text-base rounded-xl px-4 py-3 outline-none placeholder-white/35 text-center"
        />

        {/* 自訂 ID（選填） */}
        <div className="mt-3">
          <div className="flex items-center gap-2 glass-cell rounded-xl px-3 py-2.5">
            <AtSign size={15} className="text-white/45 shrink-0" />
            <input
              value={id}
              onChange={e => setId(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') submit() }}
              maxLength={24}
              placeholder={t('name.idPlaceholder')}
              className="flex-1 bg-transparent text-white text-sm outline-none placeholder-white/35"
            />
          </div>
          {idInvalid ? (
            <p className="text-[11px] text-status-danger mt-1.5 px-1">{t('name.idInvalid')}</p>
          ) : cleanId ? (
            <p className="text-[11px] text-white/45 mt-1.5 px-1">{t('name.idPreview', { id: cleanId })}</p>
          ) : (
            <p className="text-[11px] text-white/40 mt-1.5 px-1">{t('name.idHint')}</p>
          )}
        </div>

        <button
          onClick={submit}
          disabled={!value.trim() || idInvalid}
          className="w-full bg-white disabled:opacity-30 text-neutral-900 font-bold rounded-full py-3 mt-4"
        >
          {t('name.confirm')}
        </button>
      </div>
    </div>
  )
}
