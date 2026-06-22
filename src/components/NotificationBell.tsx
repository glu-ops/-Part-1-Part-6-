import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, FilePlus2, Inbox, Loader2, AlertOctagon, HeartHandshake, ShieldCheck, MapPin, User } from 'lucide-react'
import { useMesh } from '../contexts/MeshContext'
import { useFocus } from '../contexts/FocusContext'
import { useI18n } from '../i18n'
import type { Notice } from '../contexts/MeshContext'

const ICON: Record<Notice['kind'], typeof Bell> = {
  'report-new': FilePlus2,
  'report-status': Inbox,
  'sos-new': AlertOctagon,
  'sos-status': Loader2,
  'sos-reply': HeartHandshake,
  'sos-safe': ShieldCheck,
}
const TINT: Record<Notice['kind'], string> = {
  'report-new': 'text-white/70',
  'report-status': 'text-status-caution',
  'sos-new': 'text-status-danger',
  'sos-status': 'text-status-caution',
  'sos-reply': 'text-status-safe',
  'sos-safe': 'text-status-safe',
}

/** 回報 / SOS 動態通知中心（Header 鈴鐺 + 下拉面板，點擊可定位地圖） */
export default function NotificationBell() {
  const { notices, unreadCount, markNoticesRead } = useMesh()
  const { requestFocus } = useFocus()
  const { t, rt } = useI18n()
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const toggle = () => {
    setOpen(o => {
      const next = !o
      if (next) markNoticesRead()
      return next
    })
  }

  // 點擊通知 → 地圖定位 + 開啟資訊卡（report→首頁地圖；sos→Mesh 地圖）
  const onClickNotice = (n: Notice) => {
    if (n.refKind && n.refId && n.lat != null && n.lng != null) {
      nav(n.refKind === 'sos' ? '/mesh' : '/')
      requestFocus(n.refKind, n.refId, n.lat, n.lng)
      setOpen(false)
    }
  }

  return (
    <div className="relative shrink-0" ref={ref}>
      <button onClick={toggle}
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
          <p className="px-3 py-2 text-xs font-semibold text-white/70 border-b border-white/10">{t('notice.title')}</p>
          {notices.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-white/40">{t('notice.empty')}</p>
          ) : (
            notices.map(n => {
              const Icon = ICON[n.kind]
              const clickable = n.refId != null && n.lat != null
              return (
                <button key={n.id} onClick={() => onClickNotice(n)} disabled={!clickable}
                  className={`w-full text-left flex items-start gap-2 px-3 py-2.5 border-b border-white/5 ${clickable ? 'hover:bg-white/5 cursor-pointer' : 'cursor-default'}`}>
                  <Icon size={14} className={`mt-0.5 shrink-0 ${TINT[n.kind]}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-white/90 leading-snug font-medium">{n.text}</p>
                    {/* 詳細：類型 · 狀態 / 回報者 / 最新內容 / 位置 */}
                    <div className="flex items-center gap-1.5 flex-wrap mt-1">
                      {n.typeLabel && <span className="text-[10px] glass-cell text-white/55 px-1.5 py-0.5 rounded-full">{n.typeLabel}</span>}
                      {n.statusLabel && <span className="text-[10px] glass-cell text-white/55 px-1.5 py-0.5 rounded-full">{n.statusLabel}</span>}
                    </div>
                    {n.reporter && (
                      <p className="text-[10px] text-white/45 mt-1 flex items-center gap-1"><User size={9} />{n.reporter}</p>
                    )}
                    {n.latest && <p className="text-[11px] text-white/60 mt-0.5 line-clamp-2">{n.latest}</p>}
                    <div className="flex items-center justify-between mt-1">
                      {clickable
                        ? <span className="text-[10px] text-white/45 flex items-center gap-1"><MapPin size={9} />{t('notice.tapToLocate')}</span>
                        : <span />}
                      <span className="text-[10px] text-white/35">{rt(new Date(n.ts).toISOString())}</span>
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
