import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CalendarPlus, ChevronRight, MapPin, Plus, Tent } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { useRefData, STAGE_SHORT, fmtDate, fmtRange, scoutingWindow, type Camp, type CampStats, type Stage } from '../../lib/scouting'
import { Badge, Button, Card, Empty, PageHeader, SearchInput, Segmented, Spinner, Td, Th, cx } from '../../components/ui'
import { CampFormModal } from './campForm'

export function useCamps() {
  const { scoutingSeason } = useAuth()
  const [camps, setCamps] = useState<Camp[] | null>(null)
  const [stats, setStats] = useState<Record<string, CampStats>>({})
  const load = useCallback(async () => {
    if (!scoutingSeason) return
    const { data } = await supabase.from('camps').select('*').eq('season_id', scoutingSeason.id).order('starts_on', { nullsFirst: false })
    const list = (data as Camp[]) ?? []
    setCamps(list)
    if (list.length) {
      const { data: st } = await supabase.from('v_camp_stats').select('*').in('camp_id', list.map(c => c.id))
      setStats(Object.fromEntries(((st as CampStats[]) ?? []).map(s => [s.camp_id, s])))
    }
  }, [scoutingSeason])
  useEffect(() => { load() }, [load])
  return { camps, stats, reload: load }
}

export const stageTone = (s: Stage) => (s === 'national_final' ? 'dark' : s === 'province_final' ? 'lime' : 'neutral') as 'dark' | 'lime' | 'neutral'
export const statusTone = (s: Camp['status']) => (s === 'published' ? 'good' : s === 'completed' ? 'info' : s === 'open' ? 'warn' : s === 'cancelled' ? 'bad' : 'neutral') as 'good' | 'info' | 'warn' | 'bad' | 'neutral'
export const STATUS_LABEL: Record<Camp['status'], string> = { planned: 'Planned', open: 'Open', completed: 'Completed', published: 'Published', cancelled: 'Cancelled' }

export default function CampsPage() {
  const { scoutingSeason, profile } = useAuth()
  const ref = useRefData()
  const nav = useNavigate()
  const { camps, stats, reload } = useCamps()
  const [stage, setStage] = useState<Stage | 'all'>('all')
  const [q, setQ] = useState('')
  const [creating, setCreating] = useState(false)
  const canEdit = profile?.role !== 'observer'

  const list = (camps ?? []).filter(c => (stage === 'all' || c.stage === stage) &&
    (!q || `${c.name} ${ref.district(c.district_id)?.name ?? ''} ${ref.regions.find(r => r.id === c.region_id)?.name ?? ''} ${c.venue ?? ''} ${c.staff ?? ''}`.toLowerCase().includes(q.toLowerCase())))
  const count = (s: Stage) => (camps ?? []).filter(c => c.stage === s).length

  return (
    <div>
      <PageHeader eyebrow={`Scouting ${scoutingSeason?.label ?? ''}`} title="Camps"
        description="Every district camp, province final and the national final of the season. Open a camp to enter attendance, tests, grades and decisions."
        actions={canEdit && <Button variant="primary" onClick={() => setCreating(true)}><Plus size={16} /> New camp</Button>} />

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Segmented value={stage} onChange={setStage} options={[
          { value: 'all', label: 'All', count: camps?.length ?? 0 },
          { value: 'district', label: 'District', count: count('district') },
          { value: 'province_final', label: 'Province finals', count: count('province_final') },
          { value: 'national_final', label: 'National', count: count('national_final') },
        ]} />
        <SearchInput className="sm:w-72" value={q} onChange={setQ} placeholder="Search camp, district, staff" />
      </div>

      <Card className="overflow-hidden">
        {!camps ? <Spinner /> : list.length === 0 ? (
          <Empty icon={<Tent size={20} />} title={camps.length ? 'No camps match' : 'No camps yet'}>
            {camps.length ? 'Change the filter or clear the search.' : <>Plan the season's camps here or on the <Link to="/scouting/plan" className="font-semibold text-red">Plan</Link> board.</>}
          </Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="border-b border-line bg-paper/70"><tr>
                <Th>Date</Th><Th>Camp</Th><Th>Stage</Th><Th className="text-right">Players</Th><Th className="text-right">Attended</Th><Th className="text-right">Selected</Th><Th>Status</Th><Th />
              </tr></thead>
              <tbody>{list.map(c => {
                const s = stats[c.id]
                return (
                  <tr key={c.id} onClick={() => nav(`/scouting/camps/${c.id}`)} className="cursor-pointer border-b border-line last:border-0 hover:bg-paper/60">
                    <Td className="whitespace-nowrap font-semibold">{fmtRange(c.starts_on, c.ends_on)}</Td>
                    <Td><div className="font-semibold">{c.name}</div><div className="text-xs text-muted">{[c.venue, c.staff].filter(Boolean).join(' · ')}</div></Td>
                    <Td><Badge tone={stageTone(c.stage)}>{STAGE_SHORT[c.stage]}</Badge></Td>
                    <Td className="text-right">{s?.total ?? 0}</Td>
                    <Td className="text-right">{s?.attended ?? 0}</Td>
                    <Td className="text-right">{s?.selected ? <Badge tone="good">{s.selected}</Badge> : 0}</Td>
                    <Td><Badge tone={statusTone(c.status)}>{STATUS_LABEL[c.status]}</Badge></Td>
                    <Td className="text-faint"><ChevronRight size={16} /></Td>
                  </tr>
                )
              })}</tbody>
            </table>
          </div>
        )}
      </Card>

      {creating && <CampFormModal onClose={() => setCreating(false)} onSaved={id => { setCreating(false); reload(); nav(`/scouting/camps/${id}`) }} />}
    </div>
  )
}

/* ─────────────── Plan: the season by weekend ─────────────── */
function weekends(from: string, to: string) {
  const out: { sat: string; sun: string }[] = []
  const d = new Date(from + 'T00:00:00')
  while (d.getDay() !== 6) d.setDate(d.getDate() + 1)
  const end = new Date(to + 'T00:00:00')
  while (d <= end) {
    const sun = new Date(d); sun.setDate(d.getDate() + 1)
    out.push({ sat: iso(d), sun: iso(sun) })
    d.setDate(d.getDate() + 7)
  }
  return out
}
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function PlanPage() {
  const { scoutingSeason, profile } = useAuth()
  const ref = useRefData()
  const nav = useNavigate()
  const { camps, stats, reload } = useCamps()
  const [creating, setCreating] = useState<Partial<Camp> | null>(null)
  const canEdit = profile?.role !== 'observer'
  const win = scoutingWindow(scoutingSeason)
  const weeks = useMemo(() => weekends(win.from, win.to), [win.from, win.to])
  const today = iso(new Date())

  const byWeek = useMemo(() => {
    const m = new Map<string, Camp[]>()
    for (const c of camps ?? []) {
      if (!c.starts_on) continue
      const w = weeks.find(w => { const mon = new Date(w.sat + 'T00:00:00'); mon.setDate(mon.getDate() - 5); const nextMon = new Date(w.sun + 'T00:00:00'); nextMon.setDate(nextMon.getDate() + 1); return c.starts_on! >= iso(mon) && c.starts_on! < iso(nextMon) })
      if (w) m.set(w.sat, [...(m.get(w.sat) ?? []), c])
    }
    return m
  }, [camps, weeks])
  const undated = (camps ?? []).filter(c => !c.starts_on)
  const covered = new Set((camps ?? []).filter(c => c.stage === 'district' && c.status !== 'cancelled').map(c => c.district_id))

  let lastMonth = ''
  return (
    <div>
      <PageHeader eyebrow={`Scouting ${scoutingSeason?.label ?? ''}`} title="Plan"
        description={`Every weekend from ${fmtDate(win.from)} to ${fmtDate(win.to)}. Add a camp to any weekend; the coverage bar shows which districts already have a camp.`}
        actions={canEdit && <Button variant="primary" onClick={() => setCreating({})}><Plus size={16} /> New camp</Button>} />

      <Card className="mb-5 p-4">
        <div className="flex items-center justify-between">
          <div className="label-caps text-muted">District coverage</div>
          <div className="text-sm font-semibold">{[...covered].filter(Boolean).length} / {ref.districts.length} districts planned</div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-5">
          {ref.regions.map(r => (
            <div key={r.id}>
              <div className="mb-1 text-xs font-semibold text-muted">{r.name}</div>
              <div className="flex flex-wrap gap-1">
                {ref.districts.filter(d => d.region_id === r.id).map(d => (
                  <span key={d.id} className={cx('rounded px-1.5 py-0.5 text-[11px] font-semibold', covered.has(d.id) ? 'bg-ink text-lime' : 'bg-black/5 text-faint')}>{d.name}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {!camps ? <Spinner /> : (
        <div className="space-y-1.5">
          {undated.length > 0 && (
            <Card className="mb-4 p-3"><div className="label-caps mb-2 text-warn">No date yet</div>
              <div className="flex flex-wrap gap-2">{undated.map(c => <CampChip key={c.id} c={c} n={stats[c.id]?.total} onClick={() => nav(`/scouting/camps/${c.id}`)} />)}</div>
            </Card>
          )}
          {weeks.map(w => {
            const d = new Date(w.sat + 'T00:00:00')
            const month = d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
            const header = month !== lastMonth; lastMonth = month
            const list = byWeek.get(w.sat) ?? []
            const past = w.sun < today
            return (
              <div key={w.sat}>
                {header && <div className="label-caps mb-2 mt-5 text-red first:mt-0">{month}</div>}
                <div className={cx('group flex items-stretch gap-3 rounded-xl border bg-card', list.length ? 'border-line' : 'border-dashed border-line', past && 'opacity-60')}>
                  <div className="flex w-24 shrink-0 flex-col justify-center border-r border-line px-3 py-2.5">
                    <div className="font-display text-lg font-bold leading-none">{d.getDate()}–{new Date(w.sun + 'T00:00:00').getDate()}</div>
                    <div className="mt-0.5 text-[11px] text-muted">Sat–Sun</div>
                  </div>
                  <div className="flex flex-1 flex-wrap items-center gap-2 py-2.5">
                    {list.map(c => <CampChip key={c.id} c={c} n={stats[c.id]?.total} onClick={() => nav(`/scouting/camps/${c.id}`)} />)}
                    {!list.length && <span className="text-sm text-faint">Free weekend</span>}
                  </div>
                  {canEdit && (
                    <button onClick={() => setCreating({ starts_on: w.sat, ends_on: w.sun })} className="flex items-center gap-1.5 px-4 text-sm font-semibold text-muted opacity-0 transition-opacity hover:text-red group-hover:opacity-100 focus:opacity-100">
                      <CalendarPlus size={15} /> Add
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {creating && <CampFormModal defaults={creating} onClose={() => setCreating(null)} onSaved={() => { setCreating(null); reload() }} />}
    </div>
  )
}

function CampChip({ c, n, onClick }: { c: Camp; n?: number; onClick: () => void }) {
  const ref = useRefData()
  const where = c.stage === 'district' ? ref.district(c.district_id)?.name : c.stage === 'province_final' ? ref.regions.find(r => r.id === c.region_id)?.name : 'National'
  return (
    <button onClick={onClick} className={cx('flex items-center gap-2 rounded-lg border px-3 py-1.5 text-left text-sm transition-colors hover:border-ink',
      c.stage === 'national_final' ? 'border-ink bg-ink text-white' : c.stage === 'province_final' ? 'border-ink/20 bg-lime-soft' : 'border-line-2 bg-card', c.status === 'cancelled' && 'line-through opacity-50')}>
      <MapPin size={13} className={c.stage === 'national_final' ? 'text-lime' : 'text-red'} />
      <span className="font-semibold">{where}</span>
      <span className={c.stage === 'national_final' ? 'text-white/60' : 'text-muted'}>{c.stage === 'district' ? c.age_groups.join('/') : STAGE_SHORT[c.stage]}</span>
      {!!n && <span className={cx('rounded-full px-1.5 text-[11px] font-semibold', c.stage === 'national_final' ? 'bg-white/15' : 'bg-black/8')}>{n}</span>}
    </button>
  )
}
