import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Bell, CalendarDays, ChevronRight, CircleHelp, Home as HomeIcon, LogOut, SlidersHorizontal, Trophy, Users } from 'lucide-react'
import { InstallButton } from '../../lib/install'
import { useAuth } from '../../lib/auth'
import { supabase } from '../../lib/supabase'
import { fmtDate } from '../../lib/scouting'
import { notifTarget, useNotifications } from '../../lib/notifications'
import { PrefsMatrix, PushCard } from '../../components/NotificationPrefs'
import { SyncButton } from '../../components/SyncStatus'
import { ThemeButton } from '../../lib/theme'
import { Alert, Button, Card, Empty, Spinner, cx } from '../../components/ui'
import { Brand } from '../../layouts/AppShell'
import { LangProvider, useT } from './i18n'
import { TourProvider, useTour } from '../../lib/tour'
import { COACH_TOURS } from './tours'
import { CoachDataProvider, pendingInvites, useCoach } from './data'
import { ScreenTitle, useGo } from './shared'
import HomeScreen from './Home'
import TeamScreen from './Team'
import ScheduleScreen from './Schedule'
import ProgressScreen from './Progress'

export default function CoachApp({ previewAcademy }: { previewAcademy?: string }) {
  return (
    <LangProvider>
      <CoachDataProvider previewAcademy={previewAcademy}>
        <CoachTours>
        <Shell>
          <Routes>
            <Route index element={<HomeScreen />} />
            <Route path="team" element={<TeamScreen />} />
            <Route path="squad" element={<RedirectTo to="/team" />} />
            <Route path="schedule" element={<ScheduleScreen />} />
            <Route path="camps" element={<RedirectTo to="/schedule" />} />
            <Route path="progress" element={<ProgressScreen />} />
            <Route path="updates" element={<UpdatesScreen />} />
            <Route path="*" element={<RedirectTo to="/" />} />
          </Routes>
        </Shell>
        </CoachTours>
      </CoachDataProvider>
    </LangProvider>
  )
}

function RedirectTo({ to }: { to: string }) {
  const { base } = useCoach()
  const loc = useLocation()
  return <Navigate to={(base + to) || '/'} replace state={loc.state} />
}

/* ───────────────────────── Guided tours ───────────────────────── */

function CoachTours({ children }: { children: ReactNode }) {
  const { profile } = useAuth()
  const { lang } = useT()
  const { base } = useCoach()
  const loc = useLocation()
  const rel = loc.pathname.slice(base.length) || '/'
  const tab = new URLSearchParams(loc.search).get('tab')
  const screen = rel === '/' ? 'coach-home' : rel === '/team' ? (tab === 'training' ? 'coach-training' : tab === 'matches' ? 'coach-matches' : tab === 'academy' ? 'coach-academy' : 'coach-team') : rel === '/schedule' ? 'coach-schedule' : rel === '/progress' ? 'coach-progress' : rel === '/updates' ? 'coach-updates' : null
  return (
    <TourProvider tours={COACH_TOURS} screen={screen} lang={lang === 'rw' ? 'rw' : 'en'} seen={profile?.tours_seen ?? []}
      onSeen={key => { supabase.rpc('tour_seen', { p_key: key }).then(() => {}) }}>
      {children}
    </TourProvider>
  )
}

function CoachHelp() {
  const { hasTour, start } = useTour()
  const { t } = useT()
  return (
    <button data-tour="help" onClick={() => start()} disabled={!hasTour} aria-label={t('tour')} title={t('tour')}
      className="rounded-md p-2 text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-30"><CircleHelp size={18} /></button>
  )
}

/* ───────────────────────── Shell ───────────────────────── */

function Shell({ children }: { children: ReactNode }) {
  const { signOut } = useAuth()
  const { t, lang, setLang, languages } = useT()
  const { loading, error, notifs, squad, schedule, preview, base, academy } = useCoach()
  const unread = notifs.filter(n => !n.read_at).length
  const today = new Date().toISOString().slice(0, 10)
  const waiting = pendingInvites(squad).length + schedule.filter(c => c.booking?.status === 'proposed' && (c.booking.day_date ?? '') >= today).length
  const tabs = [
    { to: base || '/', label: t('home'), icon: HomeIcon, count: 0 },
    { to: base + '/team', label: t('team'), icon: Users, count: 0 },
    { to: base + '/schedule', label: t('schedule'), icon: CalendarDays, count: waiting },
    { to: base + '/progress', label: t('progress'), icon: Trophy, count: 0 },
    ...(preview ? [] : [{ to: '/updates', label: t('updates'), icon: Bell, count: unread }]),
  ]
  return (
    <div className="min-h-full bg-paper">
      {preview && (
        <div className="flex items-center justify-between gap-3 bg-neon px-4 py-2 text-sm text-ink">
          <span className="min-w-0 truncate"><b>Preview</b> · what the coach of {academy?.name ?? 'this academy'} sees · read only</span>
          <Link to="/scouting/academies" className="shrink-0 font-semibold underline">Back to Tony Next</Link>
        </div>
      )}
      <header className="sticky top-0 z-30 bg-ink text-white">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <Brand compact />
          <div className="flex items-center gap-1">
            {languages.length > 1 && (
              <div data-tour="lang" className="mr-1 flex rounded-md bg-white/8 p-0.5 text-[12px] font-bold" role="group" aria-label={t('language')}>
                {languages.map(l => (
                  <button key={l.code} onClick={() => setLang(l.code)} aria-pressed={lang === l.code} title={l.label}
                    className={cx('rounded px-2 py-1 uppercase', lang === l.code ? 'bg-neon text-ink' : 'text-white/60 hover:text-white')}>{l.code}</button>
                ))}
              </div>
            )}
            {!preview && <SyncButton labels={{ offline: t('offline'), offlineHint: t('offlineHint'), savedCopy: t('savedCopy'), pending: t('pendingChanges'), failed: t('failedChanges'), sendNow: t('sendNow'), syncing: t('syncing'), allSent: t('allSent'), discard: t('discard'), retry: t('retry'), title: t('outboxTitle') }} />}
            <InstallButton variant="icon" label="Install the app" />
            <ThemeButton labels={[t('nightMode'), t('dayMode')]} />
            <CoachHelp />
            {!preview && <NavLink to="/updates" className="relative rounded-md p-2 text-white/70 hover:bg-white/10 hover:text-white" aria-label={t('updates')}>
              <Bell size={18} />
              {unread > 0 && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-neon" />}
            </NavLink>}
            {!preview && <button onClick={signOut} className="rounded-md p-2 text-white/60 hover:bg-white/10 hover:text-white" aria-label={t('signOut')} title={t('signOut')}><LogOut size={17} /></button>}
          </div>
        </div>
        <nav data-tour="coach-tabs" className="mx-auto hidden max-w-3xl gap-1 px-3 pb-2 sm:flex">
          {tabs.map(tb => (
            <NavLink key={tb.to} to={tb.to} end={tb.to === (base || '/')}
              className={({ isActive }) => cx('flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-semibold', isActive ? 'bg-neon text-ink' : 'text-white/70 hover:bg-white/8 hover:text-white')}>
              <tb.icon size={15} />{tb.label}
              {tb.count > 0 && <span className="rounded-full bg-royal px-1.5 text-[11px] text-white">{tb.count}</span>}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-28 pt-6 sm:pb-12">
        {error && <div className="mb-4"><Alert>{error}</Alert></div>}
        {loading ? <Spinner /> : children}
      </main>

      <nav data-tour="coach-tabs" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card pb-[env(safe-area-inset-bottom)] sm:hidden">
        <div className={cx('grid', preview ? 'grid-cols-4' : 'grid-cols-5')}>
          {tabs.map(tb => (
            <NavLink key={tb.to} to={tb.to} end={tb.to === (base || '/')}
              className={({ isActive }) => cx('relative flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold', isActive ? 'text-royal' : 'text-muted')}>
              <tb.icon size={20} />
              <span className="truncate">{tb.label}</span>
              {tb.count > 0 && <span className="absolute left-1/2 top-1.5 ml-2 rounded-full bg-royal px-1.5 text-[10px] leading-4 text-white">{tb.count}</span>}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}

/* ───────────────────────── Updates ───────────────────────── */

function UpdatesScreen() {
  const { t } = useT()
  const { notifs, markRead } = useCoach()
  const { markSeen } = useNotifications()
  const [settings, setSettings] = useState(false)
  // Keep the "new" marks visible while the screen is open, then mark everything read in the background.
  const unreadAtOpen = useRef(new Set(notifs.filter(n => !n.read_at).map(n => n.id)))
  useEffect(() => { markSeen(); if (unreadAtOpen.current.size) markRead() }, [markRead, markSeen])
  return (
    <div>
      <ScreenTitle title={t('updates')} action={<Button size="sm" variant={settings ? 'dark' : 'secondary'} data-tour="notif-settings" onClick={() => setSettings(s => !s)}><SlidersHorizontal size={14} />{t('notifSettings')}</Button>} />
      {settings && (
        <div className="mb-6 space-y-4">
          <PushCard t={{ title: t('pushTitle'), on: t('pushOn'), off: t('pushOff'), enable: t('pushEnable'), disable: t('pushDisable'), unsupported: t('pushUnsupported'), blocked: t('pushBlocked') }} />
          <PrefsMatrix mode="user" labels={{ inApp: t('inApp'), push: t('pushCol'), reset: t('resetPrefs'), hint: t('prefsHint') }} />
        </div>
      )}
      {notifs.length === 0 ? (
        <Card><Empty icon={<Bell size={20} />} title={t('noUpdates')}>{t('noUpdatesHint')}</Empty></Card>
      ) : (
        <Card className="divide-y divide-line" data-tour="updates">{notifs.map(n => <NotifRow key={n.id} n={n} fresh={unreadAtOpen.current.has(n.id)} />)}</Card>
      )}
    </div>
  )
}

export function NotifRow({ n, fresh }: { n: ReturnType<typeof useCoach>['notifs'][number]; fresh?: boolean }) {
  const nav = useGo()
  const { markRead } = useNotifications()
  const target = notifTarget(n, true)
  const go = () => { markRead(n.id); if (target) nav(target) }
  const isNew = fresh ?? !n.read_at
  return (
    <button onClick={go} className={cx('flex w-full gap-3 px-4 py-3 text-left', target ? 'hover:bg-paper' : 'cursor-default')}>
      <span className={cx('mt-1.5 h-2 w-2 shrink-0 rounded-full', isNew ? 'bg-royal' : 'bg-transparent')} />
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{n.title}</span>
        {n.body && <span className="block whitespace-pre-line text-sm text-muted">{n.body}</span>}
        <span className="mt-0.5 block text-xs text-faint">{fmtDate(n.created_at.slice(0, 10))}</span>
      </span>
      {target && <ChevronRight size={18} className="mt-1 shrink-0 text-faint" />}
    </button>
  )
}
