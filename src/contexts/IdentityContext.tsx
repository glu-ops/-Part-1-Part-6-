import { createContext, useContext, useState, useMemo, useCallback } from 'react'
import type { ReactNode } from 'react'
import { getPersistentId, getName, setNameStored } from '../utils/identity'

interface IdentityCtx {
  /** 固定節點 ID（內部識別用，UI 不主要顯示） */
  myId: string
  /** 使用者名稱（UI 顯示用） */
  name: string
  setName: (n: string) => void
  hasName: boolean
}

const IdentityContext = createContext<IdentityCtx | null>(null)

/**
 * 市民端身份：固定 ID + 使用者名稱。
 * ID 在整個分頁生命週期固定（sessionStorage），名稱供全 App 顯示。
 */
export function IdentityProvider({ children }: { children: ReactNode }) {
  const myId = useMemo(getPersistentId, [])
  const [name, setNameState] = useState<string>(getName)

  const setName = useCallback((n: string) => {
    const trimmed = n.trim()
    setNameStored(trimmed)
    setNameState(trimmed)
  }, [])

  return (
    <IdentityContext.Provider value={{ myId, name, setName, hasName: !!name }}>
      {children}
    </IdentityContext.Provider>
  )
}

export function useIdentity() {
  const ctx = useContext(IdentityContext)
  if (!ctx) throw new Error('useIdentity must be inside IdentityProvider')
  return ctx
}
