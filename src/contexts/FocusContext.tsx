import { createContext, useContext, useState, useCallback } from 'react'
import type { ReactNode } from 'react'

export interface FocusTarget {
  kind: 'report' | 'sos'
  id: string              // report threadId / SOS id
  lat: number
  lng: number
  nonce: number           // 每次點擊遞增 → 即使同一目標也重新觸發定位
}

interface FocusCtx {
  target: FocusTarget | null
  requestFocus: (kind: 'report' | 'sos', id: string, lat: number, lng: number) => void
}

const FocusContext = createContext<FocusCtx | null>(null)

/**
 * 跨頁定位：通知中心點擊 → 設定 target，地圖元件監聽 target（依 nonce）→ flyTo + 開資訊卡。
 */
export function FocusProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<FocusTarget | null>(null)
  const requestFocus = useCallback((kind: 'report' | 'sos', id: string, lat: number, lng: number) => {
    setTarget(prev => ({ kind, id, lat, lng, nonce: (prev?.nonce ?? 0) + 1 }))
  }, [])
  return <FocusContext.Provider value={{ target, requestFocus }}>{children}</FocusContext.Provider>
}

export function useFocus() {
  const ctx = useContext(FocusContext)
  if (!ctx) throw new Error('useFocus must be inside FocusProvider')
  return ctx
}
