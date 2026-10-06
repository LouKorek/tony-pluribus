import { lazy, Suspense, type ComponentType } from 'react'
import { Navigate, Route, Routes, useParams } from 'react-router-dom'
import { useAuth, isAdmin } from './lib/auth'
import { Spinner } from './components/ui'
import AppShell from './layouts/AppShell'
import { LoginPage, OwnerSetupPage, PendingPage, SignupPage } from './pages/auth'
// After a new deploy, a tab that was already open asks for page files that no longer exist.
// Reload once to pick up the new version instead of showing a blank screen.
function page<T extends ComponentType<any>>(load: () => Promise<{ default: T }>) {
  return lazy(() => load().catch(err => {
    let reloaded = false
    try { reloaded = sessionStorage.getItem('pluribus.reloaded') === '1'; sessionStorage.setItem('pluribus.reloaded', '1') } catch { /* storage blocked */ }
    if (!reloaded) { window.location.reload(); return new Promise<{ default: T }>(() => {}) }
    throw err
  }))
}

const Overview = page(() => import('./pages/Overview'))
const UsersPage = page(() => import('./pages/Users'))
const SettingsPage = page(() => import('./pages/Settings'))
import { ComingSoon } from './pages/misc'
const CoachApp = page(() => import('./pages/coach/CoachApp'))
import { RefProvider } from './lib/scouting'
const ScoutingHome = page(() => import('./pages/scouting/Home'))
const AcademiesPage = page(() => import('./pages/scouting/Academies'))
const CampsPage = page(() => import('./pages/scouting/Camps'))
const PlanPage = page(() => import('./pages/scouting/Camps').then(m => ({ default: m.PlanPage })))
const CampSheet = page(() => import('./pages/scouting/CampSheet'))
const FinalsPage = page(() => import('./pages/scouting/Finals'))
const PlayersPage = page(() => import('./pages/scouting/Players'))
const PoolPage = page(() => import('./pages/scouting/Pool'))
const DashboardsPage = page(() => import('./pages/insights/Dashboards'))
const ReportsPage = page(() => import('./pages/insights/Reports'))

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
        <Route path="dashboards" element={<DashboardsPage />} />
        <Route path="reports" element={<ReportsPage />} />
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
