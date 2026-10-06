import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth, isAdmin } from './lib/auth'
import { Spinner } from './components/ui'
import AppShell from './layouts/AppShell'
import { LoginPage, OwnerSetupPage, PendingPage, SignupPage } from './pages/auth'
import Overview from './pages/Overview'
import UsersPage from './pages/Users'
import SettingsPage from './pages/Settings'
import { CoachHome, ComingSoon } from './pages/misc'

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
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Overview />} />
        <Route path="users" element={admin ? <UsersPage /> : <Navigate to="/" replace />} />
        <Route path="settings" element={admin ? <SettingsPage /> : <Navigate to="/" replace />} />
        <Route path="login" element={<Navigate to="/" replace />} />
        <Route path="signup" element={<Navigate to="/" replace />} />
        <Route path="setup" element={<Navigate to="/" replace />} />
        <Route path="*" element={<ComingSoon />} />
      </Route>
    </Routes>
  )
}
