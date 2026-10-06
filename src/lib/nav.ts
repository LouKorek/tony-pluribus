import {
  LayoutGrid, Radar, CalendarRange, School, Tent, Trophy, Users2, Sparkles,
  Shirt, ClipboardCheck, Dumbbell, Swords, Timer, Star, FolderLock, FileText, Wallet, Handshake,
  ArrowLeftRight, Building2, Bot, BarChart3, FileSpreadsheet, FolderTree, RefreshCcw, UserCog, Settings,
  type LucideIcon,
} from 'lucide-react'
import type { Role } from './supabase'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  /** stage in which the screen becomes live; items above the current build stage show a "Soon" tag */
  stage: number
  roles?: Role[]
  /** content area that must be at least "view" for the item to show */
  area?: string
}
export interface NavGroup { label: string; items: NavItem[] }

export const BUILD_STAGE = 8

const STAFF: Role[] = ['owner', 'admin', 'staff', 'scout', 'observer']
const ADMIN: Role[] = ['owner', 'admin']

export const NAV: NavGroup[] = [
  { label: '', items: [{ to: '/', label: 'Overview', icon: LayoutGrid, stage: 1, roles: STAFF }] },
  {
    label: 'Scouting',
    items: [
      { to: '/scouting', label: 'Scouting home', icon: Radar, stage: 2, roles: STAFF },
      { to: '/scouting/plan', label: 'Plan', icon: CalendarRange, stage: 2, roles: STAFF, area: 'camps' },
      { to: '/scouting/academies', label: 'Academies', icon: School, stage: 2, roles: STAFF, area: 'academies' },
      { to: '/scouting/camps', label: 'Camps', icon: Tent, stage: 2, roles: STAFF, area: 'camps' },
      { to: '/scouting/finals', label: 'Finals', icon: Trophy, stage: 2, roles: STAFF, area: 'camps' },
      { to: '/scouting/players', label: 'Players', icon: Users2, stage: 2, roles: STAFF, area: 'players' },
      { to: '/scouting/pool', label: 'Potential pool', icon: Sparkles, stage: 2, roles: STAFF, area: 'players' },
    ],
  },
  {
    label: 'Teams',
    items: [
      { to: '/squads', label: 'Squads', icon: Shirt, stage: 7, roles: STAFF, area: 'squads' },
      { to: '/attendance', label: 'Attendance', icon: ClipboardCheck, stage: 7, roles: STAFF, area: 'attendance' },
      { to: '/training', label: 'Training', icon: Dumbbell, stage: 8, roles: STAFF, area: 'training' },
      { to: '/matches', label: 'Matches', icon: Swords, stage: 8, roles: STAFF, area: 'matches' },
      { to: '/physical', label: 'Physical tests', icon: Timer, stage: 7, roles: STAFF, area: 'physical' },
      { to: '/evaluations', label: 'Evaluations', icon: Star, stage: 8, roles: STAFF, area: 'evaluations' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { to: '/player-files', label: 'Player files', icon: FolderLock, stage: 9, roles: ADMIN, area: 'player_files' },
      { to: '/staff-reports', label: 'Staff reports', icon: FileText, stage: 10, roles: STAFF, area: 'staff_reports' },
      { to: '/finance', label: 'Finance', icon: Wallet, stage: 10, roles: ADMIN, area: 'finance' },
      { to: '/partners', label: 'Club & partners', icon: Handshake, stage: 10, roles: STAFF, area: 'partners' },
      { to: '/transfers', label: 'Transfer desk', icon: ArrowLeftRight, stage: 11, roles: STAFF, area: 'transfers' },
      { to: '/club-portal', label: 'Club portal', icon: Building2, stage: 11, roles: ADMIN, area: 'club_portal' },
      { to: '/assistant', label: 'AI assistant', icon: Bot, stage: 11, roles: STAFF, area: 'assistant' },
    ],
  },
  {
    label: 'Insights',
    items: [
      { to: '/dashboards', label: 'Dashboards', icon: BarChart3, stage: 4, roles: STAFF, area: 'insights' },
      { to: '/reports', label: 'Reports', icon: FileSpreadsheet, stage: 4, roles: STAFF, area: 'insights' },
    ],
  },
  {
    label: 'System',
    items: [
      { to: '/files', label: 'Files', icon: FolderTree, stage: 5, roles: STAFF, area: 'files' },
      { to: '/sync', label: 'Sync Center', icon: RefreshCcw, stage: 12, roles: ADMIN },
      { to: '/users', label: 'Users', icon: UserCog, stage: 1, roles: ADMIN },
      { to: '/settings', label: 'Settings', icon: Settings, stage: 1, roles: ADMIN },
    ],
  },
]

export const STAGE_NAME: Record<number, string> = {
  2: 'Scouting', 3: 'Coach portal', 4: 'Dashboards & reports', 5: 'History & files', 6: 'SharePoint sync',
  7: 'Squads', 8: 'Football', 9: 'Player files', 10: 'Operations', 11: 'Scale',
}

export function findNav(path: string): NavItem | undefined {
  for (const g of NAV) for (const i of g.items) if (i.to === path) return i
  return undefined
}
