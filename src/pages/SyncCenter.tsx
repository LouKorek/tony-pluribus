import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, CircleAlert, Clock, RefreshCcw } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { Alert, Badge, Button, Card, PageHeader, Stat } from '../components/ui'

interface State { last_run_at: string | null; last_ok_at: string | null; last_status: string | null; last_error: string | null; delta_link: string | null }
interface Run { id: string; started_at: string; finished_at: string | null; status: 'running' | 'ok' | 'error'; full_scan: boolean; scheduled?: boolean; changed: number; deleted: number; error: string | null }
const when = (s: string | null) => s ? new Date(s).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'

export default function SyncCenterPage() {
  const [state, setState] = useState<State | null>(null)
  const [runs, setRuns] = useState<Run[]>([])
  const [stats, setStats] = useState<{ files: number; folders: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'good' | 'bad' | 'info'; text: string } | null>(null)

  const load = useCallback(async () => {
    const [s, r, t] = await Promise.all([
      supabase.from('sync_state').select('last_run_at, last_ok_at, last_status, last_error, delta_link').maybeSingle(),
      supabase.from('sync_runs').select('*').order('started_at', { ascending: false }).limit(20),
      supabase.rpc('talent_folder_stats'),
    ])
    setState((s.data as State) ?? null); setRuns((r.data as Run[]) ?? []); setStats(t.data as { files: number; folders: number })
  }, [])
  useEffect(() => { load() }, [load])

  async function run(full: boolean) {
    setBusy(true); setMsg(null)
    const { data, error } = await supabase.functions.invoke('sharepoint-sync', { body: { full } })
    let text = (data as { error?: string; message?: string } | null)?.error
    if (error) { try { const j = await (error as { context?: Response }).context?.json(); text = j?.message ?? j?.error } catch { /* */ } text ??= error.message }
    setBusy(false)
    if (text) setMsg({ tone: text === 'not_configured' || /^Waiting/.test(text) ? 'info' : 'bad', text: /not_configured|secret is not set/i.test(text) ? 'The Microsoft secret is not set yet. Once the owner pastes MS_CLIENT_SECRET into Supabase, run the sync again.' : text })
    else { const d = data as { changed: number; deleted: number; full: boolean }; setMsg({ tone: 'good', text: `${d.full ? 'Full scan done' : 'Up to date'}: ${d.changed} new or changed, ${d.deleted} removed.` }) }
    load()
  }

  const ok = state?.last_status === 'ok'
  const waiting = !ok && /^Waiting for the TonyRW admin/.test(state?.last_error ?? '')
  return (
    <div>
      <PageHeader eyebrow="System" title="Sync Center" description="Pluribus reads the shared Talent folder in SharePoint through the Pluribus Sync app. Every change there (new files, renames, moves, deletions) reaches the Files screen and the links across the system."
        actions={<><Button onClick={() => run(true)} disabled={busy}>Full scan</Button><Button variant="primary" loading={busy} onClick={() => run(false)}><RefreshCcw size={15} /> Sync now</Button></>} />
      <div data-tour="sync-status" className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat accent label="Status" value={!state ? 'Not connected' : ok ? 'Connected' : waiting ? 'Waiting' : 'Error'} sub={state?.last_ok_at ? `Last good sync ${when(state.last_ok_at)}` : 'Waiting for Microsoft approval'} />
        <Stat label="Last run" value={when(state?.last_run_at ?? null)} sub="Runs on its own every 15 minutes" />
        <Stat label="Files" value={stats?.files?.toLocaleString() ?? '—'} sub="in the Talent folder index" />
        <Stat label="Folders" value={stats?.folders?.toLocaleString() ?? '—'} />
      </div>
      {msg && <div className="mb-4"><Alert tone={msg.tone}>{msg.text}</Alert></div>}
      {state?.last_status === 'error' && state.last_error && !msg && <div className="mb-4"><Alert tone={waiting ? 'info' : 'bad'}>{state.last_error}</Alert></div>}
      <Card data-tour="sync-runs" className="overflow-hidden">
        <div className="border-b border-line bg-paper/70 px-4 py-2.5 text-xs font-semibold text-muted">Recent runs</div>
        {!runs.length ? <p className="px-4 py-6 text-center text-sm text-muted">No sync has run yet.</p> : (
          <ul className="divide-y divide-line">{runs.map(r => (
            <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm">
              {r.status === 'ok' ? <CheckCircle2 size={16} className="text-good" /> : r.status === 'error' ? <CircleAlert size={16} className="text-red" /> : <Clock size={16} className="text-warn" />}
              <span className="w-36 text-muted">{when(r.started_at)}</span>
              <span className="flex w-40 gap-1.5">{r.full_scan && <Badge>Full scan</Badge>}{r.scheduled && <Badge tone="info">Automatic</Badge>}{!r.full_scan && !r.scheduled && <Badge>Manual</Badge>}</span>
              <span>{r.status === 'error' ? <span className="text-red">{r.error}</span> : r.status === 'running' ? 'Running…' : `${r.changed} new or changed · ${r.deleted} removed`}</span>
            </li>
          ))}</ul>
        )}
      </Card>
    </div>
  )
}
