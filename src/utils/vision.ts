import type { ReportType, ResourceStatus } from '../types'

// 影像辨識前端用戶端：呼叫後端 proxy /api/vision（token 留在伺服器端，不外洩）。
// 後端負責呼叫 Hugging Face、解析與驗證，前端只送圖片、收結果。

export interface VisionResult {
  type: ReportType
  severity: ResourceStatus
  note: string
}

const ENDPOINT = '/api/vision'

// 前端節流：避免短時間連打（後端仍會各自處理）
let lastCallTs = 0
const MIN_INTERVAL_MS = 3000

export async function analyzeImage(
  dataUrl: string,
  signal?: AbortSignal,
): Promise<VisionResult> {
  const now = Date.now()
  if (now - lastCallTs < MIN_INTERVAL_MS) throw new Error('RATE_LIMITED')
  lastCallTs = now

  let res: Response
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataUrl }),
    })
  } catch (e) {
    if (signal?.aborted) throw e
    throw new Error('OFFLINE')
  }

  if (res.status === 503) throw new Error('NO_API_KEY')
  if (!res.ok) {
    const j = await res.json().catch(() => ({}))
    throw new Error((j as any).error || `VISION_API_${res.status}`)
  }

  const r = (await res.json()) as VisionResult
  return r
}

// 後端決定是否設定 token；前端一律顯示 AI 入口，實際可用性於呼叫時回報。
export function isVisionEnabled(): boolean {
  return true
}
