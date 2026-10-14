import { useCallback, useEffect, useState } from 'react'
import { BellRing, RotateCcw, Smartphone } from 'lucide-react'
import { supabase, errMsg } from '../lib/supabase'
import { usePush } from '../lib/push'
import { CATEGORY_LABEL } from '../lib/notifications'
import { Alert, Button, Card, cx } from './ui'

export interface PrefRow { type: string; category: string; label: string; description: string; in_app: boolean; push: boolean; custom: boolean; audience?: string[] }

/** Switch for one channel of one type. */
function Toggle({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}
      className={cx('relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-40', on ? 'bg-ink' : 'bg-platinum')}>
      <span className={cx('absolute top-0.5 h-5 w-5 rounded-full transition-all', on ? 'left-[22px] bg-neon' : 'left-0.5 bg-white')} />
    </button>
  )
}

/** The "get it on this phone" card: Web Push opt-in. */
export function PushCard({ t }: { t?: { title: string; on: string; off: string; enable: string; disable: string; unsupported: string; blocked: string } }) {
  const L = t ?? { title: 'Notifications on this device', on: 'This device receives push notifications even when the app is closed.', off: 'Turn on to get camp dates, invitations and decisions on this device, even when the app is closed.', enable: 'Turn on', disable: 'Turn off', unsupported: 'This browser cannot receive push notifications. On iPhone, install the app to the home screen first.', blocked: 'Notifications are blocked for this site in the browser settings.' }
  const push = usePush()
  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <span className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', push.subscribed ? 'bg-ink text-neon' : 'bg-paper text-muted')}><Smartphone size={18} /></span>
        <div className="min-w-0 flex-1">
          <div className="font-semibold">{L.title}</div>
          <p className="mt-0.5 text-sm text-muted">{!push.supported ? L.unsupported : push.permission === 'denied' ? L.blocked : push.subscribed ? L.on : L.off}</p>
          {push.error && <div className="mt-2"><Alert>{push.error}</Alert></div>}
        </div>
        {push.supported && push.permission !== 'denied' && (
          push.subscribed
            ? <Button size="sm" loading={push.busy} onClick={push.unsubscribe}>{L.disable}</Button>
            : <Button size="sm" variant="primary" loading={push.busy} disabled={push.subscribed === null} onClick={push.subscribe}><BellRing size={14} /> {L.enable}</Button>
        )}
      </div>
    </Card>
  )
}

/** The matrix of types × channels, for the user (mode user) or the project defaults (mode project, admins). */
export function PrefsMatrix({ mode, labels }: { mode: 'user' | 'project'; labels?: { inApp: string; push: string; reset: string; hint: string } }) {
  const L = labels ?? { inApp: 'In app', push: 'Push', reset: 'Reset to defaults', hint: mode === 'user' ? 'What you get and where. Push reaches your devices that turned it on.' : 'Defaults for everyone in the project. A person can still change their own.' }
  const [rows, setRows] = useState<PrefRow[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc(mode === 'user' ? 'my_notification_prefs' : 'admin_notification_defaults')
    if (error) setErr(errMsg(error)); else setRows((data as PrefRow[]) ?? [])
  }, [mode])
  useEffect(() => { load() }, [load])

  async function set(r: PrefRow, k: 'in_app' | 'push', v: boolean) {
    const next = { ...r, [k]: v, custom: true }
    setRows(rows => rows!.map(x => x.type === r.type ? next : x))
    const { error } = await supabase.rpc(mode === 'user' ? 'set_notification_pref' : 'admin_set_notification_default', { p_type: r.type, p_in_app: next.in_app, p_push: next.push })
    if (error) { setErr(errMsg(error)); load() }
  }
  async function reset() { if (mode !== 'user') return; await supabase.rpc('reset_notification_prefs'); load() }

  if (!rows) return <p className="text-sm text-muted">Loading…</p>
  const cats = [...new Set(rows.map(r => r.category))]
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm text-muted">{L.hint}</p>
        {mode === 'user' && rows.some(r => r.custom) && <Button size="sm" variant="ghost" onClick={reset}><RotateCcw size={13} /> {L.reset}</Button>}
      </div>
      {err && <div className="mb-3"><Alert>{err}</Alert></div>}
      <Card className="overflow-hidden">
        <div className="grid grid-cols-[1fr_64px_64px] items-center gap-2 border-b border-line bg-paper/70 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
          <span /><span className="text-center">{L.inApp}</span><span className="text-center">{L.push}</span>
        </div>
        {cats.map(c => (
          <div key={c}>
            <div className="label-caps border-b border-line bg-paper/40 px-4 py-1.5 text-[10px] text-muted">{CATEGORY_LABEL[c] ?? c}</div>
            {rows.filter(r => r.category === c).map(r => (
              <div key={r.type} className="grid grid-cols-[1fr_64px_64px] items-center gap-2 border-b border-line px-4 py-2.5 last:border-0">
                <div className="min-w-0">
                  <div className="text-sm font-semibold">{r.label}{r.custom && mode === 'user' && <span className="ml-1.5 rounded bg-royal-soft px-1 text-[10px] font-semibold text-royal">custom</span>}</div>
                  <div className="text-xs text-muted">{r.description}</div>
                </div>
                <div className="flex justify-center"><Toggle on={r.in_app} onChange={v => set(r, 'in_app', v)} label={`${r.label} in app`} /></div>
                <div className="flex justify-center"><Toggle on={r.push} onChange={v => set(r, 'push', v)} label={`${r.label} push`} /></div>
              </div>
            ))}
          </div>
        ))}
      </Card>
    </div>
  )
}
