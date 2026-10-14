import { useEffect, useRef, useState } from 'react'
import { CloudOff, CloudUpload, Check, RefreshCw, Trash2, WifiOff } from 'lucide-react'
import { discardOutbox, flush, outboxList, retryOutbox, subscribeSync, type OutboxRow, type SyncState } from '../lib/offline'
import { cx } from './ui'

export interface SyncLabels {
  offline: string; offlineHint: string; savedCopy: string; pending: string; failed: string; sendNow: string; syncing: string; allSent: string; discard: string; retry: string; title: string
}
export const SYNC_EN: SyncLabels = {
  offline: 'Offline', offlineHint: 'No network. Keep working: everything you save is sent when you are back online.', savedCopy: 'Showing the last saved copy',
  pending: 'changes waiting to send', failed: 'could not be sent', sendNow: 'Send now', syncing: 'Sending…', allSent: 'Everything is sent', discard: 'Discard', retry: 'Try again', title: 'Changes waiting',
}

export function useSync() {
  const [s, setS] = useState<SyncState>({ online: true, pending: 0, failed: 0, syncing: false, lastSync: null, fromCache: false })
  useEffect(() => subscribeSync(setS), [])
  return s
}

/** Header button: shows nothing while all is well; a pill when offline, serving a saved copy, or with changes waiting. */
export function SyncButton({ labels, tone = 'dark', placement = 'down-end' }: { labels: SyncLabels; tone?: 'dark' | 'light'; placement?: 'down' | 'down-end' | 'up' }) {
  const s = useSync()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [open])
  const quiet = s.online && !s.fromCache && s.pending === 0 && s.failed === 0 && !s.syncing
  if (quiet) return null
  const Icon = !s.online ? WifiOff : s.failed ? CloudOff : CloudUpload
  const cls = !s.online ? 'bg-warn text-ink' : s.failed ? 'bg-danger text-white' : 'bg-neon text-ink'
  const text = !s.online ? labels.offline : s.syncing ? labels.syncing : s.failed ? `${s.failed} ${labels.failed}` : s.pending ? `${s.pending} ${labels.pending}` : labels.savedCopy
  return (
    <div ref={ref} className="relative" data-tour="sync">
      <button onClick={() => setOpen(o => !o)} className={cx('flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-bold', cls)} aria-expanded={open}>
        <Icon size={14} className={cx(s.syncing && 'animate-pulse')} /><span className="hidden sm:inline">{text}</span>{(s.pending + s.failed) > 0 && <span className="sm:hidden">{s.pending + s.failed}</span>}
      </button>
      {open && (
        <div className={cx('absolute z-50 w-80 rounded-xl border border-line bg-card p-3 text-text shadow-xl', placement === 'up' ? 'bottom-full mb-2 left-0' : 'top-full mt-2', placement === 'down-end' && 'right-0', placement === 'down' && 'left-0')}>
          <SyncPanel labels={labels} s={s} tone={tone} />
        </div>
      )}
    </div>
  )
}

export function SyncPanel({ labels, s, tone }: { labels: SyncLabels; s: SyncState; tone?: 'dark' | 'light' }) {
  const [rows, setRows] = useState<OutboxRow[]>([])
  const reloadRows = () => outboxList().then(r => setRows(r.filter(x => x.label)))
  useEffect(() => { reloadRows() }, [s.pending, s.failed, s.syncing])
  void tone
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <div className="font-display text-base font-semibold">{!s.online ? labels.offline : labels.title}</div>
        {s.online && (s.pending > 0 || s.failed > 0) && <button onClick={() => flush()} disabled={s.syncing} className="inline-flex items-center gap-1 rounded-md bg-ink px-2 py-1 text-xs font-semibold text-neon disabled:opacity-50"><RefreshCw size={12} className={cx(s.syncing && 'animate-spin')} />{s.syncing ? labels.syncing : labels.sendNow}</button>}
      </div>
      {!s.online && <p className="mt-1 text-xs text-muted">{labels.offlineHint}</p>}
      {s.online && s.fromCache && s.pending === 0 && <p className="mt-1 text-xs text-muted">{labels.savedCopy}</p>}
      {rows.length === 0 ? (
        s.online && !s.fromCache && <p className="mt-2 flex items-center gap-1 text-sm text-good"><Check size={14} />{labels.allSent}</p>
      ) : (
        <ul className="mt-2 max-h-64 divide-y divide-line overflow-y-auto text-sm">
          {rows.map(r => (
            <li key={r.id} className="flex items-center gap-2 py-1.5">
              <span className={cx('h-2 w-2 shrink-0 rounded-full', r.error ? 'bg-danger' : 'bg-warn')} />
              <span className="min-w-0 flex-1">
                <span className="block truncate">{r.label}</span>
                {r.error && <span className="block truncate text-xs text-danger">{r.error}</span>}
              </span>
              {r.error && <button onClick={() => retryOutbox(r.id).then(reloadRows)} className="rounded p-1 text-muted hover:text-text" title={labels.retry}><RefreshCw size={13} /></button>}
              <button onClick={() => discardOutbox(r.id).then(reloadRows)} className="rounded p-1 text-muted hover:text-danger" title={labels.discard}><Trash2 size={13} /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
