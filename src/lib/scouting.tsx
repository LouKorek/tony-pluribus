import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase, type Academy, type AgeGroup, type District, type Region, type Season } from './supabase'
import { useAuth } from './auth'

export type Stage = 'district' | 'province_final' | 'national_final'
export type PoolStatus = 'academy_squad' | 'submitted' | 'observed' | 'province_final' | 'national_final' | 'selected' | 'see_again' | 'not_selected' | 'tony_squad' | 'released'
export type Decision = 'selected' | 'see_again' | 'not_selected'
export type PStatus = 'submitted' | 'invited' | 'confirmed' | 'declined' | 'attended' | 'absent' | 'removed'

export interface Camp {
  id: string; project_id: string; season_id: string; stage: Stage; name: string
  region_id: string | null; district_id: string | null; age_groups: string[]
  starts_on: string | null; ends_on: string | null; venue: string | null; duration: string | null; staff: string | null; notes: string | null
  status: 'planned' | 'open' | 'completed' | 'published' | 'cancelled'; submissions_open: boolean; rsvp_deadline: string | null; created_at: string
}
export interface CampStats { camp_id: string; total: number; submitted: number; invited: number; attended: number; absent: number; selected: number; see_again: number }

export interface Player {
  id: string; project_id: string; first_name: string; last_name: string; birth_year: number | null; birth_date: string | null
  age_status: 'declared' | 'doubtful' | 'verified'; preferred_foot: 'left' | 'right' | 'both' | null; positions: string | null
  academy_id: string | null; district_id: string | null; guardian_name: string | null; guardian_phone: string | null; guardian_consent: boolean
  coach_notes: string | null; staff_notes: string | null; pool_status: PoolStatus; source: string; merged_into: string | null
  created_at: string; updated_at: string; archived_at: string | null
}
export interface Participant {
  id: string; camp_id: string; player_id: string; age_group: string | null; status: PStatus
  sprint_10m: number | null; sprint_20m: number | null; cj_cm: number | null; obs: 'A' | 'B+' | 'B' | 'C' | null; decision: Decision | null
  is_goalkeeper: boolean; grade_a: boolean; position: string | null; team: string | null; comment: string | null; absence_reason: string | null
  submission_note: string | null; coach_message: string | null; decision_published: boolean; created_at: string; updated_at: string
}

export const STAGE_LABEL: Record<Stage, string> = { district: 'District camp', province_final: 'Province final', national_final: 'National final' }
export const STAGE_SHORT: Record<Stage, string> = { district: 'District', province_final: 'Province final', national_final: 'National final' }
export const POOL_LABEL: Record<PoolStatus, string> = {
  academy_squad: 'In academy squad', submitted: 'Submitted', observed: 'Seen at district camp', province_final: 'Province final',
  national_final: 'National final', selected: 'Selected', see_again: 'See again', not_selected: 'Not selected', tony_squad: 'Tony squad', released: 'Released',
}
export const POOL_ORDER: PoolStatus[] = ['academy_squad', 'submitted', 'observed', 'province_final', 'national_final', 'see_again', 'selected', 'tony_squad', 'not_selected', 'released']
export const DECISION_LABEL: Record<Decision, string> = { selected: 'Selected', see_again: 'See again', not_selected: 'Not selected' }
export const PSTATUS_LABEL: Record<PStatus, string> = { submitted: 'Submitted', invited: 'Invited', confirmed: 'Confirmed', declined: 'Declined', attended: 'Attended', absent: 'Absent', removed: 'Removed' }
export const OBS: ('A' | 'B+' | 'B' | 'C')[] = ['A', 'B+', 'B', 'C']
export const POSITIONS = ['GK', 'RB', 'CB', 'LB', 'DM', 'CM', 'AM', 'RW', 'LW', 'ST']

export const fullName = (p: { first_name: string; last_name: string }) => `${p.first_name} ${p.last_name}`.trim()
export const fmtDate = (d: string | null | undefined, withYear = true) =>
  d ? new Date(d + (d.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}) }) : '—'
export const fmtRange = (a: string | null, b: string | null) => !a ? 'Date to be set' : !b || a === b ? fmtDate(a) : `${fmtDate(a, false)} – ${fmtDate(b)}`

/** Scouting for season "2027-2028" happens during 2026-27: Sep 2026 to Jul 2027. */
export function scoutingWindow(s: Season | null): { from: string; to: string } {
  const y = s ? parseInt(s.label.slice(0, 4)) : new Date().getFullYear() + 1
  return { from: `${y - 1}-09-01`, to: `${y}-07-31` }
}

export function ageGroupFor(year: number | null | undefined, groups: AgeGroup[]): string | null {
  if (!year) return null
  return groups.find(g => year >= g.birth_year_from && year <= g.birth_year_to)?.code ?? null
}

/* ───────── shared reference data ───────── */
interface RefData {
  ready: boolean
  regions: Region[]; districts: District[]; academies: Academy[]; groups: AgeGroup[]
  regionOf: (districtId: string | null | undefined) => Region | undefined
  district: (id: string | null | undefined) => District | undefined
  academy: (id: string | null | undefined) => Academy | undefined
  reloadAcademies: () => Promise<void>
}
const RefCtx = createContext<RefData | null>(null)

export function RefProvider({ children }: { children: ReactNode }) {
  const { scoutingSeason, profile } = useAuth()
  const [regions, setRegions] = useState<Region[]>([])
  const [districts, setDistricts] = useState<District[]>([])
  const [academies, setAcademies] = useState<Academy[]>([])
  const [groups, setGroups] = useState<AgeGroup[]>([])
  const [ready, setReady] = useState(false)

  const reloadAcademies = useCallback(async () => {
    const all: Academy[] = []
    for (let from = 0; ; from += 1000) {
      const { data } = await supabase.from('academies').select('*').order('name').range(from, from + 999)
      all.push(...((data as Academy[]) ?? []))
      if (!data || data.length < 1000) break
    }
    setAcademies(all)
  }, [])

  useEffect(() => {
    if (!profile || profile.status !== 'active') return
    Promise.all([
      supabase.from('regions').select('*').order('sort'),
      supabase.from('districts').select('*').order('name'),
      scoutingSeason ? supabase.from('age_groups').select('*').eq('season_id', scoutingSeason.id).order('sort') : Promise.resolve({ data: [] }),
      reloadAcademies(),
    ]).then(([r, d, g]) => {
      setRegions((r.data as Region[]) ?? []); setDistricts((d.data as District[]) ?? []); setGroups((g.data as AgeGroup[]) ?? []); setReady(true)
    })
  }, [profile, scoutingSeason, reloadAcademies])

  const value = useMemo<RefData>(() => {
    const dm = new Map(districts.map(d => [d.id, d]))
    const rm = new Map(regions.map(r => [r.id, r]))
    const am = new Map(academies.map(a => [a.id, a]))
    return {
      ready, regions, districts, academies, groups, reloadAcademies,
      district: id => (id ? dm.get(id) : undefined),
      regionOf: id => { const d = id ? dm.get(id) : undefined; return d ? rm.get(d.region_id) : undefined },
      academy: id => (id ? am.get(id) : undefined),
    }
  }, [ready, regions, districts, academies, groups, reloadAcademies])

  return <RefCtx.Provider value={value}>{children}</RefCtx.Provider>
}

export function useRefData() {
  const c = useContext(RefCtx)
  if (!c) throw new Error('useRefData outside provider')
  return c
}
