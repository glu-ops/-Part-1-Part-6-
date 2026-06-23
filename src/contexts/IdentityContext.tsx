import { createContext, useContext, useState, useCallback } from 'react'
import type { ReactNode } from 'react'
import { getStoredId, getName, setNameStored, sanitizeId, setStoredId, clearIdentity, rememberAccount } from '../utils/identity'

interface IdentityCtx {
  /** 帳號 ID（登入用、識別用）；未登入為空字串。 */
  myId: string
  /** 使用者名稱（UI 顯示用，可重複）。 */
  name: string
  /** 是否已登入（有 ID + 名稱）。 */
  hasIdentity: boolean
  /** 登入 / 建立身分：ID 必填且合法、名稱必填。成功回傳 true。 */
  login: (name: string, id: string) => boolean
  /** 登出 / 換帳號：清除身分並重新載入，讓下一個人乾淨登入。 */
  logout: () => void
}

const IdentityContext = createContext<IdentityCtx | null>(null)

/**
 * 市民端身份：ID 即「帳號」。
 * - ID 必填且為識別主鍵；同一組 ID 在任何裝置登入都視為同一人（P2P 身分一致、
 *   聊天/通知以 ID 為 key 保存）。名稱僅供顯示、可重複。
 * - 不再自動產生 ID：登入前沒有身分（NameGate 擋住操作），由使用者指定 ID 後才登入。
 * - 注意：跨裝置「同一人」靠的是相同 ID；本機的聊天/聯絡人不會跨裝置同步。
 */
export function IdentityProvider({ children }: { children: ReactNode }) {
  const [myId, setMyId] = useState<string>(getStoredId)
  const [name, setNameState] = useState<string>(getName)

  const login = useCallback((rawName: string, rawId: string): boolean => {
    const trimmedName = rawName.trim()
    const cleanId = sanitizeId(rawId)
    if (!trimmedName || !cleanId) return false   // 名稱與合法 ID 皆為必填
    setStoredId(cleanId); setMyId(cleanId)
    setNameStored(trimmedName); setNameState(trimmedName)
    rememberAccount({ id: cleanId, name: trimmedName })   // 記住以便下次一鍵登入（避免打錯）
    // 重新載入：讓所有以帳號 ID 為 key 的狀態（P2P 節點、聊天、通知）以正確身分初始化，
    // 登入既有帳號時可復原該帳號的聊天/通知。
    window.location.reload()
    return true
  }, [])

  const logout = useCallback(() => {
    clearIdentity()
    // 重新載入以清空所有以身份為 key 的記憶體狀態（P2P 連線、聊天、通知）
    window.location.reload()
  }, [])

  return (
    <IdentityContext.Provider value={{ myId, name, hasIdentity: !!myId && !!name, login, logout }}>
      {children}
    </IdentityContext.Provider>
  )
}

export function useIdentity() {
  const ctx = useContext(IdentityContext)
  if (!ctx) throw new Error('useIdentity must be inside IdentityProvider')
  return ctx
}
