export type ResourceStatus = 'green' | 'yellow' | 'red'
export type EntryStatus = 'official_open' | 'crowd_reported' | 'unverified' | 'closed'
export type ShelterType = 'government' | 'basement' | 'shelter_tunnel' | 'emergency'
export type OverallStatus = 'safe' | 'caution' | 'danger'
export type UserRole = 'student' | 'elderly' | 'pregnant' | 'child' | 'disabled' | 'adult'
export type DisasterMode = 'earthquake' | 'flood' | 'war' | 'epidemic'
export type ReportType = 'crowd' | 'road' | 'resource' | 'disaster'

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
  photos?: string[]            // 壓縮後的 base64 data URL
  upVoters?: string[]          // 按讚者 peerId（取聯集去重 → 計數）
  downVoters?: string[]        // 倒讚者 peerId
  status?: 'active' | 'resolved'
  resolvedNote?: string        // 指揮中心處理備註
  author?: string              // 回報者 peerId
  version: number              // Mesh 版本號（演變時遞增、舊版丟棄）
}
