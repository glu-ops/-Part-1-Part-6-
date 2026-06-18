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
}
