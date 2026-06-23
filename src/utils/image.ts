import type { Attachment } from '../types'

// 非圖片附件（影片 / 檔案）大小上限：避免 data URL 撐爆 localStorage 配額
const MAX_FILE_BYTES = 8 * 1024 * 1024  // 8MB

function readAsDataUrl(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(fr.result as string)
    fr.onerror = reject
    fr.readAsDataURL(file)
  })
}

/**
 * 將上傳檔案轉成可持久化 / 可經 Mesh 傳遞的附件：
 * - 圖片：壓縮成小 JPEG
 * - 影片 / 其他：data URL（超過上限則略過並回報）
 * 回傳 { attachments, skipped }（skipped = 因過大被略過的檔名）
 */
export async function filesToAttachments(list: FileList | File[]): Promise<{ attachments: Attachment[]; skipped: string[] }> {
  const attachments: Attachment[] = []
  const skipped: string[] = []
  for (const file of Array.from(list)) {
    if (file.type.startsWith('image/')) {
      attachments.push({ name: file.name, kind: 'image', url: await downscaleImage(file), size: file.size })
    } else if (file.size > MAX_FILE_BYTES) {
      skipped.push(file.name)
    } else {
      const kind: Attachment['kind'] = file.type.startsWith('video/') ? 'video' : 'file'
      attachments.push({ name: file.name, kind, url: await readAsDataUrl(file), size: file.size })
    }
  }
  return { attachments, skipped }
}

// 將同源 / public 下的圖片網址轉成 data URL（供 /api/vision 辨識；它只收 data:image/）。
// 失敗（檔案不存在 / CORS）時拋錯，呼叫端可 fallback。
export async function urlToDataUrl(url: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`IMG_${res.status}`)
  const blob = await res.blob()
  if (!blob.type.startsWith('image/')) throw new Error('NOT_IMAGE')
  return new Promise<string>((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(fr.result as string)
    fr.onerror = reject
    fr.readAsDataURL(blob)
  })
}

// 將上傳圖片壓縮成較小的 base64 JPEG：
// 1) 可持久化到 localStorage（blob URL 重整後失效）
// 2) 夠小可透過 Mesh P2P 傳遞給其他節點
export async function downscaleImage(file: File, maxDim = 720, quality = 0.6): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(fr.result as string)
    fr.onerror = reject
    fr.readAsDataURL(file)
  })

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image()
    el.onload = () => resolve(el)
    el.onerror = reject
    el.src = dataUrl
  })

  const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
  const w = Math.round(img.width * scale)
  const h = Math.round(img.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return dataUrl
  ctx.drawImage(img, 0, 0, w, h)
  try {
    return canvas.toDataURL('image/jpeg', quality)
  } catch {
    return dataUrl
  }
}
