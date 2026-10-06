import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_KEY as string,
  { auth: { persistSession: true, autoRefreshToken: true } },
)

/** Logins are usernames; Supabase Auth needs an email, so each username maps to an internal address that never receives mail. */
export const usernameToEmail = (u: string) => `${u.trim().toLowerCase()}@users.pluribus.app`

export const USERNAME_RE = /^[a-z0-9._-]{3,32}$/

export type Role = 'owner' | 'admin' | 'staff' | 'scout' | 'observer' | 'coach'
export type Status = 'pending' | 'active' | 'locked'

export interface Profile {
  id: string
  username: string
  full_name: string | null
  phone: string | null
  role: Role
  status: Status
  org_id: string | null
  project_id: string | null
  academy_id: string | null
  requested_academy: string | null
  region_id: string | null
  approved_at: string | null
  last_seen_at: string | null
  created_at: string
}

export interface Project { id: string; name: string; slug: string; country: string | null; partner: string | null; timezone: string; sharepoint_root: string | null }
export interface Season { id: string; project_id: string; label: string; starts_on: string | null; ends_on: string | null; is_current_scouting: boolean; is_current_operational: boolean }
export interface Region { id: string; name: string; sort: number }
export interface District { id: string; name: string; region_id: string }
export interface AgeGroup { id: string; season_id: string; code: string; birth_year_from: number; birth_year_to: number; sort: number }
export interface Academy { id: string; name: string; district_id: string | null; contact_name: string | null; contact_phone: string | null; is_active: boolean }

export const ROLE_LABEL: Record<Role, string> = {
  owner: 'Owner', admin: 'Admin', staff: 'Technical staff', scout: 'Scout', observer: 'Observer', coach: 'Academy coach',
}
export const ROLE_HINT: Record<Role, string> = {
  owner: 'Everything, across all projects',
  admin: 'Whole project, users and settings',
  staff: 'All scouting: plan, camps, decisions, reports',
  scout: 'Enters attendance, tests and grades at camps',
  observer: 'Dashboards and reports, read only',
  coach: 'Own academy only, through the coach portal',
}

export function errMsg(e: unknown): string {
  if (!e) return 'Something went wrong'
  if (typeof e === 'string') return e
  const m = (e as { message?: string }).message
  return m || 'Something went wrong'
}
