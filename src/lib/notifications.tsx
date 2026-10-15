import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { supabase } from './supabase'
import { useAuth } from './auth'

// Notifications of the signed-in user: the list, the unread count, read marks, and live updates (Supabase Realtime).
// One provider serves the staff shell and the coach portal.

export interface Notif {
  id: string; type: string | null; title: string; body: string | null; link: string | null; data: Record<string, unknown>
  /** the same text in Kinyarwanda, when the type has a template (coach notifications) */
  title_rw: string | null; body_rw: string | null
  count: number; read_at: string | null; seen_at: string | null; created_at: string
}
interface NotifCtx {
  list: Notif[]; unread: number; unseen: number; loading: boolean
  refresh: () => Promise<void>
  markRead: (id: string) => Promise<void>
  markAllRead: () => Promise<void>
  markSeen: () => Promise<void>
}
const Ctx = createContext<NotifCtx | null>(null)

export function NotificationsProvider({ children, enabled = true }: { children: ReactNode; enabled?: boolean }) {
  const { session, profile } = useAuth()
  const uid = session?.user.id
  const active = enabled && !!uid && profile?.status === 'active'
  const [list, setList] = useState<Notif[]>([])
  const [loading, setLoading] = useState(true)
  const timer = useRef<number | null>(null)

  const refresh = useCallback(async () => {
    if (!active) { setList([]); setLoading(false); return }
    const { data } = await supabase.from('notifications').select('id, type, title, body, title_rw, body_rw, link, data, count, read_at, seen_at, created_at')
      .order('created_at', { ascending: false }).limit(100)
    setList((data as Notif[]) ?? []); setLoading(false)
  }, [active])
  useEffect(() => { refresh() }, [refresh])

  // Live: any change to my notifications refreshes the list (debounced: grouped events arrive in bursts).
  useEffect(() => {
    if (!active) return
    const ch = supabase.channel(`notifications:${uid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${uid}` }, () => {
        if (timer.current) window.clearTimeout(timer.current)
        timer.current = window.setTimeout(() => { refresh() }, 400)
      })
      .subscribe()
    const onFocus = () => { if (document.visibilityState === 'visible') refresh() }
    document.addEventListener('visibilitychange', onFocus)
    return () => { supabase.removeChannel(ch); document.removeEventListener('visibilitychange', onFocus); if (timer.current) window.clearTimeout(timer.current) }
  }, [active, uid, refresh])

  const markRead = useCallback(async (id: string) => {
    setList(l => l.map(n => n.id === id ? { ...n, read_at: n.read_at ?? new Date().toISOString(), seen_at: n.seen_at ?? new Date().toISOString() } : n))
    await supabase.rpc('mark_notification_read', { p_id: id })
  }, [])
  const markAllRead = useCallback(async () => {
    const now = new Date().toISOString()
    setList(l => l.map(n => ({ ...n, read_at: n.read_at ?? now, seen_at: n.seen_at ?? now })))
    await supabase.rpc('mark_notifications_read')
  }, [])
  const markSeen = useCallback(async () => {
    if (!list.some(n => !n.seen_at)) return
    const now = new Date().toISOString()
    setList(l => l.map(n => ({ ...n, seen_at: n.seen_at ?? now })))
    await supabase.rpc('mark_notifications_seen')
  }, [list])

  const value = useMemo<NotifCtx>(() => ({
    list, loading, refresh, markRead, markAllRead, markSeen,
    unread: list.filter(n => !n.read_at).length,
    unseen: list.filter(n => !n.seen_at).length,
  }), [list, loading, refresh, markRead, markAllRead, markSeen])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useNotifications() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useNotifications outside provider')
  return c
}

/** Where a notification takes the user. Staff links are paths; coach links are the portal's own codes. */
export function notifTarget(n: Notif, coach: boolean): string | null {
  if (!n.link) return null
  if (coach) {
    if (n.link === 'invites' || n.link === '/camps') return '/camps'
    if (n.link.startsWith('player:')) return `/squad?player=${n.link.slice(7)}`
    if (n.link.startsWith('/')) return n.link
    return null
  }
  return n.link.startsWith('/') ? n.link : null
}

export const CATEGORY_LABEL: Record<string, string> = { camps: 'Camps', players: 'Players', account: 'Account', points: 'Points', staff: 'Staff', system: 'System' }
export const CATEGORY_LABEL_RW: Record<string, string> = { camps: 'Amakambi', players: 'Abakinnyi', account: 'Konti', points: 'Amanota', staff: 'Abakozi', system: 'Sisitemu' }
/** The title and body of a notification in the given language (Kinyarwanda when the row carries it). */
export const notifText = (n: Pick<Notif, 'title' | 'body' | 'title_rw' | 'body_rw'>, lang: string) =>
  lang === 'rw' && n.title_rw ? { title: n.title_rw, body: n.body_rw } : { title: n.title, body: n.body }

export function fmtWhen(iso: string) {
  const d = new Date(iso), now = new Date()
  const diff = (now.getTime() - d.getTime()) / 1000
  if (diff < 60) return 'Just now'
  if (diff < 3600) return `${Math.round(diff / 60)} min ago`
  if (diff < 86400 && d.getDate() === now.getDate()) return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}
