import { useLocation, Link } from 'react-router-dom'
import { Hammer, LogOut, School } from 'lucide-react'
import { findNav, STAGE_NAME } from '../lib/nav'
import { useAuth } from '../lib/auth'
import { Button, Card, PageHeader } from '../components/ui'
import { Brand } from '../layouts/AppShell'

export function ComingSoon() {
  const { pathname } = useLocation()
  const item = findNav(pathname)
  const Icon = item?.icon ?? Hammer
  return (
    <div>
      <PageHeader eyebrow={item ? `Stage ${item.stage} · ${STAGE_NAME[item.stage] ?? ''}` : 'Not found'} title={item?.label ?? 'Page not found'} />
      <Card className="flex flex-col items-center px-6 py-16 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-ink text-lime"><Icon size={24} /></div>
        <div className="mt-4 font-display text-2xl font-bold uppercase">{item ? 'Being built' : 'Nothing here'}</div>
        <p className="mt-1 max-w-md text-sm text-muted">
          {item ? `This screen opens in stage ${item.stage}. The menu, permissions and data model are already in place for it.` : 'Check the address, or go back to the overview.'}
        </p>
        <Link to="/" className="mt-5"><Button>Back to overview</Button></Link>
      </Card>
    </div>
  )
}

export function CoachHome() {
  const { profile, signOut } = useAuth()
  return (
    <div className="min-h-full bg-paper">
      <header className="flex items-center justify-between bg-ink px-4 py-3 text-white">
        <Brand compact />
        <button onClick={signOut} className="rounded-md p-2 text-white/60 hover:bg-white/10" aria-label="Sign out"><LogOut size={17} /></button>
      </header>
      <div className="mx-auto max-w-md px-4 py-8">
        <div className="label-caps text-red">Coach portal</div>
        <h1 className="mt-1 font-display text-4xl font-bold uppercase leading-none">Welcome, {(profile?.full_name || profile?.username || '').split(' ')[0]}</h1>
        <Card className="mt-6 p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-good-soft text-good"><School size={18} /></div>
            <div className="font-semibold">Your account is approved</div>
          </div>
          <p className="mt-3 text-sm text-muted">Your squad, camp submissions and updates open here in the next stage of the build.</p>
        </Card>
      </div>
    </div>
  )
}
