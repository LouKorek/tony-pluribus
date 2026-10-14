import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, CheckCheck, ChevronRight } from 'lucide-react'
import { cx } from './ui'
import { CATEGORY_LABEL, fmtWhen, notifTarget, useNotifications, type Notif } from '../lib/notifications'

/** The bell of the staff shell: unread dot, a small panel with the latest notifications, a link to the inbox. */
export function NotificationBell({ className, light = true, placement = 'up' }: { className?: string; light?: boolean; placement?: 'up' | 'down' }) {
  const { list, unread, unseen, markSeen, markRead, markAllRead } = useNotifications()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const nav = useNavigate()
  useEffect(() => {
    if (!open) return
    markSeen()
    const h = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false) }
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', h); document.addEventListener('keydown', k)
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k) }
  }, [open, markSeen])
  const go = (n: Notif) => { markRead(n.id); setOpen(false); const t = notifTarget(n, false); if (t) nav(t) }
  return (
    <div ref={box} className="relative">
      <button data-tour="bell" onClick={() => setOpen(o => !o)} aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} title="Notifications" aria-expanded={open}
        className={cx('relative rounded-md p-2', light ? 'text-white/50 hover:bg-white/10 hover:text-white' : 'text-muted hover:bg-black/5 hover:text-text', className)}>
        <Bell size={17} />
        {unseen > 0 && <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-neon px-1 text-[10px] font-bold text-ink">{unseen > 9 ? '9+' : unseen}</span>}
        {unseen === 0 && unread > 0 && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-neon" />}
      </button>
      {open && (
        <div className={cx('absolute z-50 w-[340px] max-w-[calc(100vw-24px)] overflow-hidden rounded-xl border border-line bg-card text-text shadow-2xl', placement === 'up' ? 'bottom-full left-0 mb-2' : 'right-0 top-full mt-2')}>
          <div className="flex items-center justify-between border-b border-line px-3 py-2">
            <span className="text-sm font-semibold">Notifications{unread > 0 && <span className="ml-1.5 rounded-full bg-neon px-1.5 text-[11px] font-bold text-ink">{unread}</span>}</span>
            {unread > 0 && <button onClick={markAllRead} className="flex items-center gap-1 text-xs font-semibold text-muted hover:text-text"><CheckCheck size={13} /> Mark all read</button>}
          </div>
          <ul className="max-h-[380px] divide-y divide-line overflow-y-auto">
            {list.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted">Nothing yet. Camps, submissions and system events will show up here.</li>}
            {list.slice(0, 8).map(n => (
              <li key={n.id}>
                <button onClick={() => go(n)} className={cx('flex w-full gap-2.5 px-3 py-2.5 text-left hover:bg-paper', !n.read_at && 'bg-neon-soft/40')}>
                  <span className={cx('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.read_at ? 'bg-transparent' : 'bg-royal')} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold">{n.title}{n.count > 1 && <span className="ml-1 text-xs font-normal text-muted">×{n.count}</span>}</span>
                    {n.body && <span className="block line-clamp-2 text-xs text-muted">{n.body}</span>}
                    <span className="mt-0.5 block text-[11px] text-faint">{fmtWhen(n.created_at)}{n.type && CATEGORY_LABEL[n.type.split('.')[0]] ? '' : ''}</span>
                  </span>
                  {notifTarget(n, false) && <ChevronRight size={15} className="mt-1 shrink-0 text-faint" />}
                </button>
              </li>
            ))}
          </ul>
          <button onClick={() => { setOpen(false); nav('/notifications') }} className="block w-full border-t border-line px-3 py-2 text-center text-xs font-semibold text-royal hover:bg-paper">All notifications and settings</button>
        </div>
      )}
    </div>
  )
}
