import { Suspense, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { LogOut, Menu, X, ChevronsUpDown } from 'lucide-react'
import { NAV, BUILD_STAGE } from '../lib/nav'
import { useAuth } from '../lib/auth'
import { ROLE_LABEL } from '../lib/supabase'
import { cx, Spinner } from '../components/ui'

export function Brand({ compact }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <img src="/brand/tony.png" alt="Tony" className={compact ? 'h-4' : 'h-5'} />
      <span className="h-6 w-px bg-white/15" />
      <img src="/brand/benfica.png" alt="SL Benfica" className={compact ? 'h-7 w-7' : 'h-8 w-8'} />
    </div>
  )
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { profile, project, scoutingSeason, signOut } = useAuth()
  const role = profile?.role
  return (
    <div className="flex h-full flex-col bg-ink text-white">
      <div className="px-5 pt-6 pb-5">
        <Brand />
        <div className="mt-1.5 font-display text-[11px] font-semibold uppercase tracking-[.22em] text-white/40">Pluribus</div>
      </div>

      <div className="mx-3 mb-3 flex items-center justify-between rounded-lg border border-white/10 bg-ink-2 px-3 py-2.5" title="Project and season">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{project?.name ?? 'Project'}</div>
          <div className="truncate text-xs text-white/50">Scouting {scoutingSeason?.label ?? '—'}</div>
        </div>
        <ChevronsUpDown size={15} className="shrink-0 text-white/30" />
      </div>

      <nav className="scroll-thin flex-1 overflow-y-auto px-3 pb-4">
        {NAV.map(g => {
          const items = g.items.filter(i => !i.roles || (role && i.roles.includes(role)))
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
            {(profile?.full_name || profile?.username || '?').slice(0, 2)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{profile?.full_name || profile?.username}</div>
            <div className="truncate text-xs text-white/50">{profile ? ROLE_LABEL[profile.role] : ''}</div>
          </div>
          <button onClick={signOut} className="rounded-md p-2 text-white/50 hover:bg-white/10 hover:text-white" title="Sign out" aria-label="Sign out"><LogOut size={16} /></button>
        </div>
      </div>
    </div>
  )
}

export default function AppShell() {
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
          <span className="w-8" />
        </header>
        <main key={loc.pathname} className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 sm:px-8 sm:py-9">
          <Suspense fallback={<Spinner />}><Outlet /></Suspense>
        </main>
      </div>
    </div>
  )
}
