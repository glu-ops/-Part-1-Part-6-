import { Activity, Waves, Siren, Biohazard } from 'lucide-react'
import type { DisasterMode } from './types'

// 災害情境 → 白色線條圖示（單色輪廓，無彩色 emoji）
//  earthquake 地震 → Activity（地震波形）
//  flood      水災 → Waves（水波）
//  war        戰爭 → Siren（空襲警報）
//  epidemic   疫情 → Biohazard（生物危害）
export const DISASTER_ICON: Record<DisasterMode, typeof Activity> = {
  earthquake: Activity,
  flood: Waves,
  war: Siren,
  epidemic: Biohazard,
}

export const DISASTERS: DisasterMode[] = ['earthquake', 'flood', 'war', 'epidemic']

// 時間軸尺度（分鐘）依災害不同：
//  地震 → 震後即時快照，時間軸代表「餘震累積」（至 3 小時）
//  淹水 → 積水/溢堤為小時尺度（至 6 小時）
//  其他 → 以避難所容量飽和為主（1 小時）
export const TIME_HORIZON: Record<DisasterMode, number> = {
  earthquake: 180,
  flood: 360,
  war: 60,
  epidemic: 60,
}

// 時間軸目前在模擬什麼（顯示於 slider 下方說明）
export const SIM_LABEL_KEY: Record<DisasterMode, string> = {
  earthquake: 'home.simEarthquake',
  flood: 'home.simFlood',
  war: 'home.simCapacity',
  epidemic: 'home.simCapacity',
}
