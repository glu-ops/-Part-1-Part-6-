import { useState } from 'react'
import { HelpCircle, X } from 'lucide-react'
import { useI18n } from '../i18n'

export default function HelpFab() {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        className="fixed bottom-4 right-4 z-[700] w-11 h-11 rounded-full glass flex items-center justify-center text-white/80 hover:text-white active:scale-95 transition-transform max-lg:bottom-20"
        aria-label="help"
      >
        {open ? <X size={20} /> : <HelpCircle size={20} />}
      </button>
      {open && (
        <div className="fixed bottom-20 right-4 z-[700] w-64 glass rounded-2xl p-4 text-xs text-white/75 leading-relaxed max-lg:bottom-36">
          <p className="font-bold text-white text-sm mb-2">{t('app.name')}</p>
          <ul className="space-y-1.5 list-disc list-inside">
            <li>{t('help.map')}</li>
            <li>{t('help.route')}</li>
            <li>{t('help.report')}</li>
            <li>{t('help.mesh')}</li>
          </ul>
        </div>
      )}
    </>
  )
}
