export type ResourceStatus = 'green' | 'yellow' | 'red'
export type EntryStatus = 'official_open' | 'crowd_reported' | 'unverified' | 'closed'
export type ShelterType = 'government' | 'basement' | 'shelter_tunnel' | 'emergency'
export type OverallStatus = 'safe' | 'caution' | 'danger'
export type UserRole = 'student' | 'elderly' | 'pregnant' | 'child' | 'disabled' | 'adult'
export type DisasterMode = 'earthquake' | 'flood' | 'war' | 'epidemic'
export type ReportType = 'crowd' | 'road' | 'resource' | 'disaster'

// 回報 / SOS 共用的處理狀態機（指揮中心可推進）
export type HandleStatus = 'active' | 'received' | 'handling' | 'resolved'
export type SosLayer = 'A' | 'B' | 'C'

export interface Shelter {
  shelter_id: string
  name: string
  type: ShelterType
  type_label: string
  address: string
  lat: number
  lng: number
  capacity: {
    physical: number
    current_estimate: number
    vulnerable_capacity: number
  }
  entry_status: EntryStatus
  structure_age: number
  endurance_hours: number
  resources: {
    water: ResourceStatus
    food: ResourceStatus
    medical: ResourceStatus
    power: ResourceStatus
  }
  last_updated: string
  report_count: number
  applicable_disasters: DisasterMode[]
  not_suitable_for: DisasterMode[]
}

// 通用附件（補充回報可附圖片 / 影片 / 檔案）
export interface Attachment {
  name: string
  kind: 'image' | 'video' | 'file'
  url: string                  // data URL（可持久化 + 可經 Mesh 傳遞）
  size?: number
}

export interface CrowdReport {
  id: string
  shelter_id: string | null
  type: ReportType
  severity: ResourceStatus
  note: string
  reported_at: string
  lat: number
  lng: number
  // ── F2.8 擴充：照片、查證投票、處理狀態、Mesh 版本 ──
  photos?: string[]            // 壓縮後的 base64 data URL（向後相容；新版用 attachments）
  attachments?: Attachment[]   // 圖片 / 影片 / 檔案附件
  upVoters?: string[]          // 按讚者 peerId（取聯集去重 → 計數）
  downVoters?: string[]        // 倒讚者 peerId
  status?: HandleStatus        // 指揮中心可推進：active→received→handling→resolved
  resolvedNote?: string        // 指揮中心處理備註
  author?: string              // 回報者 peerId
  authorName?: string          // 回報者名稱（顯示用）
  threadId?: string            // 同一事件 / 地點的回報串（多人補充）
  version: number              // Mesh 版本號（演變時遞增、舊版丟棄）
}

// ── SOS 事件（取代純聊天 SOS）：可追蹤狀態 + 綁定回覆串，跨 Mesh 同步與持久化 ──
export interface SosReply {
  id: string
  fromId: string
  fromName: string
  text: string
  ts: number
  /** 是否為「我願意幫忙」快捷回覆 */
  offerHelp?: boolean
}

export interface SosEvent {
  id: string                   // 穩定事件 ID（去重用：同一次求救只顯示一次）
  senderId: string
  senderName: string
  layer: SosLayer              // A 私人 / B 指揮中心 / C 廣播
  lat?: number
  lng?: number
  text: string
  ts: number
  status: HandleStatus         // active→received→handling→resolved
  replies: SosReply[]          // 綁定此 SOS 的協助回覆
  handledBy?: string           // 接手者名稱（指揮中心或熱心民眾）
  safeBySelf?: boolean         // 求救者本人標記「已安全」（結案的一種，標籤有別於指揮中心已處理）
  version: number              // Mesh 版本號（演變時遞增）
}
