import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { stopViewAs, viewingAs } from './viewAs'
import { supabase, type Profile, type Project, type Season } from './supabase'

interface AuthState {
  loading: boolean
  session: Session | null
  profile: Profile | null
  project: Project | null
  seasons: Season[]
  scoutingSeason: Season | null
  /** The season the scouting screens show. Defaults to the season being scouted; can be switched to look at history. */
  viewSeason: Season | null
  setViewSeason: (id: string) => void
  /** My level per content area: 0 none, 1 view, 2 edit */
  access: Record<string, number>
  can: (area: string, level?: 1 | 2) => boolean
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}

const Ctx = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [project, setProject] = useState<Project | null>(null)
  const [seasons, setSeasons] = useState<Season[]>([])
  const [access, setAccess] = useState<Record<string, number>>({})
  const currentUser = useRef<string | null>(null)
  const [viewId, setViewId] = useState<string | null>(() => { try { return sessionStorage.getItem('pluribus.viewSeason') } catch { return null } })

  const load = useCallback(async (s: Session | null) => {
    setSession(s)
    if (!s) { setProfile(null); setProject(null); setSeasons([]); setLoading(false); return }
    const { data: p } = await supabase.from('profiles').select('*').eq('id', s.user.id).maybeSingle()
    setProfile(p as Profile | null)
    if (p && p.status === 'active') {
      supabase.rpc('touch_last_seen').then(() => {})
      const [{ data: pr }, { data: se }, { data: ac }] = await Promise.all([
        supabase.from('projects').select('*').eq('id', p.project_id).maybeSingle(),
        supabase.from('seasons').select('*').eq('project_id', p.project_id).order('label'),
        p.role === 'coach' ? Promise.resolve({ data: {} }) : supabase.rpc('my_access'),
      ])
      setProject(pr as Project | null)
      setSeasons((se as Season[]) ?? [])
      setAccess((ac as Record<string, number>) ?? {})
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { currentUser.current = data.session?.user.id ?? null; load(data.session) })
    // Supabase re-emits SIGNED_IN whenever the tab regains focus. Only a real change of user may reload the app,
    // otherwise every open form would be lost when someone switches tabs.
    const { data: sub } = supabase.auth.onAuthStateChange((evt, s) => {
      const prev = currentUser.current
      const next = s?.user.id ?? null
      if (evt === 'SIGNED_OUT' || (evt === 'SIGNED_IN' && next !== prev)) { currentUser.current = next; setLoading(true); load(s) }
      else setSession(s)
    })
    return () => sub.subscription.unsubscribe()
  }, [load])

  const value: AuthState = {
    loading, session, profile, project, seasons, access,
    can: (area, level = 1) => profile?.role === 'owner' || (access[area] ?? 0) >= level,
    scoutingSeason: seasons.find(s => s.is_current_scouting) ?? null,
    viewSeason: seasons.find(s => s.id === viewId) ?? seasons.find(s => s.is_current_scouting) ?? null,
    setViewSeason: id => { setViewId(id); try { sessionStorage.setItem('pluribus.viewSeason', id) } catch { /* storage blocked */ } },
    refresh: async () => { const { data } = await supabase.auth.getSession(); await load(data.session) },
    // Signing out while the owner views the system as someone else returns to the owner's own account.
    signOut: async () => { if (viewingAs()) await stopViewAs(); else await supabase.auth.signOut() },
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useAuth outside provider')
  return c
}

export const isAdmin = (p: Profile | null) => !!p && p.status === 'active' && (p.role === 'owner' || p.role === 'admin')
export const isStaff = (p: Profile | null) => !!p && p.status === 'active' && p.role !== 'coach'
