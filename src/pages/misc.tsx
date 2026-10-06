import { useLocation, Link } from 'react-router-dom'
import { Hammer } from 'lucide-react'
import { findNav, STAGE_NAME } from '../lib/nav'
import { Button, Card, PageHeader } from '../components/ui'

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
