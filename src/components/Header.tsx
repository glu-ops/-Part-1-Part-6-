import { useState, useRef, useEffect } from 'react'
import { Shield, Wifi, WifiOff, Languages, Check, Map, Navigation, MessageSquarePlus, Radio, ChevronDown } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { useUser } from '../contexts/UserContext'
import { useI18n, LANGS } from '../i18n'
import NotificationBell from './NotificationBell'
import { DISASTERS, DISASTER_ICON } from '../disasters'
import type { Lang } from '../i18n'
import type { UserRole } from '../types'

const ROLES: UserRole[] = ['adult', 'elderly', 'pregnant', 'child', 'disabled', 'student']
const TABS = [
  { to: '/', icon: Map, key: 'nav.map' },
  { to: '/route', icon: Navigation, key: 'nav.route' },
  { to: '/report', icon: MessageSquarePlus, key: 'nav.report' },
  { to: '/mesh', icon: Radio, key: 'nav.mesh' },
] as const

function LangMenu() {
  const { lang, setLang } = useI18n()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const current = LANGS.find(l => l.code === lang)!

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 text-white/80 hover:text-white glass-cell rounded-full px-2.5 py-1.5 text-xs"
        aria-label="Language"
      >
        <Languages size={14} />
        <span className="font-semibold">{current.short}</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-40 glass rounded-xl overflow-hidden z-[60] py-1">
          {LANGS.map(l => (
            <button
              key={l.code}
              onClick={() => { setLang(l.code as Lang); setOpen(false) }}
              className="w-full flex items-center justify-between px-3 py-2 text-sm text-white/85 hover:bg-white/10 transition-colors"
            >
              {l.label}
              {l.code === lang && <Check size={14} className="text-white" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// 災害情境選單 — 白色線條圖示（單色輪廓，無彩色 emoji）
function DisasterMenu() {
  const { disaster, setDisaster } = useUser()
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const Current = DISASTER_ICON[disaster]

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 glass-cell text-white text-xs rounded-full px-2 py-1.5 sm:px-2.5"
        aria-label={t(`disaster.${disaster}`)}
      >
        <Current size={14} />
        <span className="hidden min-[380px]:inline">{t(`disaster.${disaster}`)}</span>
        <ChevronDown size={12} className="text-white/55" />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1.5 w-36 glass rounded-xl overflow-hidden z-[60] py-1">
          {DISASTERS.map(d => {
            const Icon = DISASTER_ICON[d]
            return (
              <button
                key={d}
                onClick={() => { setDisaster(d); setOpen(false) }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-white/85 hover:bg-white/10 transition-colors"
              >
                <Icon size={15} />
                <span>{t(`disaster.${d}`)}</span>
                {d === disaster && <Check size={14} className="text-white ml-auto" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function Header() {
  const { role, setRole, isOnline } = useUser()
  const { t } = useI18n()

  return (
    <header className="fixed z-50 h-14 flex items-center gap-1.5 px-2 overflow-hidden
      top-0 inset-x-0 glass
      sm:gap-2 sm:px-3
      lg:top-3 lg:inset-x-4 lg:rounded-2xl lg:glass-nav lg:px-4 lg:gap-3">
      {/* Logo + 名稱 */}
      <div className="flex items-center gap-1.5 text-white font-bold text-sm shrink-0">
        <Shield size={18} className="text-white/90" />
        <span className="hidden min-[420px]:flex flex-col leading-none">
          <span>{t('app.name')}</span>
        </span>
      </div>

      {/* 角色 */}
      <div className="flex items-center gap-2 shrink-0">
        <select
          value={role}
          onChange={e => setRole(e.target.value as UserRole)}
          className="glass-cell text-white text-xs rounded-full px-2 py-1.5 outline-none shrink-0 max-w-[5.5rem] sm:max-w-none sm:px-2.5"
        >
          {ROLES.map(r => (
            <option key={r} value={r}>{t(`role.${r}`)}</option>
          ))}
        </select>
      </div>

      {/* 災害情境 */}
      <DisasterMenu />

      {/* 桌面：功能入口（區段控制器） */}
      <nav className="hidden lg:flex items-center gap-1 mx-auto glass-cell rounded-full p-1">
        {TABS.map(({ to, icon: Icon, key }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                isActive ? 'bg-white text-neutral-900' : 'text-white/55 hover:text-white'
              }`
            }
          >
            <Icon size={15} />
            {t(key)}
          </NavLink>
        ))}
      </nav>

      <div className="flex-1 lg:hidden" />

      {/* 回報 / SOS 動態通知 */}
      <NotificationBell />

      {/* 線上狀態：線上=白、離線=灰 */}
      <div className={`flex items-center gap-1 text-xs shrink-0 glass-cell rounded-full px-2.5 py-1.5 ${isOnline ? 'text-white' : 'text-white/45'}`}>
        {isOnline ? <Wifi size={14} /> : <WifiOff size={14} />}
        <span className="hidden sm:inline">{isOnline ? t('status.online') : t('status.offline')}</span>
      </div>

      <LangMenu />
    </header>
  )
}
