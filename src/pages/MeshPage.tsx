import { useState, useEffect, useRef, useMemo } from 'react'
import { Radio, Copy, Send, AlertOctagon, Wifi, WifiOff, ShieldCheck, Home, HelpCircle, X, MapPin } from 'lucide-react'
import { useI18n } from '../i18n'
import { useUser } from '../contexts/UserContext'
import { useShelters } from '../contexts/ShelterContext'
import { useMesh } from '../contexts/MeshContext'
import type { MeshMessage } from '../hooks/usePeerMesh'
import MeshMap from '../components/Map/MeshMap'
import type { MeshPeerView } from '../components/Map/MeshMap'
import { distanceMeters } from '../utils/geo'

const NEARBY_M = 200  // F2.7-G 門檻

// 放射狀節點關係圖
function NodeGraph({ ids, t }: { ids: string[]; t: (k: string) => string }) {
  const cx = 100, cy = 100, r = 62
  return (
    <svg viewBox="0 0 200 200" className="w-full h-full max-h-[150px]">
      {ids.map((id, i) => {
        const a = (i / Math.max(1, ids.length)) * Math.PI * 2 - Math.PI / 2
        const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a)
        return (
          <g key={id}>
            <line x1={cx} y1={cy} x2={x} y2={y} stroke="rgba(255,255,255,.35)" strokeWidth="1" />
            <circle cx={x} cy={y} r="11" fill="rgba(249,115,22,.18)" stroke="rgba(249,115,22,.8)" strokeWidth="1.5" />
            <text x={x} y={y + 3} textAnchor="middle" fontSize="7" fill="#f1f2f4" fontFamily="monospace">{id.slice(0, 4)}</text>
          </g>
        )
      })}
      <circle cx={cx} cy={cy} r="15" fill="#3b82f6" />
      <text x={cx} y={cy + 4} textAnchor="middle" fontSize="9" fill="#fff" fontWeight="700">{t('mesh.me')}</text>
      {ids.length === 0 && (
        <text x={cx} y={cy + 34} textAnchor="middle" fontSize="7" fill="rgba(255,255,255,.4)">{t('mesh.noNodes')}</text>
      )}
    </svg>
  )
}

export default function MeshPage() {
  const { t } = useI18n()
  const { userLoc } = useUser()
  const { shelters } = useShelters()

  const [targetId, setTargetId] = useState('')
  const [input, setInput]       = useState('')
  const [copied, setCopied]     = useState(false)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const endRef = useRef<HTMLDivElement>(null)

  const { myId, loading, error, peers, messages, connectedCount, connect, sendText, sendQuick, triggerSOS, sosFlashId } = useMesh()
  const flashId = sosFlashId

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
  const nearPeers = peerViews.filter(p => p.nearby)
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

  // ── 左欄：連線管理 ──
  const connectCol = (
    <div className="glass rounded-3xl p-4 flex flex-col gap-3 mb-3 lg:mb-0 lg:overflow-y-auto no-scrollbar">
      <div className="flex items-center gap-2">
        <Radio size={18} className="text-white/80" />
        <h1 className="text-lg font-bold text-white">{t('mesh.title')}</h1>
        {connectedCount > 0
          ? <span className="ml-auto text-xs text-status-safe glass-cell px-2 py-0.5 rounded-full flex items-center gap-1"><Wifi size={10} />{connectedCount}</span>
          : !loading && <span className="ml-auto text-xs text-white/55 glass-cell px-2 py-0.5 rounded-full flex items-center gap-1"><WifiOff size={10} />{t('mesh.waiting')}</span>}
      </div>

      <div className="glass-cell rounded-2xl p-4">
        <label className="text-xs text-white/45 block mb-2">{t('mesh.myId')}</label>
        {loading ? (
          <p className="text-white/45 text-sm animate-pulse">{t('mesh.connecting')}</p>
        ) : (
          <div className="flex items-center gap-2">
            <code className="flex-1 text-white text-base font-mono glass-cell rounded-lg px-3 py-2 truncate">{myId}</code>
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
              <div key={p.id} className="flex items-start gap-2.5 glass-cell rounded-xl px-3 py-2">
                <Radio size={14} className="text-white/70 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-white/85 truncate flex-1">{p.id.slice(0, 8)}…</span>
                    <span className="text-[10px] text-white/40">{p.connectedAt}</span>
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
        <NodeGraph ids={peers.map(p => p.id)} t={t} />
      </div>
    </div>
  )

  // ── 中欄：即時位置地圖 ──
  const mapCol = (
    <div className="glass rounded-3xl p-4 flex flex-col mb-3 lg:mb-0">
      <div className="flex items-center gap-2 mb-2">
        <MapPin size={14} className="text-white/60" />
        <p className="text-xs text-white/45 uppercase tracking-wider">{t('mesh.mapTitle')}</p>
        <span className="ml-auto flex items-center gap-2 text-[10px] text-white/55">
          <span className="flex items-center gap-1"><i className="w-2 h-2 rounded-full bg-[#3b82f6] inline-block" />{t('mesh.me')}</span>
          <span className="flex items-center gap-1"><i className="w-2 h-2 rounded-full bg-[#f97316] inline-block" />{t('mesh.peer')}</span>
        </span>
      </div>
      <div className="flex-1 min-h-[280px]">
        <MeshMap myPos={userLoc} peers={peerViews} flashId={flashId} meLabel={t('mesh.me')} noPosLabel={t('mesh.noPos')} />
      </div>
    </div>
  )

  // ── 右欄：訊息 + 快捷 + SOS ──
  const chatCol = (
    <div className="glass rounded-3xl p-4 flex flex-col mb-3 lg:mb-0">
      <div className="flex-1 overflow-y-auto no-scrollbar min-h-[180px] lg:min-h-0">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-10 text-white/35">
            <Radio size={24} className="mb-2 opacity-40" />
            <p className="text-sm">{t('mesh.startHint')}</p>
          </div>
        ) : (
          messages.map(m => (
            <div key={m.msgId} className={`mb-3 ${isMe(m) ? 'text-right' : 'text-left'}`}>
              <div className={`inline-block max-w-[80%] rounded-2xl px-3 py-2 text-sm text-left ${
                m.type === 'sos' ? 'bg-status-danger text-white font-bold' :
                isMe(m) ? 'bg-white text-neutral-900' : 'glass-cell text-white'}`}>
                {m.type === 'sos' && `🆘 SOS（${t(`mesh.layer.${m.layer ?? 'A'}`)}）— `}{m.text}
                {(m.type === 'quick' || m.type === 'sos') && m.lat != null && (
                  <span className="block text-[10px] opacity-70 mt-0.5">📍 {m.lat.toFixed(4)}, {m.lng?.toFixed(4)}</span>
                )}
              </div>
              <p className="text-[10px] text-white/40 mt-0.5">{isMe(m) ? t('mesh.me') : m.senderId.slice(0, 6)} · {new Date(m.ts).toLocaleTimeString()}</p>
            </div>
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

      {/* 三層 SOS（一鍵） */}
      <button onClick={() => triggerSOS(t('mesh.sosText'))} disabled={connectedCount === 0}
        className="w-full bg-status-danger disabled:opacity-30 text-white font-bold rounded-2xl py-3 flex flex-col items-center gap-0.5 mt-3 active:scale-[.98] transition-transform">
        <span className="flex items-center gap-2"><AlertOctagon size={18} />{t('mesh.sosThreeLayer')}</span>
        <span className="text-[10px] font-normal opacity-80">{t('mesh.sosSubtitle')}</span>
      </button>
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
        <div className="glass rounded-2xl px-4 py-3 mb-3 text-sm text-white flex items-center justify-between gap-2 border border-orange-400/40">
          <span className="flex items-center gap-2"><MapPin size={15} className="text-white/70" />
            {t('mesh.nearbyBanner', { id: bannerPeer.id.slice(0, 6), d: distanceMeters(userLoc, { lat: bannerPeer.lat!, lng: bannerPeer.lng! }) })}</span>
          <button onClick={() => setDismissed(prev => new Set(prev).add(bannerPeer.id))} className="text-white/60 hover:text-white shrink-0"><X size={15} /></button>
        </div>
      )}

      <div className="lg:grid lg:grid-cols-[320px_1fr_380px] lg:gap-4 lg:h-full">
        {connectCol}
        {mapCol}
        {chatCol}
      </div>
    </div>
  )
}
