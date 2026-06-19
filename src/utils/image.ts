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
