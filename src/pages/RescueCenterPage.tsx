import { useMemo, useCallback } from 'react'
import { ShieldAlert, Radio, MapPin, Clock, MessageSquare } from 'lucide-react'
import { useI18n } from '../i18n'
import { useShelters, getClientId } from '../contexts/ShelterContext'
import { usePeerMesh, RESCUE_CENTER_ID } from '../hooks/usePeerMesh'
import MeshMap from '../components/Map/MeshMap'
import type { MeshPeerView } from '../components/Map/MeshMap'
import ReportCard from '../components/Report/ReportCard'
import type { CrowdReport } from '../types'
import { DEFAULT_LOC, distanceMeters } from '../utils/geo'

interface SosEntry {
  senderId: string
  lat?: number
  lng?: number
  text?: string
  ts: number
  nearestLabel?: string
}

export default function RescueCenterPage() {
  const { t } = useI18n()
  const { shelters, activeReports, mergeReport, resolveReport, voteReport } = useShelters()
  const cid = getClientId()
  const onReport = useCallback((r: CrowdReport) => { mergeReport(r) }, [mergeReport])
  const { myId, loading, error, messages, shareReport } = usePeerMesh({ fixedId: RESCUE_CENTER_ID, onReport })

  // 只取 B 層公共 SOS，依求救者去重保留最新
  const entries: SosEntry[] = useMemo(() => {
    const byId = new Map<string, SosEntry>()
    for (const m of messages) {
      if (m.type !== 'sos' || m.layer !== 'B') continue
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
        byId.set(m.senderId, { senderId: m.senderId, lat: m.lat, lng: m.lng, text: m.text, ts: m.ts, nearestLabel })
      }
    }
    return [...byId.values()].sort((a, b) => b.ts - a.ts)
  }, [messages, shelters, t])

  const mapPeers: MeshPeerView[] = entries
    .filter(e => e.lat != null && e.lng != null)
    .map(e => ({ id: e.senderId, connectedAt: '', lat: e.lat, lng: e.lng, nearestLabel: e.nearestLabel }))

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
            ) : entries.map(e => (
              <div key={e.senderId} className="glass-cell rounded-2xl px-3 py-2.5 border border-status-danger/30">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-status-danger animate-ping shrink-0" />
                  <span className="font-mono text-sm font-semibold flex-1 truncate">{e.senderId.slice(0, 10)}…</span>
                  <span className="text-[10px] text-white/40 flex items-center gap-1"><Clock size={10} />{new Date(e.ts).toLocaleTimeString()}</span>
                </div>
                {e.text && <p className="text-xs text-white/80 mt-1">{e.text}</p>}
                <p className="text-[11px] text-white/50 mt-1 flex items-center gap-1">
                  <MapPin size={11} className="text-white/55" />
                  {e.lat != null ? `${e.lat.toFixed(4)}, ${e.lng?.toFixed(4)}` : t('rescue.noPos')}
                  {e.nearestLabel && <span className="text-white/35">· {e.nearestLabel}</span>}
                </p>
              </div>
            ))}
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
