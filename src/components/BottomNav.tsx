import { Map, Navigation, MessageSquarePlus, Radio } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { useI18n } from '../i18n'

const tabs = [
  { to: '/', icon: Map, key: 'nav.map' },
  { to: '/route', icon: Navigation, key: 'nav.route' },
  { to: '/report', icon: MessageSquarePlus, key: 'nav.report' },
  { to: '/mesh', icon: Radio, key: 'nav.mesh' },
] as const

export default function BottomNav() {
  const { t } = useI18n()
  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-50 glass border-t border-white/10 flex pb-[env(safe-area-inset-bottom)]">
      {tabs.map(({ to, icon: Icon, key }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) =>
            `flex-1 flex flex-col items-center justify-center py-2.5 gap-0.5 text-[11px] min-h-[56px] transition-colors ${
              isActive ? 'text-white' : 'text-white/45'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <Icon size={20} className={isActive ? 'drop-shadow-[0_0_8px_rgba(255,255,255,0.6)]' : ''} />
              {t(key)}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
