import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowUpRight, Check, Megaphone, Pencil, Plus, Trash2, UserPlus, Users2 } from 'lucide-react'
import { supabase, errMsg } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import {
  useRefData, STAGE_LABEL, PSTATUS_LABEL, DECISION_LABEL, OBS, POSITIONS, fmtRange, fullName, ageGroupFor,
  type Camp, type Decision, type Participant, type Player, type PStatus, type Stage,
} from '../../lib/scouting'
import { Alert, Badge, Button, Card, Empty, Field, Input, Modal, SearchInput, Segmented, Select, Spinner, Th, cx, useDebounced } from '../../components/ui'
import { CampFormModal } from './campForm'
import { STATUS_LABEL, stageTone, statusTone } from './Camps'
import { PlayerDrawer } from './Players'

type Row = Participant & { player: Player }
const NEXT: Partial<Record<Stage, Stage>> = { district: 'province_final', province_final: 'national_final' }

export default function CampSheet() {
  const { id } = useParams()
  const nav = useNavigate()
  const { can } = useAuth()
  const ref = useRefData()
  const [camp, setCamp] = useState<Camp | null>(null)
  const [rows, setRows] = useState<Row[] | null>(null)
  const [group, setGroup] = useState('all')
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState(false)
  const [adding, setAdding] = useState(false)
  const [promoting, setPromoting] = useState(false)
  const [openPlayer, setOpenPlayer] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const canEdit = can('camps', 2)

  const load = useCallback(async () => {
    const [{ data: c }, { data: p }] = await Promise.all([
      supabase.from('camps').select('*').eq('id', id).maybeSingle(),
      supabase.from('camp_participants').select('*, player:players(*)').eq('camp_id', id).order('created_at'),
    ])
    setCamp(c as Camp | null); setRows((p as Row[]) ?? [])
  }, [id])
  useEffect(() => { load() }, [load])

  async function patch(rowId: string, changes: Partial<Participant>) {
    setErr(null)
    setRows(rs => rs?.map(r => (r.id === rowId ? { ...r, ...changes } : r)) ?? null)
    const { error } = await supabase.from('camp_participants').update(changes).eq('id', rowId)
    if (error) { setErr(errMsg(error)); load() }
  }
  async function remove(rowId: string) {
    const { error } = await supabase.from('camp_participants').delete().eq('id', rowId)
    if (error) return setErr(errMsg(error))
    setRows(rs => rs?.filter(r => r.id !== rowId) ?? null); setConfirmDelete(null)
  }
  async function publish() {
    if (!camp) return
    setErr(null)
    const { error } = await supabase.from('camp_participants').update({ decision_published: true }).eq('camp_id', camp.id).not('decision', 'is', null)
    if (error) return setErr(errMsg(error))
    await supabase.from('camps').update({ status: 'published' }).eq('id', camp.id)
    load()
  }

  const groups = camp?.age_groups ?? []
  const shown = (rows ?? [])
    .filter(r => group === 'all' || (r.age_group ?? 'Other') === group)
    .filter(r => !q || `${fullName(r.player)} ${ref.academy(r.player.academy_id)?.name ?? ''}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (a.age_group ?? 'Z').localeCompare(b.age_group ?? 'Z') || (ref.academy(a.player.academy_id)?.name ?? '').localeCompare(ref.academy(b.player.academy_id)?.name ?? '') || a.player.last_name.localeCompare(b.player.last_name))

  const st = useMemo(() => {
    const r = rows ?? []
    return {
      total: r.length,
      attended: r.filter(x => x.status === 'attended' || x.obs || x.decision).length,
      absent: r.filter(x => x.status === 'absent' || x.status === 'declined').length,
      selected: r.filter(x => x.decision === 'selected').length,
      see_again: r.filter(x => x.decision === 'see_again').length,
      graded: r.filter(x => x.obs).length,
    }
  }, [rows])

  if (camp === null && rows) return <Empty icon={<Users2 size={20} />} title="Camp not found"><Link to="/scouting/camps" className="font-semibold text-red">Back to camps</Link></Empty>
  if (!camp || !rows) return <Spinner />

  const where = camp.stage === 'district' ? `${ref.district(camp.district_id)?.name} · ${ref.regionOf(camp.district_id)?.name}` : camp.stage === 'province_final' ? ref.regions.find(r => r.id === camp.region_id)?.name : 'Rwanda'
  const unpublished = rows.filter(r => r.decision && !r.decision_published).length

  return (
    <div>
      <button onClick={() => nav(-1)} className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-text"><ArrowLeft size={15} /> Back</button>
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={stageTone(camp.stage)}>{STAGE_LABEL[camp.stage]}</Badge>
            <Badge tone={statusTone(camp.status)}>{STATUS_LABEL[camp.status]}</Badge>
            {camp.submissions_open && <Badge tone="info">Open to coaches</Badge>}
          </div>
          <h1 className="mt-2 font-display text-3xl font-bold uppercase leading-none tracking-tight sm:text-[34px]">{camp.name}</h1>
          <p className="mt-2 text-[15px] text-muted">{fmtRange(camp.starts_on, camp.ends_on)} · {where}{camp.venue ? ` · ${camp.venue}` : ''}{camp.staff ? ` · Staff: ${camp.staff}` : ''}</p>
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setEditing(true)}><Pencil size={15} /> Edit camp</Button>
            {NEXT[camp.stage] && <Button data-tour="promote" onClick={() => setPromoting(true)} disabled={!st.selected}><ArrowUpRight size={15} /> Invite to {STAGE_LABEL[NEXT[camp.stage]!].toLowerCase()}</Button>}
            <Button data-tour="publish" variant="dark" onClick={publish} disabled={!unpublished}><Megaphone size={15} /> Publish results{unpublished ? ` (${unpublished})` : ''}</Button>
            <Button data-tour="add-player" variant="primary" onClick={() => setAdding(true)}><UserPlus size={15} /> Add player</Button>
          </div>
        )}
      </div>

      <div className="mb-5 grid grid-cols-3 gap-2 sm:grid-cols-6" data-tour="camp-stats">
        {[['Players', st.total], ['Attended', st.attended], ['Absent', st.absent], ['Graded', st.graded], ['Selected', st.selected], ['See again', st.see_again]].map(([l, v], i) => (
          <Card key={l as string} className={cx('px-3 py-2.5', i === 4 && 'border-ink bg-ink text-white')}>
            <div className={cx('text-[11px] font-semibold uppercase tracking-wide', i === 4 ? 'text-lime' : 'text-muted')}>{l}</div>
            <div className="font-display text-2xl font-bold">{v}</div>
          </Card>
        ))}
      </div>

      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Segmented value={group} onChange={setGroup} options={[{ value: 'all', label: 'All', count: rows.length }, ...groups.map(g => ({ value: g, label: g, count: rows.filter(r => r.age_group === g).length })), ...(rows.some(r => !r.age_group || !groups.includes(r.age_group)) ? [{ value: 'Other', label: 'Other age', count: rows.filter(r => !r.age_group || !groups.includes(r.age_group)).length }] : [])]} />
        <SearchInput className="sm:w-64" value={q} onChange={setQ} placeholder="Search player or academy" />
      </div>
      {err && <div className="mb-3"><Alert>{err}</Alert></div>}

      <Card className="overflow-hidden">
        {shown.length === 0 ? (
          <Empty icon={<Users2 size={20} />} title={rows.length ? 'No players match' : 'No players in this camp yet'}>
            {rows.length ? 'Change the age group or search.' : camp.stage === 'district' ? 'Add players here, or open the camp to academy coaches so they can submit their players.' : 'Invite selected players from the previous stage, or add them here.'}
          </Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1280px] text-sm">
              <thead className="border-b border-line bg-paper/70"><tr>
                <Th>Player</Th><Th>Year</Th><Th>Academy</Th><Th>Group</Th><Th>Attendance</Th><Th>10m (s)</Th><Th>20m (s)</Th><Th>CJ (cm)</Th><Th>OBS</Th><Th>Decision</Th><Th>GK</Th><Th>A</Th><Th>Position</Th>{camp.stage !== 'district' && <Th>Team</Th>}<Th>Comment</Th><Th>Message to coach</Th><Th />
              </tr></thead>
              <tbody>{shown.map(r => {
                const outOfAge = r.player.birth_year && !ageGroupFor(r.player.birth_year, ref.groups)
                return (
                  <tr key={r.id} className={cx('border-b border-line last:border-0', r.decision === 'selected' ? 'bg-good-soft/50' : r.decision === 'see_again' ? 'bg-warn-soft/40' : r.status === 'absent' ? 'bg-black/[.03] text-muted' : '')}>
                    <td className="px-3 py-1.5">
                      <button onClick={() => setOpenPlayer(r.player_id)} className="whitespace-nowrap text-left font-semibold hover:text-red">{fullName(r.player)}</button>
                      {r.player.age_status === 'doubtful' && <span className="ml-1.5"><Badge tone="warn">Age?</Badge></span>}
                      {r.submission_note && <div className="max-w-[220px] truncate text-xs text-muted" title={r.submission_note}>Coach: {r.submission_note}</div>}
                    </td>
                    <td className={cx('px-3 py-1.5', !!outOfAge && 'font-semibold text-red')} title={outOfAge ? 'Born outside the age groups of this season' : undefined}>{r.player.birth_year ?? '—'}</td>
                    <td className="max-w-[180px] truncate px-3 py-1.5 text-muted" title={ref.academy(r.player.academy_id)?.name}>{ref.academy(r.player.academy_id)?.name ?? '—'}</td>
                    <td className="px-3 py-1.5">
                      <select disabled={!canEdit} value={r.age_group ?? ''} onChange={e => patch(r.id, { age_group: e.target.value || null })} className="h-8 rounded-md border border-line-2 bg-card px-1.5 text-sm">
                        <option value="">—</option>{ref.groups.map(g => <option key={g.code}>{g.code}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-1.5">
                      <select disabled={!canEdit} value={r.status} onChange={e => patch(r.id, { status: e.target.value as PStatus })} className="h-8 rounded-md border border-line-2 bg-card px-1.5 text-sm">
                        {(['submitted', 'invited', 'confirmed', 'declined', 'attended', 'absent'] as PStatus[]).map(s => <option key={s} value={s}>{PSTATUS_LABEL[s]}</option>)}
                      </select>
                    </td>
                    <NumCell v={r.sprint_10m} step="0.01" disabled={!canEdit} onSave={v => patch(r.id, { sprint_10m: v })} />
                    <NumCell v={r.sprint_20m} step="0.01" disabled={!canEdit} onSave={v => patch(r.id, { sprint_20m: v })} />
                    <NumCell v={r.cj_cm} step="0.1" disabled={!canEdit} onSave={v => patch(r.id, { cj_cm: v })} />
                    <td className="px-3 py-1.5">
                      <div className="flex gap-0.5">
                        {OBS.map(o => (
                          <button key={o} disabled={!canEdit} onClick={() => patch(r.id, { obs: r.obs === o ? null : o, ...(r.status === 'submitted' || r.status === 'invited' || r.status === 'confirmed' ? { status: 'attended' } : {}) })}
                            className={cx('h-8 w-8 rounded-md border text-xs font-bold', r.obs === o ? 'border-ink bg-ink text-lime' : 'border-line-2 text-muted hover:border-text/40')}>{o}</button>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-1.5">
                      <div className="flex gap-0.5">
                        {(['selected', 'see_again', 'not_selected'] as Decision[]).map(d => (
                          <button key={d} disabled={!canEdit} onClick={() => patch(r.id, { decision: r.decision === d ? null : d, decision_published: false })} title={DECISION_LABEL[d]}
                            className={cx('h-8 rounded-md border px-2 text-xs font-semibold', r.decision === d ? (d === 'selected' ? 'border-good bg-good text-white' : d === 'see_again' ? 'border-warn bg-warn text-white' : 'border-text bg-text text-white') : 'border-line-2 text-muted hover:border-text/40')}>
                            {d === 'selected' ? 'Sel' : d === 'see_again' ? 'Again' : 'No'}
                          </button>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-1.5"><input type="checkbox" disabled={!canEdit} checked={r.is_goalkeeper} onChange={e => patch(r.id, { is_goalkeeper: e.target.checked })} className="h-4 w-4 accent-red" /></td>
                    <td className="px-3 py-1.5"><input type="checkbox" disabled={!canEdit} checked={r.grade_a} onChange={e => patch(r.id, { grade_a: e.target.checked })} className="h-4 w-4 accent-red" title="Grade A" /></td>
                    <TextCell v={r.position} w="w-28" placeholder="CB / CM (L)" disabled={!canEdit} onSave={v => patch(r.id, { position: v })} list="positions" />
                    {camp.stage !== 'district' && <TextCell v={r.team} w="w-16" placeholder="1ST" disabled={!canEdit} onSave={v => patch(r.id, { team: v })} />}
                    <TextCell v={r.status === 'absent' || r.status === 'declined' ? r.absence_reason : r.comment} w="w-48" placeholder={r.status === 'absent' || r.status === 'declined' ? 'Reason' : 'Comment'} disabled={!canEdit}
                      onSave={v => patch(r.id, r.status === 'absent' || r.status === 'declined' ? { absence_reason: v } : { comment: v })} />
                    <TextCell v={r.coach_message} w="w-48" placeholder="Shown to the coach on publish" disabled={!canEdit} onSave={v => patch(r.id, { coach_message: v })} />
                    <td className="px-2 py-1.5">
                      {canEdit && (confirmDelete === r.id
                        ? <button onClick={() => remove(r.id)} className="rounded-md bg-red px-2 py-1 text-xs font-semibold text-white">Remove?</button>
                        : <button onClick={() => setConfirmDelete(r.id)} className="rounded-md p-1.5 text-faint hover:bg-red-soft hover:text-red" title="Remove from camp"><Trash2 size={14} /></button>)}
                    </td>
                  </tr>
                )
              })}</tbody>
            </table>
            <datalist id="positions">{POSITIONS.map(p => <option key={p} value={p} />)}</datalist>
          </div>
        )}
      </Card>
      <p className="mt-2 text-xs text-muted">Changes save as you go. Grading a player marks them as attended. Decisions reach academy coaches only after you publish results.</p>

      {editing && <CampFormModal camp={camp} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); load() }} />}
      {adding && <AddPlayerModal camp={camp} existing={new Set(rows.map(r => r.player_id))} onClose={() => setAdding(false)} onAdded={load} />}
      {promoting && <PromoteModal camp={camp} rows={rows} onClose={() => setPromoting(false)} onDone={() => { setPromoting(false) }} />}
      {openPlayer && <PlayerDrawer playerId={openPlayer} onClose={() => setOpenPlayer(null)} onSaved={load} />}
    </div>
  )
}

function NumCell({ v, onSave, step, disabled }: { v: number | null; onSave: (v: number | null) => void; step: string; disabled?: boolean }) {
  const [val, setVal] = useState(v?.toString() ?? '')
  useEffect(() => setVal(v?.toString() ?? ''), [v])
  return (
    <td className="px-3 py-1.5">
      <input type="number" inputMode="decimal" step={step} disabled={disabled} value={val} onChange={e => setVal(e.target.value)}
        onBlur={() => { const n = val === '' ? null : Number(val); if (n !== v && (n === null || !isNaN(n))) onSave(n) }}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
        className="h-8 w-[72px] rounded-md border border-line-2 bg-card px-2 text-sm tabular-nums focus:border-ink focus:outline-none" />
    </td>
  )
}
function TextCell({ v, onSave, w, placeholder, disabled, list }: { v: string | null; onSave: (v: string | null) => void; w: string; placeholder?: string; disabled?: boolean; list?: string }) {
  const [val, setVal] = useState(v ?? '')
  useEffect(() => setVal(v ?? ''), [v])
  return (
    <td className="px-3 py-1.5">
      <input disabled={disabled} value={val} placeholder={placeholder} list={list} onChange={e => setVal(e.target.value)}
        onBlur={() => { const n = val.trim() || null; if (n !== (v ?? null)) onSave(n) }}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
        className={cx('h-8 rounded-md border border-line-2 bg-card px-2 text-sm placeholder:text-faint focus:border-ink focus:outline-none', w)} />
    </td>
  )
}

/* ─────────── Add player (existing or new) ─────────── */
function AddPlayerModal({ camp, existing, onClose, onAdded }: { camp: Camp; existing: Set<string>; onClose: () => void; onAdded: () => void }) {
  const { project } = useAuth()
  const ref = useRefData()
  const [tab, setTab] = useState<'find' | 'new'>('find')
  const [q, setQ] = useState('')
  const dq = useDebounced(q)
  const [found, setFound] = useState<Player[]>([])
  const [added, setAdded] = useState<string[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [f, setF] = useState({ first_name: '', last_name: '', birth_year: '', academy_id: '', positions: '', is_goalkeeper: false })
  const [dupes, setDupes] = useState<Player[] | null>(null)

  useEffect(() => {
    if (dq.trim().length < 2) { setFound([]); return }
    const term = dq.trim().replace(/[%,()]/g, ' ')
    const parts = term.split(/\s+/).filter(Boolean)
    let query = supabase.from('players').select('*').is('merged_into', null).limit(20)
    for (const p of parts) query = query.or(`first_name.ilike.%${p}%,last_name.ilike.%${p}%`)
    query.then(({ data }) => setFound((data as Player[]) ?? []))
  }, [dq])

  async function addExisting(p: Player) {
    setErr(null)
    const { error } = await supabase.from('camp_participants').insert({ camp_id: camp.id, player_id: p.id, status: camp.stage === 'district' ? 'submitted' : 'invited', is_goalkeeper: (p.positions ?? '').toUpperCase().includes('GK') })
    if (error) return setErr(error.code === '23505' ? 'Already in this camp.' : errMsg(error))
    setAdded(a => [...a, p.id]); onAdded()
  }

  async function createNew(force = false) {
    setErr(null)
    const year = parseInt(f.birth_year)
    if (!f.first_name.trim() || !f.last_name.trim()) return setErr('First and last name are required.')
    if (!year || year < 1995 || year > 2025) return setErr('Enter a valid birth year.')
    setBusy(true)
    if (!force) {
      const { data } = await supabase.from('players').select('*').is('merged_into', null)
        .ilike('first_name', f.first_name.trim()).ilike('last_name', f.last_name.trim()).eq('birth_year', year).limit(5)
      if (data && data.length) { setBusy(false); setDupes(data as Player[]); return }
    }
    const district = ref.academy(f.academy_id)?.district_id ?? camp.district_id
    const { data: p, error } = await supabase.from('players').insert({
      project_id: project?.id, first_name: f.first_name.trim(), last_name: f.last_name.trim(), birth_year: year,
      academy_id: f.academy_id || null, district_id: district, positions: f.positions.trim() || (f.is_goalkeeper ? 'GK' : null), source: 'staff',
    }).select('*').single()
    if (error) { setBusy(false); return setErr(errMsg(error)) }
    await addExisting(p as Player)
    setBusy(false); setDupes(null)
    setF({ ...f, first_name: '', last_name: '', positions: '', is_goalkeeper: false })
  }

  const local = ref.academies.filter(a => a.is_active && (!camp.district_id || a.district_id === camp.district_id))
  const others = ref.academies.filter(a => a.is_active && camp.district_id && a.district_id !== camp.district_id)

  return (
    <Modal open wide title="Add players to camp" onClose={onClose} footer={<Button variant="primary" onClick={onClose}>Done{added.length ? ` · ${added.length} added` : ''}</Button>}>
      <div className="mb-4"><Segmented value={tab} onChange={setTab} options={[{ value: 'find', label: 'Find existing player' }, { value: 'new', label: 'New player' }]} /></div>
      {tab === 'find' ? (
        <div>
          <SearchInput value={q} onChange={setQ} placeholder="Type a name — at least 2 letters" />
          <div className="mt-3 divide-y divide-line rounded-lg border border-line">
            {found.length === 0 ? <div className="px-3 py-6 text-center text-sm text-muted">{q.length < 2 ? 'Search everyone already in the system, from any season.' : 'No player found. Use "New player".'}</div> :
              found.map(p => {
                const inCamp = existing.has(p.id) || added.includes(p.id)
                return (
                  <div key={p.id} className="flex items-center gap-3 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold">{fullName(p)} <span className="font-normal text-muted">· {p.birth_year ?? '?'}</span></div>
                      <div className="truncate text-xs text-muted">{ref.academy(p.academy_id)?.name ?? 'No academy'} · {ref.district(p.district_id ?? ref.academy(p.academy_id)?.district_id)?.name ?? ''}</div>
                    </div>
                    {inCamp ? <Badge tone="good"><Check size={12} /> In camp</Badge> : <Button size="sm" onClick={() => addExisting(p)}><Plus size={14} /> Add</Button>}
                  </div>
                )
              })}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="First name" required><Input value={f.first_name} onChange={e => setF({ ...f, first_name: e.target.value })} /></Field>
            <Field label="Last name" required><Input value={f.last_name} onChange={e => setF({ ...f, last_name: e.target.value })} /></Field>
            <Field label="Birth year" required hint={f.birth_year ? (ageGroupFor(parseInt(f.birth_year), ref.groups) ?? 'Outside this season’s age groups') : undefined}>
              <Input type="number" inputMode="numeric" value={f.birth_year} onChange={e => setF({ ...f, birth_year: e.target.value })} placeholder="2014" />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <Field label="Academy">
                <Select value={f.academy_id} onChange={e => setF({ ...f, academy_id: e.target.value })}>
                  <option value="">No academy / parents</option>
                  {local.length > 0 && <optgroup label={camp.district_id ? `${ref.district(camp.district_id)?.name}` : 'Academies'}>{local.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</optgroup>}
                  {others.length > 0 && <optgroup label="Other districts">{others.map(a => <option key={a.id} value={a.id}>{a.name} · {ref.district(a.district_id)?.name}</option>)}</optgroup>}
                </Select>
              </Field>
            </div>
            <Field label="Position"><Input value={f.positions} onChange={e => setF({ ...f, positions: e.target.value })} placeholder="CM (R)" list="positions-new" /></Field>
            <datalist id="positions-new">{POSITIONS.map(p => <option key={p} value={p} />)}</datalist>
          </div>
          {dupes && (
            <Alert tone="warn">
              <div>Already in the system with the same name and year:</div>
              <ul className="mt-1 space-y-1">{dupes.map(d => (
                <li key={d.id} className="flex items-center justify-between gap-2"><span>{fullName(d)} · {d.birth_year} · {ref.academy(d.academy_id)?.name ?? 'No academy'}</span>
                  <Button size="sm" onClick={() => { addExisting(d); setDupes(null) }}>Use this player</Button></li>
              ))}</ul>
              <button className="mt-2 text-sm font-semibold underline" onClick={() => createNew(true)}>It is a different child — create anyway</button>
            </Alert>
          )}
          {err && <Alert>{err}</Alert>}
          <div className="flex justify-end"><Button variant="primary" loading={busy} onClick={() => createNew(false)}><UserPlus size={15} /> Create and add</Button></div>
        </div>
      )}
      {tab === 'find' && err && <div className="mt-3"><Alert>{err}</Alert></div>}
    </Modal>
  )
}

/* ─────────── Invite to the next stage ─────────── */
function PromoteModal({ camp, rows, onClose, onDone }: { camp: Camp; rows: Row[]; onClose: () => void; onDone: () => void }) {
  const ref = useRefData()
  const nav = useNavigate()
  const next = NEXT[camp.stage]!
  const [targets, setTargets] = useState<Camp[] | null>(null)
  const [target, setTarget] = useState('')
  const [pick, setPick] = useState<Set<string>>(new Set(rows.filter(r => r.decision === 'selected').map(r => r.player_id)))
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<number | null>(null)
  const region = camp.region_id ?? ref.district(camp.district_id)?.region_id

  useEffect(() => {
    let qy = supabase.from('camps').select('*').eq('season_id', camp.season_id).eq('stage', next).neq('status', 'cancelled')
    if (next === 'province_final' && region) qy = qy.eq('region_id', region)
    qy.then(({ data }) => { const l = (data as Camp[]) ?? []; setTargets(l); if (l.length === 1) setTarget(l[0].id) })
  }, [next, region, camp.season_id])

  async function go() {
    if (!target) return setErr('Choose the camp to invite them to.')
    setBusy(true); setErr(null)
    const list = rows.filter(r => pick.has(r.player_id)).map(r => ({ camp_id: target, player_id: r.player_id, status: 'invited' as PStatus, is_goalkeeper: r.is_goalkeeper, position: r.position, age_group: r.age_group }))
    const { error, data } = await supabase.from('camp_participants').upsert(list, { onConflict: 'camp_id,player_id', ignoreDuplicates: true }).select('id')
    setBusy(false)
    if (error) return setErr(errMsg(error))
    setDone(data?.length ?? 0)
  }

  const selected = rows.filter(r => r.decision === 'selected' || r.decision === 'see_again')
  return (
    <Modal open wide title={`Invite to ${STAGE_LABEL[next].toLowerCase()}`} onClose={onClose}
      footer={done !== null ? <><Button onClick={onDone}>Close</Button><Button variant="primary" onClick={() => nav(`/scouting/camps/${target}`)}>Open {STAGE_LABEL[next].toLowerCase()}</Button></> :
        <><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={go} disabled={!pick.size}>Invite {pick.size}</Button></>}>
      {done !== null ? <Alert tone="good">{done} player{done === 1 ? '' : 's'} invited. Players already in that camp were left as they were.</Alert> : (
        <div className="space-y-4">
          <Field label="Camp" required>
            {targets && targets.length === 0 ? <Alert tone="warn">There is no {STAGE_LABEL[next].toLowerCase()}{next === 'province_final' ? ` for ${ref.regions.find(r => r.id === region)?.name}` : ''} yet. Create it in Camps or Plan first.</Alert> : (
              <Select value={target} onChange={e => setTarget(e.target.value)}>
                <option value="">Choose camp</option>{targets?.map(t => <option key={t.id} value={t.id}>{t.name} · {fmtRange(t.starts_on, t.ends_on)}</option>)}
              </Select>
            )}
          </Field>
          <div>
            <div className="mb-2 text-[13px] font-semibold">Players ({pick.size} of {selected.length})</div>
            <div className="max-h-80 divide-y divide-line overflow-y-auto rounded-lg border border-line">
              {selected.map(r => (
                <label key={r.id} className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-paper/60">
                  <input type="checkbox" className="h-4 w-4 accent-red" checked={pick.has(r.player_id)} onChange={e => { const s = new Set(pick); if (e.target.checked) s.add(r.player_id); else s.delete(r.player_id); setPick(s) }} />
                  <span className="flex-1"><b>{fullName(r.player)}</b> <span className="text-muted">· {r.player.birth_year} · {r.age_group} · {ref.academy(r.player.academy_id)?.name ?? ''}</span></span>
                  <Badge tone={r.decision === 'selected' ? 'good' : 'warn'}>{DECISION_LABEL[r.decision!]}</Badge>
                </label>
              ))}
            </div>
          </div>
          {err && <Alert>{err}</Alert>}
        </div>
      )}
    </Modal>
  )
}
