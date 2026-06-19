import { useMemo, useCallback, useState } from 'react'
import { ShieldAlert, Radio, MapPin, Clock, MessageSquare, Send, CheckCircle2, Loader2 } from 'lucide-react'
import { useI18n } from '../i18n'
import { useShelters, getClientId } from '../contexts/ShelterContext'
import { usePeerMesh, RESCUE_CENTER_ID } from '../hooks/usePeerMesh'
import type { MeshMessage, SosLayer } from '../hooks/usePeerMesh'
import MeshMap from '../components/Map/MeshMap'
import type { MeshPeerView } from '../components/Map/MeshMap'
import ReportCard from '../components/Report/ReportCard'
import type { CrowdReport } from '../types'
import { DEFAULT_LOC, distanceMeters } from '../utils/geo'

type SosStatus = 'active' | 'handling' | 'resolved'

interface SosEntry {
  senderId: string
  senderName: string
  layer: SosLayer
  lat?: number
  lng?: number
  text?: string
  ts: number
  nearestLabel?: string
}

function genId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export default function RescueCenterPage() {
  const { t } = useI18n()
  const { shelters, activeReports, mergeReport, resolveReport, voteReport } = useShelters()
  const cid = getClientId()
  const onReport = useCallback((r: CrowdReport) => { mergeReport(r) }, [mergeReport])
  const { myId, loading, error, messages, shareReport, sendTo } = usePeerMesh({
    fixedId: RESCUE_CENTER_ID, myName: t('rescue.title'), onReport,
  })

  // 每筆求救的處理狀態與回覆草稿（依求救者 ID）
  const [statusMap, setStatusMap] = useState<Record<string, SosStatus>>({})
  const [replyDraft, setReplyDraft] = useState<Record<string, string>>({})

  // 取 B 與 C 層 SOS，依求救者去重保留最新
  const entries: SosEntry[] = useMemo(() => {
    const byId = new Map<string, SosEntry>()
    for (const m of messages) {
      if (m.type !== 'sos' || (m.layer !== 'B' && m.layer !== 'C')) continue
      const prev = byId.get(m.senderId)
      if (!prev || m.ts > prev.ts) {
        let nearestLabel: string | undefined
        if (m.lat != null && m.lng != null && shelters.length) {
          let best = Infinity, name = ''
          for (const s of shelters) {
            const d = distanceMeters({ lat: m.lat, lng: m.lng }, { lat: s.lat, lng: s.lng })
            if (d < best) { best = d; name = s.name }
          }
          nearestLabel = t('mesh.nearShelter', { name, d: best })
        }
        byId.set(m.senderId, {
          senderId: m.senderId,
          senderName: m.senderName || `${m.senderId.slice(0, 8)}…`,
          layer: m.layer as SosLayer,
          lat: m.lat, lng: m.lng, text: m.text, ts: m.ts, nearestLabel,
        })
      }
    }
    return [...byId.values()].sort((a, b) => b.ts - a.ts)
  }, [messages, shelters, t])

  const mapPeers: MeshPeerView[] = entries
    .filter(e => e.lat != null && e.lng != null)
    .map(e => ({ id: e.senderId, name: e.senderName, connectedAt: '', online: true, lat: e.lat, lng: e.lng, nearestLabel: e.nearestLabel }))

  // 沿原連線回覆求救者（顯示為對方端的系統訊息）
  const reply = (senderId: string, text: string) => {
    if (!text.trim()) return
    const m: MeshMessage = {
      msgId: genId(), type: 'system', text: `【${t('rescue.title')}】${text}`,
      senderId: myId || RESCUE_CENTER_ID, senderName: t('rescue.title'), ts: Date.now(),
    }
    sendTo(senderId, m)
    setReplyDraft(prev => ({ ...prev, [senderId]: '' }))
  }

  const setStatus = (senderId: string, status: SosStatus) => {
    setStatusMap(prev => ({ ...prev, [senderId]: status }))
    if (status === 'resolved') reply(senderId, t('rescue.resolvedReply'))
    else if (status === 'handling') reply(senderId, t('rescue.handlingReply'))
  }

  const layerBadge = (layer: SosLayer) =>
    layer === 'C'
      ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-600/30 text-purple-300">{t('mesh.layer.C')}</span>
      : <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-status-danger/30 text-status-danger">{t('mesh.layer.B')}</span>

  const statusBadge = (s: SosStatus) =>
    s === 'resolved'
      ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-status-safe/25 text-status-safe flex items-center gap-1"><CheckCircle2 size={10} />{t('rescue.statusResolved')}</span>
      : s === 'handling'
        ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-status-caution/25 text-status-caution flex items-center gap-1"><Loader2 size={10} />{t('rescue.statusHandling')}</span>
        : <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/10 text-white/60">{t('rescue.statusActive')}</span>

  return (
    <div className="min-h-screen bg-neutral-950 text-white px-4 py-4 lg:h-screen lg:flex lg:flex-col">
      {/* 指揮中心抬頭 */}
      <div className="glass rounded-2xl px-4 py-3 flex items-center gap-3 mb-3">
        <ShieldAlert size={26} className="text-white shrink-0" />
        <div className="min-w-0">
          <h1 className="text-lg font-bold leading-tight">{t('rescue.title')}</h1>
          <p className="text-xs text-white/50">{t('rescue.subtitle')}</p>
        </div>
        <div className="ml-auto text-right shrink-0">
          {loading
            ? <span className="text-xs text-white/45 animate-pulse">{t('mesh.connecting')}</span>
            : error
              ? <span className="text-xs text-status-caution">{t('rescue.idTaken')}</span>
              : <span className="text-xs text-status-safe flex items-center gap-1 justify-end"><Radio size={11} />{t('rescue.online')}</span>}
          <p className="text-[10px] text-white/35 font-mono mt-0.5">{myId || RESCUE_CENTER_ID}</p>
        </div>
      </div>

      <div className="lg:grid lg:grid-cols-[1fr_1fr_1.1fr] lg:gap-4 lg:flex-1 lg:min-h-0">
        {/* 求救清單 */}
        <div className="glass rounded-3xl p-4 mb-3 lg:mb-0 flex flex-col lg:min-h-0">
          <p className="text-xs text-white/45 uppercase tracking-wider mb-3">{t('rescue.count', { n: entries.length })}</p>
          <div className="flex-1 overflow-y-auto no-scrollbar space-y-2">
            {entries.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-16 text-white/30">
                <Radio size={26} className="mb-2 opacity-40" />
                <p className="text-sm">{t('rescue.empty')}</p>
              </div>
            ) : entries.map(e => {
              const st = statusMap[e.senderId] ?? 'active'
              return (
                <div key={e.senderId} className={`glass-cell rounded-2xl px-3 py-2.5 border ${st === 'resolved' ? 'border-status-safe/30 opacity-75' : 'border-status-danger/30'}`}>
                  <div className="flex items-center gap-2">
                    {st !== 'resolved' && <span className="w-2 h-2 rounded-full bg-status-danger animate-ping shrink-0" />}
                    <span className="text-sm font-semibold flex-1 truncate">{e.senderName}</span>
                    {layerBadge(e.layer)}
                    <span className="text-[10px] text-white/40 flex items-center gap-1"><Clock size={10} />{new Date(e.ts).toLocaleTimeString()}</span>
                  </div>
                  <p className="text-[10px] text-white/35 font-mono mt-0.5 truncate">{e.senderId}</p>
                  {e.text && <p className="text-xs text-white/80 mt-1">{e.text}</p>}
                  <p className="text-[11px] text-white/50 mt-1 flex items-center gap-1">
                    <MapPin size={11} className="text-white/55" />
                    {e.lat != null ? `${e.lat.toFixed(4)}, ${e.lng?.toFixed(4)}` : t('rescue.noPos')}
                    {e.nearestLabel && <span className="text-white/35">· {e.nearestLabel}</span>}
                  </p>

                  {/* 狀態 + 操作 */}
                  <div className="flex items-center gap-2 mt-2">
                    {statusBadge(st)}
                    <div className="ml-auto flex gap-1.5">
                      {st === 'active' && (
                        <button onClick={() => setStatus(e.senderId, 'handling')}
                          className="text-[10px] glass-cell px-2 py-1 rounded-full text-status-caution">{t('rescue.markHandling')}</button>
                      )}
                      {st !== 'resolved' && (
                        <button onClick={() => setStatus(e.senderId, 'resolved')}
                          className="text-[10px] bg-status-safe/20 text-status-safe px-2 py-1 rounded-full">{t('rescue.markResolved')}</button>
                      )}
                    </div>
                  </div>

                  {/* 回覆框 */}
                  <div className="flex gap-1.5 mt-2">
                    <input
                      value={replyDraft[e.senderId] ?? ''}
                      onChange={ev => setReplyDraft(prev => ({ ...prev, [e.senderId]: ev.target.value }))}
                      onKeyDown={ev => { if (ev.key === 'Enter') reply(e.senderId, replyDraft[e.senderId] ?? '') }}
                      placeholder={t('rescue.replyPlaceholder')}
                      className="flex-1 glass-cell text-white text-xs rounded-full px-3 py-1.5 outline-none placeholder-white/30" />
                    <button onClick={() => reply(e.senderId, replyDraft[e.senderId] ?? '')}
                      disabled={!(replyDraft[e.senderId] ?? '').trim()}
                      className="bg-white disabled:opacity-30 text-neutral-900 p-1.5 rounded-full shrink-0"><Send size={13} /></button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* 群眾回報（可標記已處理 → 廣播通知並從各端移除） */}
        <div className="glass rounded-3xl p-4 mb-3 lg:mb-0 flex flex-col lg:min-h-0">
          <p className="text-xs text-white/45 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <MessageSquare size={12} />{t('rescue.reports', { n: activeReports.length })}
          </p>
          <div className="flex-1 overflow-y-auto no-scrollbar space-y-2">
            {activeReports.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-16 text-white/30">
                <MessageSquare size={24} className="mb-2 opacity-40" />
                <p className="text-sm">{t('rescue.noReports')}</p>
              </div>
            ) : activeReports.slice().reverse().map(r => (
              <div key={r.id} className="glass-cell rounded-2xl p-3">
                <ReportCard
                  report={r}
                  clientId={cid}
                  onVote={dir => { const u = voteReport(r.id, dir, cid); if (u) shareReport(u) }}
                  onResolve={() => { const u = resolveReport(r.id, t('rescue.resolvedNote')); if (u) shareReport(u) }}
                />
              </div>
            ))}
          </div>
        </div>

        {/* 地圖 */}
        <div className="glass rounded-3xl p-4 flex flex-col lg:min-h-0">
          <p className="text-xs text-white/45 uppercase tracking-wider mb-2">{t('mesh.mapTitle')}</p>
          <div className="flex-1 min-h-[300px]">
            <MeshMap myPos={DEFAULT_LOC} peers={mapPeers} flashId={null} meLabel={t('rescue.title')} noPosLabel={t('rescue.noPos')} />
          </div>
        </div>
      </div>
    </div>
  )
}
