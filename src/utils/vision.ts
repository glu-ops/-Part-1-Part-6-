import type { ReportType, ResourceStatus } from '../types'

export interface VisionResult {
  type: ReportType
  severity: ResourceStatus
  note: string
}

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

let lastCallTs = 0
const MIN_INTERVAL_MS = 3000
const MAX_RETRIES = 3
const RETRY_BASE_MS = 2000

const HF_MODEL = 'google/gemma-4-26B-A4B-it'
const HF_ENDPOINT = 'https://router.huggingface.co/featherless-ai/v1/chat/completions'

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(signal.reason); return }
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason) }, { once: true })
  })
}

export async function analyzeImage(
  dataUrl: string,
  signal?: AbortSignal,
): Promise<VisionResult> {
  const now = Date.now()
  if (now - lastCallTs < MIN_INTERVAL_MS) throw new Error('RATE_LIMITED')
  lastCallTs = now

  const token = (import.meta as any).env?.VITE_HF_TOKEN as string | undefined
  if (!token) throw new Error('NO_API_KEY')

  let lastErr = ''
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const wait = RETRY_BASE_MS * attempt
      console.log(`[vision] retry ${attempt}/${MAX_RETRIES} in ${wait}ms`)
      await sleep(wait, signal)
    }

    const res = await fetch(HF_ENDPOINT, {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        model: HF_MODEL,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: dataUrl } },
              { type: 'text', text: PROMPT },
            ],
          },
        ],
        max_tokens: 256,
        stream: false,
      }),
    })

    if (res.status === 503) {
      lastErr = await res.text().catch(() => 'Model is loading')
      continue
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      throw new Error(`HF API ${res.status}: ${errText.slice(0, 200)}`)
    }

    const json = await res.json()
    console.log('[vision] HF response:', JSON.stringify(json).slice(0, 300))
    const text: string = json.choices?.[0]?.message?.content ?? ''

    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON in response')

    const result = JSON.parse(jsonMatch[0])

    const validTypes: ReportType[] = ['crowd', 'road', 'resource', 'disaster']
    const validSev: ResourceStatus[] = ['green', 'yellow', 'red']

    return {
      type: validTypes.includes(result.type) ? result.type : 'disaster',
      severity: validSev.includes(result.severity) ? result.severity : 'yellow',
      note: typeof result.note === 'string' ? result.note.slice(0, 100) : '',
    }
  }

  throw new Error(`Model still loading after ${MAX_RETRIES} retries: ${lastErr.slice(0, 100)}`)
}

export function isVisionEnabled(): boolean {
  return !!((import.meta as any).env?.VITE_HF_TOKEN)
}
