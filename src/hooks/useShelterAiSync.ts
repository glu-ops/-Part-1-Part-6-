import { useEffect, useRef, useCallback } from 'react'
import type { ShelterAIStatus } from '../types'

// AI 監測狀態共享後端輪詢間隔。狀態更新頻率中等 → 取 6 秒。
const POLL_MS = 6000
const API = '/api/shelter-ai-status'

/**
 * AI Camera 避難所監測狀態同步（輪詢版），與 P2P mesh 並存（PDR §14）。
 * - apply 提供時（使用者端 / 指揮中心）：定期 GET ?since=<seq> 拉增量，交給 apply 合併顯示。
 *   前端再以 shelterId + version 收斂（與 P2P、本機 demo 模擬一致）。
 * - push（監測節點 / 指揮中心）：產生或審核狀態後 POST 到後端，讓所有端下次輪詢即可收到。
 *
 * 後端不可用（離線 / 未部署）→ 靜默，下次再試（本機 state / P2P 仍可運作）。
 */
export function useShelterAiSync(apply?: (s: ShelterAIStatus) => void) {
  const seqRef = useRef(0)
  const applyRef = useRef(apply)
  applyRef.current = apply

  useEffect(() => {
    if (!applyRef.current) return        // 無 apply（純回報端）→ 不輪詢
    let alive = true
    let timer: ReturnType<typeof setTimeout>

    const tick = async () => {
      try {
        const r = await fetch(`${API}?since=${seqRef.current}`)
        if (r.ok) {
          const data = await r.json() as { statuses?: ShelterAIStatus[]; seq?: number }
          if (Array.isArray(data.statuses)) {
            for (const s of data.statuses) if (s && s.shelterId) applyRef.current?.(s)
          }
          if (typeof data.seq === 'number') seqRef.current = Math.max(seqRef.current, data.seq)
        }
      } catch { /* 離線 / 後端未部署 → 靜默 */ }
      if (alive) timer = setTimeout(tick, POLL_MS)
    }

    timer = setTimeout(tick, 500)        // 進場即拉一次既有狀態
    return () => { alive = false; clearTimeout(timer) }
  }, [])

  const push = useCallback((s: ShelterAIStatus) => {
    fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: s }),
    })
      .then(r => (r.ok ? r.json() : null))
      .then((d: { seq?: number } | null) => {
        if (d && typeof d.seq === 'number') seqRef.current = Math.max(seqRef.current, d.seq)
      })
      .catch(() => { /* 後端不可用 → 仍靠本機 state / P2P */ })
  }, [])

  return { push }
}
