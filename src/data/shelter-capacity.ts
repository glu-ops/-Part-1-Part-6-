import type { ResourceCapacityLevel, SupportTime } from '../types'

export interface ShelterCapacityRecord {
  id: string
  name: string
  address: string
  capacity_people: string
  current_occupancy?: number
  water_support_time: SupportTime
  food_support_time: SupportTime
  medical_support_time: SupportTime
  power_support_time: SupportTime
  physical_capacity: string
  entrance_capacity: string
  resource_capacity_level: ResourceCapacityLevel
  support_time: SupportTime
  resource_conditions: string
  suitable_users: string
  overall_role: string
  management_capacity: string
  notes: string
}

// 由 tainan_east_shelter_capacity_table.txt 轉入。
// capacity_people 依原始資料保留「待補」，避免把推估或既有 mock 最大容量誤作正式容量。
export const SHELTER_CAPACITY_DATA: Record<string, ShelterCapacityRecord> = {
  'TN-E-001': make({
    id: 'TN-E-001',
    name: '東區區公所',
    address: '崇學路 99 號',
    level: 'R2',
    support: '4-24',
    physical: '可利用區公所內部大廳、會議空間、文康休閒區與部分寢室型空間作為短期收容與分流空間。',
    entrance: '有大門口、無障礙坡道、樓梯與電梯，可支援一般民眾與行動不便者進入，但災時報到人流可能集中。',
    conditions: '具行政作業、報到登記、災民等候、醫療關懷、廁所、物資儲放與部分收容分區；但長時間住宿、供餐與持續補給仍需外部支援。',
    users: '區域管理中心、報到分流、短期收容',
    management: '管理容量強，適合作為行政、名冊、分流與救災資訊整合節點。',
    notes: '部分條件可接近 R3；長時間住宿、供餐與持續補給需外部支援。',
  }),
  'TN-E-002': make({
    id: 'TN-E-002',
    name: '崇學國小防空避難室',
    address: '崇學路 183 號',
    level: 'R3',
    support: '24-72',
    physical: '學校型避難所，可利用防空避難室、教室、操場或禮堂周邊空間，具較高收容潛力。',
    entrance: '學校通常具前門、側門與操場動線，可分流大量人潮，入口容量佳。',
    conditions: '具學校型收容潛力，可配置寢室區、家庭區、特別照護區、用餐區、物資、沐浴車、流動廁所與醫療關懷等。',
    users: '社區主要收容點、短中期安置',
    management: '可由校方、里辦、市府與志工共同管理，適合大型社區收容與分區管理。',
    notes: '適合災後短期安置與社區主要收容。',
  }),
  'TN-E-003': make({
    id: 'TN-E-003',
    name: '東峰國中地下室避難所',
    address: '東平路 103 號',
    level: 'R2',
    support: '4-24',
    physical: '以地下室避難為主，物理容量取決於地下室面積、柱距、淨高、通風與可停留面積。',
    entrance: '需確認地下室樓梯數量、是否有無障礙坡道或電梯、出入口是否可雙向疏散。',
    conditions: '地下室適合短時間防空與緊急避難，但若缺少廁所、通風、照明、飲水、物資與寢區，不宜判定為 72 小時收容點。',
    users: '短期防空避難、校園周邊臨時收容',
    management: '可由校方、區公所與里辦協同管理，需補報到、等候、醫療與物資分區。',
    notes: '地下室型空間不建議作為長時間收容點。',
  }),
  'TN-E-004': make({
    id: 'TN-E-004',
    name: '成功大學工學院大樓地下室',
    address: '大學路 1 號（成大工學院）',
    level: 'R2',
    support: '4-24',
    physical: '大學地下室可能有較大物理空間，但需扣除設備室、實驗室、機房、管制區與消防動線。',
    entrance: '成大校園外部可達性佳，但工學院地下室出入口、樓梯與電梯數量會限制實際進入效率。',
    conditions: '具校園水電與室內空間支援，但若未配置物資、用餐、寢區與照護分區，較適合短期避難。',
    users: '校園型短期避難、學生與周邊民眾分流',
    management: '需要校方、院系管理單位與市府協調，處理學生、教職員與外部民眾分流。',
    notes: '短期避難優先，長時間收容需臨時配置物資、用餐與照護分區。',
  }),
  'TN-E-005': make({
    id: 'TN-E-005',
    name: '裕文國小防空避難室',
    address: '裕農路 188 號',
    level: 'R3',
    support: '24-72',
    physical: '學校型避難所，可配置單身男寢室、單身女寢室、家庭寢室、特別照護區、文康休閒區與用餐區。',
    entrance: '具學校校門、校舍與操場動線，若有側門開放，可提升大量人流分流能力。',
    conditions: '具寢室區、家庭區、特別照護區、用餐區、物資區、廁所與醫療關懷站等資源分區潛力。',
    users: '社區主要收容點、家庭與弱勢者短中期安置',
    management: '具行政作業、機動派出所、災民等候與醫療關懷等管理配置潛力。',
    notes: '適合作為家庭與弱勢者短中期安置點。',
  }),
  'TN-E-006': make({
    id: 'TN-E-006',
    name: '東區衛生所緊急避難站',
    address: '東門路一段 28 號',
    level: 'R1',
    support: '0-4',
    physical: '衛生所不以大量住宿為主，物理容量較小，適合短暫停留、醫療照護與傷病分流。',
    entrance: '需確認主要入口、無障礙坡道、候診區動線與緊急出入口；大量人潮可能造成擁擠。',
    conditions: '醫療與健康照護能力較強，但若缺少寢室、用餐、物資與大量廁所，不宜作為長時間收容。',
    users: '醫療支援站、傷病分流、弱勢者轉介',
    management: '管理容量偏向醫療與照護管理，適合作為避難系統中的醫療支援節點。',
    notes: '醫療支援優先，不適合大量或長時間住宿收容。',
  }),
  'TN-E-007': make({
    id: 'TN-E-007',
    name: '勝利國小防空避難室',
    address: '勝利路 103 號',
    level: 'R3',
    support: '24-72',
    physical: '學校型避難所，可配置單身男寢室、單身女寢室、家庭寢室、特別照護區、文康休閒區與用餐區。',
    entrance: '學校前門、側門與操場動線可提供分流條件，入口容量佳。',
    conditions: '若具備寢室區、家庭區、特別照護區、用餐區、物資區、廁所、沐浴或流動廁所、報到登記與行政管理，可支撐 24-72 小時。',
    users: '大型社區收容點、家庭與學生族群安置',
    management: '可配置行政作業、收容民眾等候區、親友協尋與志工窗口、機動派出所，管理容量佳。',
    notes: '適合大型社區收容與家庭、學生族群安置。',
  }),
  'TN-E-008': make({
    id: 'TN-E-008',
    name: '台南市立醫院地下停車場避難區',
    address: '崇德路 670 號',
    level: 'R1',
    support: '0-4',
    physical: '地下停車場面積可能較大，但需扣除車道、柱位、設備空間、消防通道與醫院營運需求。',
    entrance: '停車場坡道可進出，但需人車分流，且需避免干擾救護車、病患與醫院急救動線。',
    conditions: '醫療資源鄰近，但醫院資源優先服務病患；通風、照明、廁所、水電與停車場空氣品質需特別確認。',
    users: '緊急避難、醫療鄰近支援、短期防護',
    management: '需由醫院、市府與警消共同協調，適合作為醫療避難與傷病支援節點。',
    notes: '部分條件可達 R2；最高可視情況延伸至 24 小時。',
  }),
  'TN-E-009': make({
    id: 'TN-E-009',
    name: '東光國小防空避難室',
    address: '崇德路 168 號',
    level: 'R2',
    support: '4-24',
    physical: '學校型避難所，具備教室、操場、廁所與室內外空間成為收容點的潛力。',
    entrance: '學校入口通常有校門、側門與操場動線；防空避難室入口仍需確認樓梯、坡道與無障礙條件。',
    conditions: '若確認有寢室區、用餐區、物資儲放、流動廁所、沐浴與醫療關懷，可升為 R3。',
    users: '鄰里收容、校園型短期避難',
    management: '可由校方、里辦、市府與志工共同管理，建議配置報到、弱勢照護、家庭區與物資發放。',
    notes: '若補足物資可達 R3；補給完整可達 24-72 小時。',
  }),
  'TN-E-010': make({
    id: 'TN-E-010',
    name: '大港社區活動中心避難所',
    address: '大港街 45 號',
    level: 'R2',
    support: '4-24',
    physical: '社區活動中心可利用活動大廳作為主要收容空間，物理容量中等，適合鄰里型短期收容。',
    entrance: '入口可能較少，需確認是否有側門、無障礙坡道與戶外集合空間。',
    conditions: '通常具廁所、簡易儲藏或活動空間，但若沒有沐浴、完整供餐、醫療照護與大量物資，不適合 72 小時收容。',
    users: '鄰里短期收容、分流與等待轉送',
    management: '適合由里辦、社區管理單位與志工協助，作為鄰里分流點。',
    notes: '鄰里型短期收容，長時間收容需要外部補給。',
  }),
  'TN-E-011': make({
    id: 'TN-E-011',
    name: '復興國小防空避難室',
    address: '裕農路 59 號',
    level: 'R3',
    support: '24-72',
    physical: '學校型收容配置完整，可包含寢室、家庭寢室、文康休閒、特別照護與用餐空間。',
    entrance: '圖面可見入口、側門、前門、災民出入口、校師生出入口與步道，入口分流條件清楚。',
    conditions: '具寢室、家庭寢室、文康休閒、特別照護、用餐、醫療關懷、流動廁所、物資與行政管理等短中期收容條件。',
    users: '主要社區收容點、弱勢與家庭安置',
    management: '有行政作業、客組、災民等候、機動派出所與醫療關懷站，管理架構完整。',
    notes: '適合主要社區收容、弱勢與家庭安置。',
  }),
  'TN-E-012': make({
    id: 'TN-E-012',
    name: '東區戶政事務所地下室',
    address: '東門路一段 120 號',
    level: 'R1',
    support: '0-4',
    physical: '行政機關地下室型避難點，容量需看地下室面積、停留淨空、通風與設備占用。',
    entrance: '需確認地下室樓梯、電梯、無障礙坡道與出入口數量；若只有單一樓梯，避難效率受限。',
    conditions: '具行政與名冊管理優勢，但地下室若缺乏寢室、用餐、物資與大量衛生設備，主要適合短時間避難。',
    users: '報到登記、身份資料管理、短期避難',
    management: '行政管理能力較好，適合資訊公告、身份確認與名冊管理。',
    notes: '部分條件可達 R2；最高可延伸至 24 小時。',
  }),
  'TN-E-013': make({
    id: 'TN-E-013',
    name: '崇善社區鄰里活動站',
    address: '崇善路 22 號',
    level: 'R1',
    support: '0-4',
    physical: '鄰里活動站通常空間較小，物理容量有限，適合短時間停留、鄰里集合或弱勢者暫時安置。',
    entrance: '入口容量可能偏低，需確認是否有無障礙入口、側門與戶外等候空間。',
    conditions: '若缺少完整寢區、供餐、物資、醫療與沐浴條件，不建議作為長時間收容點。',
    users: '鄰里集合點、短暫避難、轉送節點',
    management: '適合由里辦與志工管理，作為小型社區分流點。',
    notes: '小型社區分流點，不建議長時間收容。',
  }),
  'TN-E-014': make({
    id: 'TN-E-014',
    name: '成功大學圖書館地下室',
    address: '大學路 1 號（成大圖書館）',
    level: 'R2',
    support: '4-24',
    physical: '圖書館地下室可能具較大室內空間，但需扣除書庫、設備、機房、管制區與消防動線。',
    entrance: '成大校園可達性佳，但圖書館地下室入口、樓梯、電梯與管制門會影響入口容量。',
    conditions: '有廁所、照明、電力與校園管理條件，但物資、醫療、用餐與長時間住宿功能需臨時配置。',
    users: '校園短期避難、學生與周邊民眾分流',
    management: '需要校方與市府協調，重點是師生與外部民眾分流、空間管制與資訊公告。',
    notes: '短期避難為主，長時間住宿功能需臨時配置。',
  }),
  'TN-E-015': make({
    id: 'TN-E-015',
    name: '台糖長榮酒店地下停車場',
    address: '東門路一段 289 號',
    level: 'R1',
    support: '0-4',
    physical: '地下停車場物理面積可能較大，短時間容納能力高，但需考慮車道坡度、柱位、車輛停放、通風與消防。',
    entrance: '停車場出入口通常可容納車行，但人行避難需另行分流；坡道、車道、樓梯與電梯是關鍵。',
    conditions: '若飯店開放廁所、飲水、餐飲後勤與管理人力，才可能提升至 R2；否則以短期防護為主。',
    users: '短期防空避難、大量人群臨時停留',
    management: '需依賴飯店管理單位、市府與警消合作，長時間收容與民眾登記需外部系統支援。',
    notes: '業者配合可達 R2；最高可延伸至 24 小時。',
  }),
  'TN-E-016': make({
    id: 'TN-E-016',
    name: '東區消防分隊緊急避難區',
    address: '東門路二段 88 號',
    level: 'R1',
    support: '0-4',
    physical: '消防分隊本身為救災調度據點，不適合大量住宿收容，物理容量應以緊急暫時避難、等候與轉送為主。',
    entrance: '消防車出入口必須保持暢通，民眾入口與救災車行動線要嚴格分離。',
    conditions: '強項是救災、通訊與緊急應變，不是大量住宿、供餐或長時間收容。',
    users: '緊急支援、救災轉介、短暫避難',
    management: '管理容量強在災害應變與指揮協調，適合作為緊急支援與轉介節點。',
    notes: '救災調度優先，不適合大量住宿收容。',
  }),
}

function make(input: {
  id: string
  name: string
  address: string
  level: ResourceCapacityLevel
  support: SupportTime
  physical: string
  entrance: string
  conditions: string
  users: string
  management: string
  notes: string
}): ShelterCapacityRecord {
  return {
    id: input.id,
    name: input.name,
    address: input.address,
    capacity_people: '待補',
    water_support_time: input.support,
    food_support_time: input.support,
    medical_support_time: input.support,
    power_support_time: input.support,
    physical_capacity: input.physical,
    entrance_capacity: input.entrance,
    resource_capacity_level: input.level,
    support_time: input.support,
    resource_conditions: input.conditions,
    suitable_users: input.users,
    overall_role: levelRole(input.level),
    management_capacity: input.management,
    notes: input.notes,
  }
}

function levelRole(level: ResourceCapacityLevel): string {
  switch (level) {
    case 'R1': return '臨時停留型'
    case 'R2': return '短期收容型'
    case 'R3': return '中期收容型'
    case 'R4': return '長期支援型'
  }
}
