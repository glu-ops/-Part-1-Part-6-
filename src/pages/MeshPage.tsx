import { useState, useEffect, useRef } from 'react'
import { Radio, Copy, Send, AlertOctagon, WifiOff, Wifi } from 'lucide-react'
import { useI18n } from '../i18n'

interface Message { id: string; from: string; text: string; time: string; type: 'sos' | 'text' }
interface PeerNode { id: string; connectedAt: string }

// 放射狀節點關係圖
function NodeGraph({ nodes, t }: { nodes: PeerNode[]; t: (k: string) => string }) {
  const cx = 100, cy = 100, r = 66
  return (
    <svg viewBox="0 0 200 200" className="w-full h-full max-h-[320px]">
      {nodes.map((n, i) => {
        const a = (i / Math.max(1, nodes.length)) * Math.PI * 2 - Math.PI / 2
        const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a)
        return (
          <g key={n.id}>
            <line x1={cx} y1={cy} x2={x} y2={y} stroke="rgba(255,255,255,.35)" strokeWidth="1" />
            <circle cx={x} cy={y} r="11" fill="rgba(255,255,255,.08)" stroke="rgba(255,255,255,.6)" strokeWidth="1.5" />
            <text x={x} y={y + 3} textAnchor="middle" fontSize="7" fill="#f1f2f4" fontFamily="monospace">{n.id.slice(0, 4)}</text>
          </g>
        )
      })}
      {/* 中心：我 */}
      <circle cx={cx} cy={cy} r="16" fill="#ffffff" />
      <text x={cx} y={cy + 4} textAnchor="middle" fontSize="9" fill="#18181b" fontWeight="700">{t('mesh.me')}</text>
      {nodes.length === 0 && (
        <text x={cx} y={cy + 36} textAnchor="middle" fontSize="7" fill="rgba(255,255,255,.4)">{t('mesh.noNodes')}</text>
      )}
    </svg>
  )
}

export default function MeshPage() {
  const { t } = useI18n()
  const [myId, setMyId]           = useState<string>('')
  const [targetId, setTargetId]   = useState('')
  const [connected, setConnected] = useState(false)
  const [messages, setMessages]   = useState<Message[]>([])
  const [input, setInput]         = useState('')
  const [copied, setCopied]       = useState(false)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [nodes, setNodes]         = useState<PeerNode[]>([])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const peerRef = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const connRef = useRef<any>(null)
  const endRef  = useRef<HTMLDivElement>(null)

  useEffect(() => {
    import('peerjs').then(({ Peer }) => {
      if (peerRef.current) return
      const peer = new Peer()
      peerRef.current = peer
      peer.on('open', (id: string) => { setMyId(id); setLoading(false); setError(null) })
      peer.on('error', (err: any) => { setError(t('mesh.errConn', { e: err.type ?? err.message })); setLoading(false) })
      peer.on('disconnected', () => { setError(t('mesh.errReconnect')); peer.reconnect() })
      peer.on('connection', (conn: any) => setupConn(conn))
    })
    return () => { peerRef.current?.destroy(); peerRef.current = null }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function setupConn(conn: any) {
    connRef.current = conn
    setConnected(true)
    setNodes(prev => prev.find(n => n.id === conn.peer) ? prev : [...prev, { id: conn.peer, connectedAt: new Date().toLocaleTimeString() }])
    conn.on('data', (data: any) => addMessage(conn.peer.slice(0, 8), data))
    conn.on('close', () => { setConnected(false); setNodes(prev => prev.filter(n => n.id !== conn.peer)) })
    conn.on('error', () => setError(t('mesh.errTransfer')))
  }

  function connect() {
    if (!peerRef.current || !targetId.trim()) return
    setError(null)
    try {
      const conn = peerRef.current.connect(targetId.trim())
      conn.on('open', () => setupConn(conn))
      conn.on('error', () => setError(t('mesh.errConnFail')))
    } catch { setError(t('mesh.errConnFail')) }
  }

  function addMessage(from: string, data: { text: string; type?: 'sos' | 'text' }) {
    setMessages(prev => [...prev, {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      from, text: data.text, time: new Date().toLocaleTimeString(), type: data.type ?? 'text',
    }])
  }

  function send(text: string, type: 'text' | 'sos' = 'text') {
    if (!connRef.current) return
    try { connRef.current.send({ text, type }); addMessage(t('mesh.me'), { text, type }); setInput('') }
    catch { setError(t('mesh.errSend')) }
  }

  function copyId() {
    navigator.clipboard.writeText(myId); setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  // ── 三個欄位區塊 ──
  const connectCol = (
    <div className="glass rounded-3xl p-4 flex flex-col gap-3 mb-3 lg:mb-0 lg:overflow-y-auto no-scrollbar">
      <div className="flex items-center gap-2">
        <Radio size={18} className="text-white/80" />
        <h1 className="text-lg font-bold text-white">{t('mesh.title')}</h1>
        {connected
          ? <span className="ml-auto text-xs text-status-safe glass-cell px-2 py-0.5 rounded-full flex items-center gap-1"><Wifi size={10} />{t('mesh.connected')}</span>
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

      {!connected && (
        <div className="glass-cell rounded-2xl p-4">
          <label className="text-xs text-white/45 block mb-2">{t('mesh.connectTo')}</label>
          <div className="flex gap-2">
            <input value={targetId} onChange={e => setTargetId(e.target.value)} placeholder={t('mesh.pasteId')}
              className="flex-1 glass-cell text-white text-sm rounded-lg px-3 py-2 outline-none placeholder-white/35" />
            <button onClick={connect} disabled={!targetId.trim() || loading}
              className="bg-white disabled:opacity-30 text-neutral-900 px-4 py-2 rounded-lg text-sm font-semibold shrink-0">{t('mesh.connect')}</button>
          </div>
        </div>
      )}

      <div className="glass-cell rounded-2xl p-4 flex-1">
        <p className="text-xs text-white/45 uppercase tracking-wider mb-3">{t('mesh.connected')}</p>
        {nodes.length === 0 ? (
          <p className="text-xs text-white/40">{t('mesh.noNodes')}</p>
        ) : (
          <div className="space-y-2">
            {nodes.map(n => (
              <div key={n.id} className="flex items-center gap-2.5 glass-cell rounded-xl px-3 py-2">
                <Radio size={14} className="text-white/70 shrink-0" />
                <span className="font-mono text-xs text-white/85 truncate flex-1">{n.id.slice(0, 8)}…</span>
                <span className="text-[10px] text-white/40">{n.connectedAt}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )

  const graphCol = (
    <div className="glass rounded-3xl p-4 flex flex-col mb-3 lg:mb-0">
      <p className="text-xs text-white/45 uppercase tracking-wider mb-2">{t('mesh.network')}</p>
      <div className="flex-1 flex items-center justify-center min-h-[260px]">
        <NodeGraph nodes={nodes} t={t} />
      </div>
    </div>
  )

  const chatCol = (
    <div className="glass rounded-3xl p-4 flex flex-col mb-3 lg:mb-0">
      <div className="flex-1 overflow-y-auto no-scrollbar min-h-[200px] lg:min-h-0">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-10 text-white/35">
            <Radio size={24} className="mb-2 opacity-40" />
            <p className="text-sm">{t('mesh.startHint')}</p>
          </div>
        ) : (
          messages.map(m => (
            <div key={m.id} className={`mb-3 ${m.from === t('mesh.me') ? 'text-right' : 'text-left'}`}>
              <div className={`inline-block max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                m.type === 'sos' ? 'bg-status-danger text-white font-bold' :
                m.from === t('mesh.me') ? 'bg-white text-neutral-900' : 'glass-cell text-white'}`}>
                {m.type === 'sos' && '🆘 SOS — '}{m.text}
              </div>
              <p className="text-[10px] text-white/40 mt-0.5">{m.from} · {m.time}</p>
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>

      <div className="flex gap-2 mt-3">
        <input value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && input.trim() && send(input)}
          placeholder={connected ? t('mesh.inputMsg') : t('mesh.inputLocked')} disabled={!connected}
          className="flex-1 glass-cell text-white text-sm rounded-full px-4 py-3 outline-none placeholder-white/35 disabled:opacity-40" />
        <button onClick={() => input.trim() && send(input)} disabled={!connected || !input.trim()}
          className="bg-white disabled:opacity-30 text-neutral-900 p-3 rounded-full shrink-0"><Send size={18} /></button>
      </div>

      <button onClick={() => send(t('mesh.sosMsg'), 'sos')} disabled={!connected}
        className="w-full bg-status-danger disabled:opacity-30 text-white font-bold rounded-full py-3 flex items-center justify-center gap-2 mt-3 active:scale-[.98] transition-transform">
        <AlertOctagon size={18} />{t('mesh.sos')}
      </button>
    </div>
  )

  return (
    <div className="min-h-screen pt-14 pb-24 px-4 max-w-2xl mx-auto lg:max-w-none lg:pt-20 lg:pb-4 lg:h-screen lg:min-h-0">
      {error && (
        <div className="glass rounded-2xl px-4 py-3 mb-3 text-xs text-status-danger flex items-center justify-between gap-2 border border-status-danger/30">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-status-danger/60 hover:text-status-danger shrink-0">✕</button>
        </div>
      )}
      <div className="lg:grid lg:grid-cols-[320px_1fr_380px] lg:gap-4 lg:h-full">
        {connectCol}
        {graphCol}
        {chatCol}
      </div>
    </div>
  )
}
