// 市民端身份工具：固定節點 ID、使用者名稱、已知對象（供重連）。
//
// 為何用 sessionStorage 而非 localStorage：
// 1) 重新整理（reload）後 sessionStorage 仍保留 → 滿足「ID/名字不變」。
// 2) sessionStorage 以「分頁」為範圍 → 同一瀏覽器開兩個分頁＝兩個不同身份，
//    PeerJS 才不會因兩分頁拿到同一固定 ID 而撞號（unavailable-id）。
//    這正是兩分頁互測 demo 能跑的關鍵。

const ID_KEY = 'guardian_peer_id'
const NAME_KEY = 'guardian_name'
const PEERS_KEY = 'guardian_known_peers'

/** 固定節點 ID（首次產生後存於 sessionStorage，reload 不變）。 */
export function getPersistentId(): string {
  let id = sessionStorage.getItem(ID_KEY)
  if (!id) {
    // PeerJS 合法字元：英數與 -，這裡用 tng- 前綴 + 隨機碼
    id = `tng-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`
    sessionStorage.setItem(ID_KEY, id)
  }
  return id
}

export function getName(): string {
  return sessionStorage.getItem(NAME_KEY) ?? ''
}

export function setNameStored(name: string): void {
  sessionStorage.setItem(NAME_KEY, name.trim())
}

export interface KnownPeer {
  id: string
  name: string
}

export function getKnownPeers(): KnownPeer[] {
  try {
    const raw = sessionStorage.getItem(PEERS_KEY)
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
  sessionStorage.setItem(PEERS_KEY, JSON.stringify(list))
}

export function removeKnownPeer(id: string): void {
  const list = getKnownPeers().filter(p => p.id !== id)
  sessionStorage.setItem(PEERS_KEY, JSON.stringify(list))
}
