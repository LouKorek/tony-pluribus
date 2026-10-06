import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowDownRight, ArrowUpRight, CalendarPlus, Timer } from 'lucide-react'
import { supabase, errMsg } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { METRIC_LABEL, TeamBar, pname, useRoster, useTeamSeason, useTeams, type Measurement, type Metric } from '../../lib/teams'
import { Alert, Button, Card, Empty, Field, Input, Modal, PageHeader, Segmented, Spinner, cx } from '../../components/ui'

const GROUPS: Record<string, { label: string; metrics: Metric[]; lowerIsBetter?: boolean }> = {
  speed: { label: 'Speed', metrics: ['sprint_10m', 'sprint_20m'], lowerIsBetter: true },
  body: { label: 'Weight and height', metrics: ['weight_kg', 'height_cm'] },
  foot: { label: 'Foot', metrics: ['foot_cm'] },
  power: { label: 'Jump and endurance', metrics: ['cj_cm', 'yoyo_m'] },
}
const fmtDay = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })

export default function PhysicalPage() {
  const { can, inTeam } = useAuth()
  const { season, setSeason, seasons } = useTeamSeason()
  const { teams, team, pick } = useTeams(season?.id)
  const { roster } = useRoster(team?.id)
  const [group, setGroup] = useState<keyof typeof GROUPS>('speed')
  const [rows, setRows] = useState<Measurement[] | null>(null)
  const [extraDates, setExtraDates] = useState<string[]>([])
  const [adding, setAdding] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const canEdit = can('physical', 2) && inTeam(team?.id)
  const g = GROUPS[group]

  const load = useCallback(async () => {
    if (!roster) return
    const ids = roster.map(r => r.player_id)
    if (!ids.length) { setRows([]); return }
    const { data } = await supabase.from('measurements').select('*').in('player_id', ids).in('metric', g.metrics).order('taken_on')
    setRows((data as Measurement[]) ?? [])
  }, [roster, g])
  useEffect(() => { setRows(null); load() }, [load])

  const dates = useMemo(() => {
    const ds = new Set<string>([...(rows ?? []).filter(r => r.team_id === team?.id || !r.team_id).map(r => r.taken_on ?? ''), ...extraDates].filter(Boolean))
    return [...ds].sort()
  }, [rows, extraDates, team])
  const val = (pid: string, metric: Metric, date: string) => rows?.find(r => r.player_id === pid && r.metric === metric && r.taken_on === date)
  const players = (roster ?? []).filter(r => r.status !== 'left')

  async function save(pid: string, metric: Metric, date: string, raw: string) {
    setErr(null)
    const cur = val(pid, metric, date)
    const v = raw.trim() === '' ? null : Number(raw.replace(',', '.'))
    if (v !== null && Number.isNaN(v)) return setErr('Enter a number.')
    if (cur && v === Number(cur.value)) return
    const res = cur
      ? v === null ? await supabase.from('measurements').delete().eq('id', cur.id) : await supabase.from('measurements').update({ value: v }).eq('id', cur.id)
      : v === null ? { error: null } : await supabase.from('measurements').insert({ player_id: pid, team_id: team!.id, taken_on: date, metric, value: v })
    if (res.error) return setErr(errMsg(res.error))
    load()
  }

  return (
    <div>
      <PageHeader eyebrow="Teams" title="Physical tests" description="Sprint tests, weight and height over the season, as in the Speed Tests and Weight and Height sheets." />
      <TeamBar seasonId={season?.id} onSeason={setSeason} seasons={seasons} teams={teams} teamId={team?.id} onTeam={pick}
        extra={canEdit && team ? <Button variant="primary" onClick={() => setAdding(true)}><CalendarPlus size={16} /> New test date</Button> : undefined} />
      {!team ? (teams ? <Card><Empty icon={<Timer size={20} />} title="No team this season" /></Card> : <Spinner />) : (<>
        <div className="mb-3"><Segmented value={group} onChange={v => setGroup(v)} options={Object.entries(GROUPS).map(([k, v]) => ({ value: k as keyof typeof GROUPS, label: v.label }))} /></div>
        {err && <div className="mb-3"><Alert>{err}</Alert></div>}
        <Card data-tour="tests-table" className="overflow-hidden">
          {!rows ? <Spinner /> : !dates.length ? <Empty icon={<Timer size={20} />} title="No tests recorded">{canEdit ? 'Add a test date to start.' : ''}</Empty> : (
            <div className="scroll-thin overflow-x-auto">
              <table className="text-sm">
                <thead>
                  <tr className="border-b border-line bg-paper/70 text-xs text-muted">
                    <th rowSpan={2} className="sticky left-0 z-10 min-w-[200px] bg-paper px-3 py-2 text-left font-semibold">Player</th>
                    {dates.map(d => <th key={d} colSpan={g.metrics.length} className="border-l border-line px-2 py-1.5 text-center font-semibold">{fmtDay(d)}</th>)}
                    <th colSpan={g.metrics.length} className="border-l border-line bg-ink px-2 py-1.5 text-center font-semibold text-lime">Change</th>
                  </tr>
                  <tr className="border-b border-line bg-paper/70 text-[11px] text-muted">
                    {dates.flatMap(d => g.metrics.map(m => <th key={d + m} className="border-l border-line/60 px-2 py-1 text-center font-medium">{METRIC_LABEL[m][0].replace('Sprint ', '')} <span className="text-faint">{METRIC_LABEL[m][1]}</span></th>))}
                    {g.metrics.map(m => <th key={'c' + m} className="border-l border-line/60 px-2 py-1 text-center font-medium">{METRIC_LABEL[m][0].replace('Sprint ', '')}</th>)}
                  </tr>
                </thead>
                <tbody>{players.map(r => (
                  <tr key={r.player_id} className="border-b border-line last:border-0">
                    <td className="sticky left-0 z-10 whitespace-nowrap bg-card px-3 py-1.5 font-semibold">{pname(r.player)} <span className="text-xs font-normal text-faint">{r.position ?? ''}</span></td>
                    {dates.flatMap(d => g.metrics.map(m => {
                      const v = val(r.player_id, m, d)
                      return (
                        <td key={d + m} className="border-l border-line/60 p-0.5 text-center">
                          {canEdit
                            ? <input defaultValue={v ? String(Number(v.value)) : ''} key={v?.id ?? 'n'} onBlur={e => save(r.player_id, m, d, e.target.value)}
                                className="h-8 w-16 rounded border border-transparent bg-transparent text-center hover:border-line-2 focus:border-ink focus:outline-none focus:ring-2 focus:ring-lime/70" inputMode="decimal" />
                            : <span>{v ? Number(v.value) : ''}</span>}
                        </td>
                      )
                    }))}
                    {g.metrics.map(m => {
                      const series = (rows ?? []).filter(x => x.player_id === r.player_id && x.metric === m && x.taken_on).sort((a, b) => a.taken_on!.localeCompare(b.taken_on!))
                      if (series.length < 2) return <td key={'c' + m} className="border-l border-line/60 px-2 text-center text-faint">—</td>
                      const diff = Number(series[series.length - 1].value) - Number(series[0].value)
                      const good = g.lowerIsBetter ? diff < 0 : diff > 0
                      return (
                        <td key={'c' + m} className={cx('border-l border-line/60 px-2 text-center font-semibold', g.lowerIsBetter || m === 'height_cm' ? (good ? 'text-good' : diff === 0 ? 'text-muted' : 'text-red') : 'text-text')}>
                          <span className="inline-flex items-center gap-0.5">{diff > 0 ? <ArrowUpRight size={13} /> : diff < 0 ? <ArrowDownRight size={13} /> : null}{diff > 0 ? '+' : ''}{Math.round(diff * 100) / 100}</span>
                        </td>
                      )
                    })}
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </Card>
        <p className="mt-2 text-xs text-muted">{g.lowerIsBetter ? 'Sprint times: lower is faster. Change compares the first and the latest test.' : 'Change compares the first and the latest measurement.'}{canEdit ? ' Type in a cell and leave it to save.' : ''}</p>
      </>)}
      {adding && <Modal open title="New test date" onClose={() => setAdding(false)} footer={<Button variant="primary" onClick={() => { const el = document.getElementById('testdate') as HTMLInputElement; if (el.value) setExtraDates(d => [...d, el.value]); setAdding(false) }}>Add column</Button>}>
        <Field label="Date of the test"><Input id="testdate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} /></Field>
        <p className="mt-2 text-sm text-muted">A column for this date opens in the table. Values save as you type them.</p>
      </Modal>}
    </div>
  )
}
