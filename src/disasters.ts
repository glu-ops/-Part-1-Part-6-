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
