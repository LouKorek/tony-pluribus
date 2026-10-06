import { Suspense, useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Check, CircleHelp, LogOut, Menu, X, ChevronsUpDown } from 'lucide-react'
import { NAV, BUILD_STAGE } from '../lib/nav'
import { useAuth } from '../lib/auth'
import { ROLE_LABEL } from '../lib/supabase'
import { cx, Spinner } from '../components/ui'
import { TourProvider, useTour } from '../lib/tour'
import { STAFF_TOURS, staffTourKey } from '../lib/tours'
import { supabase } from '../lib/supabase'

export function Brand({ compact }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <img src="/brand/tony.png" alt="Tony" className={compact ? 'h-4' : 'h-5'} />
      <span className="h-6 w-px bg-white/15" />
      <img src="/brand/benfica.png" alt="SL Benfica" className={compact ? 'h-7 w-7' : 'h-8 w-8'} />
    </div>
  )
}

/** Project and the scouting season the screens show. A custom list, readable on the dark sidebar. */
function SeasonPicker() {
  const { project, seasons, scoutingSeason, viewSeason, setViewSeason } = useAuth()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false) }
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', h); document.addEventListener('keydown', k)
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k) }
  }, [open])
  const history = viewSeason?.id !== scoutingSeason?.id
  return (
    <div ref={box} className="relative mx-3 mb-3">
      <button type="button" data-tour="project-box" onClick={() => setOpen(o => !o)} aria-haspopup="listbox" aria-expanded={open} title="Season shown on the scouting screens"
        className={cx('flex w-full items-center justify-between rounded-lg border bg-ink-2 px-3 py-2.5 text-left', history ? 'border-lime/60' : open ? 'border-white/30' : 'border-white/10 hover:border-white/25')}>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{project?.name ?? 'Project'}</div>
          <div className={cx('truncate text-xs', history ? 'text-lime' : 'text-white/50')}>Scouting {viewSeason?.label ?? '—'}{history ? ' · history' : ''}</div>
        </div>
        <ChevronsUpDown size={15} className="shrink-0 text-white/30" />
      </button>
      {open && (
        <div role="listbox" className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-lg border border-white/10 bg-ink-3 py-1 shadow-2xl">
          <div className="px-3 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-[.16em] text-white/40">Scouting season</div>
          {[...seasons].reverse().map(s => {
            const on = s.id === viewSeason?.id
            return (
              <button key={s.id} type="button" role="option" aria-selected={on} onClick={() => { setViewSeason(s.id); setOpen(false) }}
                className={cx('flex w-full items-center gap-2 px-3 py-2 text-left text-sm', on ? 'bg-white/10 font-semibold text-white' : 'text-white/80 hover:bg-white/5 hover:text-white')}>
                <span className="flex-1">{s.label.replace('-20', '/')}</span>
                {s.is_current_scouting && <span className="rounded bg-lime px-1.5 py-0.5 text-[10px] font-bold uppercase text-ink">Current</span>}
                {on ? <Check size={14} className="text-lime" /> : <span className="w-3.5" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { profile, signOut, can } = useAuth()
  const role = profile?.role
  return (
    <div className="flex h-full flex-col bg-ink text-white">
      <div className="px-5 pt-6 pb-5">
        <Brand />
        <div className="mt-1.5 font-display text-[11px] font-semibold uppercase tracking-[.22em] text-white/40">Pluribus</div>
      </div>

      <SeasonPicker />

      <nav data-tour="nav" className="scroll-thin flex-1 overflow-y-auto px-3 pb-4">
        {NAV.map(g => {
          const items = g.items.filter(i => (!i.roles || (role && i.roles.includes(role))) && (!i.area || can(i.area)))
          if (!items.length) return null
          return (
            <div key={g.label || 'root'} className="mt-3 first:mt-0">
              {g.label && <div className="px-2 pb-1 pt-2 font-display text-[11px] font-semibold uppercase tracking-[.16em] text-white/35">{g.label}</div>}
              {items.map(i => {
                const live = i.stage <= BUILD_STAGE
                const Icon = i.icon
                return (
                  <NavLink
                    key={i.to}
                    to={i.to}
                    end={i.to === '/' || i.to === '/scouting'}
                    onClick={onNavigate}
                    className={({ isActive }) => cx(
                      'group flex items-center gap-2.5 rounded-md px-2 py-[7px] text-[14px] transition-colors',
                      isActive ? 'bg-lime font-semibold text-ink' : live ? 'text-white/85 hover:bg-white/6 hover:text-white' : 'text-white/40 hover:bg-white/5 hover:text-white/70',
                    )}
                  >
                    {({ isActive }) => (<>
                      <Icon size={16} className={cx('shrink-0', isActive ? 'text-ink' : '')} />
                      <span className="flex-1 truncate">{i.label}</span>
                      {!live && !isActive && <span className="rounded bg-white/8 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-white/40">Soon</span>}
                    </>)}
                  </NavLink>
                )
              })}
            </div>
          )
        })}
      </nav>

      <div className="border-t border-white/10 p-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red font-display text-sm font-bold uppercase">
            {(() => { const w = (profile?.full_name || profile?.username || '?').trim().split(/\s+/); return w.length > 1 ? w[0][0] + w[w.length - 1][0] : w[0].slice(0, 2) })()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{profile?.full_name || profile?.username}</div>
            <div className="truncate text-xs text-white/50">{profile ? ROLE_LABEL[profile.role] : ''}</div>
          </div>
          <HelpButton />
          <button onClick={signOut} className="rounded-md p-2 text-white/50 hover:bg-white/10 hover:text-white" title="Sign out" aria-label="Sign out"><LogOut size={16} /></button>
        </div>
      </div>
    </div>
  )
}

function HelpButton({ className }: { className?: string }) {
  const { hasTour, start } = useTour()
  return (
    <button data-tour="help" onClick={() => start()} disabled={!hasTour}
      className={cx('rounded-md p-2 text-white/50 hover:bg-white/10 hover:text-white disabled:opacity-30', className)}
      title="Tour of this screen" aria-label="Tour of this screen"><CircleHelp size={17} /></button>
  )
}

export default function AppShell() {
  const { profile } = useAuth()
  const loc = useLocation()
  return (
    <TourProvider tours={STAFF_TOURS} screen={staffTourKey(loc.pathname)} seen={profile?.tours_seen ?? []}
      onSeen={key => { supabase.rpc('tour_seen', { p_key: key }).then(() => {}) }}>
      <Shell />
    </TourProvider>
  )
}

function Shell() {
  const [open, setOpen] = useState(false)
  const loc = useLocation()
  return (
    <div className="flex h-full">
      <aside className="hidden w-[248px] shrink-0 lg:block"><div className="fixed inset-y-0 w-[248px]"><Sidebar /></div></aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-ink/60" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-[272px] shadow-2xl">
            <Sidebar onNavigate={() => setOpen(false)} />
            <button onClick={() => setOpen(false)} className="absolute right-3 top-5 rounded-md p-1.5 text-white/60 hover:bg-white/10" aria-label="Close menu"><X size={18} /></button>
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-white/10 bg-ink px-4 text-white lg:hidden">
          <button onClick={() => setOpen(true)} className="rounded-md p-1.5 hover:bg-white/10" aria-label="Open menu"><Menu size={20} /></button>
          <Brand compact />
          <HelpButton className="text-white/70" />
        </header>
        <main key={loc.pathname} className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 sm:px-8 sm:py-9">
          <Suspense fallback={<Spinner />}><Outlet /></Suspense>
        </main>
      </div>
    </div>
  )
}
