import type { OverallStatus, ResourceStatus, Shelter, SupportTime } from '../types'
import { SHELTER_CAPACITY_DATA } from '../data/shelter-capacity'

const SUPPORT_ORDER: Record<SupportTime, number> = {
  '0-4': 0,
  '4-24': 1,
  '24-72': 2,
  '72+': 3,
}

export function supportTimeLabel(time?: SupportTime, hoursLabel = '小時'): string {
  switch (time) {
    case '0-4': return `0-4 ${hoursLabel}`
    case '4-24': return `4-24 ${hoursLabel}`
    case '24-72': return `24-72 ${hoursLabel}`
    case '72+': return `72+ ${hoursLabel}`
    default: return '待補'
  }
}

export function supportTimeColor(time?: SupportTime): string {
  switch (time) {
    case '0-4': return 'text-status-danger'
    case '4-24': return 'text-status-caution'
    case '24-72':
    case '72+':
      return 'text-status-safe'
    default:
      return 'text-white/45'
  }
}

export function supportTimeToResourceStatus(time?: SupportTime): ResourceStatus {
  switch (time) {
    case '0-4': return 'red'
    case '4-24': return 'yellow'
    case '24-72':
    case '72+':
      return 'green'
    default:
      return 'yellow'
  }
}

export function getShelterSupportTimes(shelter: Shelter): Record<'water' | 'food' | 'medical' | 'power', SupportTime | undefined> {
  return {
    water: shelter.water_support_time,
    food: shelter.food_support_time,
    medical: shelter.medical_support_time,
    power: shelter.power_support_time,
  }
}

export function getResourceCapacityStatus(shelter: Shelter): OverallStatus | null {
  const times = Object.values(getShelterSupportTimes(shelter)).filter(Boolean) as SupportTime[]
  if (!times.length) return null

  const zeroToFourCount = times.filter(t => t === '0-4').length
  if (zeroToFourCount >= 2) return 'danger'
  if (zeroToFourCount === 1) return 'caution'

  const stableCount = times.filter(t => SUPPORT_ORDER[t] >= SUPPORT_ORDER['24-72']).length
  if (stableCount >= Math.ceil(times.length / 2)) return 'safe'

  return 'caution'
}

export function getResourceCapacityHint(shelter: Shelter): string {
  const status = getResourceCapacityStatus(shelter)
  if (status === 'danger') return '不建議長時間收容'
  if (status === 'caution') return '資源有限'
  if (status === 'safe') return '適合短中期收容'
  return '資源資料待補'
}

export function enrichShelterWithCapacity(shelter: Shelter): Shelter {
  const capacity = SHELTER_CAPACITY_DATA[shelter.shelter_id]
  if (!capacity) return shelter

  return {
    ...shelter,
    capacity_people: capacity.capacity_people,
    current_occupancy: shelter.capacity.current_estimate,
    water_support_time: capacity.water_support_time,
    food_support_time: capacity.food_support_time,
    medical_support_time: capacity.medical_support_time,
    power_support_time: capacity.power_support_time,
    physical_capacity: capacity.physical_capacity,
    entrance_capacity: capacity.entrance_capacity,
    resource_capacity_level: capacity.resource_capacity_level,
    support_time: capacity.support_time,
    resource_conditions: capacity.resource_conditions,
    suitable_users: capacity.suitable_users,
    overall_role: capacity.overall_role,
    management_capacity: capacity.management_capacity,
    notes: capacity.notes,
    resources: {
      water: supportTimeToResourceStatus(capacity.water_support_time),
      food: supportTimeToResourceStatus(capacity.food_support_time),
      medical: supportTimeToResourceStatus(capacity.medical_support_time),
      power: supportTimeToResourceStatus(capacity.power_support_time),
    },
  }
}
