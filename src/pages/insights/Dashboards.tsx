import { useEffect, useState, type ReactNode } from 'react'
import { Printer } from 'lucide-react'
import { supabase, errMsg } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { Alert, Button, Card, PageHeader, Select, Spinner, cx } from '../../components/ui'

interface Kpi {
  academies: number; academies_visited: number; academies_submitting: number; camps: number; camps_done: number
  districts_covered: number; districts: number; submitted: number; seen: number; district_selected: number
  province: number; province_selected: number; national: number; national_selected: number; see_again: number; absent: number
}
interface RegionRow { name: string; academies: number; visited: number; camps: number; camps_done: number; submitted: number; seen: number; selected: number; province: number; province_selected: number }
interface Dash {
  season: string; kpi: Kpi; regions: RegionRow[]; obs: Record<string, number>
  groups: { code: string; from: number; to: number; submitted: number; selected: number; national_selected: number }[]
  top_academies: { name: string; district: string | null; submitted: number; selected: number }[]
  months: { month: string; planned: number; done: number }[]
  history: { season: string; current: boolean; visited: number; scouted: number; selected: number; camp_submitted: number; camp_selected: number }[]
}

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0)
const fmt = (n: number) => n.toLocaleString('en-GB')

export default function DashboardsPage() {
  const { seasons, scoutingSeason } = useAuth()
  const [seasonId, setSeasonId] = useState(scoutingSeason?.id ?? '')
  const [d, setD] = useState<Dash | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!seasonId) return
    setD(null); setErr(null)
    supabase.rpc('dashboard_scouting', { p_season: seasonId }).then(({ data, error }) => { if (error) setErr(errMsg(error)); else setD(data as Dash) })
  }, [seasonId])

  return (
    <div>
      <PageHeader eyebrow="Insights" title="Scouting dashboard"
        description="The season in numbers, from the academy visits to the national final. Earlier seasons come from the Talent folder history."
        actions={<>
          <Select data-tour="season" className="w-44" value={seasonId} onChange={e => setSeasonId(e.target.value)} aria-label="Season">
            {seasons.map(s => <option key={s.id} value={s.id}>Scouting {s.label}</option>)}
          </Select>
          <Button data-tour="print" className="no-print" onClick={() => window.print()}><Printer size={15} /> Print</Button>
        </>} />

      {err && <Alert>{err}</Alert>}
      {!d ? (!err && <Spinner />) : <Body d={d} />}
    </div>
  )
}

function Body({ d }: { d: Dash }) {
  const k = d.kpi
  const funnel = [
    { label: 'Submitted by academies', v: k.submitted },
    { label: 'Seen at district camps', v: k.seen },
    { label: 'Selected at district camps', v: k.district_selected },
    { label: 'At the province finals', v: k.province },
    { label: 'Selected at province finals', v: k.province_selected },
    { label: 'At the national final', v: k.national },
    { label: 'Selected at the national final', v: k.national_selected },
  ]
  const fmax = Math.max(1, ...funnel.map(f => f.v))
  const obsTotal = ['A', 'B+', 'B', 'C'].reduce((s, o) => s + (d.obs[o] ?? 0), 0)
  const hmax = Math.max(1, ...d.history.map(h => Math.max(h.scouted, h.camp_submitted)))
  const mmax = Math.max(1, ...d.months.map(m => m.planned))

  return (
    <div className="space-y-6">
      <div data-tour="kpis" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Academies visited" value={k.academies_visited} of={k.academies} />
        <Kpi label="Districts with a camp" value={k.districts_covered} of={k.districts} />
        <Kpi label="District camps done" value={k.camps_done} of={k.camps} />
        <Kpi label="Academies submitting" value={k.academies_submitting} of={k.academies} />
        <Kpi label="Players submitted" value={k.submitted} />
        <Kpi label="Seen at camps" value={k.seen} of={k.submitted} />
        <Kpi label="Province finalists" value={k.province} />
        <Kpi label="Selected nationally" value={k.national_selected} sub={`${k.see_again} to see again`} accent />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <Panel title="Pathway funnel">
          <div className="space-y-2">
            {funnel.map((f, i) => (
              <div key={f.label} className="grid grid-cols-[minmax(0,200px)_1fr_auto] items-center gap-3 text-sm">
                <span className="truncate text-muted">{f.label}</span>
                <div className="h-6 rounded bg-black/5"><div className={cx('h-6 rounded', i % 2 ? 'bg-red' : 'bg-ink')} style={{ width: `${(f.v / fmax) * 100}%` }} /></div>
                <span className="w-12 text-right font-display text-lg font-bold">{fmt(f.v)}</span>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="OBS grades at district camps">
          {obsTotal === 0 ? <Nothing>No grades entered yet.</Nothing> : (
            <div className="flex h-44 items-end gap-4">
              {['A', 'B+', 'B', 'C'].map(o => {
                const v = d.obs[o] ?? 0
                return (
                  <div key={o} className="flex flex-1 flex-col items-center gap-1">
                    <span className="text-sm font-semibold">{v} <span className="text-xs text-muted">({pct(v, obsTotal)}%)</span></span>
                    <div className="w-full rounded-t bg-ink" style={{ height: `${Math.max(4, (v / obsTotal) * 120)}px`, opacity: o === 'A' ? 1 : o === 'B+' ? 0.8 : o === 'B' ? 0.6 : 0.4 }} />
                    <span className="font-display text-lg font-bold">{o}</span>
                  </div>
                )
              })}
            </div>
          )}
        </Panel>
      </div>

      <Panel title="By province" tour="regions">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead><tr className="border-b border-line text-left text-xs text-muted">
              {['Province', 'Academies', 'Visited', 'District camps', 'Submitted', 'Seen', 'Selected', 'Province final', 'Selected at final'].map(h => <th key={h} className="px-2 py-2 font-semibold">{h}</th>)}
            </tr></thead>
            <tbody>
              {d.regions.map(r => (
                <tr key={r.name} className="border-b border-line last:border-0">
                  <td className="px-2 py-2.5 font-semibold">{r.name}</td>
                  <td className="px-2">{r.academies}</td>
                  <td className="px-2"><Mini v={r.visited} max={r.academies} /></td>
                  <td className="px-2">{r.camps_done}/{r.camps}</td>
                  <td className="px-2">{r.submitted}</td>
                  <td className="px-2">{r.seen}</td>
                  <td className="px-2 font-semibold">{r.selected}</td>
                  <td className="px-2">{r.province}</td>
                  <td className="px-2 font-semibold text-good">{r.province_selected}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Age groups">
          <div className="space-y-3">
            {d.groups.map(g => (
              <div key={g.code}>
                <div className="flex items-baseline justify-between text-sm"><span className="font-display text-lg font-bold">{g.code} <span className="text-xs font-normal text-muted">born {g.from}–{g.to}</span></span>
                  <span className="text-muted">{g.selected} selected of {g.submitted} · {g.national_selected} national</span></div>
                <div className="mt-1 h-3 rounded-full bg-black/5"><div className="h-3 rounded-full bg-red" style={{ width: `${pct(g.selected, Math.max(1, g.submitted))}%` }} /></div>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Top academies by players selected">
          {d.top_academies.length === 0 ? <Nothing>Appears once district camps have results.</Nothing> : (
            <ol className="space-y-1.5 text-sm">
              {d.top_academies.map((a, i) => (
                <li key={a.name} className="flex items-center gap-3">
                  <span className="w-5 text-right font-display font-bold text-muted">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate"><b>{a.name}</b> <span className="text-muted">· {a.district}</span></span>
                  <span className="text-muted">{a.submitted} sent</span>
                  <span className="w-10 text-right font-semibold">{a.selected}</span>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>

      <Panel title="Camps by month">
        {d.months.length === 0 ? <Nothing>No dated camps yet.</Nothing> : (
          <div className="flex h-40 items-end gap-2 overflow-x-auto">
            {d.months.map(m => (
              <div key={m.month} className="flex min-w-12 flex-1 flex-col items-center gap-1">
                <span className="text-xs font-semibold">{m.done}/{m.planned}</span>
                <div className="relative w-full rounded-t bg-black/10" style={{ height: `${(m.planned / mmax) * 100}px` }}>
                  <div className="absolute inset-x-0 bottom-0 rounded-t bg-ink" style={{ height: `${pct(m.done, m.planned)}%` }} />
                </div>
                <span className="text-[11px] text-muted">{new Date(m.month + '-01T00:00:00').toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })}</span>
              </div>
            ))}
          </div>
        )}
        <Legend items={[['bg-ink', 'Done'], ['bg-black/10', 'Planned']]} />
      </Panel>

      <Panel title="Season against season" tour="history">
        <div className="flex h-52 items-end gap-6 overflow-x-auto pb-1">
          {d.history.map(h => (
            <div key={h.season} className="flex min-w-[120px] flex-1 flex-col items-center">
              <div className="flex h-40 w-full items-end justify-center gap-1.5">
                <Bar v={h.scouted || h.camp_submitted} max={hmax} cls="bg-black/25" />
                <Bar v={h.selected || h.camp_selected} max={hmax} cls="bg-red" />
                <Bar v={h.visited} max={hmax} cls="bg-ink" />
              </div>
              <span className={cx('mt-1.5 text-sm', h.current ? 'font-bold' : 'text-muted')}>{h.season.replace('-20', '/')}</span>
            </div>
          ))}
        </div>
        <Legend items={[['bg-black/25', 'Players seen'], ['bg-red', 'Selected'], ['bg-ink', 'Academies visited']]} />
      </Panel>
    </div>
  )
}

function Kpi({ label, value, of, sub, accent }: { label: string; value: number; of?: number; sub?: string; accent?: boolean }) {
  return (
    <Card className={cx('p-4', accent && 'border-ink bg-ink text-white')}>
      <div className={cx('label-caps text-[11px]', accent ? 'text-lime' : 'text-muted')}>{label}</div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="font-display text-4xl font-bold leading-none">{fmt(value)}</span>
        {of !== undefined && <span className={cx('text-sm', accent ? 'text-white/60' : 'text-muted')}>/ {fmt(of)}</span>}
      </div>
      {of !== undefined && <div className={cx('mt-2 h-1.5 rounded-full', accent ? 'bg-white/15' : 'bg-black/5')}><div className="h-1.5 rounded-full bg-red" style={{ width: `${pct(value, of)}%` }} /></div>}
      {sub && <div className={cx('mt-1.5 text-xs', accent ? 'text-white/60' : 'text-muted')}>{sub}</div>}
    </Card>
  )
}

function Panel({ title, children, tour }: { title: string; children: ReactNode; tour?: string }) {
  return <Card data-tour={tour} className="break-inside-avoid p-5"><div className="label-caps mb-4 text-muted">{title}</div>{children}</Card>
}
function Mini({ v, max }: { v: number; max: number }) {
  return <div className="flex items-center gap-2"><span className="w-8">{v}</span><div className="h-1.5 w-20 rounded-full bg-black/5"><div className="h-1.5 rounded-full bg-ink" style={{ width: `${pct(v, Math.max(1, max))}%` }} /></div></div>
}
function Bar({ v, max, cls }: { v: number; max: number; cls: string }) {
  return (
    <div className="flex w-8 flex-col items-center justify-end gap-1">
      <span className="text-[11px] font-semibold">{v ? fmt(v) : ''}</span>
      <div className={cx('w-full rounded-t', cls)} style={{ height: `${Math.max(v ? 3 : 0, (v / max) * 130)}px` }} />
    </div>
  )
}
function Legend({ items }: { items: [string, string][] }) {
  return <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted">{items.map(([c, l]) => <span key={l} className="flex items-center gap-1.5"><span className={cx('h-2.5 w-2.5 rounded-sm', c)} />{l}</span>)}</div>
}
function Nothing({ children }: { children: ReactNode }) {
  return <p className="rounded-lg bg-paper px-3 py-6 text-center text-sm text-muted">{children}</p>
}
