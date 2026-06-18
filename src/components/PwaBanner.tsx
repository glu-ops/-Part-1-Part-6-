import { useState, useEffect } from 'react'
import { Download, WifiOff } from 'lucide-react'
import { useI18n } from '../i18n'

export default function PwaBanner() {
  const { t } = useI18n()
  const [installPrompt, setInstallPrompt] = useState<Event | null>(null)
  const [isOffline, setIsOffline]         = useState(!navigator.onLine)
  const [dismissed, setDismissed]         = useState(false)

  useEffect(() => {
    const handler = (e: Event) => { e.preventDefault(); setInstallPrompt(e) }
    window.addEventListener('beforeinstallprompt', handler)
    const on  = () => setIsOffline(false)
    const off = () => setIsOffline(true)
    window.addEventListener('online',  on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
      window.removeEventListener('online',  on)
      window.removeEventListener('offline', off)
    }
  }, [])

  async function install() {
    if (!installPrompt) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (installPrompt as any).prompt()
    setInstallPrompt(null)
  }

  if (isOffline) {
    return (
      <div className="fixed top-14 inset-x-0 z-40 glass text-status-caution px-4 py-2 flex items-center gap-2 text-xs font-semibold border-b border-status-caution/30">
        <WifiOff size={14} />
        {t('pwa.offline')}
      </div>
    )
  }

  if (!installPrompt || dismissed) return null

  return (
    <div className="fixed top-14 inset-x-0 z-40 glass text-white px-4 py-2 flex items-center gap-3 text-xs">
      <Download size={14} className="shrink-0" />
      <span className="flex-1">{t('pwa.installMsg')}</span>
      <button onClick={install} className="bg-white text-neutral-900 font-bold px-3 py-1 rounded-lg shrink-0">{t('pwa.install')}</button>
      <button onClick={() => setDismissed(true)} className="text-white/60 hover:text-white shrink-0">✕</button>
    </div>
  )
}
