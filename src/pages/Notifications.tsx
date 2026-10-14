import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, CheckCheck, ChevronRight, Inbox } from 'lucide-react'
import { useAuth, isAdmin } from '../lib/auth'
import { CATEGORY_LABEL, fmtWhen, notifTarget, useNotifications, type Notif } from '../lib/notifications'
import { PrefsMatrix, PushCard } from '../components/NotificationPrefs'
import { Badge, Button, Card, Empty, PageHeader, cx } from '../components/ui'

type Tab = 'inbox' | 'prefs' | 'project'

export default function NotificationsPage() {
  const { profile } = useAuth()
  const { list, unread, markRead, markAllRead } = useNotifications()
  const [tab, setTab] = useState<Tab>('inbox')
  const [onlyUnread, setOnlyUnread] = useState(false)
  const nav = useNavigate()
  const admin = isAdmin(profile)
  const shown = onlyUnread ? list.filter(n => !n.read_at) : list
  const days = groupByDay(shown)
  const go = (n: Notif) => { markRead(n.id); const t = notifTarget(n, false); if (t) nav(t) }

  return (
    <div>
      <PageHeader eyebrow="System" title="Notifications" description="Everything the system tells you, and how it reaches you: in the app, or as a push notification on your devices."
        actions={tab === 'inbox' && unread > 0 ? <Button onClick={markAllRead}><CheckCheck size={15} /> Mark all read</Button> : undefined} />
      <div data-tour="notif-tabs" className="mb-5 flex gap-1 rounded-lg bg-black/5 p-1 sm:w-fit">
        {([['inbox', 'Inbox'], ['prefs', 'My settings'], ...(admin ? [['project', 'Project defaults']] : [])] as [Tab, string][]).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={cx('flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold transition-colors', tab === k ? 'bg-card text-text shadow-sm' : 'text-muted hover:text-text')}>
            {l}{k === 'inbox' && unread > 0 && <span className="rounded-full bg-neon px-1.5 text-[11px] font-bold text-ink">{unread}</span>}
          </button>
        ))}
      </div>

      {tab === 'inbox' && (
        <div data-tour="notif-list">
          <label className="mb-3 flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-royal" checked={onlyUnread} onChange={e => setOnlyUnread(e.target.checked)} /> Unread only</label>
          {shown.length === 0 ? (
            <Card><Empty icon={<Inbox size={20} />} title={onlyUnread ? 'Nothing unread' : 'Nothing yet'}>Camps, submissions, invitations and system events will show up here.</Empty></Card>
          ) : days.map(([day, items]) => (
            <div key={day} className="mb-5">
              <div className="label-caps mb-2 text-muted">{day}</div>
              <Card className="divide-y divide-line">
                {items.map(n => (
                  <button key={n.id} onClick={() => go(n)} className={cx('flex w-full gap-3 px-4 py-3 text-left hover:bg-paper', !n.read_at && 'bg-neon-soft/40')}>
                    <span className={cx('mt-2 h-2 w-2 shrink-0 rounded-full', n.read_at ? 'bg-transparent' : 'bg-royal')} />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{n.title}</span>
                        {n.count > 1 && <Badge>×{n.count}</Badge>}
                        {n.type && <Badge tone="neutral">{CATEGORY_LABEL[(n.type.split('.')[0] in CATEGORY_LABEL ? n.type.split('.')[0] : 'system')] ?? ''}</Badge>}
                      </span>
                      {n.body && <span className="mt-0.5 block whitespace-pre-line text-sm text-muted">{n.body}</span>}
                      <span className="mt-1 block text-xs text-faint">{fmtWhen(n.created_at)}</span>
                    </span>
                    {notifTarget(n, false) && <ChevronRight size={18} className="mt-1 shrink-0 text-faint" />}
                  </button>
                ))}
              </Card>
            </div>
          ))}
        </div>
      )}

      {tab === 'prefs' && (
        <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
          <div data-tour="notif-prefs"><PrefsMatrix mode="user" /></div>
          <div className="space-y-3"><PushCard /><p className="flex items-start gap-2 text-xs text-muted"><Bell size={13} className="mt-0.5 shrink-0" /> SMS and e-mail are prepared and will be switched on later.</p></div>
        </div>
      )}

      {tab === 'project' && admin && <div className="max-w-3xl"><PrefsMatrix mode="project" /></div>}
    </div>
  )
}

function groupByDay(list: Notif[]): [string, Notif[]][] {
  const today = new Date().toDateString(), yest = new Date(Date.now() - 86400000).toDateString()
  const m = new Map<string, Notif[]>()
  for (const n of list) {
    const d = new Date(n.created_at)
    const k = d.toDateString() === today ? 'Today' : d.toDateString() === yest ? 'Yesterday' : d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
    ;(m.get(k) ?? m.set(k, []).get(k)!).push(n)
  }
  return [...m.entries()]
}
