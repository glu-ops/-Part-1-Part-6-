import { Marker, Tooltip } from 'react-leaflet'
import L from 'leaflet'
import { useI18n } from '../../i18n'
import type { Shelter, OverallStatus } from '../../types'

const STATUS_COLOR: Record<OverallStatus, string> = {
  safe:    '#889D73',
  caution: '#F5C776',
  danger:  '#B30303',
}

/**
 * 白色光暈光點：光暈大小對應重要程度（容量越大光暈越大）；
 * 節點核心顏色用紅黃綠代表安全狀態（地圖上唯一彩色元素）。
 */
function makeIcon(status: OverallStatus, notSuitable: boolean, physical: number): L.DivIcon {
  const color = notSuitable ? '#8A8D84' : STATUS_COLOR[status]
  // 容量 → 光暈直徑（28 ~ 72px）
  const halo = Math.round(28 + Math.min(1, physical / 400) * 44)
  const core = notSuitable ? 12 : 16
  const ping = status === 'danger' && !notSuitable
    ? `<div class="marker-ping" style="position:absolute;inset:0;border-radius:50%;background:${color};opacity:.35;"></div>`
    : ''

  return L.divIcon({
    className: '',
    html: `
      <div style="position:relative;width:${halo}px;height:${halo}px;display:flex;align-items:center;justify-content:center;">
        <!-- 白色光暈擴散 -->
        <div class="marker-halo" style="
          position:absolute;inset:0;border-radius:50%;
          background:radial-gradient(circle, rgba(255,255,255,.45) 0%, rgba(255,255,255,.12) 45%, transparent 70%);
        "></div>
        ${ping}
        <!-- 彩色狀態核心 -->
        <div style="
          position:relative;width:${core}px;height:${core}px;border-radius:50%;
          background:${color};
          border:2px solid rgba(255,255,255,${notSuitable ? '.55' : '.95'});
          box-shadow:0 0 10px ${color}, 0 0 0 1px rgba(0,0,0,.2);
        "></div>
      </div>`,
    iconSize: [halo, halo],
    iconAnchor: [halo / 2, halo / 2],
    tooltipAnchor: [halo / 2, 0],
  })
}

interface Props {
  shelter: Shelter
  status: OverallStatus
  notSuitable: boolean
  onClick: () => void
}

export default function ShelterMarker({ shelter: s, status, notSuitable, onClick }: Props) {
  const { t } = useI18n()
  const icon = makeIcon(status, notSuitable, s.capacity.physical)
  const occ = Math.round((s.capacity.current_estimate / s.capacity.physical) * 100)

  return (
    <Marker
      position={[s.lat, s.lng]}
      icon={icon}
      eventHandlers={{ click: onClick }}
    >
      <Tooltip direction="right" offset={[8, 0]} opacity={1}>
        <div style={{ fontFamily: 'inherit', fontSize: 12, minWidth: 140 }}>
          <div style={{ fontWeight: 700, marginBottom: 2 }}>{s.name}</div>
          {notSuitable
            ? <span style={{ color: '#8A8D84' }}>⚠ {t('common.notApplicable')}</span>
            : <>
                <div>{t('home.occupancy')}：{s.capacity.current_estimate}/{s.capacity.physical}（{occ}%）</div>
                <div>{t('detail.endurance')}：{s.endurance_hours}{t('common.hours')}</div>
              </>
          }
        </div>
      </Tooltip>
    </Marker>
  )
}
