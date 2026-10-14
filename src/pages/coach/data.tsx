import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { supabase, type AgeGroup } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { useNotifications, type Notif } from '../../lib/notifications'
import type { Decision, PStatus, Stage } from '../../lib/scouting'

export interface JourneyItem {
  id: string; camp_id: string; camp: string; stage: Stage; starts_on: string | null; ends_on: string | null; venue: string | null
  rsvp_deadline: string | null; status: PStatus; decision: Decision | null; message: string | null; absence_reason: string | null; note: string | null
}
export interface LogItem { id: string; at: string; kind: 'note' | 'match' | 'absent' | 'measure' | 'status' | 'injury'; text: string | null }
export type SquadStatus = 'active' | 'left' | 'unavailable'
export interface SquadPlayer {
  id: string; first_name: string; last_name: string; birth_year: number; birth_date: string | null; positions: string | null
  preferred_foot: 'left' | 'right' | 'both' | null; guardian_name: string | null; guardian_phone: string | null; guardian_consent: boolean
  coach_notes: string | null; created_at: string; journey: JourneyItem[]
  photo_path: string | null; shirt_no: number | null; height_cm: number | null; weight_kg: number | null; measured_on: string | null
  school: string | null; sector: string | null; joined_year: number | null; squad_status: SquadStatus; pool_status: string
  sessions: number; log: LogItem[]
}
export interface OpenCamp {
  id: string; name: string; starts_on: string | null; ends_on: string | null; venue: string | null; age_groups: string[] | null
  district: string | null; own_district: boolean; submitted: number
}
export interface CampDay { id: string; day_date: string; start_time: string | null; end_time: string | null; notes: string | null }
export type BookingStatus = 'proposed' | 'confirmed' | 'change_requested' | 'declined' | 'arrived'
export interface Booking {
  id: string; day_id: string | null; day_date: string | null; start_time: string | null; end_time: string | null; report_time: string | null
  players_expected: number | null; status: BookingStatus; coach_note: string | null; staff_note: string | null; confirmed_at: string | null; arrived_at: string | null
}
export interface ScheduleCamp {
  id: string; name: string; stage: Stage; status: string; starts_on: string | null; ends_on: string | null; venue: string | null; age_groups: string[] | null
  district: string | null; own_district: boolean; submissions_open: boolean; days: CampDay[]; booking: Booking | null; my_players: number; my_invited: number
}
export interface Session { id: string; held_on: string; topic: string | null; duration_min: number | null; notes: string | null; present: number; players: string[] }
export interface Standing { submitted: number; selected: number; rank: number | null; academies: number; region: string | null }
export type ProgrammeStatus = 'registered' | 'observed' | 'partner' | 'official'
export interface MyAcademy {
  id: string; name: string; district: string | null; region: string | null; contact_name: string | null; contact_phone: string | null
  venue: string | null; training_days: string[]; training_time: string | null; players_count: number | null; age_groups: string[]
  photo_path: string | null; programme_status: ProgrammeStatus; profile_updated_at: string | null; complete: boolean
}

interface CoachData {
  loading: boolean; error: string | null
  academy: MyAcademy | null; squad: SquadPlayer[]; camps: OpenCamp[]; schedule: ScheduleCamp[]; sessions: Session[]
  standing: Standing | null; notifs: Notif[]; groups: AgeGroup[]
  /** signed links of the photos in the squad and the academy, by storage path */
  photos: Record<string, string>
  photoUrl: (path: string | null | undefined) => string | null
  reload: () => Promise<void>
  markRead: () => Promise<void>
  /** Staff looking at an academy's portal: read-only, links stay under the preview path. */
  preview: boolean
  base: string
}

const Ctx = createContext<CoachData | null>(null)
const BUCKET = 'squad-photos'

export function CoachDataProvider({ children, previewAcademy }: { children: ReactNode; previewAcademy?: string }) {
  const { profile, scoutingSeason } = useAuth()
  const notifications = useNotifications()
  const [state, setState] = useState<Omit<CoachData, 'reload' | 'markRead' | 'preview' | 'base' | 'notifs' | 'photoUrl'>>({
    loading: true, error: null, academy: null, squad: [], camps: [], schedule: [], sessions: [], standing: null, groups: [], photos: {},
  })
  const photoCache = useRef<Record<string, { url: string; at: number }>>({})

  const signAll = useCallback(async (paths: string[]) => {
    const fresh = paths.filter(p => p && !(photoCache.current[p] && Date.now() - photoCache.current[p].at < 50 * 60 * 1000))
    if (fresh.length) {
      const { data } = await supabase.storage.from(BUCKET).createSignedUrls(fresh, 3600)
      for (const d of data ?? []) if (d.signedUrl && d.path) photoCache.current[d.path] = { url: d.signedUrl, at: Date.now() }
    }
    return Object.fromEntries(paths.filter(p => photoCache.current[p]).map(p => [p, photoCache.current[p].url]))
  }, [])

  const reload = useCallback(async () => {
    const args = previewAcademy ? { p_academy: previewAcademy } : {}
    const [sq, ca, sc, se, st, ac, gr] = await Promise.all([
      supabase.rpc('coach_squad', args),
      supabase.rpc('coach_camps', args),
      supabase.rpc('coach_schedule', args),
      supabase.rpc('coach_sessions', args),
      supabase.rpc('coach_standing', args),
      supabase.rpc('coach_academy', args),
      scoutingSeason ? supabase.from('age_groups').select('*').eq('season_id', scoutingSeason.id).order('sort') : Promise.resolve({ data: [], error: null }),
    ])
    const err = sq.error || ca.error || sc.error || se.error || st.error || ac.error || gr.error
    const squad = (sq.data as SquadPlayer[]) ?? []
    const academy = (ac.data as MyAcademy) ?? null
    const paths = [...squad.map(p => p.photo_path), academy?.photo_path].filter((p): p is string => !!p)
    const photos = paths.length ? await signAll(paths) : {}
    setState({
      loading: false, error: err ? err.message : null,
      squad, camps: (ca.data as OpenCamp[]) ?? [], schedule: (sc.data as ScheduleCamp[]) ?? [], sessions: (se.data as Session[]) ?? [],
      standing: (st.data as Standing) ?? null, academy, groups: (gr.data as AgeGroup[]) ?? [], photos,
    })
  }, [scoutingSeason, previewAcademy, signAll])

  useEffect(() => { reload() }, [reload, profile?.academy_id])

  const markRead = useCallback(async () => { if (!previewAcademy) await notifications.markAllRead() }, [previewAcademy, notifications])
  const photoUrl = useCallback((path: string | null | undefined) => (path ? state.photos[path] ?? null : null), [state.photos])

  const base = previewAcademy ? `/coach-preview/${previewAcademy}` : ''
  return <Ctx.Provider value={{ ...state, notifs: previewAcademy ? [] : notifications.list, photoUrl, reload, markRead, preview: !!previewAcademy, base }}>{children}</Ctx.Provider>
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

/** Shrinks a photo on the phone before upload: longest side 900 px, JPEG. */
export async function shrinkPhoto(file: File, max = 900): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => null)
  if (!bitmap) return file
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * scale), h = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h)
  return new Promise(res => canvas.toBlob(b => res(b ?? file), 'image/jpeg', 0.84))
}

/** Uploads a photo to the academy's folder and returns its storage path. */
export async function uploadPhoto(academyId: string, file: File, kind: 'player' | 'academy', id: string): Promise<string> {
  const blob = await shrinkPhoto(file)
  const path = `${academyId}/${kind}-${id}-${Date.now()}.jpg`
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: true })
  if (error) throw error
  return path
}
