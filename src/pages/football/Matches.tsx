import { useCallback, useEffect, useMemo, useState } from 'react'
import { FileText, Plus, Swords } from 'lucide-react'
import { supabase, errMsg } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { TeamBar, pname, useFileLinks, useRoster, useTeamSeason, useTeams, type Match, type MatchPlayer, type TeamPlayer } from '../../lib/teams'
import { Alert, Button, Card, Empty, Field, Input, Modal, MultiSelect, PageHeader, Select, Spinner, Stat, Textarea, cx } from '../../components/ui'

const result = (m: Match) => m.goals_for == null || m.goals_against == null ? null : m.goals_for > m.goals_against ? 'W' : m.goals_for < m.goals_against ? 'L' : 'D'
const COMPETITIONS = ['Friendly', 'League', 'TDS', '2nd Division', '3rd Division', 'U17 League', 'U20 League', 'Tournament', 'Cup']

export default function MatchesPage() {
  const { can, inTeam } = useAuth()
  const { season, setSeason, seasons } = useTeamSeason()
  const { teams, team, pick } = useTeams(season?.id)
  const { roster } = useRoster(team?.id)
  const [matches, setMatches] = useState<Match[] | null>(null)
  const [scorers, setScorers] = useState<Record<string, string>>({})
  const [comp, setComp] = useState<string[]>([])
  const [open, setOpen] = useState<Match | 'new' | null>(null)
  const canEdit = can('matches', 2) && inTeam(team?.id)
  const files = useFileLinks(matches?.map(m => m.report_file_id) ?? [])

  const load = useCallback(async () => {
    if (!team) return
    const { data } = await supabase.from('matches').select('*').eq('team_id', team.id).order('played_on', { ascending: false, nullsFirst: false }).order('number', { ascending: false })
    const list = (data as Match[]) ?? []
    setMatches(list)
    if (list.length) {
      const { data: mp } = await supabase.from('match_players').select('match_id, goals, player:players(first_name, last_name)').in('match_id', list.map(m => m.id)).gt('goals', 0)
      const by: Record<string, string[]> = {}
      for (const r of (mp as unknown as { match_id: string; goals: number; player: { first_name: string; last_name: string } }[]) ?? []) (by[r.match_id] = by[r.match_id] ?? []).push(`${r.player.last_name !== '—' ? r.player.last_name : r.player.first_name}${r.goals > 1 ? ` ×${r.goals}` : ''}`)
      setScorers(Object.fromEntries(Object.entries(by).map(([k, v]) => [k, v.join(', ')])))
    }
  }, [team])
  useEffect(() => { setMatches(null); load() }, [load])

  const shown = (matches ?? []).filter(m => !comp.length || comp.includes(m.competition))
  const rec = useMemo(() => {
    const r = { p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 }
    for (const m of shown) { const x = result(m); if (!x) continue; r.p++; if (x === 'W') r.w++; else if (x === 'D') r.d++; else r.l++; r.gf += m.goals_for ?? 0; r.ga += m.goals_against ?? 0 }
    return r
  }, [shown])
  const comps = [...new Set((matches ?? []).map(m => m.competition))]

  return (
    <div>
      <PageHeader eyebrow="Teams" title="Matches" description="Results, scorers and cards of every match, with the match report from the Talent folder." />
      <TeamBar seasonId={season?.id} onSeason={setSeason} seasons={seasons} teams={teams} teamId={team?.id} onTeam={pick}
        extra={<>
          {comps.length > 1 && <MultiSelect className="w-52" placeholder="All competitions" value={comp} onChange={setComp} options={comps.map(c => ({ value: c, label: c }))} />}
          {canEdit && team && <Button variant="primary" onClick={() => setOpen('new')}><Plus size={16} /> New match</Button>}
        </>} />
      {!team ? (teams ? <Card><Empty icon={<Swords size={20} />} title="No team this season" /></Card> : <Spinner />) : (<>
        <div data-tour="match-record" className="mb-5 grid grid-cols-3 gap-3 lg:grid-cols-6">
          <Stat accent label="Played" value={rec.p} />
          <Stat label="Won" value={rec.w} /><Stat label="Drawn" value={rec.d} /><Stat label="Lost" value={rec.l} />
          <Stat label="Goals for" value={rec.gf} /><Stat label="Goals against" value={rec.ga} />
        </div>
        <Card data-tour="match-list" className="overflow-hidden">
          {!matches ? <Spinner /> : !shown.length ? <Empty icon={<Swords size={20} />} title="No matches recorded">{canEdit ? 'Add the first match.' : ''}</Empty> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead><tr className="border-b border-line bg-paper/70 text-left text-xs text-muted">
                  {['Date', 'Competition', 'Opponent', '', 'Score', 'Scorers', 'Report'].map((h, i) => <th key={i} className="px-3 py-2.5 font-semibold">{h}</th>)}
                </tr></thead>
                <tbody>{shown.map(m => {
                  const r = result(m)
                  return (
                    <tr key={m.id} onClick={() => setOpen(m)} className="cursor-pointer border-b border-line last:border-0 hover:bg-paper/60">
                      <td className="whitespace-nowrap px-3 py-2">{m.played_on ? new Date(m.played_on + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : <span className="text-faint">{m.number ? `Match ${m.number}` : '—'}</span>}</td>
                      <td className="px-3 py-2 text-muted">{m.competition}</td>
                      <td className="px-3 py-2 font-semibold">{m.opponent}</td>
                      <td className="px-3 py-2 text-xs text-muted">{m.venue === 'home' ? 'Home' : m.venue === 'away' ? 'Away' : ''}</td>
                      <td className="px-3 py-2">{r ? <span className={cx('inline-flex min-w-[52px] justify-center rounded-md px-2 py-0.5 font-display text-base font-bold', r === 'W' ? 'bg-good text-white' : r === 'L' ? 'bg-red text-white' : 'bg-black/10')}>{m.goals_for}–{m.goals_against}</span> : '—'}</td>
                      <td className="max-w-[280px] truncate px-3 py-2 text-muted">{scorers[m.id] ?? ''}</td>
                      <td className="px-3 py-2">{m.report_file_id && files[m.report_file_id] ? <a onClick={e => e.stopPropagation()} href={files[m.report_file_id].url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-red hover:underline"><FileText size={13} /> PDF</a> : ''}</td>
                    </tr>
                  )
                })}</tbody>
              </table>
            </div>
          )}
        </Card>
      </>)}
      {open && team && <MatchModal teamId={team.id} match={open === 'new' ? null : open} roster={roster ?? []} canEdit={canEdit} onClose={() => setOpen(null)} onDone={() => { setOpen(null); load() }} />}
    </div>
  )
}

function MatchModal({ teamId, match, roster, canEdit, onClose, onDone }: { teamId: string; match: Match | null; roster: TeamPlayer[]; canEdit: boolean; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ played_on: match?.played_on ?? new Date().toISOString().slice(0, 10), competition: match?.competition ?? 'Friendly', opponent: match?.opponent ?? '', venue: match?.venue ?? 'home', gf: match?.goals_for?.toString() ?? '', ga: match?.goals_against?.toString() ?? '', notes: match?.notes ?? '' })
  const [stats, setStats] = useState<Record<string, MatchPlayer>>({})
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    if (!match) return
    supabase.from('match_players').select('*').eq('match_id', match.id).then(({ data }) => setStats(Object.fromEntries(((data as MatchPlayer[]) ?? []).map(s => [s.player_id, s]))))
  }, [match])
  const inSquad = Object.keys(stats)
  const setSquad = (ids: string[]) => setStats(s => Object.fromEntries(ids.map(id => [id, s[id] ?? { match_id: match?.id ?? '', player_id: id, minutes: null, goals: 0, assists: 0, yellow: 0, red: 0, started: null }])))
  const upd = (pid: string, k: keyof MatchPlayer, v: number | boolean | null) => setStats(s => ({ ...s, [pid]: { ...s[pid], [k]: v } }))
  const players = [...roster.filter(r => r.status !== 'left'), ...roster.filter(r => r.status === 'left' && stats[r.player_id])]
  const name = (pid: string) => { const r = roster.find(x => x.player_id === pid); return r ? pname(r.player) : 'Player' }

  async function save() {
    if (!f.opponent.trim()) return setErr('Who was the opponent?')
    setBusy(true); setErr(null)
    const row = { team_id: teamId, played_on: f.played_on || null, competition: f.competition, opponent: f.opponent.trim(), venue: f.venue || null, goals_for: f.gf === '' ? null : Number(f.gf), goals_against: f.ga === '' ? null : Number(f.ga), notes: f.notes || null }
    const res = match ? await supabase.from('matches').update(row).eq('id', match.id).select('id').single() : await supabase.from('matches').insert(row).select('id').single()
    if (res.error) { setBusy(false); return setErr(errMsg(res.error)) }
    const id = (res.data as { id: string }).id
    await supabase.from('match_players').delete().eq('match_id', id).not('player_id', 'in', `(${inSquad.length ? inSquad.join(',') : '00000000-0000-0000-0000-000000000000'})`)
    if (inSquad.length) {
      const { error } = await supabase.from('match_players').upsert(Object.values(stats).map(s => ({ match_id: id, player_id: s.player_id, minutes: s.minutes, goals: s.goals || 0, assists: s.assists || 0, yellow: s.yellow || 0, red: s.red || 0, started: s.started })))
      if (error) { setBusy(false); return setErr(errMsg(error)) }
    }
    setBusy(false); onDone()
  }
  async function remove() { if (!match) return; const { error } = await supabase.from('matches').delete().eq('id', match.id); if (error) setErr(errMsg(error)); else onDone() }

  return (
    <Modal open wide title={match ? `${match.opponent}` : 'New match'} onClose={onClose}
      footer={canEdit ? <div className="flex w-full justify-between">{match ? <Button variant="ghost" size="sm" onClick={remove}>Delete match</Button> : <span />}<div className="flex gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>Save</Button></div></div> : undefined}>
      <fieldset disabled={!canEdit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Date"><Input type="date" value={f.played_on} onChange={e => setF({ ...f, played_on: e.target.value })} /></Field>
          <Field label="Competition"><Select value={f.competition} onChange={e => setF({ ...f, competition: e.target.value })}>{[...new Set([f.competition, ...COMPETITIONS])].map(c => <option key={c}>{c}</option>)}</Select></Field>
          <div className="sm:col-span-2"><Field label="Opponent"><Input value={f.opponent} onChange={e => setF({ ...f, opponent: e.target.value })} /></Field></div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Venue"><Select value={f.venue} onChange={e => setF({ ...f, venue: e.target.value as 'home' })}><option value="home">Home</option><option value="away">Away</option><option value="neutral">Neutral</option></Select></Field>
          <Field label="Goals for"><Input type="number" min={0} value={f.gf} onChange={e => setF({ ...f, gf: e.target.value })} /></Field>
          <Field label="Goals against"><Input type="number" min={0} value={f.ga} onChange={e => setF({ ...f, ga: e.target.value })} /></Field>
        </div>
        <Field label="Players in the match"><MultiSelect placeholder="Choose players" value={inSquad} onChange={setSquad} options={players.map(r => ({ value: r.player_id, label: pname(r.player) }))} searchable /></Field>
        {inSquad.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full text-sm">
              <thead><tr className="bg-paper text-xs text-muted">{['Player', 'Started', 'Min.', 'Goals', 'Assists', 'Yellow', 'Red'].map(h => <th key={h} className="px-2 py-1.5 text-left font-semibold">{h}</th>)}</tr></thead>
              <tbody>{inSquad.map(pid => (
                <tr key={pid} className="border-t border-line">
                  <td className="whitespace-nowrap px-2 py-1 font-medium">{name(pid)}</td>
                  <td className="px-2 py-1"><input type="checkbox" className="h-4 w-4 accent-red" checked={!!stats[pid].started} onChange={e => upd(pid, 'started', e.target.checked)} /></td>
                  {(['minutes', 'goals', 'assists', 'yellow', 'red'] as const).map(k => (
                    <td key={k} className="px-1 py-1"><input type="number" min={0} value={stats[pid][k] ?? ''} onChange={e => upd(pid, k, e.target.value === '' ? (k === 'minutes' ? null : 0) : Number(e.target.value))} className="h-8 w-14 rounded border border-line-2 px-1.5 text-center" /></td>
                  ))}
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        <Field label="Notes"><Textarea rows={3} value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} /></Field>
        {err && <Alert>{err}</Alert>}
      </fieldset>
    </Modal>
  )
}
