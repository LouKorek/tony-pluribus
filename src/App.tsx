import { lazy, Suspense, type ComponentType } from 'react'
import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom'
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
import { ComingSoon, Need } from './pages/misc'
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
const FilesPage = page(() => import('./pages/Files'))
const SquadsPage = page(() => import('./pages/football/Squads'))
const AttendancePage = page(() => import('./pages/football/Attendance'))
const PhysicalPage = page(() => import('./pages/football/Physical'))
const TrainingPage = page(() => import('./pages/football/Training'))
const MatchesPage = page(() => import('./pages/football/Matches'))
const EvaluationsPage = page(() => import('./pages/football/Evaluations'))
const PlayerFilesPage = page(() => import('./pages/ops/PlayerFiles'))
const StaffReportsPage = page(() => import('./pages/ops/StaffReports'))
const FinancePage = page(() => import('./pages/ops/Finance'))
const PartnersPage = page(() => import('./pages/ops/Partners'))
const TransfersPage = page(() => import('./pages/ops/Transfers'))
const ClubPortalPage = page(() => import('./pages/ops/ClubPortal'))
const AssistantPage = page(() => import('./pages/ops/Assistant'))
const SharePage = page(() => import('./pages/Share'))

export default function App() {
  const { loading, session, profile } = useAuth()
  const { pathname } = useLocation()

  // A list shared with a club opens for anyone with the link, signed in or not.
  if (pathname.startsWith('/share/')) return (
    <Suspense fallback={<Spinner />}><Routes><Route path="/share/:token" element={<SharePage />} /></Routes></Suspense>
  )

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
        <Route path="scouting/plan" element={<Need area="camps"><PlanPage /></Need>} />
        <Route path="scouting/academies" element={<Need area="academies"><AcademiesPage /></Need>} />
        <Route path="scouting/camps" element={<Need area="camps"><CampsPage /></Need>} />
        <Route path="scouting/camps/:id" element={<Need area="camps"><CampSheet /></Need>} />
        <Route path="scouting/finals" element={<Need area="camps"><FinalsPage /></Need>} />
        <Route path="scouting/players" element={<Need area="players"><PlayersPage /></Need>} />
        <Route path="scouting/pool" element={<Need area="players"><PoolPage /></Need>} />
        <Route path="dashboards" element={<Need area="insights"><DashboardsPage /></Need>} />
        <Route path="reports" element={<Need area="insights"><ReportsPage /></Need>} />
        <Route path="files" element={<Need area="files"><FilesPage /></Need>} />
        <Route path="squads" element={<Need area="squads"><SquadsPage /></Need>} />
        <Route path="attendance" element={<Need area="attendance"><AttendancePage /></Need>} />
        <Route path="physical" element={<Need area="physical"><PhysicalPage /></Need>} />
        <Route path="training" element={<Need area="training"><TrainingPage /></Need>} />
        <Route path="matches" element={<Need area="matches"><MatchesPage /></Need>} />
        <Route path="evaluations" element={<Need area="evaluations"><EvaluationsPage /></Need>} />
        <Route path="player-files" element={<Need area="player_files"><PlayerFilesPage /></Need>} />
        <Route path="staff-reports" element={<Need area="staff_reports"><StaffReportsPage /></Need>} />
        <Route path="finance" element={<Need area="finance"><FinancePage /></Need>} />
        <Route path="partners" element={<Need area="partners"><PartnersPage /></Need>} />
        <Route path="transfers" element={<Need area="transfers"><TransfersPage /></Need>} />
        <Route path="club-portal" element={<Need area="club_portal"><ClubPortalPage /></Need>} />
        <Route path="assistant" element={<Need area="assistant"><AssistantPage /></Need>} />
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
