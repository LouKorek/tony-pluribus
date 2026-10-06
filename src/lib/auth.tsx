import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, type Profile, type Project, type Season } from './supabase'

interface AuthState {
  loading: boolean
  session: Session | null
  profile: Profile | null
  project: Project | null
  seasons: Season[]
  scoutingSeason: Season | null
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
  const currentUser = useRef<string | null>(null)

  const load = useCallback(async (s: Session | null) => {
    setSession(s)
    if (!s) { setProfile(null); setProject(null); setSeasons([]); setLoading(false); return }
    const { data: p } = await supabase.from('profiles').select('*').eq('id', s.user.id).maybeSingle()
    setProfile(p as Profile | null)
    if (p && p.status === 'active') {
      supabase.rpc('touch_last_seen').then(() => {})
      const [{ data: pr }, { data: se }] = await Promise.all([
        supabase.from('projects').select('*').eq('id', p.project_id).maybeSingle(),
        supabase.from('seasons').select('*').eq('project_id', p.project_id).order('label'),
      ])
      setProject(pr as Project | null)
      setSeasons((se as Season[]) ?? [])
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
    loading, session, profile, project, seasons,
    scoutingSeason: seasons.find(s => s.is_current_scouting) ?? null,
    refresh: async () => { const { data } = await supabase.auth.getSession(); await load(data.session) },
    signOut: async () => { await supabase.auth.signOut() },
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
