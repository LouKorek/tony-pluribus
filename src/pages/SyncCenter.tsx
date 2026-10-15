import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, CircleAlert, Clock, FileSpreadsheet, RefreshCcw } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { Alert, Badge, Button, Card, PageHeader, Stat } from '../components/ui'

interface State { last_run_at: string | null; last_ok_at: string | null; last_status: string | null; last_error: string | null; delta_link: string | null }
interface Run { id: string; started_at: string; finished_at: string | null; status: 'running' | 'ok' | 'error'; full_scan: boolean; scheduled?: boolean; changed: number; deleted: number; error: string | null }
interface ContentStats {
  kinds: { kind: string; files: number; read: number; stale: number; errors: number; last: string | null }[]
  errors: { path: string; error: string; attempts: number }[]
  linked: { plans: number; reports: number; evaluations: number; photos: number; documents: number }
}
interface ContentResult { read: number; failed: number; rows: number; pending: number; files: { path: string; rows?: number; error?: string; notes?: string[] }[] }
const KIND_LABEL: Record<string, string> = { presence: 'Presence control', speed: 'Speed tests', weight: 'Weight and height', matchstats: 'Match stats', squad: 'Squad boards', evaluations: 'Evaluations', finance: 'Finance ledgers', weekreport: 'Weekly staff reports' }
const when = (s: string | null) => s ? new Date(s).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'

export default function SyncCenterPage() {
  const [state, setState] = useState<State | null>(null)
  const [runs, setRuns] = useState<Run[]>([])
  const [stats, setStats] = useState<{ files: number; folders: number } | null>(null)
  const [content, setContent] = useState<ContentStats | null>(null)
  const [result, setResult] = useState<ContentResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'good' | 'bad' | 'info'; text: string } | null>(null)

  const load = useCallback(async () => {
    const [s, r, t, c] = await Promise.all([
      supabase.from('sync_state').select('last_run_at, last_ok_at, last_status, last_error, delta_link').maybeSingle(),
      supabase.from('sync_runs').select('*').order('started_at', { ascending: false }).limit(20),
      supabase.rpc('talent_folder_stats'),
      supabase.rpc('talent_content_stats'),
    ])
    setState((s.data as State) ?? null); setRuns((r.data as Run[]) ?? []); setStats(t.data as { files: number; folders: number }); setContent((c.data as ContentStats) ?? null)
  }, [])
  useEffect(() => { load() }, [load])

  async function run(opts: { full?: boolean; content?: boolean }) {
    setBusy(true); setMsg(null); setResult(null)
    const { data, error } = await supabase.functions.invoke('sharepoint-sync', { body: opts })
    let text = (data as { error?: string; message?: string } | null)?.error
    if (error) { try { const j = await (error as { context?: Response }).context?.json(); text = j?.message ?? j?.error } catch { /* */ } text ??= error.message }
    setBusy(false)
    if (text) setMsg({ tone: text === 'not_configured' || /^Waiting/.test(text) ? 'info' : 'bad', text: /not_configured|secret is not set/i.test(text) ? 'The Microsoft secret is not set yet. Once the owner pastes MS_CLIENT_SECRET into Supabase, run the sync again.' : text })
    else {
      const d = data as { changed: number; deleted: number; full: boolean; content?: ContentResult }
      const c = d.content
      const tail = c ? ` Content: ${c.read} workbook${c.read === 1 ? '' : 's'} read (${c.rows.toLocaleString()} rows)${c.failed ? `, ${c.failed} failed` : ''}${c.pending ? `, ${c.pending} still pending — run "Reconcile content now" again` : ''}.` : ''
      setMsg({ tone: c?.failed ? 'info' : 'good', text: `${d.full ? 'Full scan done' : 'Up to date'}: ${d.changed} new or changed, ${d.deleted} removed.${tail}` })
      if (c) setResult(c)
    }
    load()
  }
  async function reread() {
    if (!confirm('Read every workbook in the Talent folder again? Existing content from the files is replaced by what the files hold now.')) return
    await supabase.rpc('talent_content_reset')
    await run({ content: true })
  }

  const ok = state?.last_status === 'ok'
  const waiting = !ok && /^Waiting for the TonyRW admin/.test(state?.last_error ?? '')
  return (
    <div>
      <PageHeader eyebrow="System" title="Sync Center" description="Tony Next reads the shared Talent folder in SharePoint through the Tony Next sync app. Every change there (new files, renames, moves, deletions) reaches the Files screen and the links across the system."
        actions={<><Button onClick={() => run({ full: true })} disabled={busy}>Full scan</Button><Button variant="primary" loading={busy} onClick={() => run({})}><RefreshCcw size={15} /> Sync now</Button></>} />
      <div data-tour="sync-status" className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat accent label="Status" value={!state ? 'Not connected' : ok ? 'Connected' : waiting ? 'Waiting' : 'Error'} sub={state?.last_ok_at ? `Last good sync ${when(state.last_ok_at)}` : 'Waiting for Microsoft approval'} />
        <Stat label="Last run" value={when(state?.last_run_at ?? null)} sub="Runs on its own every 15 minutes" />
        <Stat label="Files" value={stats?.files?.toLocaleString() ?? '—'} sub="in the Talent folder index" />
        <Stat label="Folders" value={stats?.folders?.toLocaleString() ?? '—'} />
      </div>
      {msg && <div className="mb-4"><Alert tone={msg.tone}>{msg.text}</Alert></div>}
      {state?.last_status === 'error' && state.last_error && !msg && <div className="mb-4"><Alert tone={waiting ? 'info' : 'bad'}>{state.last_error}</Alert></div>}

      <Card data-tour="sync-content" className="mb-5 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-paper/70 px-4 py-2.5">
          <div>
            <div className="text-xs font-semibold text-muted">Content inside the files</div>
            <div className="text-xs text-muted">Squads, presence, tests, match stats, evaluations, finance and weekly reports come from the workbooks; plans, match reports, photos and documents are linked by name. The files are the source of truth: what is in them is what the screens show.</div>
          </div>
          <div className="flex gap-2">
            <Button onClick={reread} disabled={busy}>Re-read all workbooks</Button>
            <Button variant="primary" loading={busy} onClick={() => run({ content: true })}><FileSpreadsheet size={15} /> Reconcile content now</Button>
          </div>
        </div>
        {!content ? <p className="px-4 py-6 text-center text-sm text-muted">Loading…</p> : (
          <div className="grid gap-0 lg:grid-cols-[1fr_auto]">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-muted"><th className="px-4 py-2 font-medium">Workbooks</th><th className="px-2 py-2 text-right font-medium">Files</th><th className="px-2 py-2 text-right font-medium">Read</th><th className="px-2 py-2 text-right font-medium">Pending</th><th className="px-2 py-2 text-right font-medium">Errors</th><th className="px-4 py-2 font-medium">Last read</th></tr></thead>
              <tbody className="divide-y divide-line">
                {content.kinds.map(k => (
                  <tr key={k.kind}>
                    <td className="px-4 py-1.5">{KIND_LABEL[k.kind] ?? k.kind}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{k.files}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{k.read}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{k.stale ? <Badge tone="warn">{k.stale}</Badge> : <span className="text-muted">0</span>}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{k.errors ? <Badge tone="bad">{k.errors}</Badge> : <span className="text-muted">0</span>}</td>
                    <td className="px-4 py-1.5 text-muted">{when(k.last)}</td>
                  </tr>
                ))}
                {!content.kinds.length && <tr><td colSpan={6} className="px-4 py-4 text-center text-muted">No workbook recognised in the index yet.</td></tr>}
              </tbody>
            </table>
            <div className="grid grid-cols-5 gap-3 border-t border-line p-4 lg:grid-cols-1 lg:border-l lg:border-t-0">
              {([['plans', 'Training plans'], ['reports', 'Match reports'], ['evaluations', 'Individual reports'], ['photos', 'Player photos'], ['documents', 'Player documents']] as const).map(([k, l]) => (
                <div key={k}><div className="text-lg font-semibold tabular-nums">{content.linked[k]}</div><div className="text-xs text-muted">{l} linked</div></div>
              ))}
            </div>
          </div>
        )}
        {!!content?.errors.length && (
          <ul className="divide-y divide-line border-t border-line bg-danger/5 text-xs">{content.errors.map(e => (
            <li key={e.path} className="flex flex-wrap gap-x-3 px-4 py-1.5"><span className="font-medium">{e.path}</span><span className="text-danger">{e.error}</span><span className="text-muted">attempt {e.attempts} of 5</span></li>
          ))}</ul>
        )}
        {result && result.files.length > 0 && (
          <details className="border-t border-line text-xs">
            <summary className="cursor-pointer px-4 py-2 text-muted">What this run read ({result.files.length} files)</summary>
            <ul className="divide-y divide-line">{result.files.map(f => (
              <li key={f.path} className="flex flex-wrap gap-x-3 px-4 py-1.5"><span className="font-medium">{f.path}</span>{f.error ? <span className="text-danger">{f.error}</span> : <span className="text-muted">{f.rows} rows</span>}{f.notes?.map(n => <span key={n} className="text-warn">{n}</span>)}</li>
            ))}</ul>
          </details>
        )}
      </Card>

      <Card data-tour="sync-runs" className="overflow-hidden">
        <div className="border-b border-line bg-paper/70 px-4 py-2.5 text-xs font-semibold text-muted">Recent runs</div>
        {!runs.length ? <p className="px-4 py-6 text-center text-sm text-muted">No sync has run yet.</p> : (
          <ul className="divide-y divide-line">{runs.map(r => (
            <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm">
              {r.status === 'ok' ? <CheckCircle2 size={16} className="text-good" /> : r.status === 'error' ? <CircleAlert size={16} className="text-danger" /> : <Clock size={16} className="text-warn" />}
              <span className="w-36 text-muted">{when(r.started_at)}</span>
              <span className="flex w-40 gap-1.5">{r.full_scan && <Badge>Full scan</Badge>}{r.scheduled && <Badge tone="info">Automatic</Badge>}{!r.full_scan && !r.scheduled && <Badge>Manual</Badge>}</span>
              <span>{r.status === 'error' ? <span className="text-danger">{r.error}</span> : r.status === 'running' ? 'Running…' : `${r.changed} new or changed · ${r.deleted} removed`}</span>
            </li>
          ))}</ul>
        )}
      </Card>
    </div>
  )
}
