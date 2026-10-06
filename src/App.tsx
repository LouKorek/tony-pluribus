import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth, isAdmin } from './lib/auth'
import { Spinner } from './components/ui'
import AppShell from './layouts/AppShell'
import { LoginPage, OwnerSetupPage, PendingPage, SignupPage } from './pages/auth'
import Overview from './pages/Overview'
import UsersPage from './pages/Users'
import SettingsPage from './pages/Settings'
import { CoachHome, ComingSoon } from './pages/misc'
import { RefProvider } from './lib/scouting'
import ScoutingHome from './pages/scouting/Home'
import AcademiesPage from './pages/scouting/Academies'
import CampsPage, { PlanPage } from './pages/scouting/Camps'
import CampSheet from './pages/scouting/CampSheet'
import FinalsPage from './pages/scouting/Finals'
import PlayersPage from './pages/scouting/Players'
import PoolPage from './pages/scouting/Pool'

export default function App() {
  const { loading, session, profile } = useAuth()

  if (loading) return <Spinner />

  if (!session) return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/setup" element={<OwnerSetupPage />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )

  if (!profile || profile.status !== 'active') return <PendingPage />

  if (profile.role === 'coach') return (
    <Routes>
      <Route path="*" element={<CoachHome />} />
    </Routes>
  )

  const admin = isAdmin(profile)
  return (
    <RefProvider>
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Overview />} />
        <Route path="scouting" element={<ScoutingHome />} />
        <Route path="scouting/plan" element={<PlanPage />} />
        <Route path="scouting/academies" element={<AcademiesPage />} />
        <Route path="scouting/camps" element={<CampsPage />} />
        <Route path="scouting/camps/:id" element={<CampSheet />} />
        <Route path="scouting/finals" element={<FinalsPage />} />
        <Route path="scouting/players" element={<PlayersPage />} />
        <Route path="scouting/pool" element={<PoolPage />} />
        <Route path="users" element={admin ? <UsersPage /> : <Navigate to="/" replace />} />
        <Route path="settings" element={admin ? <SettingsPage /> : <Navigate to="/" replace />} />
        <Route path="login" element={<Navigate to="/" replace />} />
        <Route path="signup" element={<Navigate to="/" replace />} />
        <Route path="setup" element={<Navigate to="/" replace />} />
        <Route path="*" element={<ComingSoon />} />
      </Route>
    </Routes>
    </RefProvider>
  )
}
