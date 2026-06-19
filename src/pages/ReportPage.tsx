import { useEffect, useState, useRef } from 'react'
import { CheckCircle, MapPin, LocateFixed, Loader2, ImagePlus, X } from 'lucide-react'
import { useShelters, getClientId } from '../contexts/ShelterContext'
import { useUser } from '../contexts/UserContext'
import { useMesh } from '../contexts/MeshContext'
import { useI18n } from '../i18n'
import { useIsDesktop } from '../hooks'
import LocationPicker from '../components/Map/LocationPicker'
import ReportCard from '../components/Report/ReportCard'
import { downscaleImage } from '../utils/image'
import type { CrowdReport, ReportType, ResourceStatus } from '../types'

const TYPES: { value: ReportType; key: string }[] = [
  { value: 'crowd', key: 'report.type.crowd' },
  { value: 'road', key: 'report.type.road' },
  { value: 'resource', key: 'report.type.resource' },
  { value: 'disaster', key: 'report.type.disaster' },
]
const SEV: { value: ResourceStatus; key: string; cls: string }[] = [
  { value: 'green', key: 'report.sev.green', cls: 'border-status-safe text-status-safe' },
  { value: 'yellow', key: 'report.sev.yellow', cls: 'border-status-caution text-status-caution' },
  { value: 'red', key: 'report.sev.red', cls: 'border-status-danger text-status-danger' },
]

function makeReportId(clientId: string): string {
  const randomId = globalThis.crypto?.randomUUID?.()
  return randomId ? `R-${randomId}` : `R-${Date.now()}-${clientId}-${Math.random().toString(36).slice(2, 8)}`
}

export default function ReportPage() {
  const { shelters, addReport, activeReports, voteReport } = useShelters()
  const { userLoc, locateMe, locating } = useUser()
  const { shareReport } = useMesh()
  const { t } = useI18n()
  const isDesktop = useIsDesktop()
  const cid = getClientId()
  const [type, setType] = useState<ReportType>('crowd')
  const [severity, setSeverity] = useState<ResourceStatus>('green')
  const [shelterId, setShelterId] = useState('')
  const [note, setNote] = useState('')
  const [loc, setLoc] = useState(userLoc)
  const [files, setFiles] = useState<{ url: string; name: string }[]>([])
  const [done, setDone] = useState(false)
  const [saveWarning, setSaveWarning] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const locTouched = useRef(false)

  useEffect(() => {
    if (!locTouched.current) setLoc(userLoc)
  }, [userLoc])

  function setPickedLoc(next: typeof loc) {
    locTouched.current = true
    setLoc(next)
  }

  async function addFiles(list: FileList | null) {
    if (!list) return
    // 壓縮成 base64（可持久化 + 可透過 Mesh 傳遞）
    const next = await Promise.all(
      Array.from(list).map(async f => ({ url: await downscaleImage(f), name: f.name })),
    )
    setFiles(prev => [...prev, ...next])
  }

  function submit() {
    const r: CrowdReport = {
      id: makeReportId(cid),
      shelter_id: shelterId || null,
      type, severity, note,
      reported_at: new Date().toISOString(),
      lat: loc.lat, lng: loc.lng,
      photos: files.map(f => f.url),
      upVoters: [], downVoters: [],
      status: 'active',
      author: cid,
      version: 1,
    }
    const saved = addReport(r)
    shareReport(r)   // 透過 Mesh 廣播給其他節點
    setSaveWarning(!saved)
    setDone(true)
    setTimeout(() => { setDone(false); setSaveWarning(false); setNote(''); setFiles([]) }, 3000)
  }

  const recent = activeReports.slice().reverse().slice(0, 6)
  const onVote = (id: string, dir: 'up' | 'down') => { const u = voteReport(id, dir, cid); if (u) shareReport(u) }

  const panel = (
    <>
      <div className="px-4 pt-4 pb-2 shrink-0">
        <h1 className="text-xl font-bold text-white">{t('report.title')}</h1>
      </div>

      <div className="flex-1 lg:overflow-y-auto no-scrollbar px-4 space-y-3 pb-3">
        {done && (
          <div className={`glass-soft rounded-2xl p-3 flex items-center gap-3 border ${saveWarning ? 'border-status-caution/40' : 'border-status-safe/30'}`}>
            <CheckCircle size={20} className={saveWarning ? 'text-status-caution' : 'text-status-safe'} />
            <span className={`${saveWarning ? 'text-status-caution' : 'text-status-safe'} font-semibold text-sm`}>
              {saveWarning ? '已送出，但本機儲存空間不足，重新整理後可能遺失。' : t('report.success')}
            </span>
          </div>
        )}

        {/* Type */}
        <div className="glass-cell rounded-2xl p-4">
          <label className="text-xs text-white/45 block mb-3">{t('report.type')}</label>
          <div className="grid grid-cols-2 gap-2">
            {TYPES.map(ty => (
              <button key={ty.value} onClick={() => setType(ty.value)}
                className={`py-2.5 rounded-xl text-sm font-medium transition-colors ${type === ty.value ? 'bg-white text-neutral-900' : 'glass-cell text-white/65'}`}>
                {t(ty.key)}
              </button>
            ))}
          </div>
        </div>

        {/* Shelter */}
        <div className="glass-cell rounded-2xl p-4">
          <label className="text-xs text-white/45 block mb-2">{t('report.relatedShelter')}</label>
          <select value={shelterId} onChange={e => setShelterId(e.target.value)}
            className="w-full glass-cell text-white text-sm rounded-lg px-3 py-2 outline-none">
            <option value="">{t('report.none')}</option>
            {shelters.map(s => (<option key={s.shelter_id} value={s.shelter_id}>{s.name}</option>))}
          </select>
        </div>

        {/* Severity */}
        <div className="glass-cell rounded-2xl p-4">
          <label className="text-xs text-white/45 block mb-3">{t('report.severity')}</label>
          <div className="flex gap-2">
            {SEV.map(s => (
              <button key={s.value} onClick={() => setSeverity(s.value)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-bold border-2 transition-colors ${severity === s.value ? s.cls + ' bg-white/5' : 'border-white/10 text-white/40'}`}>
                {t(s.key)}
              </button>
            ))}
          </div>
        </div>

        {/* 回報位置 */}
        <div className="glass-cell rounded-2xl p-4">
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs text-white/45 flex items-center gap-1.5">
              <MapPin size={13} className="text-white/60" />{t('report.location')}
            </label>
            <button onClick={() => { locateMe().then(setPickedLoc).catch(() => {}) }}
              className="flex items-center gap-1 text-[11px] text-white glass-cell rounded-full px-2.5 py-1 shrink-0">
              {locating ? <Loader2 size={12} className="animate-spin" /> : <LocateFixed size={12} />}{t('report.locate')}
            </button>
          </div>
          {/* 行動版：內嵌選點地圖 */}
          {!isDesktop && (
            <LocationPicker value={loc} onChange={setPickedLoc} />
          )}
          <p className="text-[11px] text-white/45 mt-2 num">{t('report.coords', { lat: loc.lat.toFixed(5), lng: loc.lng.toFixed(5) })}</p>
        </div>

        {/* Note */}
        <div className="glass-cell rounded-2xl p-4">
          <label className="text-xs text-white/45 block mb-2">{t('report.note')}</label>
          <textarea value={note} onChange={e => setNote(e.target.value)} placeholder={t('report.notePlaceholder')} rows={3}
            className="w-full glass-cell text-white text-sm rounded-xl px-3 py-2.5 outline-none resize-none placeholder-white/35" />
        </div>

        {/* 附件上傳 */}
        <div className="glass-cell rounded-2xl p-4">
          <label className="text-xs text-white/45 block mb-2">{t('report.attachments')}</label>
          <button onClick={() => fileRef.current?.click()}
            className="w-full border border-dashed border-white/25 rounded-xl py-5 flex flex-col items-center gap-1.5 text-white/45 hover:text-white/70 hover:border-white/40 transition-colors">
            <ImagePlus size={20} />
            <span className="text-[11px]">{t('report.dropHint')}</span>
          </button>
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={e => addFiles(e.target.files)} />
          {files.length > 0 && (
            <div className="grid grid-cols-4 gap-2 mt-2">
              {files.map((f, i) => (
                <div key={i} className="relative aspect-square rounded-lg overflow-hidden glass-cell">
                  <img src={f.url} alt={f.name} className="w-full h-full object-cover" />
                  <button onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))}
                    className="absolute top-0.5 right-0.5 bg-black/60 rounded-full p-0.5 text-white/80">
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 最近回報 */}
        {recent.length > 0 && (
          <div className="glass-cell rounded-2xl p-4">
            <p className="text-xs text-white/45 uppercase tracking-wider mb-3">{t('report.recent')}</p>
            <div className="space-y-2">
              {recent.map(r => (
                <div key={r.id} className="glass-cell rounded-xl p-3">
                  <ReportCard report={r} clientId={cid} onVote={dir => onVote(r.id, dir)} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="px-4 py-3 shrink-0 border-t border-white/10">
        <button onClick={submit} disabled={!note.trim()}
          className="w-full bg-white disabled:opacity-30 text-neutral-900 font-bold rounded-full py-3">
          {t('report.submit')}
        </button>
      </div>
    </>
  )

  return (
    <div className="lg:fixed lg:inset-0">
      {/* 桌面：右側全幅地圖（可點選回報位置 + 顯示避難所/回報/災害範圍） */}
      {isDesktop && (
        <div className="absolute inset-0">
          <LocationPicker value={loc} onChange={setPickedLoc} className="w-full h-full" showContext />
        </div>
      )}

      {/* 面板 */}
      <div className="min-h-screen pt-14 pb-24 max-w-2xl mx-auto flex flex-col
        lg:min-h-0 lg:pt-0 lg:pb-0 lg:max-w-none
        lg:absolute lg:left-4 lg:top-20 lg:bottom-4 lg:w-[380px] lg:z-[500]
        lg:glass lg:rounded-3xl lg:overflow-hidden">
        {panel}
      </div>
    </div>
  )
}
