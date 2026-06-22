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

export async function analyzeImage(dataUrl: string, signal?: AbortSignal): Promise<VisionResult> {
  const apiKey = (import.meta as any).env?.VITE_GEMINI_API_KEY as string | undefined
  if (!apiKey) throw new Error('NO_API_KEY')

  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
  if (!match) throw new Error('Invalid image data URL')
  const [, mimeType, base64] = match

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: PROMPT },
            { inlineData: { mimeType, data: base64 } },
          ],
        }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 256,
        },
      }),
    },
  )

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`Gemini API ${res.status}: ${errText.slice(0, 200)}`)
  }

  const json = await res.json()
  const text: string = json.candidates?.[0]?.content?.parts?.[0]?.text ?? ''

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

export function isVisionEnabled(): boolean {
  return !!((import.meta as any).env?.VITE_GEMINI_API_KEY)
}
