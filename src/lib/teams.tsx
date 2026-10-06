import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase, type Season } from './supabase'
import { useAuth } from './auth'
import { Select, cx } from '../components/ui'

export interface Team { id: string; season_id: string; name: string; age_group: string | null; competitions: string | null; folder: string | null; sort: number }
export interface TeamPlayer { id: string; team_id: string; player_id: string; position: string | null; slot: number | null; shirt: number | null; status: 'active' | 'injured' | 'loan' | 'left'; notes: string | null
  player: { id: string; first_name: string; last_name: string; birth_year: number | null; birth_date: string | null; photo_file_id: string | null; academy_id: string | null } }
export interface TeamDay { id: string; team_id: string; day: string; seq: number; kind: 'training' | 'match' | 'test' | 'meeting' | 'video' | 'rest'; minutes: number | null; label: string | null }
export interface Mark { day_id: string; player_id: string; minutes: number | null; code: string | null }
export interface Measurement { id: string; player_id: string; team_id: string | null; taken_on: string | null; metric: Metric; value: number; note: string | null }
export type Metric = 'sprint_10m' | 'sprint_20m' | 'weight_kg' | 'height_cm' | 'foot_cm' | 'cj_cm' | 'yoyo_m' | 'other'
export interface Match { id: string; team_id: string; number: number | null; played_on: string | null; competition: string; opponent: string; venue: 'home' | 'away' | 'neutral' | null; goals_for: number | null; goals_against: number | null; notes: string | null; report_file_id: string | null }
export interface MatchPlayer { match_id: string; player_id: string; minutes: number | null; goals: number; assists: number; yellow: number; red: number; started: boolean | null }
export interface TrainingPlan { id: string; team_id: string; number: number | null; day: string | null; month: string | null; microcycle: string | null; objective: string | null; notes: string | null; file_id: string | null }
export interface Evaluation { id: string; player_id: string; season_id: string; grade: 'A' | 'B' | 'C' | 'D' | null; potential: number | null; performance: number | null; summary: string | null; report_file_id: string | null }

export const POS_LABEL: Record<string, string> = { GK: 'Goalkeeper', D: 'Defender', M: 'Midfielder', F: 'Forward' }
export const POS_ORDER = ['GK', 'D', 'M', 'F']
export const CODE_LABEL: Record<string, string> = {
  A: 'Absent', I: 'Injured', JA: 'Justified absence', M: 'Match', SM: 'School match', S: 'Suspended', SI: 'Sick', PT: 'Physical tests', TM: 'Team meeting', '*': 'Video analysis',
}
export const METRIC_LABEL: Record<Metric, [string, string]> = {
  sprint_10m: ['Sprint 10 m', 's'], sprint_20m: ['Sprint 20 m', 's'], weight_kg: ['Weight', 'kg'], height_cm: ['Height', 'cm'], foot_cm: ['Foot length', 'cm'],
  cj_cm: ['Counter jump', 'cm'], yoyo_m: ['Yo-yo test', 'm'], other: ['Other', ''],
}
export const GRADE_LABEL: Record<string, [string, string]> = {
  A: ['Potential and performance', 'bg-good text-white'], B: ['Potential, less performance', 'bg-info text-white'],
  C: ['Performance, less potential', 'bg-warn text-white'], D: ['Less potential, less performance', 'bg-black/15 text-text'],
}
export const pname = (p: { first_name: string; last_name: string }) => (p.last_name && p.last_name !== '—' ? `${p.last_name.toUpperCase()} ${p.first_name}` : p.first_name)

/** The season the team screens show. Defaults to the running (operational) season. */
export function useTeamSeason() {
  const { seasons } = useAuth()
  const [id, setId] = useState<string | null>(() => { try { return sessionStorage.getItem('pluribus.teamSeason') } catch { return null } })
  const season: Season | null = seasons.find(s => s.id === id) ?? seasons.find(s => s.is_current_operational) ?? seasons[seasons.length - 1] ?? null
  const set = (v: string) => { setId(v); try { sessionStorage.setItem('pluribus.teamSeason', v) } catch { /* storage blocked */ } }
  return { season, setSeason: set, seasons }
}

/** Teams of a season and the one picked (kept in the address so a link opens the same team). */
export function useTeams(seasonId: string | undefined) {
  const [teams, setTeams] = useState<Team[] | null>(null)
  const [teamId, setTeamId] = useState<string | null>(() => { try { return sessionStorage.getItem('pluribus.team') } catch { return null } })
  useEffect(() => {
    if (!seasonId) return
    setTeams(null)
    supabase.from('teams').select('*').eq('season_id', seasonId).order('sort').then(({ data }) => setTeams((data as Team[]) ?? []))
  }, [seasonId])
  const team = useMemo(() => teams?.find(t => t.id === teamId) ?? teams?.[0] ?? null, [teams, teamId])
  const pick = useCallback((id: string) => { setTeamId(id); try { sessionStorage.setItem('pluribus.team', id) } catch { /* storage blocked */ } }, [])
  return { teams, team, pick }
}

export function useRoster(teamId: string | undefined) {
  const [roster, setRoster] = useState<TeamPlayer[] | null>(null)
  const load = useCallback(async () => {
    if (!teamId) return
    const { data } = await supabase.from('team_players').select('*, player:players(id, first_name, last_name, birth_year, birth_date, photo_file_id, academy_id)').eq('team_id', teamId)
    const list = ((data as TeamPlayer[]) ?? []).sort((a, b) => POS_ORDER.indexOf(a.position ?? 'Z') - POS_ORDER.indexOf(b.position ?? 'Z') || pname(a.player).localeCompare(pname(b.player)))
    setRoster(list)
  }, [teamId])
  useEffect(() => { setRoster(null); load() }, [load])
  return { roster, reload: load }
}

/** Season select + team tabs, shared by all team screens. */
export function TeamBar({ seasonId, onSeason, seasons, teams, teamId, onTeam, extra }: {
  seasonId: string | undefined; onSeason: (id: string) => void; seasons: Season[]; teams: Team[] | null; teamId: string | undefined; onTeam: (id: string) => void; extra?: ReactNode
}) {
  return (
    <div className="mb-5 flex flex-col gap-2 lg:flex-row lg:items-center">
      <Select data-tour="team-season" className="lg:w-44" value={seasonId ?? ''} onChange={e => onSeason(e.target.value)} aria-label="Season">
        {[...seasons].reverse().map(s => <option key={s.id} value={s.id}>Season {s.label}{s.is_current_operational ? ' (now)' : ''}</option>)}
      </Select>
      <div data-tour="team-tabs" className="inline-flex flex-wrap gap-1 rounded-lg bg-black/5 p-1">
        {teams?.length ? teams.map(t => (
          <button key={t.id} onClick={() => onTeam(t.id)}
            className={cx('rounded-md px-3 py-1.5 text-sm font-semibold', t.id === teamId ? 'bg-ink text-white shadow-sm' : 'text-muted hover:text-text')}>{t.name}</button>
        )) : <span className="px-3 py-1.5 text-sm text-muted">{teams ? 'No teams this season' : 'Loading…'}</span>}
      </div>
      {extra && <div className="flex flex-wrap gap-2 lg:ml-auto">{extra}</div>}
    </div>
  )
}

export function fileUrl(root: string | null | undefined, path: string, ext?: string | null) {
  return encodeURI(`${root ?? ''}/${path}`) + (['xlsx', 'xls', 'docx', 'doc', 'pptx', 'ppt'].includes(ext ?? '') ? '?web=1' : '')
}

/** Resolves Talent file ids (photos, reports, plans) to links that open in SharePoint. */
export function useFileLinks(ids: (string | null | undefined)[]) {
  const { project } = useAuth()
  const key = ids.filter(Boolean).sort().join(',')
  const [map, setMap] = useState<Record<string, { url: string; name: string }>>({})
  useEffect(() => {
    const list = key ? key.split(',') : []
    if (!list.length) { setMap({}); return }
    supabase.from('talent_files').select('id, path, name, ext').in('id', list.slice(0, 400)).then(({ data }) => {
      setMap(Object.fromEntries(((data as { id: string; path: string; name: string; ext: string | null }[]) ?? []).map(f => [f.id, { url: fileUrl(project?.sharepoint_root, f.path, f.ext), name: f.name }])))
    })
  }, [key, project?.sharepoint_root])
  return map
}
