import { Routes, Route, useLocation } from 'react-router-dom'
import { I18nProvider } from './i18n'
import { UserProvider } from './contexts/UserContext'
import { ShelterProvider } from './contexts/ShelterContext'
import { IdentityProvider } from './contexts/IdentityContext'
import { MeshProvider } from './contexts/MeshContext'
import Header from './components/Header'
import BottomNav from './components/BottomNav'
import HelpFab from './components/HelpFab'
import PwaBanner from './components/PwaBanner'
import NameGate from './components/NameGate'
import HomePage from './pages/HomePage'
import ShelterDetailPage from './pages/ShelterDetailPage'
import RoutePage from './pages/RoutePage'
import ReportPage from './pages/ReportPage'
import MeshPage from './pages/MeshPage'
import RescueCenterPage from './pages/RescueCenterPage'

export default function App() {
  // 指揮中心（/rescue）為獨立官方介面：不顯示市民端 Header/導覽，
  // 也不掛市民端 MeshProvider（它用自己寫死 ID 的節點）。
  const pathname = useLocation().pathname
  const bare = pathname === '/rescue' || pathname.startsWith('/rescue/')

  return (
    <I18nProvider>
    <UserProvider>
      <ShelterProvider>
        {bare ? (
          <Routes>
            <Route path="/rescue/*" element={<RescueCenterPage />} />
          </Routes>
        ) : (
          <IdentityProvider>
            <MeshProvider>
              <NameGate />
              <Header />
              <PwaBanner />
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/shelter/:id" element={<ShelterDetailPage />} />
                <Route path="/route" element={<RoutePage />} />
                <Route path="/report" element={<ReportPage />} />
                <Route path="/mesh" element={<MeshPage />} />
              </Routes>
              <BottomNav />
              <HelpFab />
            </MeshProvider>
          </IdentityProvider>
        )}
      </ShelterProvider>
    </UserProvider>
    </I18nProvider>
  )
}
