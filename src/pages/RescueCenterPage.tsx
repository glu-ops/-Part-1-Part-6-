import { useCallback, useRef, useState } from 'react'
import { Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import { ShieldAlert, Radio, MessageSquare, Megaphone, Send } from 'lucide-react'
import { useI18n } from '../i18n'
import { useShelters, getClientId } from '../contexts/ShelterContext'
import { usePeerMesh, RESCUE_CENTER_ID } from '../hooks/usePeerMesh'
import { useSosStore } from '../hooks/useSosStore'
import { useSosSync } from '../hooks/useSosSync'
import { useAnnounceSync } from '../hooks/useAnnounceSync'
import { isSosClosed, PRIORITY_COLOR } from '../sos'
import type { MeshMessage } from '../hooks/usePeerMesh'
import MeshMap from '../components/Map/MeshMap'
import ReportThreadCard from '../components/Report/ReportThreadCard'
import SosBoard from '../components/Mesh/SosBoard'
import ShelterAiPanel from '../components/Rescue/ShelterAiPanel'
import type { CrowdReport, SosEvent, SosReply, SosStatus, SosReplyKind, HandleStatus, ResourceStatus, Announcement, AnnounceLevel } from '../types'
import { DEFAULT_LOC } from '../utils/geo'

function genId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

// 回報地圖標記（白菱形 + 嚴重度透明度 + 多人補充人數徽章）
const ALPHA: Record<ResourceStatus, number> = { green: 0.25, yellow: 0.5, red: 0.85 }
function reportIcon(sev: ResourceStatus, count: number): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<div style="position:relative;width:18px;height:18px;">
      <div style="width:18px;height:18px;background:rgba(255,255,255,${ALPHA[sev]});border:1.5px solid rgba(255,255,255,.9);border-radius:4px;transform:rotate(45deg);box-shadow:0 0 8px rgba(255,255,255,.4);"></div>
      ${count > 1 ? `<span style="position:absolute;top:-8px;right:-8px;background:#B30303;color:#fff;font-size:9px;font-weight:700;border-radius:9px;min-width:15px;height:15px;display:flex;align-items:center;justify-content:center;padding:0 3px;">${count}</span>` : ''}
    </div>`,
    iconSize: [18, 18], iconAnchor: [9, 9], popupAnchor: [0, -10],
  })
}

export default function RescueCenterPage() {
  const { t } = useI18n()
  const { reportThreads, reports, mergeReport, setThreadStatus, voteReport } = useShelters()
  const reportsRef = useRef(reports)   // 同步用：含 resolved，讓市民端重連也能移除已處理 marker
  reportsRef.current = reports
  const cid = getClientId()
  const sos = useSosStore()

  // ── 廣播公告（指揮中心 → 全體市民）：輸入內容 + 重要程度 + 已發布歷史（持久化）──
  const ANN_KEY = 'guardian_announcements'
  const [annText, setAnnText] = useState('')
  const [annLevel, setAnnLevel] = useState<AnnounceLevel>('info')
  const [announcements, setAnnouncements] = useState<Announcement[]>(() => {
    try { return JSON.parse(localStorage.getItem(ANN_KEY) ?? '[]') as Announcement[] } catch { return [] }
  })
  const announcementsRef = useRef(announcements)
  announcementsRef.current = announcements

  const onReport = useCallback((r: CrowdReport) => { mergeReport(r) }, [mergeReport])
  const onSosEvent = useCallback((s: SosEvent) => { sos.mergeRemote(s) }, [sos])
  // 重連同步：把指揮中心已知的未結案 SOS + 進行中回報推回給新連上的市民（hub 轉發）
  const getSyncMessages = useCallback((): MeshMessage[] => {
    const sosMsgs: MeshMessage[] = sos.getOpenEvents().map(e => ({
      msgId: genId(), type: 'sosEvent', eventId: e.id, version: e.version,
      sos: e, layer: e.layer, senderId: e.senderId, senderName: e.senderName, ts: Date.now(),
    }))
    const reportMsgs: MeshMessage[] = [...reportsRef.current]
      .sort((a, b) => +new Date(b.reported_at) - +new Date(a.reported_at))
      .slice(0, 25)
      .map(r => ({
        msgId: genId(), type: 'report' as const, eventId: r.id, version: r.version,
        report: r, senderId: r.author ?? RESCUE_CENTER_ID, senderName: r.authorName, ts: Date.now(),
      }))
    // 最近 10 則公告：讓晚連線 / 重連的市民也能補收（依 id 在市民端去重）
    const annMsgs: MeshMessage[] = announcementsRef.current.slice(0, 10).map(a => ({
      msgId: genId(), type: 'announce' as const, eventId: a.id, announce: a,
      senderId: RESCUE_CENTER_ID, senderName: a.from, ts: a.ts,
    }))
    return [...sosMsgs, ...reportMsgs, ...annMsgs]
  }, [sos])

  const { myId, loading, error, shareReport, shareSosEvent, broadcastAnnounce } = usePeerMesh({
    fixedId: RESCUE_CENTER_ID, myName: t('rescue.title'), onReport, onSosEvent, getSyncMessages,
  })

  // 發布公告：建立 Announcement → P2P 廣播給所有市民 → 存入歷史（持久化）
  const sendAnnouncement = useCallback(() => {
    const text = annText.trim()
    if (!text) return
    const a: Announcement = { id: `ann-${genId()}`, level: annLevel, text, ts: Date.now(), from: t('rescue.title') }
    broadcastAnnounce(a)   // P2P 即時
    pushAnnounce(a)        // 共享後端（市民輪詢備援，跨 Vercel）
    setAnnouncements(prev => {
      const next = [a, ...prev].slice(0, 50)
      try { localStorage.setItem(ANN_KEY, JSON.stringify(next)) } catch { /* 容量不足忽略 */ }
      return next
    })
    setAnnText('')
  }, [annText, annLevel, broadcastAnnounce, t])

  // 共享後端同步（輪詢）：拉市民端的 SOS 新增/回覆/狀態 → 合併進指揮中心看板
  const { push: pushSos } = useSosSync(onSosEvent)
  // 公告共享後端：發布時 push，讓所有市民（即使 P2P 未連上）都輪詢得到
  const { push: pushAnnounce } = useAnnounceSync()
  // 私人（layer A）不寫入共享後端；B/C 同步給所有使用者
  const broadcastSos = useCallback((e: SosEvent) => { shareSosEvent(e); if (e.layer !== 'A') pushSos(e) }, [shareSosEvent, pushSos])

  // 指揮中心回覆 / 推進 SOS 狀態 → 寫入 store 並同步（P2P + 共享後端）
  const replySos = useCallback((sosId: string, text: string, kind?: SosReplyKind) => {
    const reply: SosReply = {
      id: genId(), fromId: myId || RESCUE_CENTER_ID, fromName: t('rescue.title'), text, ts: Date.now(),
      kind, offerHelp: kind === 'willing' || undefined,
    }
    const u = sos.addReply(sosId, reply); if (u) broadcastSos(u)
  }, [sos, broadcastSos, myId, t])

  const setSosStatusFn = useCallback((sosId: string, status: SosStatus) => {
    const u = sos.setStatus(sosId, status, t('rescue.title')); if (u) broadcastSos(u)
  }, [sos, broadcastSos, t])

  // 回報整串推進狀態 → 廣播每筆更新
  const onThreadStatus = (threadId: string, status: HandleStatus) => {
    const updated = setThreadStatus(threadId, status, status === 'resolved' ? t('rescue.resolvedNote') : undefined)
    updated.forEach(u => shareReport(u))
  }
  const onVote = (id: string, dir: 'up' | 'down') => { const u = voteReport(id, dir, cid); if (u) shareReport(u) }

  // 分類：未結案 / 已處理
  const activeThreads = reportThreads.filter(th => th.status !== 'resolved')
  const resolvedThreads = reportThreads.filter(th => th.status === 'resolved')

  // 地圖標記：SOS 發光點 + 回報菱形（皆可點開詳情）
  const openSos = sos.sosEvents.filter(e => !isSosClosed(e.status))
  const sosPoints = openSos.filter(e => e.lat != null && e.lng != null)
  const reportMarkers = activeThreads.filter(th => th.latest.lat && th.latest.lng).map(th => (
    <Marker key={th.threadId} position={[th.latest.lat, th.latest.lng]} icon={reportIcon(th.latest.severity, th.reports.length)}>
      <Popup>
        <div style={{ minWidth: 220, maxWidth: 260 }}>
          <ReportThreadCard thread={th} clientId={cid} onVote={onVote} onThreadStatus={status => onThreadStatus(th.threadId, status)} />
        </div>
      </Popup>
    </Marker>
  ))

  return (
    <div className="min-h-screen bg-transparent text-white px-4 py-4 lg:h-screen lg:flex lg:flex-col">
      {/* 指揮中心抬頭（誠實標示為系統內部模擬節點） */}
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
              : <span className="text-xs text-white/70 flex items-center gap-1 justify-end"><Radio size={11} />{t('rescue.online')}</span>}
          <p className="text-[10px] text-white/35 font-mono mt-0.5">{myId || RESCUE_CENTER_ID}</p>
        </div>
      </div>

      {/* 災情公告廣播：輸入內容＋重要程度，一鍵推送給全體市民 */}
      <div className="glass rounded-2xl px-4 py-3 mb-3">
        <p className="text-xs text-white/55 uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <Megaphone size={13} />{t('announce.title')}
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={annText}
            onChange={e => setAnnText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey || !e.shiftKey)) { e.preventDefault(); sendAnnouncement() } }}
            maxLength={200}
            placeholder={t('announce.placeholder')}
            className="flex-1 glass-cell rounded-xl px-3 py-2 text-sm text-white outline-none placeholder-white/35"
          />
          <div className="flex gap-2">
            <div className="flex glass-cell rounded-xl p-0.5">
              {(['info', 'warning', 'critical'] as AnnounceLevel[]).map(lv => (
                <button key={lv} onClick={() => setAnnLevel(lv)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    annLevel === lv
                      ? (lv === 'critical' ? 'bg-status-danger text-white' : lv === 'warning' ? 'bg-status-caution text-neutral-900' : 'bg-white/80 text-neutral-900')
                      : 'text-white/55'}`}>
                  {t(`announce.level.${lv}`)}
                </button>
              ))}
            </div>
            <button onClick={sendAnnouncement} disabled={!annText.trim()}
              className="bg-white disabled:opacity-30 text-neutral-900 font-bold rounded-xl px-4 py-2 text-sm flex items-center gap-1.5 shrink-0">
              <Send size={14} />{t('announce.send')}
            </button>
          </div>
        </div>
        {announcements.length > 0 && (
          <details className="mt-2">
            <summary className="text-[11px] text-white/40 cursor-pointer py-1">{t('announce.history', { n: announcements.length })}</summary>
            <div className="space-y-1 mt-1 max-h-32 overflow-y-auto thin-scrollbar">
              {announcements.map(a => (
                <div key={a.id} className="flex items-start gap-2 text-[11px] glass-cell rounded-lg px-2 py-1.5">
                  <span className={`mt-0.5 w-1.5 h-1.5 rounded-full shrink-0 ${a.level === 'critical' ? 'bg-status-danger' : a.level === 'warning' ? 'bg-status-caution' : 'bg-white/80'}`} />
                  <span className="text-white/80 flex-1 min-w-0">{a.text}</span>
                  <span className="text-white/30 shrink-0">{new Date(a.ts).toLocaleTimeString()}</span>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>

      {/* AI Camera 避難所監測（PDR §10）：監測節點啟停 + 狀態總覽 + 異常警示處理 */}
      <ShelterAiPanel />

      <div className="lg:grid lg:grid-cols-[1fr_1fr_1.1fr] lg:gap-4 lg:flex-1 lg:min-h-0">
        {/* 求救看板（B/C 層 SOS，可回覆與推進狀態） */}
        <div className="glass rounded-3xl p-4 mb-3 lg:mb-0 flex flex-col lg:min-h-0">
          <p className="text-xs text-white/45 uppercase tracking-wider mb-3">{t('rescue.count', { n: openSos.length })}</p>
          <div className="flex-1 overflow-y-auto thin-scrollbar">
            {sos.sosEvents.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-16 text-white/30">
                <Radio size={26} className="mb-2 opacity-40" />
                <p className="text-sm">{t('rescue.empty')}</p>
              </div>
            ) : (
              <SosBoard events={sos.sosEvents} myId={RESCUE_CENTER_ID} onReply={replySos} onStatus={setSosStatusFn} />
            )}
          </div>
        </div>

        {/* 群眾回報（合併為回報串，三段狀態：已收到 / 處理中 / 已處理） */}
        <div className="glass rounded-3xl p-4 mb-3 lg:mb-0 flex flex-col lg:min-h-0">
          <p className="text-xs text-white/45 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <MessageSquare size={12} />{t('rescue.reports', { n: activeThreads.length })}
          </p>
          <div className="flex-1 overflow-y-auto thin-scrollbar space-y-2">
            {activeThreads.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-16 text-white/30">
                <MessageSquare size={24} className="mb-2 opacity-40" />
                <p className="text-sm">{t('rescue.noReports')}</p>
              </div>
            ) : activeThreads.map(th => (
              <div key={th.threadId} className="glass-cell rounded-2xl p-3">
                <ReportThreadCard
                  thread={th} clientId={cid}
                  onVote={onVote}
                  onThreadStatus={status => onThreadStatus(th.threadId, status)}
                />
              </div>
            ))}
            {/* 已處理歷史（保留紀錄，不在地圖顯示） */}
            {resolvedThreads.length > 0 && (
              <details className="mt-2">
                <summary className="text-[11px] text-white/40 cursor-pointer py-1">{t('rescue.resolvedHistory', { n: resolvedThreads.length })}</summary>
                <div className="space-y-2 mt-1">
                  {resolvedThreads.map(th => (
                    <div key={th.threadId} className="glass-cell rounded-2xl p-3 opacity-70">
                      <ReportThreadCard thread={th} clientId={cid} />
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        </div>

        {/* 地圖：預設顯示 SOS 白點 + 回報菱形，點 marker 看詳情 */}
        <div className="glass rounded-3xl p-4 flex flex-col lg:min-h-0">
          {/* 圖例：與 mesh「即時位置」一致，置於標題列右側（不佔地圖空間） */}
          <div className="flex items-center gap-2 mb-2">
            <p className="text-xs text-white/45 uppercase tracking-wider">{t('mesh.mapTitle')}</p>
            <span className="ml-auto flex items-center gap-2 text-[10px] text-white/55 flex-wrap justify-end">
              <span className="flex items-center gap-1"><i className="w-2 h-2 rounded-full inline-block" style={{ background: '#315A58' }} />{t('rescue.title')}</span>
              <span className="text-white/35">|</span>
              <span className="flex items-center gap-1"><i className="w-2 h-2 rounded-full inline-block" style={{ background: PRIORITY_COLOR.high, boxShadow: `0 0 5px ${PRIORITY_COLOR.high}` }} />{t('sos.prio.high')}</span>
              <span className="flex items-center gap-1"><i className="w-2 h-2 rounded-full inline-block" style={{ background: PRIORITY_COLOR.medium, boxShadow: `0 0 5px ${PRIORITY_COLOR.medium}` }} />{t('sos.prio.medium')}</span>
              <span className="flex items-center gap-1"><i className="w-2 h-2 rounded-full inline-block" style={{ background: PRIORITY_COLOR.low, boxShadow: `0 0 5px ${PRIORITY_COLOR.low}` }} />{t('sos.prio.low')}</span>
              <span className="text-white/35">|</span>
              <span className="flex items-center gap-1"><i className="w-2 h-2 bg-white/70 inline-block rotate-45" />{t('home.legendReport')}</span>
            </span>
          </div>
          <div className="flex-1 min-h-[300px]">
            <MeshMap myPos={DEFAULT_LOC} peers={[]} flashId={null} meLabel={t('rescue.title')} noPosLabel={t('rescue.noPos')}
              sosPoints={sosPoints} extra={reportMarkers} />
          </div>
        </div>
      </div>
    </div>
  )
}
