import { createContext, useContext, useState, useCallback } from 'react'
import type { ReactNode } from 'react'
import { getPersistentId, getName, setNameStored, sanitizeId, setStoredId } from '../utils/identity'

interface IdentityCtx {
  /** 固定節點 ID（可由使用者自訂；連線/識別用） */
  myId: string
  /** 使用者名稱（UI 顯示用） */
  name: string
  /** 設定名稱；可選自訂 ID（留空則沿用目前/自動產生的） */
  setName: (n: string, customId?: string) => void
  hasName: boolean
}

const IdentityContext = createContext<IdentityCtx | null>(null)

/**
 * 市民端身份：固定 ID + 使用者名稱。
 * ID 持久固定（localStorage，關閉重開不變），名稱供全 App 顯示。
 * 第一次設定時可自訂 ID，方便在別的裝置用同一組名稱+ID 重新登入（注意：
 * 聊天/聯絡人仍存於各裝置本機，不會跨裝置同步）。
 */
export function IdentityProvider({ children }: { children: ReactNode }) {
  // 預設先有一個自動 ID（避免 Peer 以空 ID 啟動）；自訂時覆寫並觸發重連
  const [myId, setMyId] = useState<string>(getPersistentId)
  const [name, setNameState] = useState<string>(getName)

  const setName = useCallback((n: string, customId?: string) => {
    const trimmed = n.trim()
    setNameStored(trimmed)
    setNameState(trimmed)
    if (customId != null) {
      const clean = sanitizeId(customId)
      if (clean) { setStoredId(clean); setMyId(clean) }
    }
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
