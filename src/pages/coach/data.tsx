import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase, type AgeGroup } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import type { Decision, PStatus, Stage } from '../../lib/scouting'

export interface JourneyItem {
  id: string; camp_id: string; camp: string; stage: Stage; starts_on: string | null; ends_on: string | null; venue: string | null
  rsvp_deadline: string | null; status: PStatus; decision: Decision | null; message: string | null; absence_reason: string | null; note: string | null
}
export interface SquadPlayer {
  id: string; first_name: string; last_name: string; birth_year: number; birth_date: string | null; positions: string | null
  preferred_foot: 'left' | 'right' | 'both' | null; guardian_name: string | null; guardian_phone: string | null; guardian_consent: boolean
  coach_notes: string | null; created_at: string; journey: JourneyItem[]
}
export interface OpenCamp {
  id: string; name: string; starts_on: string | null; ends_on: string | null; venue: string | null; age_groups: string[] | null
  district: string | null; own_district: boolean; submitted: number
}
export interface Standing { submitted: number; selected: number; rank: number | null; academies: number; region: string | null }
export interface Notif { id: string; title: string; body: string | null; link: string | null; read_at: string | null; created_at: string }
export interface MyAcademy { id: string; name: string; district: { name: string; region: { name: string } | null } | null }

interface CoachData {
  loading: boolean; error: string | null
  academy: MyAcademy | null; squad: SquadPlayer[]; camps: OpenCamp[]; standing: Standing | null; notifs: Notif[]; groups: AgeGroup[]
  reload: () => Promise<void>
  markRead: () => Promise<void>
  /** Staff looking at an academy's portal: read-only, links stay under the preview path. */
  preview: boolean
  base: string
}

const Ctx = createContext<CoachData | null>(null)

export function CoachDataProvider({ children, previewAcademy }: { children: ReactNode; previewAcademy?: string }) {
  const { profile, scoutingSeason } = useAuth()
  const [state, setState] = useState<Omit<CoachData, 'reload' | 'markRead' | 'preview' | 'base'>>({ loading: true, error: null, academy: null, squad: [], camps: [], standing: null, notifs: [], groups: [] })

  const reload = useCallback(async () => {
    const args = previewAcademy ? { p_academy: previewAcademy } : {}
    const academyId = previewAcademy ?? profile?.academy_id ?? ''
    const [sq, ca, st, no, ac, gr] = await Promise.all([
      supabase.rpc('coach_squad', args),
      supabase.rpc('coach_camps', args),
      supabase.rpc('coach_standing', args),
      previewAcademy ? Promise.resolve({ data: [], error: null }) : supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(60),
      supabase.from('academies').select('id, name, district:districts(name, region:regions(name))').eq('id', academyId).maybeSingle(),
      scoutingSeason ? supabase.from('age_groups').select('*').eq('season_id', scoutingSeason.id).order('sort') : Promise.resolve({ data: [], error: null }),
    ])
    const err = sq.error || ca.error || st.error || no.error || ac.error || gr.error
    setState({
      loading: false, error: err ? err.message : null,
      squad: (sq.data as SquadPlayer[]) ?? [], camps: (ca.data as OpenCamp[]) ?? [], standing: (st.data as Standing) ?? null,
      notifs: (no.data as Notif[]) ?? [], academy: (ac.data as unknown as MyAcademy) ?? null, groups: (gr.data as AgeGroup[]) ?? [],
    })
  }, [profile?.academy_id, scoutingSeason, previewAcademy])

  useEffect(() => { reload() }, [reload])

  const markRead = useCallback(async () => {
    if (previewAcademy) return
    await supabase.rpc('mark_notifications_read')
    setState(s => ({ ...s, notifs: s.notifs.map(n => n.read_at ? n : { ...n, read_at: new Date().toISOString() }) }))
  }, [previewAcademy])

  const base = previewAcademy ? `/coach-preview/${previewAcademy}` : ''
  return <Ctx.Provider value={{ ...state, reload, markRead, preview: !!previewAcademy, base }}>{children}</Ctx.Provider>
}

export function useCoach() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useCoach outside provider')
  return c
}

export const groupOf = (year: number | null | undefined, groups: AgeGroup[]) =>
  year ? groups.find(g => year >= Math.min(g.birth_year_from, g.birth_year_to) && year <= Math.max(g.birth_year_from, g.birth_year_to))?.code ?? null : null

/** The open invitations to a final that still wait for the coach's answer. */
export const pendingInvites = (squad: SquadPlayer[]) =>
  squad.flatMap(p => p.journey.filter(j => j.stage !== 'district' && j.status === 'invited').map(j => ({ player: p, item: j })))

/** Answers the coach may still change: invitations to a final that has not started yet. */
export const openInvites = (squad: SquadPlayer[]) => {
  const today = new Date().toISOString().slice(0, 10)
  return squad.flatMap(p => p.journey
    .filter(j => j.stage !== 'district' && ['invited', 'confirmed', 'declined'].includes(j.status) && (!j.starts_on || j.starts_on >= today))
    .map(j => ({ player: p, item: j })))
}
