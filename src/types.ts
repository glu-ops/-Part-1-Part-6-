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

// ── SOS 擴充（Part 6）：類型、優先級、發送範圍、狀態機 ──
// SOS 求救類型（8 類，各自帶預設優先級與是否需填說明，詳見 src/sos.ts 的 META）
export type SosCategory =
  | 'lifeThreat'   // 生命危險（high，一鍵送出）
  | 'medical'      // 醫療救助（high，一鍵送出）
  | 'trapped'      // 被困 / 無法離開（high，一鍵送出）
  | 'supplies'     // 物資需求（medium，需簡短說明）
  | 'evacuation'   // 撤離 / 交通協助（medium，需簡短說明）
  | 'shelterHelp'  // 避難所協助（medium，需簡短說明，可帶避難所資訊）
  | 'comms'        // 通訊 / 失聯（medium，需簡短說明）
  | 'other'        // 其他困難（medium，必填說明）

export type SosPriority = 'high' | 'medium' | 'low'

// 發送範圍（語意層）；對應既有 P2P 路由的 SosLayer：private=A / commandCenter=B / broadcast=C
export type SosScope = 'private' | 'commandCenter' | 'broadcast'

// SOS 狀態機（取代回報用的 HandleStatus；safe 與 resolved 視為「已結案」）
export type SosStatus = 'new' | 'received' | 'processing' | 'helped' | 'safe' | 'resolved'

// 協助回覆的快捷類型（綁定 sosId，不混入一般聊天）
export type SosReplyKind = 'willing' | 'enroute' | 'supplies' | 'evacuate' | 'custom'

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
  /** 是否為「我願意幫忙」快捷回覆（向後相容；新版改用 kind） */
  offerHelp?: boolean
  /** 快捷回覆類型（願意幫忙 / 正在前往 / 可提供物資 / 可協助撤離 / 自訂） */
  kind?: SosReplyKind
}

export interface SosEvent {
  id: string                   // 穩定事件 ID（去重用：同一次求救只顯示一次）
  senderId: string
  senderName: string
  layer: SosLayer              // 路由層（A 私人 / B 指揮中心 / C 廣播）
  scope: SosScope              // 發送範圍語意（private / commandCenter / broadcast）
  category: SosCategory        // 求救類型（8 類）
  priority: SosPriority        // 優先級（high / medium / low）
  lat?: number
  lng?: number
  text: string                 // 說明（高優先級可空，其餘需填）
  // 避難所協助：從避難所卡片發起時自動帶入
  shelterId?: string
  shelterName?: string
  shelterLocation?: string
  ts: number
  status: SosStatus            // new→received→processing→helped→(safe|resolved)
  replies: SosReply[]          // 綁定此 SOS 的協助回覆
  handledBy?: string           // 接手者名稱（指揮中心或熱心民眾）
  safeBySelf?: boolean         // 求救者本人標記「已安全」（status='safe'）
  version: number              // Mesh / 後端版本號（演變時遞增）
}
