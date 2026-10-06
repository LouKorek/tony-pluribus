import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertTriangle, ArrowRight, CalendarClock, ClipboardList } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth, isAdmin } from '../../lib/auth'
import { useRefData, STAGE_SHORT, fmtRange } from '../../lib/scouting'
import { Badge, Card, PageHeader, Spinner } from '../../components/ui'
import { useCamps, stageTone } from './Camps'

interface Funnel { submitted: number; seen: number; district_selected: number; province: number; province_selected: number; national: number; national_selected: number; see_again: number; by_group: Record<string, number> }

export default function ScoutingHome() {
  const { scoutingSeason, profile } = useAuth()
  const ref = useRefData()
  const nav = useNavigate()
  const { camps, stats } = useCamps()
  const [f, setF] = useState<Funnel | null>(null)
  const [todo, setTodo] = useState({ doubtful: 0, pending: 0 })

  useEffect(() => {
    if (!scoutingSeason) return
    supabase.rpc('season_funnel', { p_season: scoutingSeason.id }).then(({ data }) => setF(data as Funnel))
    Promise.all([
      supabase.from('players').select('id', { count: 'exact', head: true }).eq('age_status', 'doubtful').is('merged_into', null),
      isAdmin(profile) ? supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('status', 'pending') : Promise.resolve({ count: 0 }),
    ]).then(([d, p]) => setTodo({ doubtful: d.count ?? 0, pending: p.count ?? 0 }))
  }, [scoutingSeason, profile])

  const today = new Date().toISOString().slice(0, 10)
  const upcoming = (camps ?? []).filter(c => c.status !== 'cancelled' && c.starts_on && c.starts_on >= today).slice(0, 6)
  const needResults = (camps ?? []).filter(c => c.status !== 'cancelled' && c.starts_on && (c.ends_on ?? c.starts_on) < today && !['completed', 'published'].includes(c.status))
  const covered = new Set((camps ?? []).filter(c => c.stage === 'district' && c.status !== 'cancelled').map(c => c.district_id))
  const uncovered = ref.districts.filter(d => !covered.has(d.id))

  const steps = f ? [
    { label: 'Submitted to district camps', v: f.submitted },
    { label: 'Seen at district camps', v: f.seen },
    { label: 'Selected at district camps', v: f.district_selected },
    { label: 'At province finals', v: f.province },
    { label: 'At the national final', v: f.national },
    { label: 'Selected for Tony', v: f.national_selected, strong: true },
  ] : []
  const max = Math.max(1, ...steps.map(s => s.v))

  return (
    <div>
      <PageHeader eyebrow={`Scouting ${scoutingSeason?.label ?? ''}`} title="Scouting home" description="Where the season stands: the funnel, the next camps, and what needs attention." />

      <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
        <Card className="p-5" data-tour="funnel">
          <div className="flex items-baseline justify-between">
            <div className="label-caps text-muted">Season funnel · players</div>
            {f && Object.keys(f.by_group).length > 0 && <div className="text-xs text-muted">{Object.entries(f.by_group).sort().map(([g, n]) => `${g} ${n}`).join(' · ')}</div>}
          </div>
          {!f ? <Spinner /> : (
            <div className="mt-4 space-y-2.5">
              {steps.map((s, i) => (
                <div key={s.label} className="grid grid-cols-[minmax(0,190px)_1fr_auto] items-center gap-3">
                  <div className={`truncate text-sm ${s.strong ? 'font-semibold' : 'text-muted'}`}>{s.label}</div>
                  <div className="h-6 rounded bg-black/[.04]">
                    <div className={`h-6 rounded ${s.strong ? 'bg-red' : 'bg-ink'}`} style={{ width: `${Math.max(s.v ? 1.5 : 0, (s.v / max) * 100)}%`, opacity: s.strong ? 1 : 1 - i * 0.12 }} />
                  </div>
                  <div className="w-14 text-right font-display text-xl font-bold tabular-nums">{s.v.toLocaleString()}</div>
                </div>
              ))}
              {f.see_again > 0 && <div className="pt-1 text-sm text-muted">{f.see_again} more marked “see again”.</div>}
              {f.submitted === 0 && <p className="pt-2 text-sm text-muted">No players in camps yet. The funnel fills as camps take place.</p>}
            </div>
          )}
        </Card>

        <Card data-tour="attention" className="p-5">
          <div className="label-caps text-muted">Needs attention</div>
          <ul className="mt-3 space-y-2 text-sm">
            {needResults.length > 0 && <Todo icon={<ClipboardList size={16} />} to="/scouting/camps" text={`${needResults.length} past camp${needResults.length > 1 ? 's' : ''} not marked completed`} />}
            {todo.pending > 0 && <Todo icon={<AlertTriangle size={16} />} to="/users" text={`${todo.pending} coach account${todo.pending > 1 ? 's' : ''} waiting for approval`} />}
            {todo.doubtful > 0 && <Todo icon={<AlertTriangle size={16} />} to="/scouting/players" text={`${todo.doubtful} player${todo.doubtful > 1 ? 's' : ''} with a doubtful age`} />}
            {uncovered.length > 0 && <Todo icon={<CalendarClock size={16} />} to="/scouting/plan" text={`${uncovered.length} of ${ref.districts.length} districts have no camp planned`} />}
            {!needResults.length && !todo.pending && !todo.doubtful && !uncovered.length && <li className="text-muted">Nothing waiting.</li>}
          </ul>
        </Card>
      </div>

      <div className="mt-6" data-tour="next-camps">
        <div className="mb-2 flex items-center justify-between">
          <div className="label-caps text-muted">Next camps</div>
          <Link to="/scouting/plan" className="text-sm font-semibold text-red hover:underline">Open the plan</Link>
        </div>
        {!camps ? <Spinner /> : upcoming.length === 0 ? (
          <Card className="p-5 text-sm text-muted">No upcoming camps. Plan the season on the <Link to="/scouting/plan" className="font-semibold text-red">Plan</Link> board.</Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {upcoming.map(c => (
              <button key={c.id} onClick={() => nav(`/scouting/camps/${c.id}`)} className="rounded-xl border border-line bg-card p-4 text-left hover:border-ink">
                <div className="flex items-center justify-between"><span className="text-sm font-semibold">{fmtRange(c.starts_on, c.ends_on)}</span><Badge tone={stageTone(c.stage)}>{STAGE_SHORT[c.stage]}</Badge></div>
                <div className="mt-1 font-display text-lg font-bold uppercase leading-tight">{c.name}</div>
                <div className="mt-1 text-xs text-muted">{c.venue ?? 'Venue to be set'}{c.staff ? ` · ${c.staff}` : ''}</div>
                <div className="mt-2 text-sm"><b>{stats[c.id]?.total ?? 0}</b> <span className="text-muted">players so far</span></div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Todo({ icon, text, to }: { icon: React.ReactNode; text: string; to: string }) {
  return (
    <li>
      <Link to={to} className="flex items-center gap-2.5 rounded-lg border border-line px-3 py-2.5 hover:border-ink">
        <span className="text-warn">{icon}</span><span className="flex-1">{text}</span><ArrowRight size={15} className="text-faint" />
      </Link>
    </li>
  )
}
