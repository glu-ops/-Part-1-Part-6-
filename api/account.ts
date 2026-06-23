/**
 * 帳號後端（Vercel Serverless Function）：讓「ID = 帳號」具備全域唯一性與 PIN 驗證。
 *
 * 儲存（與 api/sos.ts 相同策略）：
 *  - 有 KV / Upstash 環境變數 → Redis（REST）持久化。
 *  - 否則降級為模組內記憶體（免設定即可 demo；冷啟動會清空）。
 *
 * API（皆為 POST，body.action 指定動作）：
 *  - register { id, name, pin }      → 201 { ok, id, name }；ID 已存在 → 409 { error:'taken' }
 *  - login    { id, pin }            → 200 { ok, id, name }；查無 → 404；PIN 錯 → 401
 *  - check    { id }                 → 200 { exists, name? }
 *
 * PIN 以 SHA-256 雜湊（公式與前端一致，前端離線時可用本機快取自行比對）。
 * 注意：此為課堂等級實作，未加隨機 salt / 速率限制，正式環境請強化。
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { randomBytes, pbkdf2Sync } from 'node:crypto'

const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || ''
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || ''
const USE_KV = !!(KV_URL && KV_TOKEN)

const ACCOUNTS_KEY = 'guardian:accounts'
const RESERVED_ID = 'tainan-guardian-rescue'

// 登入暴力破解防護：連續失敗達上限即鎖定一段時間
const MAX_FAILS = 5
const LOCK_MS = 15 * 60 * 1000   // 15 分鐘

// PIN 以 PBKDF2-SHA256 + 每帳號隨機 salt 推導；迭代次數須與前端 utils/account.ts 一致
const PBKDF2_ITER = 100000

interface AccountRecord {
  name: string
  /** 每帳號隨機 salt（hex；非機密，會回傳前端供離線比對） */
  salt: string
  pinHash: string
  createdAt: number
  /** 連續登入失敗次數（成功或鎖定後歸零） */
  fails?: number
  /** 鎖定到期時間戳（ms）；> now 表示鎖定中 */
  lockedUntil?: number
}

// ── 記憶體後備 ──
let memAccounts: Record<string, AccountRecord> = {}

async function kvCmd(cmd: any[]): Promise<any> {
  const r = await fetch(KV_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
  })
  if (!r.ok) throw new Error(`kv ${r.status}`)
  const j = await r.json()
  return j.result
}

async function loadAll(): Promise<Record<string, AccountRecord>> {
  if (!USE_KV) return memAccounts
  try {
    const raw = await kvCmd(['GET', ACCOUNTS_KEY])
    if (!raw) return {}
    return JSON.parse(raw as string)
  } catch {
    return memAccounts
  }
}

async function saveAll(map: Record<string, AccountRecord>): Promise<void> {
  if (!USE_KV) { memAccounts = map; return }
  try {
    await kvCmd(['SET', ACCOUNTS_KEY, JSON.stringify(map)])
  } catch {
    memAccounts = map
  }
}

function genSalt(): string {
  return randomBytes(16).toString('hex')
}

// PIN 推導：參數（PBKDF2 / SHA-256 / 迭代 / keylen / salt 解析）須與前端 derivePin 完全一致
function derivePin(pin: string, salt: string): string {
  return pbkdf2Sync(pin, Buffer.from(salt, 'hex'), PBKDF2_ITER, 32, 'sha256').toString('hex')
}

function sanitizeId(raw: string): string {
  const clean = String(raw ?? '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 24)
  if (!clean || clean === RESERVED_ID) return ''
  return clean
}

function isValidPin(pin: string): boolean {
  return /^\d{4,8}$/.test(pin)
}

function readBody(req: any): any {
  if (req.body && typeof req.body === 'object') return req.body
  if (typeof req.body === 'string' && req.body) { try { return JSON.parse(req.body) } catch { return {} } }
  return {}
}

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store')

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    res.status(405).json({ error: 'method not allowed' })
    return
  }

  const body = readBody(req)
  const action = String(body.action ?? '')
  const id = sanitizeId(body.id)
  if (!id) { res.status(400).json({ error: 'invalid id' }); return }

  const all = await loadAll()

  if (action === 'check') {
    res.status(200).json({ exists: !!all[id], name: all[id]?.name })
    return
  }

  const pin = String(body.pin ?? '')

  if (action === 'register') {
    const name = String(body.name ?? '').trim().slice(0, 16)
    if (!name) { res.status(400).json({ error: 'name required' }); return }
    if (!isValidPin(pin)) { res.status(400).json({ error: 'invalid pin' }); return }
    if (all[id]) { res.status(409).json({ error: 'taken' }); return }
    const salt = genSalt()
    all[id] = { name, salt, pinHash: derivePin(pin, salt), createdAt: Date.now() }
    await saveAll(all)
    res.status(201).json({ ok: true, id, name, salt })
    return
  }

  if (action === 'login') {
    const acc = all[id]
    if (!acc) { res.status(404).json({ error: 'not found' }); return }

    const now = Date.now()
    // 鎖定中：直接拒絕，回剩餘秒數
    if (acc.lockedUntil && acc.lockedUntil > now) {
      res.status(429).json({ error: 'locked', retryAfter: Math.ceil((acc.lockedUntil - now) / 1000) })
      return
    }

    // 舊資料（無 salt）無法驗證 → 視為需重新註冊
    if (!acc.salt) { res.status(401).json({ error: 'bad pin', remaining: MAX_FAILS }); return }

    // PIN 錯誤：累計失敗，達上限則鎖定
    if (acc.pinHash !== derivePin(pin, acc.salt)) {
      acc.fails = (acc.fails ?? 0) + 1
      const justLocked = acc.fails >= MAX_FAILS
      if (justLocked) { acc.lockedUntil = now + LOCK_MS; acc.fails = 0 }
      all[id] = acc
      await saveAll(all)
      if (justLocked) {
        res.status(429).json({ error: 'locked', retryAfter: Math.ceil(LOCK_MS / 1000) })
      } else {
        res.status(401).json({ error: 'bad pin', remaining: MAX_FAILS - acc.fails })
      }
      return
    }

    // 成功：重置失敗計數與鎖定狀態
    if (acc.fails || acc.lockedUntil) {
      acc.fails = 0
      acc.lockedUntil = 0
      all[id] = acc
      await saveAll(all)
    }
    res.status(200).json({ ok: true, id, name: acc.name, salt: acc.salt })
    return
  }

  res.status(400).json({ error: 'unknown action' })
}
