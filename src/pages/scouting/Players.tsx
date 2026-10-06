import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { GitMerge, Plus, Users2 } from 'lucide-react'
import { supabase, errMsg } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import {
  useRefData, POOL_LABEL, POOL_ORDER, STAGE_SHORT, DECISION_LABEL, PSTATUS_LABEL, fmtDate, fullName, ageGroupFor,
  type Camp, type Participant, type Player, type PoolStatus,
} from '../../lib/scouting'
import { Alert, Badge, Button, Card, Drawer, Empty, Field, Input, Modal, PageHeader, SearchInput, Select, Spinner, Td, Textarea, Th, cx, useDebounced } from '../../components/ui'

export const poolTone = (s: PoolStatus) => ({
  academy_squad: 'neutral', submitted: 'info', observed: 'neutral', province_final: 'lime', national_final: 'dark',
  selected: 'good', see_again: 'warn', not_selected: 'neutral', tony_squad: 'good', released: 'bad',
} as const)[s]

const PAGE = 100

export default function PlayersPage() {
  const { profile, project } = useAuth()
  const ref = useRefData()
  const [rows, setRows] = useState<Player[] | null>(null)
  const [total, setTotal] = useState(0)
  const [q, setQ] = useState('')
  const dq = useDebounced(q)
  const [pool, setPool] = useState('')
  const [group, setGroup] = useState('')
  const [region, setRegion] = useState('')
  const [age, setAge] = useState('')
  const [limit, setLimit] = useState(PAGE)
  const [open, setOpen] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const canEdit = profile?.role !== 'observer'

  const load = useCallback(async () => {
    let qy = supabase.from('players').select('*', { count: 'exact' }).is('merged_into', null).order('last_name').order('first_name').range(0, limit - 1)
    if (dq.trim()) for (const p of dq.trim().replace(/[%,()]/g, ' ').split(/\s+/)) qy = qy.or(`first_name.ilike.%${p}%,last_name.ilike.%${p}%`)
    if (pool) qy = qy.eq('pool_status', pool)
    if (age) qy = qy.eq('age_status', age)
    if (group) { const g = ref.groups.find(x => x.code === group); if (g) qy = qy.gte('birth_year', g.birth_year_from).lte('birth_year', g.birth_year_to) }
    if (region) qy = qy.in('district_id', ref.districts.filter(d => d.region_id === region).map(d => d.id))
    const { data, count } = await qy
    setRows((data as Player[]) ?? []); setTotal(count ?? 0)
  }, [dq, pool, group, region, age, limit, ref.groups, ref.districts])
  useEffect(() => { load() }, [load])

  return (
    <div>
      <PageHeader eyebrow="Scouting" title="Players"
        description="Everyone the scouting has met, across seasons. Each child has one card that follows them from academy squad to the Tony squads."
        actions={canEdit && <Button variant="primary" onClick={() => setCreating(true)}><Plus size={16} /> New player</Button>} />

      <div className="mb-4 flex flex-col gap-2 lg:flex-row" data-tour="filters">
        <SearchInput className="lg:w-72" value={q} onChange={v => { setQ(v); setLimit(PAGE) }} placeholder="Search by name" />
        <Select className="lg:w-52" value={pool} onChange={e => setPool(e.target.value)}>
          <option value="">Any status</option>{POOL_ORDER.map(s => <option key={s} value={s}>{POOL_LABEL[s]}</option>)}
        </Select>
        <Select className="lg:w-40" value={group} onChange={e => setGroup(e.target.value)}>
          <option value="">Any age</option>{ref.groups.map(g => <option key={g.code} value={g.code}>{g.code} · {g.birth_year_from}–{g.birth_year_to}</option>)}
        </Select>
        <Select className="lg:w-48" value={region} onChange={e => setRegion(e.target.value)}>
          <option value="">All provinces</option>{ref.regions.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
        </Select>
        <Select className="lg:w-44" value={age} onChange={e => setAge(e.target.value)}>
          <option value="">Any age check</option><option value="declared">Age declared</option><option value="doubtful">Age doubtful</option><option value="verified">Age verified</option>
        </Select>
      </div>

      <Card className="overflow-hidden">
        {!rows ? <Spinner /> : rows.length === 0 ? <Empty icon={<Users2 size={20} />} title="No players yet">Players appear here when they are added to a camp, submitted by a coach, or loaded from past seasons.</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="border-b border-line bg-paper/70"><tr><Th>Player</Th><Th>Born</Th><Th>Group</Th><Th>Academy</Th><Th>District</Th><Th>Position</Th><Th>Status</Th></tr></thead>
              <tbody>{rows.map(p => (
                <tr key={p.id} onClick={() => setOpen(p.id)} className="cursor-pointer border-b border-line last:border-0 hover:bg-paper/60">
                  <Td><span className="font-semibold">{fullName(p)}</span>{p.age_status === 'doubtful' && <span className="ml-1.5"><Badge tone="warn">Age?</Badge></span>}{p.age_status === 'verified' && <span className="ml-1.5 text-xs text-good">✓</span>}</Td>
                  <Td>{p.birth_year ?? '—'}</Td>
                  <Td>{ageGroupFor(p.birth_year, ref.groups) ?? <span className="text-faint">—</span>}</Td>
                  <Td className="max-w-[220px] truncate text-muted">{ref.academy(p.academy_id)?.name ?? '—'}</Td>
                  <Td className="text-muted">{ref.district(p.district_id ?? ref.academy(p.academy_id)?.district_id)?.name ?? '—'}</Td>
                  <Td className="text-muted">{p.positions ?? ''}</Td>
                  <Td><Badge tone={poolTone(p.pool_status)}>{POOL_LABEL[p.pool_status]}</Badge></Td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Card>
      <div className="mt-3 flex items-center justify-between text-sm text-muted">
        <span>{rows?.length ?? 0} of {total.toLocaleString()} players</span>
        {rows && rows.length < total && <Button size="sm" onClick={() => setLimit(l => l + PAGE)}>Show more</Button>}
      </div>

      {open && <PlayerDrawer playerId={open} onClose={() => setOpen(null)} onSaved={load} onOpenOther={setOpen} />}
      {creating && <NewPlayerModal projectId={project?.id} onClose={() => setCreating(false)} onCreated={id => { setCreating(false); load(); setOpen(id) }} />}
    </div>
  )
}

function NewPlayerModal({ projectId, onClose, onCreated }: { projectId?: string; onClose: () => void; onCreated: (id: string) => void }) {
  const ref = useRefData()
  const [f, setF] = useState({ first_name: '', last_name: '', birth_year: '', academy_id: '', positions: '' })
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  async function save() {
    const y = parseInt(f.birth_year)
    if (!f.first_name.trim() || !f.last_name.trim() || !y) return setErr('First name, last name and birth year are required.')
    setBusy(true)
    const { data, error } = await supabase.from('players').insert({ project_id: projectId, first_name: f.first_name.trim(), last_name: f.last_name.trim(), birth_year: y, academy_id: f.academy_id || null, district_id: ref.academy(f.academy_id)?.district_id ?? null, positions: f.positions.trim() || null, source: 'staff' }).select('id').single()
    setBusy(false)
    if (error) return setErr(errMsg(error))
    onCreated(data.id)
  }
  return (
    <Modal open title="New player" onClose={onClose} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>Create</Button></>}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="First name" required><Input value={f.first_name} onChange={e => setF({ ...f, first_name: e.target.value })} /></Field>
          <Field label="Last name" required><Input value={f.last_name} onChange={e => setF({ ...f, last_name: e.target.value })} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Birth year" required><Input type="number" value={f.birth_year} onChange={e => setF({ ...f, birth_year: e.target.value })} /></Field>
          <Field label="Position"><Input value={f.positions} onChange={e => setF({ ...f, positions: e.target.value })} /></Field>
        </div>
        <Field label="Academy"><AcademySelect value={f.academy_id} onChange={v => setF({ ...f, academy_id: v })} /></Field>
        {err && <Alert>{err}</Alert>}
      </div>
    </Modal>
  )
}

export function AcademySelect({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const ref = useRefData()
  return (
    <Select value={value} onChange={e => onChange(e.target.value)} disabled={disabled}>
      <option value="">No academy / parents</option>
      {ref.regions.map(r => ref.districts.filter(d => d.region_id === r.id).map(d => {
        const list = ref.academies.filter(a => a.district_id === d.id && (a.is_active || a.id === value))
        return list.length ? <optgroup key={d.id} label={`${d.name} · ${r.name}`}>{list.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</optgroup> : null
      }))}
    </Select>
  )
}

type Journey = Participant & { camp: Camp }

export function PlayerDrawer({ playerId, onClose, onSaved, onOpenOther }: { playerId: string; onClose: () => void; onSaved?: () => void; onOpenOther?: (id: string) => void }) {
  const { profile, seasons } = useAuth()
  const ref = useRefData()
  const nav = useNavigate()
  const [p, setP] = useState<Player | null>(null)
  const [journey, setJourney] = useState<Journey[]>([])
  const [f, setF] = useState<Partial<Player>>({})
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState(false)
  const [busy, setBusy] = useState(false)
  const [similar, setSimilar] = useState<Player[]>([])
  const [merging, setMerging] = useState<Player | null>(null)
  const canEdit = profile?.role !== 'observer'

  const load = useCallback(async () => {
    const [{ data: pl }, { data: j }] = await Promise.all([
      supabase.from('players').select('*').eq('id', playerId).single(),
      supabase.from('camp_participants').select('*, camp:camps(*)').eq('player_id', playerId),
    ])
    const player = pl as Player
    setP(player); setF(player)
    setJourney(((j as Journey[]) ?? []).sort((a, b) => (a.camp.starts_on ?? '9999').localeCompare(b.camp.starts_on ?? '9999')))
    if (player) {
      const { data: s } = await supabase.from('players').select('*').is('merged_into', null).neq('id', player.id)
        .ilike('last_name', player.last_name).ilike('first_name', `${player.first_name.split(' ')[0]}%`).limit(5)
      setSimilar(((s as Player[]) ?? []).filter(x => !x.birth_year || !player.birth_year || Math.abs(x.birth_year - player.birth_year) <= 1))
    }
  }, [playerId])
  useEffect(() => { load() }, [load])

  async function save() {
    if (!p) return
    setErr(null); setOk(false); setBusy(true)
    const changes = {
      first_name: f.first_name?.trim(), last_name: f.last_name?.trim(), birth_year: f.birth_year ? Number(f.birth_year) : null, birth_date: f.birth_date || null,
      age_status: f.age_status, preferred_foot: f.preferred_foot || null, positions: f.positions || null, academy_id: f.academy_id || null,
      district_id: ref.academy(f.academy_id)?.district_id ?? f.district_id ?? null,
      guardian_name: f.guardian_name || null, guardian_phone: f.guardian_phone || null, guardian_consent: !!f.guardian_consent, staff_notes: f.staff_notes || null,
      ...(f.pool_status !== p.pool_status ? { pool_status: f.pool_status } : {}),
    }
    const { error } = await supabase.from('players').update(changes).eq('id', p.id)
    setBusy(false)
    if (error) return setErr(errMsg(error))
    setOk(true); load(); onSaved?.()
  }

  if (!p) return <Drawer open onClose={onClose} title="Player"><Spinner /></Drawer>
  const set = (k: keyof Player) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })

  return (
    <Drawer open onClose={onClose} width={640} title={fullName(p)}
      subtitle={<span className="flex flex-wrap items-center gap-2">{p.birth_year ?? 'Year ?'} · {ageGroupFor(p.birth_year, ref.groups) ?? 'outside age groups'} · {ref.academy(p.academy_id)?.name ?? 'No academy'} <Badge tone={poolTone(p.pool_status)}>{POOL_LABEL[p.pool_status]}</Badge></span>}
      footer={canEdit ? <><Button variant="ghost" onClick={onClose}>Close</Button><Button variant="primary" loading={busy} onClick={save}>Save</Button></> : undefined}>
      <div className="space-y-6">
        <section>
          <div className="label-caps mb-3 text-muted">Pathway</div>
          {journey.length === 0 ? <p className="text-sm text-muted">Not in any camp yet.</p> : (
            <ol className="relative space-y-3 border-l-2 border-line pl-5">
              {journey.map(j => (
                <li key={j.id} className="relative">
                  <span className={cx('absolute -left-[27px] top-1 h-3 w-3 rounded-full border-2 border-card', j.decision === 'selected' ? 'bg-good' : j.decision === 'see_again' ? 'bg-warn' : j.status === 'absent' ? 'bg-faint' : 'bg-ink')} />
                  <button onClick={() => nav(`/scouting/camps/${j.camp.id}`)} className="text-left">
                    <div className="text-sm font-semibold hover:text-red">{j.camp.name}</div>
                    <div className="text-xs text-muted">{fmtDate(j.camp.starts_on)} · {STAGE_SHORT[j.camp.stage]} · scouting for {seasons.find(s => s.id === j.camp.season_id)?.label}</div>
                  </button>
                  <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
                    <Badge tone="neutral">{PSTATUS_LABEL[j.status]}</Badge>
                    {j.obs && <Badge tone="dark">OBS {j.obs}</Badge>}
                    {j.decision && <Badge tone={j.decision === 'selected' ? 'good' : j.decision === 'see_again' ? 'warn' : 'neutral'}>{DECISION_LABEL[j.decision]}</Badge>}
                    {(j.sprint_10m || j.sprint_20m) && <Badge tone="neutral">{j.sprint_10m ?? '–'}s / {j.sprint_20m ?? '–'}s</Badge>}
                    {j.cj_cm && <Badge tone="neutral">CJ {j.cj_cm}cm</Badge>}
                    {j.position && <Badge tone="neutral">{j.position}</Badge>}
                  </div>
                  {(j.comment || j.absence_reason) && <div className="mt-1 text-xs text-muted">{j.comment || j.absence_reason}</div>}
                </li>
              ))}
            </ol>
          )}
        </section>

        {similar.length > 0 && canEdit && (
          <Alert tone="warn">
            <div className="font-semibold">Possible duplicate{similar.length > 1 ? 's' : ''}</div>
            <ul className="mt-1 space-y-1">{similar.map(s => (
              <li key={s.id} className="flex items-center justify-between gap-2 text-sm">
                <button className="text-left underline" onClick={() => onOpenOther?.(s.id)}>{fullName(s)} · {s.birth_year ?? '?'} · {ref.academy(s.academy_id)?.name ?? 'No academy'}</button>
                <Button size="sm" onClick={() => setMerging(s)}><GitMerge size={13} /> Merge</Button>
              </li>
            ))}</ul>
          </Alert>
        )}

        <section className="space-y-4">
          <div className="label-caps text-muted">Details</div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="First name"><Input value={f.first_name ?? ''} onChange={set('first_name')} disabled={!canEdit} /></Field>
            <Field label="Last name"><Input value={f.last_name ?? ''} onChange={set('last_name')} disabled={!canEdit} /></Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Birth year"><Input type="number" value={f.birth_year ?? ''} onChange={set('birth_year')} disabled={!canEdit} /></Field>
            <Field label="Date of birth"><Input type="date" value={f.birth_date ?? ''} onChange={set('birth_date')} disabled={!canEdit} /></Field>
            <Field label="Age check">
              <Select value={f.age_status} onChange={set('age_status')} disabled={!canEdit}>
                <option value="declared">Declared</option><option value="doubtful">Doubtful</option><option value="verified">Verified (birth certificate)</option>
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2"><Field label="Academy"><AcademySelect value={f.academy_id ?? ''} onChange={v => setF({ ...f, academy_id: v })} disabled={!canEdit} /></Field></div>
            <Field label="Foot">
              <Select value={f.preferred_foot ?? ''} onChange={set('preferred_foot')} disabled={!canEdit}>
                <option value="">—</option><option value="right">Right</option><option value="left">Left</option><option value="both">Both</option>
              </Select>
            </Field>
          </div>
          <Field label="Positions"><Input value={f.positions ?? ''} onChange={set('positions')} disabled={!canEdit} placeholder="CB / CM (LEFT)" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Parent / guardian"><Input value={f.guardian_name ?? ''} onChange={set('guardian_name')} disabled={!canEdit} /></Field>
            <Field label="Guardian phone"><Input value={f.guardian_phone ?? ''} onChange={set('guardian_phone')} disabled={!canEdit} /></Field>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-red" checked={!!f.guardian_consent} onChange={e => setF({ ...f, guardian_consent: e.target.checked })} disabled={!canEdit} /> Guardian consent received</label>
          {p.coach_notes && <Field label="Academy coach's notes"><div className="rounded-lg bg-paper p-3 text-sm">{p.coach_notes}</div></Field>}
          <Field label="Staff notes" hint="Internal. Never shown to academy coaches."><Textarea rows={3} value={f.staff_notes ?? ''} onChange={set('staff_notes')} disabled={!canEdit} /></Field>
          <Field label="Pool status" hint="Set automatically from camps. Change it by hand only to mark Tony squad or Released.">
            <Select value={f.pool_status} onChange={set('pool_status')} disabled={!canEdit}>
              {POOL_ORDER.map(s => <option key={s} value={s}>{POOL_LABEL[s]}</option>)}
            </Select>
          </Field>
          <div className="text-xs text-muted">Source: {p.source} · added {fmtDate(p.created_at.slice(0, 10))}</div>
          {err && <Alert>{err}</Alert>}
          {ok && <Alert tone="good">Saved.</Alert>}
        </section>
      </div>
      {merging && <MergeModal keep={merging} drop={p} onClose={() => setMerging(null)} onDone={id => { setMerging(null); onSaved?.(); if (onOpenOther) onOpenOther(id); else onClose() }} />}
    </Drawer>
  )
}

function MergeModal({ keep, drop, onClose, onDone }: { keep: Player; drop: Player; onClose: () => void; onDone: (keptId: string) => void }) {
  const ref = useRefData()
  const [dir, setDir] = useState<'keep' | 'drop'>('keep')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [a, b] = dir === 'keep' ? [keep, drop] : [drop, keep]
  async function go() {
    setBusy(true); setErr(null)
    const { error } = await supabase.rpc('merge_players', { p_keep: a.id, p_drop: b.id })
    setBusy(false)
    if (error) return setErr(errMsg(error))
    onDone(a.id)
  }
  const line = (p: Player) => `${fullName(p)} · ${p.birth_year ?? '?'} · ${ref.academy(p.academy_id)?.name ?? 'No academy'}`
  return (
    <Modal open title="Merge duplicate players" onClose={onClose} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={go}><GitMerge size={15} /> Merge</Button></>}>
      <div className="space-y-3 text-sm">
        <p className="text-muted">All camps of the second card move to the first. The second card is hidden but kept, with a pointer to the first.</p>
        <div className="space-y-2">
          <label className="flex items-center gap-2 rounded-lg border border-line p-3"><input type="radio" checked={dir === 'keep'} onChange={() => setDir('keep')} className="accent-red" /> Keep <b>{line(keep)}</b></label>
          <label className="flex items-center gap-2 rounded-lg border border-line p-3"><input type="radio" checked={dir === 'drop'} onChange={() => setDir('drop')} className="accent-red" /> Keep <b>{line(drop)}</b></label>
        </div>
        <Alert tone="info">Merging {line(b)} into {line(a)}.</Alert>
        {err && <Alert>{err}</Alert>}
      </div>
    </Modal>
  )
}
