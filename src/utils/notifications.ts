// 通知中心：純邏輯（去重鍵、文案生成、地點 fallback）。
//
// 設計重點（對應需求）：
// - 每筆通知有「決定性」notificationId（由事件內容算出），同一事件動作只會有一筆 →
//   不論來自 P2P broadcast、已連線 peer、後端 polling 或重連補播，addNotice 依此去重。
// - 文案清楚表達「誰做了什麼」：actorName（執行者）+ targetOwnerName（事件擁有者）。
// - 地點 fallback：locationName → address → lat/lng → 「未知地點」。
// - 不輸出 undefined / sos.cat.undefined / sos.prio.undefined：缺值一律先判斷再取字串。
//
// 純函式、不含 React / 網路 → 易於單元測試（見檔尾「測試方式」註解）。

import type {
  SosEvent, CrowdReport, Announcement, AnnounceLevel, SosStatus, HandleStatus,
} from '../types'

// 指揮中心保留節點 ID（與 usePeerMesh / identity 一致）
export const RESCUE_CENTER_ID = 'tainan-guardian-rescue'

export type NotificationCategory = 'sos' | 'report' | 'command' | 'system'
export type ActorRole = 'citizen' | 'command' | 'system'

export interface Notice {
  /** 去重鍵：同一事件＋同一動作唯一（決定性，可跨來源收斂） */
  notificationId: string
  eventType: NotificationCategory
  /** 動作：new / reply / willing / enroute / received / processing / dispatched / safe / supplement / resolved / announce */
  action: string
  /** 對應事件 id（sosId / report threadId / announceId） */
  targetId: string
  actorName: string
  actorRole: ActorRole
  /** 事件擁有者（求救者 / 回報者）名稱 */
  targetOwnerName: string
  /** 已套用 fallback，必有值（最差為「未知地點」） */
  locationName: string
  /** 完整文案（顯示主行） */
  message: string
  createdAt: number
  read: boolean
  // ── 顯示 / 定位輔助 ──
  level?: AnnounceLevel          // 公告重要程度
  detail?: string               // 次要行：補充 / 回覆內容
  refKind?: 'report' | 'sos'    // 點擊定位用
  lat?: number
  lng?: number
}

type T = (key: string, vars?: Record<string, string | number>) => string

function coordLabel(lat?: number, lng?: number): string {
  if (lat == null || lng == null) return ''
  if (lat === 0 && lng === 0) return ''
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`
}

/** 地點名稱 fallback：name → address → lat/lng → 「未知地點」 */
export function resolveLocationName(
  t: T,
  opts: { name?: string | null; address?: string | null; lat?: number; lng?: number },
): string {
  const name = opts.name?.trim()
  if (name) return name
  const addr = opts.address?.trim()
  if (addr) return addr
  const coord = coordLabel(opts.lat, opts.lng)
  if (coord) return coord
  return t('notice.unknownLocation')
}

function truncate(s: string, n = 24): string {
  const clean = s.replace(/\s+/g, ' ').trim()
  return clean.length > n ? `${clean.slice(0, n)}…` : clean
}

/** 是否為指揮中心發出的動作（用節點 ID 或名稱判斷） */
function isCommand(fromId?: string, fromName?: string, cmdName?: string): boolean {
  return fromId === RESCUE_CENTER_ID || (!!fromName && fromName === cmdName)
}

/**
 * SOS 事件 → 一筆通知（無可通知時回 null）。
 * 優先序：新求救 > 已安全 > 狀態推進（指揮中心）> 新回覆。
 */
export function buildSosNotice(
  t: T,
  args: { event: SosEvent; isNew: boolean; prevStatus?: SosStatus; locationName: string },
): Notice | null {
  const { event, isNew, prevStatus, locationName } = args
  const cmd = t('rescue.title')
  const owner = event.senderName?.trim() || t('notice.someone')
  const catLabel = event.category ? t(`sos.cat.${event.category}`) : ''
  const loc = { locationName, refKind: 'sos' as const, lat: event.lat, lng: event.lng, targetId: event.id, eventType: 'sos' as const }
  const common = { createdAt: Date.now(), read: false }

  if (isNew) {
    return {
      ...loc, ...common,
      notificationId: `sos:new:${event.id}`,
      action: 'new', actorName: owner, actorRole: 'citizen', targetOwnerName: owner,
      message: catLabel ? t('notice.sos.new', { owner, cat: catLabel }) : t('notice.sos.newNoCat', { owner }),
      detail: event.text?.trim() || undefined,
    }
  }

  if (event.status === 'safe' && event.safeBySelf) {
    return {
      ...loc, ...common,
      notificationId: `sos:safe:${event.id}`,
      action: 'safe', actorName: owner, actorRole: 'citizen', targetOwnerName: owner,
      message: t('notice.sos.safe', { owner }),
    }
  }

  if (prevStatus && prevStatus !== event.status) {
    const map: Partial<Record<SosStatus, { action: string; key: string }>> = {
      received:   { action: 'received',   key: 'notice.sos.cmdReceived' },
      processing: { action: 'processing', key: 'notice.sos.cmdProcessing' },
      helped:     { action: 'dispatched', key: 'notice.sos.cmdDispatched' },
    }
    const m = map[event.status]
    if (!m) return null   // resolved / new 等不另發狀態通知
    return {
      ...loc, ...common,
      notificationId: `sos:${event.status}:${event.id}`,
      action: m.action, actorName: cmd, actorRole: 'command', targetOwnerName: owner,
      message: t(m.key, { cmd, owner }),
    }
  }

  const reply = event.replies.length ? event.replies[event.replies.length - 1] : null
  if (reply) {
    const command = isCommand(reply.fromId, reply.fromName, cmd)
    const actor = command ? cmd : (reply.fromName?.trim() || t('notice.someone'))
    let action = 'reply'; let key = 'notice.sos.reply'
    if (reply.kind === 'willing')      { action = 'willing'; key = 'notice.sos.willing' }
    else if (reply.kind === 'enroute') { action = 'enroute'; key = 'notice.sos.enroute' }
    return {
      ...loc, ...common,
      notificationId: `sos:${action}:${event.id}:${reply.id}`,
      action, actorName: actor, actorRole: command ? 'command' : 'citizen', targetOwnerName: owner,
      message: t(key, { actor, owner }),
      detail: reply.text?.trim() || undefined,
    }
  }

  return null
}

/**
 * 回報 → 一筆通知（無可通知時回 null）。
 * isSupplement：此回報屬於「已存在的回報串」（補充），否則為新回報。
 */
export function buildReportNotice(
  t: T,
  args: { report: CrowdReport; isNew: boolean; isSupplement: boolean; prevStatus?: HandleStatus; locationName: string },
): Notice | null {
  const { report, isNew, isSupplement, prevStatus, locationName } = args
  const cmd = t('rescue.title')
  const actor = report.authorName?.trim() || t('notice.someone')
  const threadId = report.threadId ?? report.id
  const catLabel = report.type ? t(`rt.${report.type}`) : ''
  const title = report.note?.trim() ? truncate(report.note) : (catLabel || t('notice.untitled'))
  const loc = { locationName, refKind: 'report' as const, lat: report.lat, lng: report.lng, targetId: threadId, eventType: 'report' as const }
  const common = { createdAt: Date.now(), read: false }

  if (isNew) {
    if (isSupplement) {
      return {
        ...loc, ...common,
        notificationId: `report:supplement:${report.id}`,
        action: 'supplement', actorName: actor, actorRole: 'citizen', targetOwnerName: actor,
        message: t('notice.report.supplement', { actor, loc: locationName, title }),
        detail: report.note?.trim() || undefined,
      }
    }
    return {
      ...loc, ...common,
      notificationId: `report:new:${report.id}`,
      action: 'new', actorName: actor, actorRole: 'citizen', targetOwnerName: actor,
      message: t('notice.report.new', { actor, loc: locationName, cat: catLabel || title }),
      detail: report.note?.trim() || undefined,
    }
  }

  if (prevStatus && prevStatus !== report.status) {
    const map: Partial<Record<HandleStatus, { action: string; key: string }>> = {
      received: { action: 'received',   key: 'notice.report.cmdReceived' },
      handling: { action: 'processing', key: 'notice.report.cmdProcessing' },
      resolved: { action: 'resolved',   key: 'notice.report.cmdResolved' },
    }
    const m = report.status ? map[report.status] : undefined
    if (!m) return null
    return {
      ...loc, ...common,
      notificationId: `report:${report.status}:${threadId}`,
      action: m.action, actorName: cmd, actorRole: 'command', targetOwnerName: actor,
      message: t(m.key, { cmd, loc: locationName, title }),
    }
  }

  return null
}

/** 指揮中心廣播公告 → 一筆通知（固定格式：「{指揮中心}：{內容}」）。 */
export function buildAnnounceNotice(t: T, a: Announcement): Notice {
  const cmd = a.from?.trim() || t('rescue.title')
  return {
    notificationId: `command:announce:${a.id}`,
    eventType: 'command', action: 'announce', targetId: a.id,
    actorName: cmd, actorRole: 'command', targetOwnerName: '',
    locationName: t('notice.unknownLocation'),   // 公告無地點
    message: t('notice.command.announce', { cmd, content: a.text }),
    level: a.level, createdAt: a.ts || Date.now(), read: false,
  }
}

/* ──────────────────────────────────────────────────────────────────────────
 * 測試方式（純函式，可用任何 runner，例如 vitest）：
 *   const t = (k, v) => k.startsWith('rescue.title') ? '東區救災指揮中心'
 *     : Object.entries(v ?? {}).reduce((s,[kk,vv]) => s.replaceAll(`{${kk}}`,String(vv)), DICT[k] ?? k)
 *   - buildSosNotice 同一 event 連叫兩次 → notificationId 相同（去重可行）。
 *   - reply.kind='willing' → message='{actor} 願意協助 {owner} 的 SOS'。
 *   - status received（指揮中心）→ '{cmd}已收到 {owner} 的 SOS'。
 *   - resolveLocationName({}) → '未知地點'；給 lat/lng → '25.0000, 121.0000'。
 *   - 缺 category 時走 notice.sos.newNoCat，不會出現 'sos.cat.undefined'。
 * ────────────────────────────────────────────────────────────────────────── */
