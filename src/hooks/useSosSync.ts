import { useEffect, useRef, useCallback } from 'react'
import type { SosEvent } from '../types'

// 共享後端輪詢間隔（含版本號增量）。SOS 為高優先事件 → 取較短間隔。
const POLL_MS = 4000
const API = '/api/sos'

/**
 * SOS 共享資料來源同步（輪詢版）。
 * - 定期 GET /api/sos?since=<seq> 拉取「他人新增 / 回覆 / 狀態更新」的增量，
 *   交給 applyRemote（內部走 useSosStore.mergeRemote → 合併 + 通知 + 地圖）。
 * - push(event)：本機任何 SOS 動作（建立 / 回覆 / 推進狀態 / 我已安全）後呼叫，
 *   POST 到共享後端，讓所有 Vercel 使用者下次輪詢即可看到。
 *
 * 與既有 PeerJS mesh 並存：後端是共享真實來源（離線重連後也拉得到），
 * P2P 則作為即時加速層。兩者皆以 mergeRemote 收斂，重複資料為冪等。
 */
export function useSosSync(applyRemote: (e: SosEvent) => void) {
  const seqRef = useRef(0)
  const applyRef = useRef(applyRemote)
  applyRef.current = applyRemote

  useEffect(() => {
    let alive = true
    let timer: ReturnType<typeof setTimeout>

    const tick = async () => {
      try {
        const r = await fetch(`${API}?since=${seqRef.current}`)
        if (r.ok) {
          const data = await r.json() as { events?: SosEvent[]; seq?: number }
          if (Array.isArray(data.events)) {
            for (const e of data.events) {
              if (e && e.id) applyRef.current(e)
            }
          }
          if (typeof data.seq === 'number') seqRef.current = Math.max(seqRef.current, data.seq)
        }
      } catch { /* 離線 / 後端未部署 → 靜默，下次再試（P2P 仍可運作） */ }
      if (alive) timer = setTimeout(tick, POLL_MS)
    }

    timer = setTimeout(tick, 400)   // 進場即拉一次既有 SOS
    return () => { alive = false; clearTimeout(timer) }
  }, [])

  const push = useCallback((event: SosEvent) => {
    fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event }),
    })
      .then(r => (r.ok ? r.json() : null))
      .then((d: { seq?: number } | null) => {
        if (d && typeof d.seq === 'number') seqRef.current = Math.max(seqRef.current, d.seq)
      })
      .catch(() => { /* 後端不可用 → 仍靠 P2P + 本地持久化 */ })
  }, [])

  return { push }
}
