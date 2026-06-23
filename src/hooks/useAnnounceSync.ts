import { useEffect, useRef, useCallback } from 'react'
import type { Announcement } from '../types'

// 公告共享後端輪詢間隔。公告為重要單向通知 → 取較短間隔。
const POLL_MS = 5000
const API = '/api/announce'

/**
 * 公告共享資料來源同步（輪詢版），與 P2P mesh 並存。
 * - apply 提供時（市民端）：定期 GET /api/announce?since=<seq> 拉增量，交給 apply 顯示。
 *   首次（since=0）為補抓既有公告 → 標記 toast=false，只進通知中心、不洗版跳 toast；
 *   之後拉到的新公告 → toast=true 即時提示。前端再以公告 id 去重（與 P2P 收斂）。
 * - push（指揮中心）：發布公告後 POST 到後端，讓所有使用者下次輪詢即可收到。
 *
 * 後端不可用（離線 / 未部署）→ 靜默，下次再試（P2P 仍可運作）。
 */
export function useAnnounceSync(apply?: (a: Announcement, opts?: { toast?: boolean }) => void) {
  const seqRef = useRef(0)
  const firstRef = useRef(true)
  const applyRef = useRef(apply)
  applyRef.current = apply

  useEffect(() => {
    if (!applyRef.current) return        // 無 apply（純發布端）→ 不輪詢
    let alive = true
    let timer: ReturnType<typeof setTimeout>

    const tick = async () => {
      try {
        const r = await fetch(`${API}?since=${seqRef.current}`)
        if (r.ok) {
          const data = await r.json() as { announcements?: Announcement[]; seq?: number }
          const backfill = firstRef.current
          if (Array.isArray(data.announcements)) {
            // 舊→新套用，確保通知中心順序正確
            for (const a of [...data.announcements].sort((x, y) => (x.ts || 0) - (y.ts || 0))) {
              if (a && a.id) applyRef.current?.(a, { toast: !backfill })
            }
          }
          if (typeof data.seq === 'number') seqRef.current = Math.max(seqRef.current, data.seq)
          firstRef.current = false
        }
      } catch { /* 離線 / 後端未部署 → 靜默 */ }
      if (alive) timer = setTimeout(tick, POLL_MS)
    }

    timer = setTimeout(tick, 400)        // 進場即拉一次既有公告
    return () => { alive = false; clearTimeout(timer) }
  }, [])

  const push = useCallback((a: Announcement) => {
    fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ announcement: a }),
    })
      .then(r => (r.ok ? r.json() : null))
      .then((d: { seq?: number } | null) => {
        if (d && typeof d.seq === 'number') seqRef.current = Math.max(seqRef.current, d.seq)
      })
      .catch(() => { /* 後端不可用 → 仍靠 P2P */ })
  }, [])

  return { push }
}
