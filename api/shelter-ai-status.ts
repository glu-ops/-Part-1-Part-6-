/**
 * AI Camera 避難所監測節點 — 共享狀態後端（Vercel Serverless Function）。
 *
 * 目的（PDR §14）：AI Simulation / Camera 的避難所狀態不可只存在前端。監測節點把每筆
 * ShelterAIStatus 寫入這個共享資料來源；使用者端與指揮中心以版本號輪詢（GET ?since=seq）
 * 拉增量，達成跨 Vercel 多使用者同步。P2P 仍作為即時加速層，兩者以 shelterId + version 收斂。
 *
 * 與 api/announce.ts / api/sos.ts 同一套儲存模式：
 *  - 有 KV / Upstash 環境變數 → Redis（REST）持久化。
 *  - 否則降級為模組內記憶體（免設定即可 demo；冷啟動 / 換實例會清空）。
 *
 * API：
 *  - GET  /api/shelter-ai-status?since=<seq>  → { statuses: ShelterAIStatus[], seq }
 *  - POST /api/shelter-ai-status  body { status }  → { status: <合併後>, seq }
 *
 * 合併策略（PDR §12 權威順序）：每個 shelterId 僅保留一筆最新狀態。
 *  取較大 version；version 相同時取權威較高的來源（command > staff > aiCamera > aiSimulation > crowd > system）。
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || ''
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || ''
const USE_KV = !!(KV_URL && KV_TOKEN)

const KEY = 'guardian:shelter:ai-status'

// 權威順序（PDR §12）：數字越大越權威。AI 不可覆蓋較新的指揮中心 / 工作人員資料。
const SOURCE_RANK: Record<string, number> = {
  command: 5, staff: 4, aiCamera: 3, aiSimulation: 2, crowd: 1, system: 0,
}

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

// 同 shelterId 取較新：version 大者勝；version 相同則權威來源勝（PDR §12）。
function isNewer(incoming: any, existing: any): boolean {
  const vi = incoming.version ?? 0
  const ve = existing.version ?? 0
  if (vi !== ve) return vi > ve
  const ri = SOURCE_RANK[incoming?.aiMonitor?.source] ?? 0
  const re = SOURCE_RANK[existing?.aiMonitor?.source] ?? 0
  return ri > re   // 同版本僅權威嚴格較高才覆蓋；相同來源的回聲忽略，避免 _seq churn
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
    const statuses = since > 0 ? all.filter(e => (e._seq || 0) > since) : all
    res.status(200).json({ statuses, seq: maxSeq(all) })
    return
  }

  if (req.method === 'POST') {
    const incoming = readBody(req)?.status
    if (!incoming || !incoming.shelterId) {
      res.status(400).json({ error: 'status required' })
      return
    }
    const all = await loadAll()
    const i = all.findIndex(e => e.shelterId === incoming.shelterId)
    // 既有較新 → 不覆蓋，直接回現值（讓來源端收斂）
    if (i !== -1 && !isNewer(incoming, all[i])) {
      res.status(200).json({ status: all[i], seq: maxSeq(all) })
      return
    }
    const seq = maxSeq(all) + 1
    const stored = { ...incoming, _seq: seq }
    if (i === -1) all.push(stored)
    else all[i] = stored
    await saveAll(all)
    res.status(200).json({ status: stored, seq })
    return
  }

  res.setHeader('Allow', 'GET, POST')
  res.status(405).json({ error: 'method not allowed' })
}
