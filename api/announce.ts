/**
 * 共享公告後端（Vercel Serverless Function）。
 *
 * 目的：指揮中心廣播的公告不可只走 P2P（連線不穩時市民收不到）。比照 api/sos.ts，
 * 指揮中心把公告寫入這個共享資料來源，市民端以版本號輪詢（GET ?since=seq）拉增量，
 * 達成跨 Vercel 多使用者同步；P2P 則作為即時加速層，兩者以公告 id 去重收斂。
 *
 * 儲存：
 *  - 有 KV / Upstash 環境變數 → Redis（REST）持久化。
 *  - 否則降級為模組內記憶體（免設定即可 demo；冷啟動 / 換實例會清空）。
 *
 * API：
 *  - GET  /api/announce?since=<seq>  → { announcements: Announcement[], seq }
 *  - POST /api/announce  body { announcement }  → { announcement, seq }
 *
 * 公告為一次性、不可變（無合併）：同 id 重複貼入視為已存在，直接回現值。
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || ''
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || ''
const USE_KV = !!(KV_URL && KV_TOKEN)

const KEY = 'guardian:announcements'
const MAX_KEEP = 100   // 僅保留最近 100 則，避免無限成長

// ── 記憶體後備 ──
let memArr: any[] = []

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

async function loadAll(): Promise<any[]> {
  if (!USE_KV) return memArr
  try {
    const raw = await kvCmd(['GET', KEY])
    if (!raw) return []
    return JSON.parse(raw as string)
  } catch {
    return memArr
  }
}

async function saveAll(arr: any[]): Promise<void> {
  if (!USE_KV) { memArr = arr; return }
  try {
    await kvCmd(['SET', KEY, JSON.stringify(arr)])
  } catch {
    memArr = arr
  }
}

function maxSeq(arr: any[]): number {
  return arr.reduce((m, e) => Math.max(m, e._seq || 0), 0)
}

function readBody(req: any): any {
  if (req.body && typeof req.body === 'object') return req.body
  if (typeof req.body === 'string' && req.body) { try { return JSON.parse(req.body) } catch { return {} } }
  return {}
}

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store')

  if (req.method === 'GET') {
    const since = Number(req.query?.since ?? 0) || 0
    const all = await loadAll()
    const announcements = since > 0 ? all.filter(e => (e._seq || 0) > since) : all
    res.status(200).json({ announcements, seq: maxSeq(all) })
    return
  }

  if (req.method === 'POST') {
    const a = readBody(req)?.announcement
    if (!a || !a.id || !a.text) { res.status(400).json({ error: 'announcement required' }); return }

    const all = await loadAll()
    const existing = all.find(e => e.id === a.id)
    if (existing) { res.status(200).json({ announcement: existing, seq: maxSeq(all) }); return }

    const seq = maxSeq(all) + 1
    const stored = { ...a, _seq: seq }
    all.push(stored)
    // 僅保留最近 MAX_KEEP 則（依 _seq）
    const trimmed = all.sort((x, y) => (x._seq || 0) - (y._seq || 0)).slice(-MAX_KEEP)
    await saveAll(trimmed)
    res.status(200).json({ announcement: stored, seq })
    return
  }

  res.setHeader('Allow', 'GET, POST')
  res.status(405).json({ error: 'method not allowed' })
}
