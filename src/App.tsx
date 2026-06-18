import { Routes, Route } from 'react-router-dom'
import { I18nProvider } from './i18n'
import { UserProvider } from './contexts/UserContext'
import { ShelterProvider } from './contexts/ShelterContext'
import Header from './components/Header'
import BottomNav from './components/BottomNav'
import HelpFab from './components/HelpFab'
import PwaBanner from './components/PwaBanner'
import HomePage from './pages/HomePage'
import ShelterDetailPage from './pages/ShelterDetailPage'
import RoutePage from './pages/RoutePage'
import ReportPage from './pages/ReportPage'
import MeshPage from './pages/MeshPage'

export default function App() {
  return (
    <I18nProvider>
    <UserProvider>
      <ShelterProvider>
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
      </ShelterProvider>
    </UserProvider>
    </I18nProvider>
  )
}
