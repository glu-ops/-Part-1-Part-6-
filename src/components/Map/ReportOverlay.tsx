import { useState, useRef, useEffect } from 'react'
import { Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import { ImagePlus, Send, X } from 'lucide-react'
import { useShelters, getClientId } from '../../contexts/ShelterContext'
import type { ReportThread } from '../../contexts/ShelterContext'
import { useMesh } from '../../contexts/MeshContext'
import { useIdentity } from '../../contexts/IdentityContext'
import { useI18n } from '../../i18n'
import ReportCard from '../Report/ReportCard'
import { filesToAttachments } from '../../utils/image'
import type { ResourceStatus, CrowdReport, Attachment } from '../../types'

// 群眾回報為單色（白）菱形，嚴重度以不透明度區分；多人補充串加紅色人數徽章
const ALPHA: Record<ResourceStatus, number> = { green: 0.25, yellow: 0.5, red: 0.85 }
function threadIcon(sev: ResourceStatus, count: number): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<div style="position:relative;width:18px;height:18px;">
      <div style="width:18px;height:18px;background:rgba(255,255,255,${ALPHA[sev]});border:1.5px solid rgba(255,255,255,.9);border-radius:4px;transform:rotate(45deg);box-shadow:0 0 8px rgba(255,255,255,.4);"></div>
      ${count > 1 ? `<span style="position:absolute;top:-8px;right:-8px;background:#B30303;color:#fff;font-size:9px;font-weight:700;border-radius:9px;min-width:15px;height:15px;display:flex;align-items:center;justify-content:center;padding:0 3px;">${count}</span>` : ''}
    </div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    popupAnchor: [0, -10],
  })
}

function makeId(cid: string): string {
  const rid = globalThis.crypto?.randomUUID?.()
  return rid ? `R-${rid}` : `R-${Date.now()}-${cid}-${Math.random().toString(36).slice(2, 8)}`
}

function ThreadPopup({ thread }: { thread: ReportThread }) {
  const { addReport, voteReport } = useShelters()
  const { shareReport } = useMesh()
  const { name } = useIdentity()
  const { t } = useI18n()
  const cid = getClientId()
  const [note, setNote] = useState('')
  const [files, setFiles] = useState<Attachment[]>([])
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const onVote = (id: string, dir: 'up' | 'down') => { const u = voteReport(id, dir, cid); if (u) shareReport(u) }

  const pickFiles = async (list: FileList | null) => {
    if (!list || !list.length) return
    setBusy(true)
    const { attachments } = await filesToAttachments(list)
    setFiles(prev => [...prev, ...attachments])
    setBusy(false)
  }

  // 補充回報：沿用同 threadId 與最新一筆的位置/類型，形成回報串（可附圖/影片/檔）
  const addSupplement = () => {
    if (!note.trim() && files.length === 0) return
    const base = thread.latest
    const r: CrowdReport = {
      id: makeId(cid), shelter_id: base.shelter_id,
      type: base.type, severity: base.severity, note: note.trim(),
      reported_at: new Date().toISOString(), lat: base.lat, lng: base.lng,
      photos: [], attachments: files, upVoters: [], downVoters: [], status: 'active',
      author: cid, authorName: name || undefined, threadId: thread.threadId, version: 1,
    }
    addReport(r); shareReport(r); setNote(''); setFiles([])
  }

  return (
    <div className="text-white" style={{ minWidth: 230, maxWidth: 270 }}>
      {thread.reports.length > 1 && (
        <p className="text-[10px] text-white/45 mb-1.5">{t('report.threadCount', { n: thread.reports.length })}</p>
      )}
      <div className="space-y-2 max-h-[40vh] overflow-y-auto thin-scrollbar pr-1">
        {thread.reports.map((r, i) => (
          <div key={r.id} className={i > 0 ? 'border-t border-white/10 pt-2' : ''}>
            <ReportCard report={r} clientId={cid} onVote={dir => onVote(r.id, dir)} compact />
          </div>
        ))}
      </div>

      {/* 補充回報（多人接力描述事件演變，支援附件） */}
      {thread.status !== 'resolved' && (
        <div className="mt-2 pt-2 border-t border-white/10 space-y-1.5">
          {files.length > 0 && (
            <div className="grid grid-cols-4 gap-1">
              {files.map((f, i) => (
                <div key={i} className="relative aspect-square rounded-md overflow-hidden glass-cell flex items-center justify-center">
                  {f.kind === 'image'
                    ? <img src={f.url} alt={f.name} className="w-full h-full object-cover" />
                    : <span className="text-[8px] text-white/60 px-0.5 text-center break-all">{f.kind === 'video' ? '🎬' : '📎'} {f.name.slice(0, 8)}</span>}
                  <button onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))}
                    className="absolute top-0 right-0 bg-black/60 rounded-bl p-0.5"><X size={9} /></button>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-1.5">
            <button onClick={() => fileRef.current?.click()} disabled={busy}
              className="glass-cell text-white/70 p-1.5 rounded-full shrink-0"><ImagePlus size={14} /></button>
            <input ref={fileRef} type="file" accept="image/*,video/*,*/*" multiple className="hidden"
              onChange={e => { pickFiles(e.target.files); e.target.value = '' }} />
            <input value={note} onChange={e => setNote(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addSupplement() }}
              placeholder={t('report.supplementHint')}
              className="flex-1 glass-cell text-white text-xs rounded-full px-3 py-1.5 outline-none placeholder-white/30" />
            <button onClick={addSupplement} disabled={!note.trim() && files.length === 0}
              className="bg-white disabled:opacity-30 text-neutral-900 p-1.5 rounded-full shrink-0"><Send size={13} /></button>
          </div>
        </div>
      )}
    </div>
  )
}

/** 地圖回報層：同 threadId 的多人回報合併為單一標記（帶人數徽章），點開看回報串。
 *  focus（{id,nonce}）改變時自動開啟對應回報串的 popup（通知中心定位用）。 */
export default function ReportOverlay({ focus }: { focus?: { id: string; nonce: number } | null }) {
  const { reportThreads } = useShelters()
  const refs = useRef<Map<string, L.Marker>>(new Map())

  useEffect(() => {
    if (!focus) return
    const t = setTimeout(() => refs.current.get(focus.id)?.openPopup(), 750)
    return () => clearTimeout(t)
  }, [focus])

  return (
    <>
      {reportThreads
        .filter(th => th.status !== 'resolved' && th.latest.lat && th.latest.lng)
        .map(th => (
          <Marker
            key={th.threadId}
            position={[th.latest.lat, th.latest.lng]}
            icon={threadIcon(th.latest.severity, th.reports.length)}
            ref={(m: L.Marker | null) => { if (m) refs.current.set(th.threadId, m); else refs.current.delete(th.threadId) }}
          >
            <Popup>
              <ThreadPopup thread={th} />
            </Popup>
          </Marker>
        ))}
    </>
  )
}
