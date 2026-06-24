import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, FilePlus2, Inbox, Loader2, AlertOctagon, HeartHandshake, ShieldCheck, MapPin, User, Megaphone, ChevronDown } from 'lucide-react'
import { useMesh } from '../contexts/MeshContext'
import { useFocus } from '../contexts/FocusContext'
import { useI18n } from '../i18n'
import type { Notice } from '../contexts/MeshContext'

// 公告依重要程度上色（緊急＝紅、注意＝黃、一般＝藍白）
const ANNOUNCE_TINT: Record<string, string> = { info: 'text-white/65', warning: 'text-status-caution', critical: 'text-status-danger' }

type Filter = 'all' | 'sos' | 'report' | 'command' | 'system'
const FILTERS: Filter[] = ['all', 'sos', 'report', 'command', 'system']

// 分類篩選：指揮中心＝由指揮中心發出的動作（公告 + 各種已收到/處理中/已派人/已處理）。
function matchesFilter(n: Notice, f: Filter): boolean {
  switch (f) {
    case 'all': return true
    case 'sos': return n.eventType === 'sos'
    case 'report': return n.eventType === 'report'
    case 'command': return n.actorRole === 'command'
    case 'system': return n.eventType === 'system'
  }
}

function iconFor(n: Notice): typeof Bell {
  if (n.eventType === 'command') return Megaphone
  if (n.eventType === 'sos') {
    if (n.action === 'new') return AlertOctagon
    if (n.action === 'safe') return ShieldCheck
    if (n.actorRole === 'command') return Loader2          // received / processing / dispatched
    return HeartHandshake                                  // reply / willing / enroute
  }
  if (n.eventType === 'report') {
    if (n.action === 'new' || n.action === 'supplement') return FilePlus2
    return Inbox                                           // received / processing / resolved
  }
  return Bell
}

function tintFor(n: Notice): string {
  if (n.eventType === 'command') return ANNOUNCE_TINT[n.level ?? 'info']
  if (n.eventType === 'sos') {
    if (n.action === 'new') return 'text-status-danger'
    if (n.action === 'safe') return 'text-status-safe'
    if (n.actorRole === 'command') return 'text-status-caution'
    return 'text-status-safe'
  }
  if (n.eventType === 'report') return n.actorRole === 'command' ? 'text-status-caution' : 'text-white/70'
  return 'text-white/70'
}

function hasLocation(n: Notice): boolean {
  return !!n.refKind && n.lat != null && n.lng != null && !(n.lat === 0 && n.lng === 0)
}

/** 回報 / SOS 動態通知中心（Header 鈴鐺 + 下拉面板；分類篩選、點擊定位/詳情、單筆已讀） */
export default function NotificationBell() {
  const { notices, unreadCount, markNoticesRead, markNoticeRead } = useMesh()
  const { requestFocus } = useFocus()
  const { t, rt } = useI18n()
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState<Filter>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  // 點擊通知：標記已讀；有位置 → 定位到地圖並開資訊卡；沒位置 → 展開詳情。
  const onClickNotice = (n: Notice) => {
    markNoticeRead(n.notificationId)
    if (hasLocation(n)) {
      nav(n.refKind === 'sos' ? '/mesh' : '/')
      requestFocus(n.refKind!, n.targetId, n.lat!, n.lng!)
      setOpen(false)
    } else {
      setExpandedId(prev => (prev === n.notificationId ? null : n.notificationId))
    }
  }

  const filtered = notices.filter(n => matchesFilter(n, filter))

  return (
    <div className="relative shrink-0" ref={ref}>
      <button onClick={() => setOpen(o => !o)}
        className="relative flex items-center text-white/80 hover:text-white glass-cell rounded-full p-1.5"
        aria-label={t('notice.title')}>
        <Bell size={15} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[15px] h-[15px] px-1 bg-status-danger text-white text-[9px] font-bold rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-80 max-h-[70vh] overflow-y-auto no-scrollbar glass rounded-xl z-[60] py-1">
          <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
            <p className="text-xs font-semibold text-white/70">{t('notice.title')}</p>
            {unreadCount > 0 && (
              <button onClick={markNoticesRead} className="text-[10px] text-white/45 hover:text-white">
                {t('notice.markAllRead')}
              </button>
            )}
          </div>

          {/* 分類：全部 / SOS / 回報 / 指揮中心 / 系統 */}
          <div className="flex gap-1 px-2 py-2 border-b border-white/5 overflow-x-auto no-scrollbar">
            {FILTERS.map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`text-[11px] px-2 py-1 rounded-full whitespace-nowrap transition-colors ${
                  filter === f ? 'bg-white text-neutral-900 font-semibold' : 'glass-cell text-white/55 hover:text-white'}`}>
                {t(`notice.filter.${f}`)}
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-white/40">{t('notice.empty')}</p>
          ) : (
            filtered.map(n => {
              const Icon = iconFor(n)
              const tint = tintFor(n)
              const located = hasLocation(n)
              const expanded = expandedId === n.notificationId
              const showLoc = (n.eventType === 'sos' || n.eventType === 'report') && !!n.locationName
              return (
                <button key={n.notificationId} onClick={() => onClickNotice(n)}
                  className="w-full text-left flex items-start gap-2 px-3 py-2.5 border-b border-white/5 hover:bg-white/5 cursor-pointer">
                  <Icon size={14} className={`mt-0.5 shrink-0 ${tint}`} />
                  <div className="min-w-0 flex-1">
                    <p className={`text-xs leading-snug ${n.read ? 'text-white/60' : 'text-white/90 font-medium'}`}>
                      {!n.read && <span className="inline-block w-1.5 h-1.5 rounded-full bg-status-danger mr-1.5 align-middle" />}
                      {n.message}
                    </p>
                    {/* 詳細：地點 / 執行者 */}
                    <div className="flex items-center gap-1.5 flex-wrap mt-1">
                      {showLoc && <span className="text-[10px] glass-cell text-white/55 px-1.5 py-0.5 rounded-full flex items-center gap-1"><MapPin size={9} />{n.locationName}</span>}
                      {n.actorName && <span className="text-[10px] glass-cell text-white/55 px-1.5 py-0.5 rounded-full flex items-center gap-1"><User size={9} />{n.actorName}</span>}
                    </div>
                    {n.detail && <p className={`text-[11px] text-white/60 mt-0.5 ${expanded ? '' : 'line-clamp-2'}`}>{n.detail}</p>}
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[10px] text-white/45 flex items-center gap-1">
                        {located ? <><MapPin size={9} />{t('notice.tapToLocate')}</> : <><ChevronDown size={9} />{t('notice.viewDetail')}</>}
                      </span>
                      <span className="text-[10px] text-white/35">{rt(new Date(n.createdAt).toISOString())}</span>
                    </div>
                  </div>
                </button>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
