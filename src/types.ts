export type ResourceStatus = 'green' | 'yellow' | 'red'
export type EntryStatus = 'official_open' | 'crowd_reported' | 'unverified' | 'closed'
export type ShelterType = 'government' | 'basement' | 'shelter_tunnel' | 'emergency'
export type OverallStatus = 'safe' | 'caution' | 'danger'
export type UserRole = 'student' | 'elderly' | 'pregnant' | 'child' | 'disabled' | 'adult'
export type DisasterMode = 'earthquake' | 'flood' | 'war' | 'epidemic'
export type ReportType = 'crowd' | 'road' | 'resource' | 'disaster'
export type SupportTime = '0-4' | '4-24' | '24-72' | '72+'
export type ResourceCapacityLevel = 'R1' | 'R2' | 'R3' | 'R4'

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
  capacity_people?: string
  current_occupancy?: number
  water_support_time?: SupportTime
  food_support_time?: SupportTime
  medical_support_time?: SupportTime
  power_support_time?: SupportTime
  physical_capacity?: string
  entrance_capacity?: string
  resource_capacity_level?: ResourceCapacityLevel
  support_time?: SupportTime
  resource_conditions?: string
  suitable_users?: string
  overall_role?: string
  management_capacity?: string
  notes?: string
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

// ── 指揮中心廣播公告：由 /rescue 推送給全體市民（新聞、災情演變等單向通知）──
export type AnnounceLevel = 'info' | 'warning' | 'critical'

export interface Announcement {
  id: string                   // 穩定 ID（去重用：同一則公告只顯示一次）
  level: AnnounceLevel         // 重要程度（一般 / 注意 / 緊急），決定樣式
  text: string                 // 公告內容
  ts: number                   // 發布時間
  from: string                 // 發布單位名稱（指揮中心）
}

// ── AI Camera 避難所監測節點（PDR）：自動辨識避難所人數與物資，疊加在 shelters.json 基準上 ──
// 監測模式：目前用 simulation（自動輪播範例照辨識），預留 live_camera 接真實攝影機
export type AIMonitorMode = 'simulation' | 'live_camera'
// 監測節點狀態：未部署 / demo / 在線 / 離線 / 錯誤（離線、錯誤皆視為需指揮中心關注）
export type AIMonitorStatus = 'not_installed' | 'demo' | 'online' | 'offline' | 'error'
// 資源等級：沿用 ResourceStatus 三燈，另加 unknown（AI 看不出來）
export type ResourceLevel = ResourceStatus | 'unknown'

// 指揮中心對 AI 回報的審核狀態（PDR §8/§9）：
//  auto       正常且可信度高 → 系統自動更新，不需人工
//  pending    異常 → 等待東區救災指揮中心確認
//  confirmed  指揮中心確認屬實
//  corrected  指揮中心修正後採用
//  ignored    指揮中心判定誤報、忽略（不更新使用者端顯示值）
export type AIReviewStatus = 'auto' | 'pending' | 'confirmed' | 'corrected' | 'ignored'

// 異常嚴重度：warning（黃色警戒，如資源偏低）/ critical（紅色危急，如不足、接近額滿）
export type AbnormalSeverity = 'warning' | 'critical'

// 權威來源（PDR §12 合併順序）：command > staff > aiCamera > aiSimulation > crowd > system
// AI 資料不可覆蓋較新的指揮中心 / 避難所工作人員資料。
export type ShelterStatusSource = 'command' | 'staff' | 'aiCamera' | 'aiSimulation' | 'crowd' | 'system'

// AI 監測單筆回報（避難所即時狀態疊加層）。以 shelterId 為鍵、version 遞增收斂，
// 同步機制比照 SosEvent / Announcement（P2P + /api/shelter-ai-status 輪詢）。
export interface ShelterAIStatus {
  shelterId: string
  aiMonitor: {
    status: AIMonitorStatus
    mode: AIMonitorMode
    source: ShelterStatusSource     // 實際產生此筆資料的來源
    lastReportAt: string            // 監測節點最後回報時間（ISO）
  }
  people: {
    estimatedCount: number          // AI 粗估目前人數
    capacity: number                // 容量（取自 shelters.json physical）
    occupancyRate: number           // 收容率 0–100
    confidence: number              // 人數估計可信度 0–100
  }
  resources: {
    water: ResourceLevel
    food: ResourceLevel
    medical: ResourceLevel
    power: ResourceLevel
    supplies: ResourceLevel          // 一般物資（毛毯 / 民生用品）
  }
  urgentNeeds: string[]             // 急需項目（顯示用，如「缺水」「缺毛毯」）
  analysis?: string                 // AI 對目前狀況的文字分析（vision note 或模擬摘要）
  abnormal: boolean                 // 是否異常（需指揮中心處理）
  abnormalReasons: string[]         // 異常原因（PDR §9）
  abnormalSeverity?: AbnormalSeverity // 異常嚴重度（warning 黃 / critical 紅）
  confidence: number                // 整體可信度 0–100（< 85 視為需人工）
  review: AIReviewStatus            // 審核狀態（見上）
  reviewedBy?: string               // 處理者（指揮中心）
  reviewNote?: string               // 指揮中心備註
  detectedAt: string                // AI 偵測時間（ISO）
  updatedAt: string                 // 此筆最後更新時間（ISO）
  version: number                   // 合併版本號（演變時遞增、舊版丟棄）
}
