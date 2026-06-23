import { useState, useRef } from 'react'
import { UserCircle2, AtSign, X, Dice5, KeyRound, Loader2 } from 'lucide-react'
import { useIdentity } from '../contexts/IdentityContext'
import { useI18n } from '../i18n'
import { sanitizeId, getAccounts, forgetAccount, suggestId, resetAllLocal } from '../utils/identity'
import { registerAccount, loginAccount, isValidPin } from '../utils/account'
import type { AccountError } from '../utils/account'

/**
 * 登入 / 建立身分 modal。未登入前覆蓋全螢幕擋住操作。ID 即帳號（全域唯一），PIN 驗證。
 * - 登入帳號：列出本裝置登入過的帳號可一鍵帶入 ID，輸入 PIN 後登入（連不上後端時離線驗證）。
 * - 新增帳號：向後端註冊新帳號（保證 ID 唯一），可一鍵產生建議 ID。
 * 同一組 ID 在任何裝置登入即同一人；名稱僅供顯示、可重複。
 */
export default function NameGate() {
  const { hasIdentity, login } = useIdentity()
  const { t } = useI18n()
  const [accounts, setAccounts] = useState(getAccounts)
  const [mode, setMode] = useState<'login' | 'create'>(() => (accounts.length ? 'login' : 'create'))
  const [value, setValue] = useState('')
  const [id, setId] = useState('')
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<AccountError | null>(null)
  const [errMeta, setErrMeta] = useState<{ retryAfter?: number; remaining?: number }>({})
  const pinRef = useRef<HTMLInputElement>(null)

  if (hasIdentity) return null

  const cleanId = sanitizeId(id)
  const idInvalid = id.trim().length > 0 && !cleanId
  const pinOk = isValidPin(pin)
  const idExists = !!cleanId && accounts.some(a => a.id === cleanId)
  const canSubmit = !busy && !!cleanId && pinOk && (mode === 'login' || value.trim().length > 0)

  const submit = async () => {
    if (!canSubmit) return
    setBusy(true)
    setErr(null)
    try {
      const result = mode === 'create'
        ? await registerAccount(cleanId, value.trim(), pin)
        : await loginAccount(cleanId, pin)
      if (result.ok) {
        // 本機提交身分並重新載入；若名稱/ID 不合法（理論上不會）則顯示錯誤
        if (!login(result.name ?? value, cleanId)) setErr('error')
      } else {
        setErr(result.error ?? 'error')
        setErrMeta({ retryAfter: result.retryAfter, remaining: result.remaining })
      }
    } finally {
      setBusy(false)
    }
  }

  const pickAccount = (accId: string) => {
    setId(accId); setErr(null)
    setTimeout(() => pinRef.current?.focus(), 0)
  }
  const forget = (accId: string) => { forgetAccount(accId); setAccounts(getAccounts()) }

  const resetAll = () => {
    if (window.confirm(t('name.resetConfirm'))) { resetAllLocal(); window.location.reload() }
  }

  // 錯誤訊息（鎖定帶剩餘分鐘、PIN 錯帶剩餘次數）
  let errText: string | null = null
  if (err === 'locked') errText = t('account.err.locked', { min: Math.max(1, Math.ceil((errMeta.retryAfter ?? 0) / 60)) })
  else if (err === 'bad-pin' && errMeta.remaining != null) errText = t('account.err.bad-pin-remaining', { n: errMeta.remaining })
  else if (err) errText = t(`account.err.${err}`)

  const tab = (m: 'login' | 'create', label: string) => (
    <button onClick={() => { setMode(m); setErr(null) }}
      className={`flex-1 py-2 rounded-full text-sm font-semibold transition-colors ${
        mode === m ? 'bg-white text-neutral-900' : 'text-white/60'}`}>
      {label}
    </button>
  )

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

        {/* 兩個選項：登入帳號 / 新增帳號 */}
        <div className="flex gap-1 glass-cell rounded-full p-1 mb-4">
          {tab('login', t('name.tabLogin'))}
          {tab('create', t('name.tabCreate'))}
        </div>

        {/* 登入模式：最近帳號一鍵帶入 ID（仍需輸入 PIN） */}
        {mode === 'login' && (accounts.length > 0 ? (
          <div className="mb-4">
            <p className="text-[11px] text-white/40 uppercase tracking-wider mb-2 px-1">{t('name.recentTitle')}</p>
            <div className="space-y-2">
              {accounts.map(a => (
                <div key={a.id} className={`flex items-center gap-2 glass-cell rounded-xl pr-2 ${cleanId === a.id ? 'ring-1 ring-white/50' : ''}`}>
                  <button onClick={() => pickAccount(a.id)}
                    className="flex-1 flex items-center gap-2.5 px-3 py-2.5 text-left min-w-0">
                    <span className="w-2 h-2 rounded-full bg-[#3b82f6] shrink-0" />
                    <span className="min-w-0">
                      <span className="block text-sm text-white font-semibold truncate">{a.name}</span>
                      <span className="block text-[11px] text-white/45 font-mono truncate">@{a.id}</span>
                    </span>
                  </button>
                  <button onClick={() => forget(a.id)} title={t('name.forget')}
                    className="text-white/35 hover:text-status-danger p-1 shrink-0"><X size={14} /></button>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-white/40 mt-3 px-1">{t('name.orManual')}</p>
          </div>
        ) : (
          <p className="text-[12px] text-white/50 mb-3 px-1">{t('name.loginManualHint')}</p>
        ))}

        {/* 名稱（顯示用，僅新增帳號需要） */}
        {mode === 'create' && (
          <input
            autoFocus
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') submit() }}
            maxLength={16}
            placeholder={t('name.placeholder')}
            className="w-full glass-cell text-white text-base rounded-xl px-4 py-3 outline-none placeholder-white/35 text-center mb-3"
          />
        )}

        {/* 帳號 ID（必填；新增模式可一鍵產生建議 ID） */}
        <div className="flex items-center gap-2 glass-cell rounded-xl px-3 py-2.5">
          <AtSign size={15} className="text-white/45 shrink-0" />
          <input
            value={id}
            onChange={e => { setId(e.target.value); setErr(null) }}
            onKeyDown={e => { if (e.key === 'Enter') submit() }}
            maxLength={24}
            placeholder={t('name.idPlaceholder')}
            className="flex-1 bg-transparent text-white text-sm outline-none placeholder-white/35"
          />
          {mode === 'create' && (
            <button onClick={() => setId(suggestId())} title={t('name.suggest')}
              className="text-white/50 hover:text-white p-1 shrink-0"><Dice5 size={15} /></button>
          )}
        </div>

        {/* PIN 密碼 */}
        <div className="flex items-center gap-2 glass-cell rounded-xl px-3 py-2.5 mt-2">
          <KeyRound size={15} className="text-white/45 shrink-0" />
          <input
            ref={pinRef}
            value={pin}
            onChange={e => { setPin(e.target.value.replace(/\D/g, '').slice(0, 8)); setErr(null) }}
            onKeyDown={e => { if (e.key === 'Enter') submit() }}
            inputMode="numeric"
            maxLength={8}
            placeholder={t('name.pinPlaceholder')}
            className="flex-1 bg-transparent text-white text-sm outline-none placeholder-white/35 tracking-widest"
          />
        </div>

        {/* 提示 / 錯誤 */}
        {idInvalid ? (
          <p className="text-[11px] text-status-danger mt-1.5 px-1">{t('name.idInvalid')}</p>
        ) : errText ? (
          <p className="text-[11px] text-status-danger mt-1.5 px-1">{errText}</p>
        ) : mode === 'create' && idExists ? (
          <p className="text-[11px] text-status-caution mt-1.5 px-1">{t('name.idExists')}</p>
        ) : (
          <p className="text-[11px] text-white/40 mt-1.5 px-1">{mode === 'create' ? t('name.idHint') : t('name.loginIdHint')}</p>
        )}

        <button
          onClick={submit}
          disabled={!canSubmit}
          className="w-full bg-white disabled:opacity-30 text-neutral-900 font-bold rounded-full py-3 mt-4 flex items-center justify-center gap-2"
        >
          {busy && <Loader2 size={16} className="animate-spin" />}
          {busy ? t('account.busy') : (mode === 'create' ? t('name.createConfirm') : t('name.confirm'))}
        </button>

        {/* 本機重置：清除這台裝置的所有帳號 */}
        <button onClick={resetAll}
          className="w-full text-[11px] text-white/35 hover:text-status-danger mt-3 py-1">
          {t('name.resetAll')}
        </button>
      </div>
    </div>
  )
}
