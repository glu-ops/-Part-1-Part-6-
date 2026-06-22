import {
  AlertOctagon, HeartPulse, Lock, Package, Bus, Home, RadioTower, HelpCircle,
  HeartHandshake, Navigation, Boxes, LogOut, MessageCircle,
} from 'lucide-react'
import type {
  SosCategory, SosPriority, SosScope, SosLayer, SosStatus, SosReplyKind,
} from './types'

// ── 8 類 SOS 類型的中介資料（優先級、是否需填說明、是否一鍵送出、圖示）──
export interface SosCategoryMeta {
  priority: SosPriority
  /** 是否必須填寫說明（high 類可空，可一鍵送出） */
  needsDesc: boolean
  /** 高優先級類型可一鍵送出（不強制展開說明） */
  oneTap: boolean
  icon: typeof AlertOctagon
}

export const SOS_CATEGORY_META: Record<SosCategory, SosCategoryMeta> = {
  lifeThreat:  { priority: 'high',   needsDesc: false, oneTap: true,  icon: AlertOctagon },
  medical:     { priority: 'high',   needsDesc: false, oneTap: true,  icon: HeartPulse },
  trapped:     { priority: 'high',   needsDesc: false, oneTap: true,  icon: Lock },
  supplies:    { priority: 'medium', needsDesc: true,  oneTap: false, icon: Package },
  evacuation:  { priority: 'medium', needsDesc: true,  oneTap: false, icon: Bus },
  shelterHelp: { priority: 'medium', needsDesc: true,  oneTap: false, icon: Home },
  comms:       { priority: 'medium', needsDesc: true,  oneTap: false, icon: RadioTower },
  other:       { priority: 'medium', needsDesc: true,  oneTap: false, icon: HelpCircle },
}

// 顯示順序（high 在前）
export const SOS_CATEGORIES: SosCategory[] = [
  'lifeThreat', 'medical', 'trapped',
  'supplies', 'evacuation', 'shelterHelp', 'comms', 'other',
]

// ── 範圍（scope）↔ 路由層（layer）對應，沿用既有 P2P 路由 ──
export const SCOPE_TO_LAYER: Record<SosScope, SosLayer> = {
  private: 'A', commandCenter: 'B', broadcast: 'C',
}
export const LAYER_TO_SCOPE: Record<SosLayer, SosScope> = {
  A: 'private', B: 'commandCenter', C: 'broadcast',
}
export const SOS_SCOPES: SosScope[] = ['private', 'commandCenter', 'broadcast']

// ── 狀態機 ──
// 推進排序（合併收斂用：取較進階者）。safe/resolved 為「已結案」。
export const SOS_STATUS_RANK: Record<SosStatus, number> = {
  new: 0, received: 1, processing: 2, helped: 3, safe: 4, resolved: 5,
}
export function isSosClosed(s: SosStatus): boolean {
  return s === 'safe' || s === 'resolved'
}

// 指揮中心可推進的狀態（依序）
export const COMMAND_STATUS_FLOW: SosStatus[] = ['received', 'processing', 'helped', 'resolved']

// ── 優先級樣式（地圖光環 + 徽章顏色）──
export const PRIORITY_COLOR: Record<SosPriority, string> = {
  high:   '#ef4444',  // 紅
  medium: '#f59e0b',  // 琥珀
  low:    '#38bdf8',  // 藍
}
export const PRIORITY_BADGE: Record<SosPriority, string> = {
  high:   'bg-status-danger/25 text-status-danger',
  medium: 'bg-amber-500/25 text-amber-300',
  low:    'bg-sky-500/25 text-sky-300',
}

// ── 快捷回覆類型（綁定 sosId）──
export interface SosReplyMeta { icon: typeof HeartHandshake; i18nKey: string }
export const SOS_QUICK_REPLIES: { kind: Exclude<SosReplyKind, 'custom'>; icon: typeof HeartHandshake; i18nKey: string }[] = [
  { kind: 'willing',  icon: HeartHandshake, i18nKey: 'sos.reply.willing' },
  { kind: 'enroute',  icon: Navigation,     i18nKey: 'sos.reply.enroute' },
  { kind: 'supplies', icon: Boxes,          i18nKey: 'sos.reply.supplies' },
  { kind: 'evacuate', icon: LogOut,         i18nKey: 'sos.reply.evacuate' },
]
export const REPLY_CUSTOM_ICON = MessageCircle
