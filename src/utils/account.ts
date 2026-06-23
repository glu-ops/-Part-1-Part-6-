// 帳號後端用戶端：註冊 / 登入（全域唯一 + PIN），含離線快取後備。
//
// - 註冊：必須連線（才能保證 ID 全域唯一）。成功後快取 {name, salt, pinHash} 於本機。
// - 登入：優先走後端驗證；連不上時改用本機快取的 salt+pinHash 離線比對
//   （此裝置先前成功登入過的帳號，離線也能進）。
// - PIN 以 PBKDF2-SHA256 + 每帳號隨機 salt 推導，參數與後端 api/account.ts 的 derivePin 完全一致。

const ENDPOINT = '/api/account'
const CACHE_PREFIX = 'guardian_account_cache__'

export type AccountError = 'taken' | 'not-found' | 'bad-pin' | 'bad-input' | 'offline' | 'error' | 'locked'
export interface AccountResult {
  ok: boolean
  name?: string
  error?: AccountError
  /** 是否以離線快取登入（無後端驗證） */
  offline?: boolean
  /** 鎖定剩餘秒數（error:'locked' 時） */
  retryAfter?: number
  /** 鎖定前剩餘可嘗試次數（error:'bad-pin' 時） */
  remaining?: number
}

// crypto.subtle 只在安全環境（HTTPS / localhost）才有；用 LAN IP 走 http 開時為 undefined。
// 此時回傳 null：後端仍會做真正的雜湊驗證（線上註冊/登入照常），僅略過離線快取。
// 迭代次數須與後端 PBKDF2_ITER 一致
const PBKDF2_ITER = 100000

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return out
}

// crypto.subtle 只在安全環境（HTTPS / localhost）才有；用 LAN IP 走 http 開時為 undefined。
// 此時回傳 null：後端仍會做真正的雜湊驗證（線上註冊/登入照常），僅略過離線快取。
/** PIN 推導：PBKDF2-SHA256 + salt（參數須與後端 derivePin 完全一致）；環境不支援回 null。 */
export async function derivePin(pin: string, salt: string): Promise<string | null> {
  if (!globalThis.crypto?.subtle || !salt) return null
  try {
    const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits'])
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: hexToBytes(salt) as BufferSource, iterations: PBKDF2_ITER, hash: 'SHA-256' },
      keyMaterial, 256,
    )
    return [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2, '0')).join('')
  } catch {
    return null
  }
}

export function isValidPin(pin: string): boolean {
  return /^\d{4,8}$/.test(pin)
}

interface CachedAccount { name: string; salt: string; pinHash: string }
const cacheKey = (id: string) => `${CACHE_PREFIX}${id}`

function getCached(id: string): CachedAccount | null {
  try {
    const raw = localStorage.getItem(cacheKey(id))
    return raw ? (JSON.parse(raw) as CachedAccount) : null
  } catch {
    return null
  }
}

function setCached(id: string, acc: CachedAccount): void {
  try { localStorage.setItem(cacheKey(id), JSON.stringify(acc)) } catch { /* 容量不足忽略 */ }
}

/** 註冊新帳號（需連線）。ID 已被占用 → error:'taken'。 */
export async function registerAccount(id: string, name: string, pin: string): Promise<AccountResult> {
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'register', id, name, pin }),
    })
    if (res.status === 409) return { ok: false, error: 'taken' }
    if (!res.ok) return { ok: false, error: 'bad-input' }
    const j = await res.json()
    const salt: string = j.salt ?? ''
    const h = await derivePin(pin, salt)
    if (h && salt) setCached(id, { name: j.name ?? name, salt, pinHash: h })
    return { ok: true, name: j.name ?? name }
  } catch {
    return { ok: false, error: 'offline' }   // 註冊需連線以保證唯一
  }
}

/** 登入既有帳號。連不上後端時，改用本機快取離線驗證。 */
export async function loginAccount(id: string, pin: string): Promise<AccountResult> {
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'login', id, pin }),
    })
    if (res.status === 404) return { ok: false, error: 'not-found' }
    if (res.status === 429) {
      const j = await res.json().catch(() => ({}))
      return { ok: false, error: 'locked', retryAfter: j.retryAfter }
    }
    if (res.status === 401) {
      const j = await res.json().catch(() => ({}))
      return { ok: false, error: 'bad-pin', remaining: j.remaining }
    }
    if (!res.ok) return { ok: false, error: 'error' }
    const j = await res.json()
    const salt: string = j.salt ?? ''
    const h = await derivePin(pin, salt)
    if (h && salt) setCached(id, { name: j.name, salt, pinHash: h })
    return { ok: true, name: j.name }
  } catch {
    // 離線：用本機快取驗證（此裝置先前登入過、且環境支援雜湊才有）
    const cached = getCached(id)
    const h = cached ? await derivePin(pin, cached.salt) : null
    if (cached && h && cached.pinHash === h) {
      return { ok: true, name: cached.name, offline: true }
    }
    return { ok: false, error: 'offline' }
  }
}
