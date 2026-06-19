import { createContext, useContext, useState, useCallback, useRef } from 'react'
import type { ReactNode } from 'react'
import { AlertOctagon, CheckCircle } from 'lucide-react'
import { usePeerMesh } from '../hooks/usePeerMesh'
import type { MeshMessage } from '../hooks/usePeerMesh'
import { useShelters } from './ShelterContext'
import { useUser } from './UserContext'
import { useI18n } from '../i18n'
import type { CrowdReport } from '../types'

type MeshApi = ReturnType<typeof usePeerMesh>
interface MeshCtx extends MeshApi {
  sosFlashId: string | null
}

const MeshContext = createContext<MeshCtx | null>(null)

/**
 * 全 App 共用的 Mesh 節點（市民端）：讓回報能在任何頁面即時 P2P 同步，
 * 並把收到的回報合併進 ShelterContext。SOS / 處理通知以全域 toast 呈現。
 */
export function MeshProvider({ children }: { children: ReactNode }) {
  const { userLoc } = useUser()
  const { mergeReport } = useShelters()
  const { t } = useI18n()

  const [toast, setToast] = useState<{ kind: 'sos' | 'done'; text: string } | null>(null)
  const [sosFlashId, setSosFlashId] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const showToast = useCallback((kind: 'sos' | 'done', text: string) => {
    setToast({ kind, text })
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 5000)
  }, [])

  const onSos = useCallback((m: MeshMessage) => {
    showToast('sos', t('mesh.sosReceived', { id: m.senderId.slice(0, 6) }))
    setSosFlashId(m.senderId)
    setTimeout(() => setSosFlashId(null), 6000)
  }, [showToast, t])

  const onReport = useCallback((r: CrowdReport) => {
    const { changed } = mergeReport(r)
    if (changed && r.status === 'resolved') {
      showToast('done', t('report.resolvedToast', { id: r.id.slice(0, 8) }))
    }
  }, [mergeReport, showToast, t])

  const mesh = usePeerMesh({ myPos: userLoc, onSos, onReport })

  return (
    <MeshContext.Provider value={{ ...mesh, sosFlashId }}>
      {children}
      {toast && (
        <div className={`fixed top-16 left-1/2 -translate-x-1/2 z-[2000] glass rounded-full px-4 py-2 text-sm font-semibold flex items-center gap-2 border ${
          toast.kind === 'sos' ? 'text-status-danger border-status-danger/50 animate-pulse' : 'text-status-safe border-status-safe/40'}`}>
          {toast.kind === 'sos' ? <AlertOctagon size={16} className="text-status-danger" /> : <CheckCircle size={16} className="text-status-safe" />}
          {toast.text}
        </div>
      )}
    </MeshContext.Provider>
  )
}

export function useMesh() {
  const ctx = useContext(MeshContext)
  if (!ctx) throw new Error('useMesh must be inside MeshProvider')
  return ctx
}
