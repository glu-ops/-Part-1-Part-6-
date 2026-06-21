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
const PEERS_KEY = `guardian_known_peers${SFX}`

// 指揮中心保留 ID，使用者不可佔用
const RESERVED_ID = 'tainan-guardian-rescue'

/** 固定節點 ID（首次產生後存於 localStorage，關閉重開仍不變）。 */
export function getPersistentId(): string {
  let id = localStorage.getItem(ID_KEY)
  if (!id) {
    // PeerJS 合法字元：英數與 -，這裡用 tng- 前綴 + 隨機碼
    id = `tng-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`
    localStorage.setItem(ID_KEY, id)
  }
  return id
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

export interface KnownPeer {
  id: string
  name: string
}

export function getKnownPeers(): KnownPeer[] {
  try {
    const raw = localStorage.getItem(PEERS_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr.filter(p => p && typeof p.id === 'string') : []
  } catch {
    return []
  }
}

/** 新增/更新一筆已知對象（依 id 去重，名字以最新為準）。 */
export function saveKnownPeer(peer: KnownPeer): void {
  const list = getKnownPeers()
  const i = list.findIndex(p => p.id === peer.id)
  if (i === -1) list.push(peer)
  else list[i] = { ...list[i], ...peer }
  localStorage.setItem(PEERS_KEY, JSON.stringify(list))
}

export function removeKnownPeer(id: string): void {
  const list = getKnownPeers().filter(p => p.id !== id)
  localStorage.setItem(PEERS_KEY, JSON.stringify(list))
}
