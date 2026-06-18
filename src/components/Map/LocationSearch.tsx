import { useState, useRef, useEffect } from 'react'
import { Search, X, Loader2, MapPin } from 'lucide-react'
import { geocode } from '../../utils/geo'
import { useI18n } from '../../i18n'
import type { GeocodeResult } from '../../utils/geo'

interface Props {
  onSelect: (r: GeocodeResult) => void
  placeholder?: string
}

export default function LocationSearch({ onSelect, placeholder }: Props) {
  const { t } = useI18n()
  const ph = placeholder ?? t('search.placeholder')
  const [q, setQ] = useState('')
  const [results, setResults] = useState<GeocodeResult[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  // debounce 搜尋
  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) {
      setResults([])
      setError(null)
      return
    }
    const timer = setTimeout(async () => {
      abortRef.current?.abort()
      const ctrl = new AbortController()
      abortRef.current = ctrl
      setLoading(true)
      setError(null)
      try {
        const res = await geocode(term, ctrl.signal)
        setResults(res)
        setOpen(true)
        if (res.length === 0) setError(t('search.notFound'))
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setError(t('search.fail'))
      } finally {
        setLoading(false)
      }
    }, 450)
    return () => clearTimeout(timer)
  }, [q])

  function pick(r: GeocodeResult) {
    onSelect(r)
    setQ(r.name.split(',')[0])
    setOpen(false)
    setResults([])
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-2 glass rounded-xl px-3 py-2.5">
        <Search size={16} className="text-white/50 shrink-0" />
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          onFocus={() => results.length && setOpen(true)}
          placeholder={ph}
          className="flex-1 bg-transparent text-sm text-white outline-none placeholder-white/40 min-w-0"
        />
        {loading && <Loader2 size={15} className="text-white/70 animate-spin shrink-0" />}
        {!loading && q && (
          <button onClick={() => { setQ(''); setResults([]); setError(null) }} className="text-white/40 hover:text-white shrink-0">
            <X size={15} />
          </button>
        )}
      </div>

      {open && (results.length > 0 || error) && (
        <div className="absolute top-full left-0 right-0 mt-1.5 glass rounded-xl overflow-hidden max-h-64 overflow-y-auto no-scrollbar">
          {error && <p className="px-3 py-2.5 text-xs text-white/50">{error}</p>}
          {results.map((r, i) => (
            <button
              key={i}
              onClick={() => pick(r)}
              className="w-full flex items-start gap-2 px-3 py-2.5 text-left hover:bg-white/10 transition-colors border-b border-white/5 last:border-0"
            >
              <MapPin size={14} className="text-white/60 mt-0.5 shrink-0" />
              <span className="text-xs text-white/85 leading-snug">{r.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
