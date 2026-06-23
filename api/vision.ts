/**
 * 影像辨識後端 proxy（Vercel Serverless Function）。
 *
 * 為什麼要這支：原本前端直接帶 `VITE_HF_TOKEN` 打 Hugging Face，有兩個問題——
 *  1. `VITE_` 變數是 build-time 內嵌，token 會被打包進「瀏覽器看得到」的 bundle（外洩）。
 *  2. build-time 內嵌也代表改了 Vercel 環境變數後，舊 build 不會更新；常造成「昨天能用今天不行」。
 * 改由後端讀「runtime」環境變數 `HF_TOKEN`（無 VITE_ 前綴）呼叫 HF，token 永不離開伺服器，
 * 設好變數重新部署即生效，也不再依賴打包時機。
 *
 * API：POST { dataUrl }  → 200 { type, severity, note }
 *   - 未設定 token            → 503 { error:'NO_API_KEY' }
 *   - HF/解析失敗             → 502 { error }
 *   - 缺 dataUrl              → 400 { error }
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const HF_MODEL = 'google/gemma-4-26B-A4B-it'
const HF_ENDPOINT = 'https://router.huggingface.co/featherless-ai/v1/chat/completions'

const MAX_RETRIES = 3
const RETRY_BASE_MS = 2000

const PROMPT = `你是台南市防災回報系統的影像辨識助手。請分析這張照片，判斷災害類型、嚴重程度並描述狀況。

回傳嚴格 JSON 格式（不要 markdown 包裹）：
{"type":"...","severity":"...","note":"..."}

type 只能是以下之一：
- crowd（擁擠度：人潮、排隊、避難所內人數）
- road（道路狀況：路面損壞、障礙物、交通中斷）
- resource（物資狀況：食物、飲水、醫療物資）
- disaster（災情：淹水、建物損壞、火災、地震破壞）

severity 只能是以下之一：
- green（正常：無明顯異常、輕微狀況）
- yellow（注意：中度損害、積水、人潮擁擠、物資有限）
- red（嚴重：重大損害、嚴重淹水、建物倒塌、道路中斷、人員受困）

note：用繁體中文，30 字以內簡短描述照片中觀察到的狀況。`

const VALID_TYPES = ['crowd', 'road', 'resource', 'disaster']
const VALID_SEV = ['green', 'yellow', 'red']

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

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

  // runtime 環境變數；相容本機 dev 仍用 VITE_HF_TOKEN 的情況
  const token = process.env.HF_TOKEN || process.env.VITE_HF_TOKEN
  if (!token) { res.status(503).json({ error: 'NO_API_KEY' }); return }

  const dataUrl = String(readBody(req).dataUrl ?? '')
  if (!dataUrl.startsWith('data:image/')) { res.status(400).json({ error: 'BAD_IMAGE' }); return }

  let lastErr = 'Model is loading'
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) await sleep(RETRY_BASE_MS * attempt)

    let hf: Response
    try {
      hf = await fetch(HF_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          model: HF_MODEL,
          messages: [{
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: dataUrl } },
              { type: 'text', text: PROMPT },
            ],
          }],
          max_tokens: 256,
          stream: false,
        }),
      })
    } catch (e) {
      res.status(502).json({ error: `HF_FETCH_FAILED: ${String(e).slice(0, 120)}` })
      return
    }

    if (hf.status === 503) { lastErr = await hf.text().catch(() => 'Model is loading'); continue }

    if (!hf.ok) {
      const errText = await hf.text().catch(() => '')
      res.status(502).json({ error: `HF ${hf.status}: ${errText.slice(0, 200)}` })
      return
    }

    const json = await hf.json().catch(() => null)
    const text: string = json?.choices?.[0]?.message?.content ?? ''
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) { res.status(502).json({ error: 'NO_JSON_IN_RESPONSE' }); return }

    let parsed: any
    try { parsed = JSON.parse(match[0]) } catch { res.status(502).json({ error: 'BAD_JSON' }); return }

    res.status(200).json({
      type: VALID_TYPES.includes(parsed.type) ? parsed.type : 'disaster',
      severity: VALID_SEV.includes(parsed.severity) ? parsed.severity : 'yellow',
      note: typeof parsed.note === 'string' ? parsed.note.slice(0, 100) : '',
    })
    return
  }

  res.status(502).json({ error: `MODEL_LOADING: ${lastErr.slice(0, 100)}` })
}
