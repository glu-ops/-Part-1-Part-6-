// 市民端身份工具：固定節點 ID、使用者名稱、已知對象（供重連）。
//
// 儲存策略：localStorage（關閉分頁/視窗後仍保留 → 像「登入」一樣持久，
// 重開頁面身份不變、自動重連之前連過的人）。
//
// 同機多人測試：localStorage 為「整個瀏覽器共用」，預設兩個分頁＝同一身份。
// 若要在同一台機器同時測多個獨立又持久的身份，網址加 ?u=<代號>
// （例：/?u=2、/?u=hua），各代號各自一份持久身份，互不衝突。
// 真實手機/電腦各自是不同瀏覽器，天然分開，不受影響。

function profileSuffix(): string {
  try {
    const u = new URLSearchParams(window.location.search).get('u')
    const clean = (u ?? '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 16)
    return clean ? `__${clean}` : ''
  } catch {
    return ''
  }
}
const SFX = profileSuffix()

const ID_KEY = `guardian_peer_id${SFX}`
const NAME_KEY = `guardian_name${SFX}`
const ACCOUNTS_KEY = `guardian_accounts${SFX}`
// 聯絡人（已知對象）依「帳號 ID」分開存：登入同一帳號就帶回該帳號的聯絡人。
const peersKey = (ownerId: string) => `guardian_known_peers${SFX}__${ownerId}`

// 指揮中心保留 ID，使用者不可佔用
const RESERVED_ID = 'tainan-guardian-rescue'

/**
 * 已登入的帳號 ID（存於 localStorage）。未登入回傳空字串。
 * ID 即帳號：在其他裝置用同一組 ID 登入即視為同一人。不再自動產生 —
 * 一律由使用者在登入時指定（見 NameGate / IdentityContext.login）。
 */
export function getStoredId(): string {
  return localStorage.getItem(ID_KEY) ?? ''
}

/** 登出：清除目前帳號 ID 與名稱（聊天/通知以 ID 為 key 保留，重新登入同一 ID 可復原）。 */
export function clearIdentity(): void {
  localStorage.removeItem(ID_KEY)
  localStorage.removeItem(NAME_KEY)
}

/**
 * 本機重置：清除這台裝置上所有帳號相關資料（登入紀錄、目前身分、PIN 快取、
 * 聊天、通知、聯絡人）。後端帳號表不受影響。此動作無法復原。
 */
export function resetAllLocal(): void {
  const keys: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k && k.startsWith('guardian')) keys.push(k)
  }
  keys.forEach(k => localStorage.removeItem(k))
}

/** 產生一組建議帳號 ID（合法、隨機、好打），供「新增帳號」一鍵填入、降低撞號。 */
export function suggestId(): string {
  return `u-${Math.random().toString(36).slice(2, 7)}`
}

/** 把使用者輸入清成 PeerJS 合法 ID（小寫英數與 - _，長度上限）。不合法回傳空字串。 */
export function sanitizeId(raw: string): string {
  const clean = raw.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 24)
  if (!clean || clean === RESERVED_ID) return ''
  return clean
}

/** 覆寫固定節點 ID（使用者自訂時用）。 */
export function setStoredId(id: string): void {
  localStorage.setItem(ID_KEY, id)
}

export function getName(): string {
  return localStorage.getItem(NAME_KEY) ?? ''
}

export function setNameStored(name: string): void {
  localStorage.setItem(NAME_KEY, name.trim())
}

// ── 這台裝置登入過的帳號（供登入頁一鍵登入，避免手打 ID 打錯變成新帳號）──
export interface Account {
  id: string
  name: string
}

export function getAccounts(): Account[] {
  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr.filter(a => a && typeof a.id === 'string') : []
  } catch {
    return []
  }
}

/** 記住一個登入過的帳號（移到最前、依 id 去重、最多 8 筆）。 */
export function rememberAccount(acc: Account): void {
  const list = getAccounts().filter(a => a.id !== acc.id)
  list.unshift(acc)
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(list.slice(0, 8)))
}

/** 從「最近帳號」清單移除一筆（僅移除快捷入口，不刪該帳號的聊天/聯絡人）。 */
export function forgetAccount(id: string): void {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(getAccounts().filter(a => a.id !== id)))
}

// ── 聯絡人（已知對象）：依帳號 ID 分開儲存 ──
export interface KnownPeer {
  id: string
  name: string
}

export function getKnownPeers(ownerId: string): KnownPeer[] {
  if (!ownerId) return []
  try {
    const raw = localStorage.getItem(peersKey(ownerId))
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr.filter(p => p && typeof p.id === 'string') : []
  } catch {
    return []
  }
}

/** 新增/更新一筆已知對象（屬於 ownerId 帳號；依 id 去重，名字以最新為準）。 */
export function saveKnownPeer(ownerId: string, peer: KnownPeer): void {
  if (!ownerId) return
  const list = getKnownPeers(ownerId)
  const i = list.findIndex(p => p.id === peer.id)
  if (i === -1) list.push(peer)
  else list[i] = { ...list[i], ...peer }
  localStorage.setItem(peersKey(ownerId), JSON.stringify(list))
}

export function removeKnownPeer(ownerId: string, id: string): void {
  if (!ownerId) return
  const list = getKnownPeers(ownerId).filter(p => p.id !== id)
  localStorage.setItem(peersKey(ownerId), JSON.stringify(list))
}
