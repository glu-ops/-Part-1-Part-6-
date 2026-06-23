import { useState, useEffect, useRef, useMemo } from 'react'
import { Radio, Copy, Send, AlertOctagon, Wifi, WifiOff, ShieldCheck, Home, HelpCircle, X, MapPin, UserCircle2, Plus, LogOut } from 'lucide-react'
import { useI18n } from '../i18n'
import { useUser } from '../contexts/UserContext'
import { useShelters } from '../contexts/ShelterContext'
import { useIdentity } from '../contexts/IdentityContext'
import { useMesh } from '../contexts/MeshContext'
import { useFocus } from '../contexts/FocusContext'
import type { MeshMessage, PeerInfo } from '../hooks/usePeerMesh'
import MeshMap from '../components/Map/MeshMap'
import type { MeshPeerView } from '../components/Map/MeshMap'
import SosBoard from '../components/Mesh/SosBoard'
import { SOS_CATEGORY_META, PRIORITY_COLOR, isSosClosed } from '../sos'
import type { SosCategory, SosScope } from '../types'
import { distanceMeters } from '../utils/geo'

// 高優先級「一鍵送出」類型（預設範圍＝指揮中心）
const ONE_TAP_CATEGORIES: SosCategory[] = ['lifeThreat', 'medical', 'trapped']
const ONE_TAP_SCOPE: SosScope = 'commandCenter'

const NEARBY_M = 200  // F2.7-G 門檻

// 放射狀節點關係圖（以名稱顯示）
function NodeGraph({ peers, t, meLabel }: { peers: PeerInfo[]; t: (k: string) => string; meLabel: string }) {
  const cx = 100, cy = 100, r = 62
  return (
    <svg viewBox="0 0 200 200" className="w-full h-full max-h-[150px]">
      {peers.map((p, i) => {
        const a = (i / Math.max(1, peers.length)) * Math.PI * 2 - Math.PI / 2
        const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a)
        const label = (p.name || p.id.slice(0, 4)).slice(0, 4)
        const on = p.online
        return (
          <g key={p.id} opacity={on ? 1 : 0.4}>
            <line x1={cx} y1={cy} x2={x} y2={y} stroke="rgba(255,255,255,.35)" strokeWidth="1" strokeDasharray={on ? '0' : '3 2'} />
            <circle cx={x} cy={y} r="12" fill={on ? 'rgba(245,199,118,.16)' : 'rgba(120,120,120,.15)'} stroke={on ? 'rgba(245,199,118,.75)' : 'rgba(160,160,160,.6)'} strokeWidth="1.5" />
            <text x={x} y={y + 3} textAnchor="middle" fontSize="7" fill="#F4F1E6">{label}</text>
          </g>
        )
      })}
      <circle cx={cx} cy={cy} r="15" fill="#315A58" />
      <text x={cx} y={cy + 4} textAnchor="middle" fontSize="8" fill="#fff" fontWeight="700">{meLabel.slice(0, 4)}</text>
      {peers.length === 0 && (
        <text x={cx} y={cy + 34} textAnchor="middle" fontSize="7" fill="rgba(255,255,255,.4)">{t('mesh.noNodes')}</text>
      )}
    </svg>
  )
}

export default function MeshPage() {
  const { t } = useI18n()
  const { userLoc } = useUser()
  const { shelters } = useShelters()
  const { name: myName, logout } = useIdentity()

  const [targetId, setTargetId] = useState('')
  const [input, setInput]       = useState('')
  const [copied, setCopied]     = useState(false)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [filter, setFilter]     = useState<string>('all')  // 'all' | 'sos' | 'system' | <peerId>
  const endRef = useRef<HTMLDivElement>(null)

  const { myId, loading, error, peers, messages, connectedCount, connect, sendText, sendQuick, raiseSos, replySos, markSosSafe, openSosComposer, sosEvents, sosFlashId } = useMesh()
  const flashId = sosFlashId
  const { target } = useFocus()
  const focusSos = target?.kind === 'sos' ? { id: target.id, nonce: target.nonce } : null
  const openSosPoints = useMemo(() => sosEvents.filter(e => !isSosClosed(e.status) && e.lat != null && e.lng != null), [sosEvents])

  // 名稱解析：訊息自帶 senderName 優先，否則查 peers，最後退回短 ID
  const peerNameMap = useMemo(() => {
    const m = new Map<string, string>()
    peers.forEach(p => { if (p.name) m.set(p.id, p.name) })
    return m
  }, [peers])
  const displayName = (m: MeshMessage) =>
    m.senderId === myId ? (myName || t('mesh.me'))
      : (m.senderName || peerNameMap.get(m.senderId) || `${m.senderId.slice(0, 6)}`)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  // 計算最近避難所 + 距我距離（F2.7-B / F2.7-G）
  const peerViews: MeshPeerView[] = useMemo(() => {
    return peers.map(p => {
      if (p.lat == null || p.lng == null) return { ...p }
      const pos = { lat: p.lat, lng: p.lng }
      let nearest = shelters[0]
      let best = Infinity
      for (const s of shelters) {
        const d = distanceMeters(pos, { lat: s.lat, lng: s.lng })
        if (d < best) { best = d; nearest = s }
      }
      const distToMe = distanceMeters(userLoc, pos)
      return {
        ...p,
        nearestLabel: nearest ? t('mesh.nearShelter', { name: nearest.name, d: best }) : undefined,
        nearby: distToMe < NEARBY_M,
      }
    })
  }, [peers, shelters, userLoc, t])

  // F2.7-G：附近橫幅（離開 200m 後重置 dismissed，再進入會重新觸發）
  const nearPeers = peerViews.filter(p => p.nearby && p.online)
  useEffect(() => {
    setDismissed(prev => {
      const nearIds = new Set(nearPeers.map(p => p.id))
      const next = new Set([...prev].filter(id => nearIds.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [nearPeers])
  const bannerPeer = nearPeers.find(p => !dismissed.has(p.id))

  const copyId = () => {
    navigator.clipboard.writeText(myId); setCopied(true); setTimeout(() => setCopied(false), 2000)
  }
  const errMsg = error
    ? error === 'conn-fail' ? t('mesh.errConnFail') : t('mesh.errConn', { e: error })
    : null

  const isMe = (m: MeshMessage) => m.senderId === myId

  // 訊息類型標籤
  const typeTag = (m: MeshMessage): string => {
    if (m.type === 'quick') return t('mesh.type.quick')
    if (m.type === 'system') return t('mesh.type.system')
    return t('mesh.type.text')
  }

  // 篩選（SOS 已獨立到看板，不在聊天篩選內）
  const connectedPeers = peers.filter(p => p.online)
  const filtered = messages.filter(m => {
    if (filter === 'all') return true
    if (filter === 'system') return m.type === 'system'
    return m.senderId === filter || m.senderId === myId  // 與某人的對話視圖
  })

  // ── 左欄：連線管理 ──
  const connectCol = (
    <div className="order-3 lg:order-none glass rounded-3xl p-4 flex flex-col gap-3 mb-3 lg:mb-0 lg:overflow-y-auto no-scrollbar">
      <div className="flex items-center gap-2">
        <Radio size={18} className="text-white/80" />
        <h1 className="text-lg font-bold text-white">{t('mesh.title')}</h1>
        {connectedCount > 0
          ? <span className="ml-auto text-xs text-status-safe glass-cell px-2 py-0.5 rounded-full flex items-center gap-1"><Wifi size={10} />{connectedCount}</span>
          : !loading && <span className="ml-auto text-xs text-white/55 glass-cell px-2 py-0.5 rounded-full flex items-center gap-1"><WifiOff size={10} />{t('mesh.waiting')}</span>}
      </div>

      {/* 我的身份（名稱 + ID） */}
      <div className="glass-cell rounded-2xl p-4">
        <label className="text-xs text-white/45 block mb-2 flex items-center gap-1.5"><UserCircle2 size={13} />{t('mesh.myIdentity')}</label>
        <div className="flex items-center gap-2 mb-2">
          <span className="w-2 h-2 rounded-full bg-[#315A58] shrink-0" />
          <span className="text-white font-semibold text-sm flex-1 truncate">{myName || t('mesh.me')}</span>
          <button onClick={() => { if (window.confirm(t('mesh.logoutConfirm'))) logout() }} title={t('mesh.logout')}
            className="text-white/45 hover:text-status-danger p-1 shrink-0"><LogOut size={14} /></button>
        </div>
        {loading ? (
          <p className="text-white/45 text-sm animate-pulse">{t('mesh.connecting')}</p>
        ) : (
          <div className="flex items-center gap-2">
            <code className="flex-1 text-white/70 text-xs font-mono glass-cell rounded-lg px-3 py-2 truncate">{myId}</code>
            <button onClick={copyId} className="text-white/55 hover:text-white p-2 shrink-0"><Copy size={16} /></button>
          </div>
        )}
        {copied && <span className="text-xs text-status-safe">{t('mesh.copied')}</span>}
        {myId && <p className="text-[10px] text-white/40 mt-1.5">{t('mesh.shareId')}</p>}
      </div>

      <div className="glass-cell rounded-2xl p-4">
        <label className="text-xs text-white/45 block mb-2">{t('mesh.connectTo')}</label>
        <div className="flex gap-2">
          <input value={targetId} onChange={e => setTargetId(e.target.value)} placeholder={t('mesh.pasteId')}
            onKeyDown={e => { if (e.key === 'Enter' && targetId.trim()) { connect(targetId); setTargetId('') } }}
            className="flex-1 glass-cell text-white text-sm rounded-lg px-3 py-2 outline-none placeholder-white/35" />
          <button onClick={() => { connect(targetId); setTargetId('') }} disabled={!targetId.trim() || loading}
            className="bg-white disabled:opacity-30 text-neutral-900 px-4 py-2 rounded-lg text-sm font-semibold shrink-0">{t('mesh.connect')}</button>
        </div>
      </div>

      <div className="glass-cell rounded-2xl p-4 flex-1">
        <p className="text-xs text-white/45 uppercase tracking-wider mb-3">{t('mesh.connected')}</p>
        {peerViews.length === 0 ? (
          <p className="text-xs text-white/40">{t('mesh.noNodes')}</p>
        ) : (
          <div className="space-y-2">
            {peerViews.map(p => (
              <div key={p.id} className={`flex items-start gap-2.5 glass-cell rounded-xl px-3 py-2 ${p.online ? '' : 'opacity-50'}`}>
                <span className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${p.online ? 'bg-status-safe' : 'bg-white/30'}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-white/90 truncate flex-1 font-medium">{p.name || `${p.id.slice(0, 6)}…`}</span>
                    {p.online
                      ? <span className="text-[10px] text-white/40">{p.connectedAt}</span>
                      : <span className="text-[10px] text-white/40">{t('mesh.peerOffline')}</span>}
                  </div>
                  <p className="text-[10px] text-white/45 mt-0.5 flex items-center gap-1">
                    <MapPin size={9} />{p.nearestLabel ?? t('mesh.noPos')}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="glass-cell rounded-2xl p-3">
        <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1">{t('mesh.network')}</p>
        <NodeGraph peers={peers} t={t} meLabel={myName || t('mesh.me')} />
      </div>
    </div>
  )

  // ── 中欄：即時位置地圖 ──
  const mapCol = (
    <div className="order-1 lg:order-none glass rounded-3xl p-4 flex flex-col mb-3 lg:mb-0">
      <div className="flex items-center gap-2 mb-2">
        <MapPin size={14} className="text-white/60" />
        <p className="text-xs text-white/45 uppercase tracking-wider">{t('mesh.mapTitle')}</p>
        <span className="ml-auto flex items-center gap-2 text-[10px] text-white/55 flex-wrap justify-end">
          <span className="flex items-center gap-1"><i className="w-2 h-2 rounded-full bg-[#315A58] inline-block" />{myName || t('mesh.me')}</span>
          <span className="flex items-center gap-1"><i className="w-2 h-2 rounded-full bg-[#F5C776] inline-block" />{t('mesh.peer')}</span>
          <span className="text-white/35">|</span>
          <span className="flex items-center gap-1"><i className="w-2 h-2 rounded-full inline-block" style={{ background: PRIORITY_COLOR.high, boxShadow: `0 0 5px ${PRIORITY_COLOR.high}` }} />{t('sos.prio.high')}</span>
          <span className="flex items-center gap-1"><i className="w-2 h-2 rounded-full inline-block" style={{ background: PRIORITY_COLOR.medium, boxShadow: `0 0 5px ${PRIORITY_COLOR.medium}` }} />{t('sos.prio.medium')}</span>
          <span className="flex items-center gap-1"><i className="w-2 h-2 rounded-full inline-block" style={{ background: PRIORITY_COLOR.low, boxShadow: `0 0 5px ${PRIORITY_COLOR.low}` }} />{t('sos.prio.low')}</span>
        </span>
      </div>
      <div className="h-[58vh] min-h-[320px] lg:h-auto lg:flex-1 lg:min-h-[260px]">
        <MeshMap myPos={userLoc} peers={peerViews.filter(p => p.online)} flashId={flashId}
          meLabel={myName || t('mesh.me')} noPosLabel={t('mesh.noPos')}
          sosPoints={openSosPoints} focusSos={focusSos} />
      </div>
    </div>
  )

  // ── 右欄：SOS 看板 + 訊息 + 篩選 + 快捷 + 發 SOS ──
  const filterChips: { key: string; label: string }[] = [
    { key: 'all', label: t('mesh.filter.all') },
    { key: 'system', label: t('mesh.filter.system') },
    ...connectedPeers.map(p => ({ key: p.id, label: p.name || p.id.slice(0, 6) })),
  ]

  const chatCol = (
    <div className="order-2 lg:order-none glass rounded-3xl p-4 flex flex-col mb-3 lg:mb-0 lg:min-h-0">
      {/* SOS 事件看板（聊天框上方） */}
      <SosBoard events={sosEvents} myId={myId} onReply={replySos} onSelfSafe={markSosSafe} />

      {/* 篩選列 */}
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-2 mb-1 shrink-0">
        {filterChips.map(c => (
          <button key={c.key} onClick={() => setFilter(c.key)}
            className={`text-[11px] px-2.5 py-1 rounded-full whitespace-nowrap shrink-0 transition-colors ${
              filter === c.key ? 'bg-white text-neutral-900 font-semibold' : 'glass-cell text-white/60'}`}>
            {c.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar min-h-[180px] lg:min-h-0">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-10 text-white/35">
            <Radio size={24} className="mb-2 opacity-40" />
            <p className="text-sm">{messages.length === 0 ? t('mesh.startHint') : t('mesh.filterEmpty')}</p>
          </div>
        ) : (
          filtered.map(m => (
            m.type === 'system' ? (
              <div key={m.msgId} className="text-center my-2">
                <span className="text-[11px] text-white/45 glass-cell rounded-full px-3 py-1">{m.text}</span>
              </div>
            ) : (
              <div key={m.msgId} className={`mb-3 ${isMe(m) ? 'text-right' : 'text-left'}`}>
                {/* 來源標籤：名字 · 類型 */}
                <div className={`flex items-center gap-1.5 mb-0.5 ${isMe(m) ? 'justify-end' : 'justify-start'}`}>
                  <span className="text-[11px] font-semibold text-white/70">{displayName(m)}</span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full glass-cell text-white/40">{typeTag(m)}</span>
                </div>
                <div className={`inline-block max-w-[85%] rounded-2xl px-3 py-2 text-sm text-left ${
                  isMe(m) ? 'bg-white text-neutral-900' : 'glass-cell text-white'}`}>
                  {m.text}
                  {m.type === 'quick' && m.lat != null && (
                    <span className="block text-[10px] opacity-70 mt-0.5">📍 {m.lat.toFixed(4)}, {m.lng?.toFixed(4)}</span>
                  )}
                </div>
                <p className="text-[10px] text-white/30 mt-0.5">{new Date(m.ts).toLocaleTimeString()}</p>
              </div>
            )
          ))
        )}
        <div ref={endRef} />
      </div>

      {/* F2.7-C 快捷訊息 */}
      <div className="grid grid-cols-3 gap-2 mt-3">
        <button onClick={() => sendQuick(t('mesh.quick.safe'))} disabled={connectedCount === 0}
          className="glass-cell disabled:opacity-30 text-white text-xs rounded-xl py-2 flex flex-col items-center gap-1 active:scale-95 transition-transform">
          <ShieldCheck size={16} className="text-white/80" />{t('mesh.quick.safe')}
        </button>
        <button onClick={() => sendQuick(t('mesh.quick.atShelter'))} disabled={connectedCount === 0}
          className="glass-cell disabled:opacity-30 text-white text-xs rounded-xl py-2 flex flex-col items-center gap-1 active:scale-95 transition-transform">
          <Home size={16} className="text-white/80" />{t('mesh.quick.atShelter')}
        </button>
        <button onClick={() => sendQuick(t('mesh.quick.needHelp'))} disabled={connectedCount === 0}
          className="glass-cell disabled:opacity-30 text-white text-xs rounded-xl py-2 flex flex-col items-center gap-1 active:scale-95 transition-transform">
          <HelpCircle size={16} className="text-white/80" />{t('mesh.quick.needHelp')}
        </button>
      </div>

      <div className="flex gap-2 mt-3">
        <input value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && input.trim()) { sendText(input); setInput('') } }}
          placeholder={connectedCount > 0 ? t('mesh.inputMsg') : t('mesh.inputLocked')} disabled={connectedCount === 0}
          className="flex-1 glass-cell text-white text-sm rounded-full px-4 py-3 outline-none placeholder-white/35 disabled:opacity-40" />
        <button onClick={() => { if (input.trim()) { sendText(input); setInput('') } }} disabled={connectedCount === 0 || !input.trim()}
          className="bg-white disabled:opacity-30 text-neutral-900 p-3 rounded-full shrink-0"><Send size={18} /></button>
      </div>

      {/* SOS：高優先級一鍵送出（預設送指揮中心）＋ 完整發送面板（選類型/範圍/說明） */}
      <div className="mt-3">
        <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
          <AlertOctagon size={11} />{t('mesh.sosTitle')}
        </p>
        <div className="grid grid-cols-3 gap-2">
          {ONE_TAP_CATEGORIES.map(cat => {
            const Icon = SOS_CATEGORY_META[cat].icon
            return (
              <button key={cat} onClick={() => raiseSos({ category: cat, scope: ONE_TAP_SCOPE, text: '' })}
                className="bg-status-danger text-white rounded-2xl px-1 py-2.5 flex flex-col items-center gap-1 active:scale-95 transition-transform">
                <Icon size={16} />
                <span className="text-xs font-bold leading-tight text-center">{t(`sos.cat.${cat}`)}</span>
                <span className="text-[9px] font-medium bg-white/20 rounded-full px-1.5 py-0.5 flex items-center gap-0.5 leading-none">
                  <Send size={8} />{t('sos.sendTo', { target: t(`sos.scope.${ONE_TAP_SCOPE}`) })}
                </span>
              </button>
            )
          })}
        </div>
        <button onClick={() => openSosComposer()}
          className="w-full mt-2 glass-cell text-white/90 rounded-2xl py-2.5 flex items-center justify-center gap-1.5 active:scale-[.98] transition-transform">
          <Plus size={15} />
          <span className="text-xs font-semibold">{t('sos.moreTypes')}</span>
        </button>
        <p className="text-[10px] text-white/35 mt-1.5">{t('mesh.sosHint')}</p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen pt-14 pb-24 px-4 max-w-2xl mx-auto lg:max-w-none lg:pt-20 lg:pb-4 lg:h-screen lg:min-h-0">
      {errMsg && (
        <div className="glass rounded-2xl px-4 py-3 mb-3 text-xs text-status-danger flex items-center justify-between gap-2 border border-status-danger/30">
          <span>{errMsg}</span>
        </div>
      )}

      {/* F2.7-G 附近橫幅 */}
      {bannerPeer && (
        <div className="glass rounded-2xl px-4 py-3 mb-3 text-sm text-white flex items-center justify-between gap-2 border border-status-caution/35">
          <span className="flex items-center gap-2"><MapPin size={15} className="text-white/70" />
            {t('mesh.nearbyBanner', { id: bannerPeer.name || bannerPeer.id.slice(0, 6), d: distanceMeters(userLoc, { lat: bannerPeer.lat!, lng: bannerPeer.lng! }) })}</span>
          <button onClick={() => setDismissed(prev => new Set(prev).add(bannerPeer.id))} className="text-white/60 hover:text-white shrink-0"><X size={15} /></button>
        </div>
      )}

      {/* 行動版：單欄、地圖優先（map → 聊天/SOS → 連線管理）；桌面維持三欄（來源順序） */}
      <div className="flex flex-col lg:grid lg:grid-cols-[320px_1fr_380px] lg:gap-4 lg:h-full">
        {connectCol}
        {mapCol}
        {chatCol}
      </div>
    </div>
  )
}
