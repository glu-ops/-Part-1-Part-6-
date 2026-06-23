import { useParams } from 'react-router-dom'
import ShelterDetailView from '../components/ShelterCard/ShelterDetailView'

/** 路由 /shelter/:id：直接渲染共用的避難所詳細資料（頁面版）。 */
export default function ShelterDetailPage() {
  const { id } = useParams()
  return <ShelterDetailView shelterId={id ?? ''} variant="page" />
}
