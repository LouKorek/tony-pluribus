import { useCallback, useEffect, useMemo, useState } from 'react'
import { FileText, Star } from 'lucide-react'
import { supabase, errMsg } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { GRADE_LABEL, pname, useFileLinks, useTeamSeason, type Evaluation } from '../../lib/teams'
import { Alert, Card, Empty, MultiSelect, PageHeader, Select, Spinner, Textarea, cx } from '../../components/ui'

interface Row { player_id: string; first_name: string; last_name: string; birth_year: number | null; teams: string[]; ev: Evaluation | null }
const GRADES = ['A', 'B', 'C', 'D'] as const

export default function EvaluationsPage() {
  const { can } = useAuth()
  const { season, setSeason, seasons } = useTeamSeason()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [years, setYears] = useState<string[]>([])
  const [teamsF, setTeamsF] = useState<string[]>([])
  const [err, setErr] = useState<string | null>(null)
  const canEdit = can('evaluations', 2)
  const files = useFileLinks(rows?.map(r => r.ev?.report_file_id) ?? [])

  const load = useCallback(async () => {
    if (!season) return
    const [{ data: tp }, { data: ev }] = await Promise.all([
      supabase.from('team_players').select('player_id, team:teams!inner(name, season_id), player:players(first_name, last_name, birth_year)').eq('team.season_id', season.id),
      supabase.from('evaluations').select('*, player:players(first_name, last_name, birth_year)').eq('season_id', season.id),
    ])
    const by = new Map<string, Row>()
    for (const r of (tp as unknown as { player_id: string; team: { name: string }; player: { first_name: string; last_name: string; birth_year: number | null } }[]) ?? []) {
      const x = by.get(r.player_id) ?? { player_id: r.player_id, ...r.player, teams: [], ev: null }
      x.teams.push(r.team.name); by.set(r.player_id, x)
    }
    for (const e of (ev as unknown as (Evaluation & { player: { first_name: string; last_name: string; birth_year: number | null } })[]) ?? []) {
      const x = by.get(e.player_id) ?? { player_id: e.player_id, ...e.player, teams: [], ev: null }
      x.ev = e; by.set(e.player_id, x)
    }
    setRows([...by.values()].sort((a, b) => (a.birth_year ?? 0) - (b.birth_year ?? 0) || pname(a).localeCompare(pname(b))))
  }, [season])
  useEffect(() => { setRows(null); load() }, [load])

  async function setGrade(r: Row, patch: Partial<Evaluation>) {
    setErr(null)
    const { error } = r.ev
      ? await supabase.from('evaluations').update(patch).eq('id', r.ev.id)
      : await supabase.from('evaluations').insert({ player_id: r.player_id, season_id: season!.id, ...patch })
    if (error) return setErr(errMsg(error))
    load()
  }

  const allYears = [...new Set((rows ?? []).map(r => String(r.birth_year ?? '')))].filter(Boolean).sort()
  const allTeams = [...new Set((rows ?? []).flatMap(r => r.teams))].sort()
  const shown = useMemo(() => (rows ?? []).filter(r => (!years.length || years.includes(String(r.birth_year))) && (!teamsF.length || r.teams.some(t => teamsF.includes(t)))), [rows, years, teamsF])

  return (
    <div>
      <PageHeader eyebrow="Teams" title="Evaluations" description="The season evaluation of every Tony player: potential against performance (A–D), with the individual reports." />
      <div className="mb-5 flex flex-col gap-2 lg:flex-row lg:items-center">
        <Select className="lg:w-52" value={season?.id ?? ''} onChange={e => setSeason(e.target.value)}>{[...seasons].reverse().map(s => <option key={s.id} value={s.id}>Season {s.label}</option>)}</Select>
        <MultiSelect className="lg:w-52" placeholder="All teams" value={teamsF} onChange={setTeamsF} options={allTeams.map(t => ({ value: t, label: t }))} />
        <MultiSelect className="lg:w-52" placeholder="All birth years" value={years} onChange={setYears} options={allYears.map(y => ({ value: y, label: `Born ${y}` }))} />
      </div>
      {err && <div className="mb-3"><Alert>{err}</Alert></div>}
      {!rows ? <Spinner /> : !rows.length ? <Card><Empty icon={<Star size={20} />} title="No players this season" /></Card> : (<>
        <div data-tour="eval-matrix" className="mb-6 grid gap-3 sm:grid-cols-2">
          {(['B', 'A', 'D', 'C'] as const).map(g => {
            const list = shown.filter(r => r.ev?.grade === g)
            return (
              <Card key={g} className="p-4">
                <div className="flex items-center gap-3">
                  <span className={cx('flex h-9 w-9 items-center justify-center rounded-lg font-display text-xl font-bold', GRADE_LABEL[g][1])}>{g}</span>
                  <div><div className="font-semibold">{GRADE_LABEL[g][0]}</div><div className="text-xs text-muted">{list.length} player{list.length === 1 ? '' : 's'}</div></div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">{list.map(r => <span key={r.player_id} className="rounded-md bg-paper px-2 py-0.5 text-xs font-medium">{pname(r)} <span className="text-faint">{r.birth_year}</span></span>)}</div>
              </Card>
            )
          })}
        </div>
        <Card data-tour="eval-table" className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead><tr className="border-b border-line bg-paper/70 text-left text-xs text-muted">{['Player', 'Born', 'Team', 'Grade', 'Summary', 'Report'].map(h => <th key={h} className="px-3 py-2.5 font-semibold">{h}</th>)}</tr></thead>
              <tbody>{shown.map(r => (
                <tr key={r.player_id} className="border-b border-line align-top last:border-0">
                  <td className="whitespace-nowrap px-3 py-2 font-semibold">{pname(r)}</td>
                  <td className="px-3 py-2">{r.birth_year ?? '—'}</td>
                  <td className="px-3 py-2 text-muted">{r.teams.join(', ') || '—'}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">{GRADES.map(g => (
                      <button key={g} disabled={!canEdit} onClick={() => setGrade(r, { grade: r.ev?.grade === g ? null : g })} title={GRADE_LABEL[g][0]}
                        className={cx('h-7 w-7 rounded-md text-xs font-bold', r.ev?.grade === g ? GRADE_LABEL[g][1] : 'border border-line-2 text-muted hover:text-text disabled:hover:text-muted')}>{g}</button>
                    ))}</div>
                  </td>
                  <td className="min-w-[260px] px-3 py-2">
                    {canEdit ? <Textarea rows={1} defaultValue={r.ev?.summary ?? ''} key={r.ev?.id ?? r.player_id} onBlur={e => { if ((e.target.value || null) !== (r.ev?.summary ?? null)) setGrade(r, { summary: e.target.value || null }) }} placeholder="Strengths, what to work on" className="min-h-9 text-sm" />
                      : <span className="text-muted">{r.ev?.summary ?? ''}</span>}
                  </td>
                  <td className="px-3 py-2">{r.ev?.report_file_id && files[r.ev.report_file_id] ? <a href={files[r.ev.report_file_id].url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-red hover:underline"><FileText size={13} /> PDF</a> : ''}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </Card>
      </>)}
    </div>
  )
}
