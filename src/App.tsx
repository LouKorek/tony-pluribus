import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes, useParams } from 'react-router-dom'
import { useAuth, isAdmin } from './lib/auth'
import { Spinner } from './components/ui'
import AppShell from './layouts/AppShell'
import { LoginPage, OwnerSetupPage, PendingPage, SignupPage } from './pages/auth'
const Overview = lazy(() => import('./pages/Overview'))
const UsersPage = lazy(() => import('./pages/Users'))
const SettingsPage = lazy(() => import('./pages/Settings'))
import { ComingSoon } from './pages/misc'
const CoachApp = lazy(() => import('./pages/coach/CoachApp'))
import { RefProvider } from './lib/scouting'
const ScoutingHome = lazy(() => import('./pages/scouting/Home'))
const AcademiesPage = lazy(() => import('./pages/scouting/Academies'))
const CampsPage = lazy(() => import('./pages/scouting/Camps'))
const PlanPage = lazy(() => import('./pages/scouting/Camps').then(m => ({ default: m.PlanPage })))
const CampSheet = lazy(() => import('./pages/scouting/CampSheet'))
const FinalsPage = lazy(() => import('./pages/scouting/Finals'))
const PlayersPage = lazy(() => import('./pages/scouting/Players'))
const PoolPage = lazy(() => import('./pages/scouting/Pool'))

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
    <Suspense fallback={<Spinner />}>
      <Routes>
        <Route path="/*" element={<CoachApp />} />
      </Routes>
    </Suspense>
  )

  const admin = isAdmin(profile)
  return (
    <RefProvider>
    <Suspense fallback={<Spinner />}>
    <Routes>
      <Route path="coach-preview/:academyId/*" element={<CoachPreview />} />
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
    </Suspense>
    </RefProvider>
  )
}

function CoachPreview() {
  const { academyId } = useParams()
  return <CoachApp key={academyId} previewAcademy={academyId} />
}
