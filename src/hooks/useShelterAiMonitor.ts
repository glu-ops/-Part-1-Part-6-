import { useEffect, useRef } from 'react'
import { useShelters } from '../contexts/ShelterContext'
import { useShelterAiSync } from './useShelterAiSync'
import { analyzeShelter } from '../utils/vision'
import { urlToDataUrl } from '../utils/image'
import {
  samplePhotoFor, buildAiStatus,
  simulateRawReading, estimateCountFromOccupancy,
} from '../utils/shelterAi'
import type { RawReading } from '../utils/shelterAi'

// 監測節點輪播間隔。每個 tick 處理一所（round-robin），避免一次打多支 vision。
const TICK_MS = 9000
// 指揮中心剛審核（確認/修正/忽略）過的避難所，於此時間內不被 AI 覆蓋（PDR §12 權威順序）。
const COMMAND_HOLD_MS = 60000

/**
 * AI Camera 避難所監測節點 — simulation 引擎（PDR §6.1）。
 * enabled 時，定時輪流為每個 AI 部署的避難所：
 *   1) 輪播 public/ 範例照 → 真跑 /api/vision（mode=shelter）辨識人潮密度與物資
 *   2) 失敗（無 token / 離線 / 無範例照）→ fallback 演算法模擬讀數
 * 產出 ShelterAIStatus → 合併進本機 context（即時）＋ POST 共享後端（跨使用者同步）。
 * triage（自動更新 vs 送指揮中心）由 buildAiStatus 內含的判定完成。
 */
export function useShelterAiMonitor(enabled: boolean) {
  const { shelters, aiStatus, mergeAiStatus } = useShelters()
  const { push } = useShelterAiSync()
  const sheltersRef = useRef(shelters); sheltersRef.current = shelters
  const aiRef = useRef(aiStatus); aiRef.current = aiStatus
  const idxRef = useRef(0)      // 避難所 round-robin 游標
  const photoRef = useRef(0)    // 範例照 round-robin 游標
  const busyRef = useRef(false) // 上一 tick 未完成則跳過，避免 vision 呼叫堆疊

  useEffect(() => {
    if (!enabled) return
    let alive = true
    let timer: ReturnType<typeof setTimeout>

    // 初始種子：為所有避難所重置一筆乾淨的模擬狀態（覆蓋舊資料，清掉殘留異常），
    // 但保留指揮中心已處理的資料。讓總覽即時填滿，之後輪播再以 vision 精修。
    for (const s of sheltersRef.current) {
      const prev = aiRef.current.get(s.shelter_id)
      if (prev?.aiMonitor.source === 'command') continue   // 尊重指揮中心決定
      const status = buildAiStatus({
        shelterId: s.shelter_id, capacity: s.capacity.physical,
        reading: simulateRawReading(s, undefined),
        source: 'aiSimulation', mode: 'simulation', prevVersion: prev?.version ?? 0,
      })
      if (mergeAiStatus(status)) push(status)
    }

    const tick = async () => {
      if (!busyRef.current) {
        busyRef.current = true
        try {
          const ids = sheltersRef.current.map(s => s.shelter_id)   // 全部避難所皆監測
          const id = ids[idxRef.current % ids.length]
          idxRef.current++
          const shelter = sheltersRef.current.find(s => s.shelter_id === id)
          const prev = aiRef.current.get(id)
          // 尊重指揮中心近期決定：剛審核過的避難所暫不以 AI 覆蓋（PDR §12）
          const commandHeld = prev?.aiMonitor.source === 'command'
            && Date.now() - +new Date(prev.updatedAt) < COMMAND_HOLD_MS
          if (shelter && !commandHeld) {
            const cap = shelter.capacity.physical
            let reading: RawReading
            try {
              const photo = samplePhotoFor(id, photoRef.current)
              photoRef.current++
              const v = await analyzeShelter(await urlToDataUrl(photo))
              reading = {
                estimatedCount: estimateCountFromOccupancy(v.occupancy, cap, prev?.people.estimatedCount),
                resources: { water: v.water, food: v.food, medical: v.medical, power: v.power, supplies: v.supplies },
                confidence: v.confidence,
                note: v.note,                                 // 真實 AI 狀況分析
              }
            } catch {
              reading = simulateRawReading(shelter, prev)   // 無 vision → 演算法模擬
            }
            const status = buildAiStatus({
              shelterId: id, capacity: cap, reading,
              source: 'aiSimulation', mode: 'simulation',
              prevCount: prev?.people.estimatedCount, prevVersion: prev?.version ?? 0,
            })
            if (mergeAiStatus(status)) push(status)
          }
        } finally {
          busyRef.current = false
        }
      }
      if (alive) timer = setTimeout(tick, TICK_MS)
    }
    timer = setTimeout(tick, 800)
    return () => { alive = false; clearTimeout(timer) }
  }, [enabled, mergeAiStatus, push])
}
