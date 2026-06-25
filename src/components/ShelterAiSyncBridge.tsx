import { useShelters } from '../contexts/ShelterContext'
import { useShelterAiSync } from '../hooks/useShelterAiSync'

/**
 * 無畫面橋接：在 App 根層輪詢 /api/shelter-ai-status，把 AI 監測狀態合併進 context。
 * 讓所有端（市民 + 指揮中心）都能收到監測節點的即時更新，不必各自接線。
 */
export default function ShelterAiSyncBridge() {
  const { mergeAiStatus } = useShelters()
  useShelterAiSync(mergeAiStatus)
  return null
}
