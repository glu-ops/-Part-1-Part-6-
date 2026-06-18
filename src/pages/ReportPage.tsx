import { useState, useRef } from 'react'
import { CheckCircle, MapPin, LocateFixed, Loader2, ImagePlus, X } from 'lucide-react'
import { useShelters } from '../contexts/ShelterContext'
import { useUser } from '../contexts/UserContext'
import { useI18n } from '../i18n'
import { useIsDesktop } from '../hooks'
import LocationPicker from '../components/Map/LocationPicker'
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

export default function ReportPage() {
  const { shelters, addReport, reports } = useShelters()
  const { userLoc, locateMe, locating } = useUser()
  const { t, rt } = useI18n()
  const isDesktop = useIsDesktop()
  const [type, setType] = useState<ReportType>('crowd')
  const [severity, setSeverity] = useState<ResourceStatus>('green')
  const [shelterId, setShelterId] = useState('')
  const [note, setNote] = useState('')
  const [loc, setLoc] = useState(userLoc)
  const [files, setFiles] = useState<{ url: string; name: string }[]>([])
  const [done, setDone] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  function addFiles(list: FileList | null) {
    if (!list) return
    const next = Array.from(list).map(f => ({ url: URL.createObjectURL(f), name: f.name }))
    setFiles(prev => [...prev, ...next])
  }

  function submit() {
    const r: CrowdReport = {
      id: `R${Date.now()}`,
      shelter_id: shelterId || null,
      type, severity, note,
      reported_at: new Date().toISOString(),
      lat: loc.lat, lng: loc.lng,
    }
    addReport(r)
    setDone(true)
    setTimeout(() => { setDone(false); setNote(''); setFiles([]) }, 3000)
  }

  const recent = reports.slice().reverse().slice(0, 6)

  const panel = (
    <>
      <div className="px-4 pt-4 pb-2 shrink-0">
        <h1 className="text-xl font-bold text-white">{t('report.title')}</h1>
      </div>

      <div className="flex-1 lg:overflow-y-auto no-scrollbar px-4 space-y-3 pb-3">
        {done && (
          <div className="glass-soft rounded-2xl p-3 flex items-center gap-3 border border-status-safe/30">
            <CheckCircle size={20} className="text-status-safe" />
            <span className="text-status-safe font-semibold text-sm">{t('report.success')}</span>
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
            <button onClick={() => { locateMe().then(setLoc).catch(() => {}) }}
              className="flex items-center gap-1 text-[11px] text-white glass-cell rounded-full px-2.5 py-1 shrink-0">
              {locating ? <Loader2 size={12} className="animate-spin" /> : <LocateFixed size={12} />}{t('report.locate')}
            </button>
          </div>
          {/* 行動版：內嵌選點地圖 */}
          {!isDesktop && (
            <LocationPicker value={loc} onChange={setLoc} />
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
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] glass-cell text-white/55 px-2 py-0.5 rounded-full">{t(`rt.${r.type}`)}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full glass-cell ${r.severity === 'green' ? 'text-status-safe' : r.severity === 'yellow' ? 'text-status-caution' : 'text-status-danger'}`}>{t(`report.sev.${r.severity}`)}</span>
                    <span className="text-[10px] text-white/40 ml-auto">{rt(r.reported_at)}</span>
                  </div>
                  {r.note && <p className="text-sm text-white/85">{r.note}</p>}
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
          <LocationPicker value={loc} onChange={setLoc} className="w-full h-full" showContext />
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
