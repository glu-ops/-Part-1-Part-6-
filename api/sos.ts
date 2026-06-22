/**
 * 共享 SOS 後端（Vercel Serverless Function）。
 *
 * 目的：SOS 不可只存在前端 state。所有使用者把 SOS 的新增 / 回覆 / 狀態更新
 * 寫入這個共享資料來源，前端以版本號輪詢（GET ?since=seq）拉增量，達成
 * Vercel 多使用者同步。
 *
 * 儲存：
 *  - 若偵測到 Vercel KV / Upstash 環境變數（KV_REST_API_URL + KV_REST_API_TOKEN），
 *    用 Redis 透過 REST 持久化（跨區、跨冷啟動）。
 *  - 否則自動降級為模組內記憶體（免設定即可 demo；冷啟動 / 換實例會清空）。
 *
 * API：
 *  - GET  /api/sos?since=<seq>  → { events: SosEvent[], seq }（seq 之後變動的事件）
 *  - POST /api/sos  body { event }  → { event: <合併後>, seq }
 *
 * 合併策略與前端 useSosStore 一致：狀態取較進階、回覆取聯集、版本取大 →
 * 多來源（P2P + 後端）最終收斂。
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || ''
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || ''
const USE_KV = !!(KV_URL && KV_TOKEN)

const EVENTS_KEY = 'guardian:sos:events'

// safe/resolved 視為已結案；推進排序用於合併收斂
const STATUS_RANK: Record<string, number> = {
  new: 0, received: 1, processing: 2, helped: 3, safe: 4, resolved: 5,
  // 向後相容舊狀態名
  active: 0, handling: 2,
}

// ── 記憶體後備 ──
let memEvents: any[] = []

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
  if (!USE_KV) return memEvents
  try {
    const raw = await kvCmd(['GET', EVENTS_KEY])
    if (!raw) return []
    return JSON.parse(raw as string)
  } catch {
    return memEvents
  }
}

async function saveAll(arr: any[]): Promise<void> {
  if (!USE_KV) { memEvents = arr; return }
  try {
    await kvCmd(['SET', EVENTS_KEY, JSON.stringify(arr)])
  } catch {
    memEvents = arr
  }
}

function uniqReplies(a: any[] = [], b: any[] = []): any[] {
  const byId = new Map<string, any>()
  for (const r of [...a, ...b]) if (r && r.id) byId.set(r.id, r)
  return [...byId.values()].sort((x, y) => (x.ts || 0) - (y.ts || 0))
}

function mergeOne(a: any, b: any): any {
  const newer = (b.version ?? 0) >= (a.version ?? 0) ? b : a
  const ra = STATUS_RANK[a.status] ?? 0
  const rb = STATUS_RANK[b.status] ?? 0
  const status = ra >= rb ? a.status : b.status
  return {
    ...newer,
    status,
    replies: uniqReplies(a.replies, b.replies),
    handledBy: b.handledBy ?? a.handledBy,
    safeBySelf: a.safeBySelf || b.safeBySelf,
    version: Math.max(a.version ?? 0, b.version ?? 0),
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
    const events = since > 0 ? all.filter(e => (e._seq || 0) > since) : all
    res.status(200).json({ events, seq: maxSeq(all) })
    return
  }

  if (req.method === 'POST') {
    const body = readBody(req)
    const incoming = body?.event
    if (!incoming || !incoming.id) {
      res.status(400).json({ error: 'event required' })
      return
    }
    const all = await loadAll()
    const i = all.findIndex(e => e.id === incoming.id)
    const merged = i === -1 ? incoming : mergeOne(all[i], incoming)
    const seq = maxSeq(all) + 1
    merged._seq = seq
    if (i === -1) all.push(merged)
    else all[i] = merged
    await saveAll(all)
    res.status(200).json({ event: merged, seq })
    return
  }

  res.setHeader('Allow', 'GET, POST')
  res.status(405).json({ error: 'method not allowed' })
}
