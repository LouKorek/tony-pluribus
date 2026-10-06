import { useEffect, useMemo, useState } from 'react'
import { Camera, FileText, Plus, Shirt, Trash2, UserPlus } from 'lucide-react'
import { supabase, errMsg } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { TeamBar, POS_LABEL, GRADE_LABEL, pname, useRoster, useTeamSeason, useTeams, useFileLinks, type TeamPlayer } from '../../lib/teams'
import { Alert, Badge, Button, Card, Empty, Field, Modal, PageHeader, SearchInput, Select, Spinner, Stat, cx, useDebounced } from '../../components/ui'
import { PlayerDrawer } from '../scouting/Players'

interface Summary { player_id: string; sessions: number; attended: number; minutes: number; matches: number; goals: number; assists: number; yellow: number; red: number
  sprint_10m: number | null; sprint_20m: number | null; weight_kg: number | null; height_cm: number | null; grade: string | null }

export default function SquadsPage() {
  const { can, inTeam } = useAuth()
  const { season, setSeason, seasons } = useTeamSeason()
  const { teams, team, pick } = useTeams(season?.id)
  const { roster, reload } = useRoster(team?.id)
  const [sum, setSum] = useState<Record<string, Summary>>({})
  const [open, setOpen] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<TeamPlayer | null>(null)
  const [q, setQ] = useState('')
  const canEdit = can('squads', 2) && inTeam(team?.id)
  const photos = useFileLinks(roster?.map(r => r.player.photo_file_id) ?? [])

  useEffect(() => {
    if (!team) return
    setSum({})
    supabase.rpc('team_summary', { p_team: team.id }).then(({ data }) => setSum(Object.fromEntries(((data as Summary[]) ?? []).map(s => [s.player_id, s]))))
  }, [team, roster])

  const list = useMemo(() => (roster ?? []).filter(r => !q || pname(r.player).toLowerCase().includes(q.toLowerCase())), [roster, q])
  const active = (roster ?? []).filter(r => r.status !== 'left')
  const totals = useMemo(() => {
    const s = Object.values(sum)
    const att = s.reduce((a, x) => a + x.attended, 0), ses = s.reduce((a, x) => a + x.sessions, 0)
    return { goals: s.reduce((a, x) => a + x.goals, 0), att: ses ? Math.round((att / ses) * 100) : 0, sessions: s[0]?.sessions ?? 0 }
  }, [sum])

  return (
    <div>
      <PageHeader eyebrow="Teams" title="Squads" description="The Tony teams of each season: who is in the squad, how often they train and play, their latest tests and evaluation." />
      <TeamBar seasonId={season?.id} onSeason={setSeason} seasons={seasons} teams={teams} teamId={team?.id} onTeam={pick}
        extra={canEdit && team ? <Button variant="primary" onClick={() => setAdding(true)}><UserPlus size={16} /> Add players</Button> : undefined} />

      {!team ? (teams ? <Card><Empty icon={<Shirt size={20} />} title="No team this season">Teams appear once a season's squad is set up.</Empty></Card> : <Spinner />) : (<>
        <div data-tour="squad-stats" className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat accent label="Players" value={active.length} sub={`${(roster ?? []).length - active.length} left the squad`} />
          <Stat label="Training sessions" value={totals.sessions} sub="this season" />
          <Stat label="Attendance" value={`${totals.att}%`} sub="of training sessions" />
          <Stat label="Goals" value={totals.goals} sub="in recorded matches" />
        </div>
        <div className="mb-3 flex items-center justify-between gap-2">
          <SearchInput className="sm:w-72" value={q} onChange={setQ} placeholder="Find a player" />
        </div>
        <Card data-tour="squad-table" className="overflow-hidden">
          {!roster ? <Spinner /> : list.length === 0 ? <Empty icon={<Shirt size={20} />} title="No players yet">{canEdit ? 'Add the players of this squad.' : ''}</Empty> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1040px] text-sm">
                <thead><tr className="border-b border-line bg-paper/70 text-left text-xs text-muted">
                  {['Player', 'Pos.', 'Born', 'Attendance', 'Minutes', 'Matches', 'Goals', 'Assists', 'Cards', '10 m', '20 m', 'Weight', 'Height', 'Eval.', ''].map((h, i) => <th key={i} className={cx('whitespace-nowrap px-3 py-2.5 font-semibold', i > 2 && i < 14 && 'text-right')}>{h}</th>)}
                </tr></thead>
                <tbody>{list.map(r => {
                  const s = sum[r.player_id]
                  const pct = s && s.sessions ? Math.round((s.attended / s.sessions) * 100) : null
                  return (
                    <tr key={r.id} className={cx('border-b border-line last:border-0 hover:bg-paper/60', r.status === 'left' && 'text-muted')}>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <button onClick={() => setOpen(r.player_id)} className="whitespace-nowrap text-left font-semibold hover:text-red">{pname(r.player)}</button>
                          {r.player.photo_file_id && photos[r.player.photo_file_id] && <a href={photos[r.player.photo_file_id].url} target="_blank" rel="noreferrer" title="Photo in SharePoint" className="text-faint hover:text-text"><Camera size={13} /></a>}
                          {r.status !== 'active' && <Badge tone={r.status === 'injured' ? 'bad' : 'neutral'}>{r.status}</Badge>}
                        </div>
                      </td>
                      <td className="px-3 py-2" title={POS_LABEL[r.position ?? ''] ?? ''}>{r.position ?? '—'}</td>
                      <td className="px-3 py-2">{r.player.birth_year ?? '—'}</td>
                      <td className="px-3 py-2 text-right">
                        {pct === null ? '—' : <span className="inline-flex items-center gap-2"><span className="h-1.5 w-14 rounded-full bg-black/5"><span className={cx('block h-1.5 rounded-full', pct >= 80 ? 'bg-good' : pct >= 60 ? 'bg-warn' : 'bg-red')} style={{ width: `${pct}%` }} /></span>{pct}%</span>}
                      </td>
                      <td className="px-3 py-2 text-right">{s?.minutes ? s.minutes.toLocaleString() : '—'}</td>
                      <td className="px-3 py-2 text-right">{s?.matches || '—'}</td>
                      <td className="px-3 py-2 text-right font-semibold">{s?.goals || '—'}</td>
                      <td className="px-3 py-2 text-right">{s?.assists || '—'}</td>
                      <td className="px-3 py-2 text-right">{s && (s.yellow || s.red) ? <span className="inline-flex gap-1">{s.yellow > 0 && <span className="rounded-sm bg-warn px-1 text-[11px] font-bold text-white">{s.yellow}</span>}{s.red > 0 && <span className="rounded-sm bg-red px-1 text-[11px] font-bold text-white">{s.red}</span>}</span> : '—'}</td>
                      <td className="px-3 py-2 text-right">{s?.sprint_10m ? Number(s.sprint_10m).toFixed(2) : '—'}</td>
                      <td className="px-3 py-2 text-right">{s?.sprint_20m ? Number(s.sprint_20m).toFixed(2) : '—'}</td>
                      <td className="px-3 py-2 text-right">{s?.weight_kg ? `${Number(s.weight_kg)} kg` : '—'}</td>
                      <td className="px-3 py-2 text-right">{s?.height_cm ? `${Number(s.height_cm)} cm` : '—'}</td>
                      <td className="px-3 py-2 text-right">{s?.grade ? <span title={GRADE_LABEL[s.grade][0]} className={cx('inline-flex h-6 w-6 items-center justify-center rounded-md text-xs font-bold', GRADE_LABEL[s.grade][1])}>{s.grade}</span> : '—'}</td>
                      <td className="px-2 py-2 text-right">{canEdit && <Button size="sm" variant="ghost" onClick={() => setEditing(r)}>Edit</Button>}</td>
                    </tr>
                  )
                })}</tbody>
              </table>
            </div>
          )}
        </Card>
        {team.folder && <TeamFolderLink folder={team.folder} />}
      </>)}

      {open && <PlayerDrawer playerId={open} onClose={() => setOpen(null)} onSaved={reload} onOpenOther={setOpen} />}
      {adding && team && <AddPlayersModal teamId={team.id} existing={(roster ?? []).map(r => r.player_id)} onClose={() => setAdding(false)} onDone={() => { setAdding(false); reload() }} />}
      {editing && <EditMemberModal member={editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); reload() }} />}
    </div>
  )
}

function TeamFolderLink({ folder }: { folder: string }) {
  const { project } = useAuth()
  return (
    <a href={encodeURI(`${project?.sharepoint_root}/${folder}`)} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-red hover:underline">
      <FileText size={14} /> Team folder in SharePoint
    </a>
  )
}

function AddPlayersModal({ teamId, existing, onClose, onDone }: { teamId: string; existing: string[]; onClose: () => void; onDone: () => void }) {
  const [q, setQ] = useState('')
  const dq = useDebounced(q, 250)
  const [found, setFound] = useState<{ id: string; first_name: string; last_name: string; birth_year: number | null; pool_status: string }[]>([])
  const [picked, setPicked] = useState<Record<string, { id: string; label: string; pos: string }>>({})
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    if (dq.trim().length < 2) { setFound([]); return }
    const t = dq.trim().replace(/[%_,()]/g, '')
    supabase.from('players').select('id, first_name, last_name, birth_year, pool_status').is('merged_into', null)
      .or(`first_name.ilike.%${t}%,last_name.ilike.%${t}%`).order('pool_status').limit(30)
      .then(({ data }) => setFound(((data as typeof found) ?? []).filter(p => !existing.includes(p.id))))
  }, [dq, existing])
  const n = Object.keys(picked).length
  async function save() {
    setBusy(true); setErr(null)
    const { error } = await supabase.from('team_players').insert(Object.values(picked).map(p => ({ team_id: teamId, player_id: p.id, position: p.pos || null, joined_on: new Date().toISOString().slice(0, 10) })))
    if (!error) await supabase.from('players').update({ pool_status: 'tony_squad' }).in('id', Object.keys(picked))
    setBusy(false)
    if (error) return setErr(errMsg(error))
    onDone()
  }
  return (
    <Modal open wide title="Add players to the squad" onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} disabled={!n} onClick={save}><Plus size={15} /> Add {n || ''} player{n === 1 ? '' : 's'}</Button></>}>
      <SearchInput value={q} onChange={setQ} placeholder="Search players by name (at least 2 letters)" />
      <p className="mt-1.5 text-xs text-muted">Tick as many as you need. Players selected at the national final are usually the ones to add.</p>
      <div className="mt-3 max-h-72 overflow-y-auto rounded-lg border border-line">
        {found.length === 0 ? <p className="px-3 py-6 text-center text-sm text-muted">{q.trim().length < 2 ? 'Type a name to search.' : 'No player found.'}</p> : found.map(p => (
          <label key={p.id} className="flex cursor-pointer items-center gap-3 border-b border-line px-3 py-2 last:border-0 hover:bg-paper">
            <input type="checkbox" className="h-4 w-4 accent-red" checked={!!picked[p.id]}
              onChange={e => setPicked(s => { const c = { ...s }; if (e.target.checked) c[p.id] = { id: p.id, label: pname(p), pos: '' }; else delete c[p.id]; return c })} />
            <span className="flex-1 font-medium">{pname(p)}</span>
            <span className="text-sm text-muted">{p.birth_year ?? '—'}</span>
            <Badge tone={p.pool_status === 'selected' ? 'good' : 'neutral'}>{p.pool_status.replace('_', ' ')}</Badge>
          </label>
        ))}
      </div>
      {n > 0 && (
        <div className="mt-4 space-y-2">
          <div className="label-caps text-muted">Positions</div>
          {Object.values(picked).map(p => (
            <div key={p.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="font-medium">{p.label}</span>
              <Select className="w-44" value={p.pos} onChange={e => setPicked(s => ({ ...s, [p.id]: { ...p, pos: e.target.value } }))}>
                <option value="">Position</option>{Object.entries(POS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </div>
          ))}
        </div>
      )}
      {err && <div className="mt-3"><Alert>{err}</Alert></div>}
    </Modal>
  )
}

function EditMemberModal({ member, onClose, onDone }: { member: TeamPlayer; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ position: member.position ?? '', shirt: member.shirt?.toString() ?? '', status: member.status, notes: member.notes ?? '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [confirm, setConfirm] = useState(false)
  async function save() {
    setBusy(true)
    const { error } = await supabase.from('team_players').update({ position: f.position || null, shirt: f.shirt ? Number(f.shirt) : null, status: f.status, notes: f.notes || null,
      ...(f.status === 'left' && member.status !== 'left' ? { left_on: new Date().toISOString().slice(0, 10) } : {}) }).eq('id', member.id)
    setBusy(false)
    if (error) return setErr(errMsg(error))
    onDone()
  }
  async function remove() {
    const { error } = await supabase.from('team_players').delete().eq('id', member.id)
    if (error) return setErr(errMsg(error))
    onDone()
  }
  return (
    <Modal open title={pname(member.player)} onClose={onClose}
      footer={<div className="flex w-full items-center justify-between">
        {confirm ? <Button variant="danger" size="sm" onClick={remove}>Remove from this squad?</Button> : <Button variant="ghost" size="sm" onClick={() => setConfirm(true)}><Trash2 size={14} /> Remove</Button>}
        <div className="flex gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>Save</Button></div>
      </div>}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Position"><Select value={f.position} onChange={e => setF({ ...f, position: e.target.value })}><option value="">—</option>{Object.entries(POS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
          <Field label="Shirt number"><input type="number" min={1} max={99} value={f.shirt} onChange={e => setF({ ...f, shirt: e.target.value })} className="h-10 w-full rounded-lg border border-line-2 px-3" /></Field>
        </div>
        <Field label="Status"><Select value={f.status} onChange={e => setF({ ...f, status: e.target.value as TeamPlayer['status'] })}>
          <option value="active">Active</option><option value="injured">Injured</option><option value="loan">On loan / trial</option><option value="left">Left the squad</option>
        </Select></Field>
        <Field label="Notes"><textarea rows={3} value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} className="w-full rounded-lg border border-line-2 px-3 py-2" /></Field>
        {err && <Alert>{err}</Alert>}
      </div>
    </Modal>
  )
}
