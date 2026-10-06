import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Check, Eye, KeyRound, ShieldCheck, Pencil, Plus, Search, UserPlus, Users as UsersIcon, Wand2 } from 'lucide-react'
import { supabase, ROLE_LABEL, ROLE_HINT, USERNAME_RE, errMsg, type Academy, type District, type Profile, type Region, type Role, type Status } from '../lib/supabase'
import { startViewAs } from '../lib/viewAs'
import { useAuth } from '../lib/auth'
import { Alert, Badge, Button, Card, Empty, Field, Input, Modal, PageHeader, Select, Spinner, cx, generatePassword } from '../components/ui'

const ROLES: Role[] = ['owner', 'admin', 'staff', 'scout', 'observer', 'coach']
const statusTone: Record<Status, 'good' | 'warn' | 'bad'> = { active: 'good', pending: 'warn', locked: 'bad' }

function since(iso: string | null) {
  if (!iso) return 'Never'
  const d = (Date.now() - new Date(iso).getTime()) / 1000
  if (d < 90) return 'Just now'
  if (d < 3600) return `${Math.round(d / 60)} min ago`
  if (d < 86400) return `${Math.round(d / 3600)} h ago`
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function UsersPage() {
  const { profile: me } = useAuth()
  const [users, setUsers] = useState<Profile[] | null>(null)
  const [academies, setAcademies] = useState<Academy[]>([])
  const [districts, setDistricts] = useState<District[]>([])
  const [regions, setRegions] = useState<Region[]>([])
  const [tab, setTab] = useState<'pending' | 'active' | 'locked' | 'all'>('all')
  const [q, setQ] = useState('')
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Profile | null>(null)
  const [viewing, setViewing] = useState<string | null>(null)
  const [accessFor, setAccessFor] = useState<Profile | null>(null)
  const [viewErr, setViewErr] = useState<string | null>(null)
  async function viewAs(u: Profile) {
    setViewing(u.id); setViewErr(null)
    const e = await startViewAs(u.id, `${u.full_name || u.username} (${ROLE_LABEL[u.role]})`)
    if (e) { setViewErr(e); setViewing(null) }
  }
  const [resetting, setResetting] = useState<Profile | null>(null)

  const load = useCallback(async () => {
    const [u, a, d, r] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at', { ascending: false }),
      supabase.from('academies').select('*').order('name'),
      supabase.from('districts').select('*').order('name'),
      supabase.from('regions').select('*').order('sort'),
    ])
    setUsers((u.data as Profile[]) ?? [])
    setAcademies((a.data as Academy[]) ?? [])
    setDistricts((d.data as District[]) ?? [])
    setRegions((r.data as Region[]) ?? [])
  }, [])
  useEffect(() => { load() }, [load])

  const pending = users?.filter(u => u.status === 'pending').length ?? 0
  useEffect(() => { if (pending > 0) setTab(t => (t === 'all' ? 'pending' : t)) }, [pending])

  const acName = useMemo(() => Object.fromEntries(academies.map(a => [a.id, a.name])), [academies])
  const rgName = useMemo(() => Object.fromEntries(regions.map(r => [r.id, r.name])), [regions])

  const shown = (users ?? []).filter(u =>
    (tab === 'all' || u.status === tab) &&
    (!q || `${u.full_name ?? ''} ${u.username} ${u.phone ?? ''} ${u.requested_academy ?? ''}`.toLowerCase().includes(q.toLowerCase())))

  const counts = { all: users?.length ?? 0, pending, active: users?.filter(u => u.status === 'active').length ?? 0, locked: users?.filter(u => u.status === 'locked').length ?? 0 }

  return (
    <div>
      <PageHeader
        eyebrow="System"
        title="Users"
        description="Staff accounts are created here with a username and password. Academy coaches sign up through the link on the sign-in page and wait here for approval."
        actions={<Button variant="primary" onClick={() => setCreating(true)}><UserPlus size={16} /> New user</Button>}
      />
      {viewErr && <div className="mb-4"><Alert>{viewErr}</Alert></div>}

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div data-tour="tabs" className="flex gap-1 rounded-lg bg-black/5 p-1">
          {(['pending', 'active', 'locked', 'all'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} className={cx('flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold capitalize transition-colors', tab === t ? 'bg-card text-text shadow-sm' : 'text-muted hover:text-text')}>
              {t}
              <span className={cx('rounded-full px-1.5 text-[11px]', t === 'pending' && counts.pending ? 'bg-warn text-white' : 'bg-black/8 text-muted')}>{counts[t]}</span>
            </button>
          ))}
        </div>
        <div className="relative sm:w-72">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <Input className="pl-9" placeholder="Search name, username, phone" value={q} onChange={e => setQ(e.target.value)} />
        </div>
      </div>

      <Card className="overflow-hidden">
        {!users ? <Spinner /> : shown.length === 0 ? (
          <Empty icon={<UsersIcon size={20} />} title={tab === 'pending' ? 'No one is waiting for approval' : 'No users here'}>
            {tab === 'pending' ? 'Coaches who sign up through the link appear here.' : 'Try another tab or clear the search.'}
          </Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="border-b border-line bg-paper/70 text-xs text-muted">
                  <th className="px-4 py-2.5 font-semibold">User</th>
                  <th className="px-4 py-2.5 font-semibold">Role</th>
                  <th className="px-4 py-2.5 font-semibold">Scope</th>
                  <th className="px-4 py-2.5 font-semibold">Status</th>
                  <th className="px-4 py-2.5 font-semibold">Last seen</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {shown.map(u => {
                  const scope = u.role === 'coach'
                    ? (u.academy_id ? acName[u.academy_id] : u.requested_academy ? <span className="text-warn">Asked for: {u.requested_academy}</span> : <span className="text-faint">No academy</span>)
                    : u.role === 'scout' ? (u.region_id ? rgName[u.region_id] : 'All regions')
                    : u.role === 'owner' ? 'All projects' : 'Whole project'
                  return (
                    <tr key={u.id} className="border-b border-line last:border-0 hover:bg-paper/50">
                      <td className="px-4 py-3">
                        <div className="font-semibold">{u.full_name || u.username}{u.id === me?.id && <span className="ml-1.5 text-xs font-normal text-muted">(you)</span>}</div>
                        <div className="text-xs text-muted">@{u.username}{u.phone ? ` · ${u.phone}` : ''}</div>
                      </td>
                      <td className="px-4 py-3">{u.role === 'owner' ? <Badge tone="dark">{ROLE_LABEL[u.role]}</Badge> : ROLE_LABEL[u.role]}</td>
                      <td className="px-4 py-3 text-muted">{scope}</td>
                      <td className="px-4 py-3"><Badge tone={statusTone[u.status]}>{u.status}</Badge></td>
                      <td className="px-4 py-3 text-muted">{since(u.last_seen_at)}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1.5">
                          {u.status === 'pending'
                            ? <Button size="sm" variant="primary" onClick={() => setEditing(u)}><Check size={14} /> Review</Button>
                            : <Button size="sm" variant="ghost" onClick={() => setEditing(u)} disabled={u.role === 'owner' && me?.role !== 'owner'}><Pencil size={14} /> Edit</Button>}
                          <Button size="sm" variant="ghost" onClick={() => setResetting(u)} disabled={u.role === 'owner' && me?.role !== 'owner'} title="Set a new password"><KeyRound size={14} /></Button>
                          {u.role !== 'owner' && u.role !== 'coach' && u.status === 'active' && (u.role !== 'admin' || me?.role === 'owner') && (
                            <Button size="sm" variant="ghost" onClick={() => setAccessFor(u)} title="What this user can see and change"><ShieldCheck size={14} /> Access</Button>
                          )}
                          {me?.role === 'owner' && u.id !== me.id && (
                            <Button size="sm" variant="ghost" loading={viewing === u.id} onClick={() => viewAs(u)} title={`See and use the system as ${u.username}`}><Eye size={14} /> View as</Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {creating && <CreateUserModal academies={academies} districts={districts} regions={regions} myRole={me?.role} onClose={() => setCreating(false)} onDone={() => { setCreating(false); load() }} onAcademyAdded={load} />}
      {editing && <EditUserModal user={editing} me={me} academies={academies} districts={districts} regions={regions} onClose={() => setEditing(null)} onDone={() => { setEditing(null); load() }} onAcademyAdded={load} />}
      {resetting && <ResetPasswordModal user={resetting} onClose={() => setResetting(null)} />}
      {accessFor && <AccessModal user={accessFor} onClose={() => setAccessFor(null)} />}
    </div>
  )
}

function RolePicker({ value, onChange, myRole }: { value: Role; onChange: (r: Role) => void; myRole?: Role }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {ROLES.filter(r => r !== 'owner' || myRole === 'owner').map(r => (
        <button type="button" key={r} onClick={() => onChange(r)}
          className={cx('rounded-lg border p-3 text-left transition-colors', value === r ? 'border-ink bg-ink text-white' : 'border-line-2 hover:border-text/40')}>
          <div className="text-sm font-semibold">{ROLE_LABEL[r]}</div>
          <div className={cx('mt-0.5 text-xs', value === r ? 'text-white/60' : 'text-muted')}>{ROLE_HINT[r]}</div>
        </button>
      ))}
    </div>
  )
}

function AcademyPicker({ value, onChange, academies, districts, onAdded, suggestion }: {
  value: string; onChange: (id: string) => void; academies: Academy[]; districts: District[]; onAdded: () => void; suggestion?: string | null
}) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState(suggestion ?? '')
  const [district, setDistrict] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const dn = Object.fromEntries(districts.map(d => [d.id, d.name]))

  async function add() {
    if (!name.trim() || !district) return setErr('Name and district are required.')
    setBusy(true); setErr(null)
    const { data: proj } = await supabase.from('projects').select('id').limit(1).single()
    const { data, error } = await supabase.from('academies').insert({ name: name.trim().toUpperCase(), district_id: district, project_id: proj?.id }).select('id').single()
    setBusy(false)
    if (error) return setErr(error.code === '23505' ? 'An academy with this name already exists.' : errMsg(error))
    onAdded(); onChange(data.id); setAdding(false)
  }

  return (
    <div className="space-y-2">
      {!adding ? (
        <div className="flex gap-2">
          <Select value={value} onChange={e => onChange(e.target.value)}>
            <option value="">Choose academy</option>
            {academies.map(a => <option key={a.id} value={a.id}>{a.name}{a.district_id ? ` · ${dn[a.district_id]}` : ''}</option>)}
          </Select>
          <Button type="button" onClick={() => setAdding(true)} title="Add academy"><Plus size={15} /> New</Button>
        </div>
      ) : (
        <div className="space-y-2 rounded-lg border border-line bg-paper p-3">
          <div className="text-xs font-semibold text-muted">New academy</div>
          <Input placeholder="Academy name" value={name} onChange={e => setName(e.target.value)} />
          <Select value={district} onChange={e => setDistrict(e.target.value)}>
            <option value="">District</option>
            {districts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
          {err && <Alert>{err}</Alert>}
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
            <Button type="button" size="sm" variant="dark" loading={busy} onClick={add}>Add academy</Button>
          </div>
        </div>
      )}
    </div>
  )
}

export function CreateUserModal({ academies, districts, regions, myRole, onClose, onDone, onAcademyAdded }: {
  academies: Academy[]; districts: District[]; regions: Region[]; myRole?: Role; onClose: () => void; onDone: () => void; onAcademyAdded: () => void
}) {
  const [f, setF] = useState({ username: '', full_name: '', phone: '', role: 'staff' as Role, academy_id: '', region_id: '', password: generatePassword() })
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [created, setCreated] = useState<{ username: string; password: string } | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault(); setErr(null)
    const u = f.username.trim().toLowerCase()
    if (!USERNAME_RE.test(u)) return setErr('Username: 3–32 characters, letters, digits, dots, dashes or underscores.')
    if (f.password.length < 8) return setErr('Password: at least 8 characters.')
    if (f.role === 'coach' && !f.academy_id) return setErr('Choose the academy this coach belongs to.')
    setBusy(true)
    const { error } = await supabase.rpc('admin_create_user', {
      p_username: u, p_password: f.password, p_full_name: f.full_name.trim() || null, p_role: f.role,
      p_phone: f.phone.trim() || null, p_academy_id: f.academy_id || null, p_region_id: f.region_id || null,
    })
    setBusy(false)
    if (error) return setErr(errMsg(error))
    setCreated({ username: u, password: f.password })
  }

  if (created) return (
    <Modal open title="User created" onClose={onDone} footer={<Button variant="primary" onClick={onDone}>Done</Button>}>
      <p className="text-sm text-muted">Send these details to the user. The password is shown only now.</p>
      <div className="mt-4 rounded-xl bg-ink p-4 font-mono text-sm text-white">
        <div><span className="text-white/50">Address </span>{location.origin}</div>
        <div><span className="text-white/50">Username </span>{created.username}</div>
        <div><span className="text-white/50">Password </span><span className="text-lime">{created.password}</span></div>
      </div>
      <Button className="mt-3" size="sm" onClick={() => navigator.clipboard.writeText(`${location.origin}\nUsername: ${created.username}\nPassword: ${created.password}`)}>Copy details</Button>
    </Modal>
  )

  return (
    <Modal open wide title="New user" onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={submit}>Create user</Button></>}>
      <form onSubmit={submit} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Full name"><Input value={f.full_name} onChange={e => setF({ ...f, full_name: e.target.value })} /></Field>
          <Field label="Username" required><Input value={f.username} autoCapitalize="none" onChange={e => setF({ ...f, username: e.target.value })} /></Field>
          <Field label="Phone"><Input type="tel" value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} /></Field>
        </div>
        <Field label="Role" required><RolePicker value={f.role} myRole={myRole} onChange={role => setF({ ...f, role })} /></Field>
        {f.role === 'coach' && <Field label="Academy" required><AcademyPicker value={f.academy_id} onChange={academy_id => setF({ ...f, academy_id })} academies={academies} districts={districts} onAdded={onAcademyAdded} /></Field>}
        {f.role === 'scout' && (
          <Field label="Region" hint="Leave empty for a scout who works in every region.">
            <Select value={f.region_id} onChange={e => setF({ ...f, region_id: e.target.value })}>
              <option value="">All regions</option>
              {regions.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </Select>
          </Field>
        )}
        <Field label="Password" required hint="Generated for you. You can type your own instead.">
          <div className="flex gap-2">
            <Input value={f.password} onChange={e => setF({ ...f, password: e.target.value })} className="font-mono" />
            <Button type="button" onClick={() => setF({ ...f, password: generatePassword() })} title="Generate"><Wand2 size={15} /></Button>
          </div>
        </Field>
        {err && <Alert>{err}</Alert>}
      </form>
    </Modal>
  )
}

export function EditUserModal({ user, me, academies, districts, regions, onClose, onDone, onAcademyAdded }: {
  user: Profile; me: Profile | null; academies: Academy[]; districts: District[]; regions: Region[]; onClose: () => void; onDone: () => void; onAcademyAdded: () => void
}) {
  const [f, setF] = useState({ full_name: user.full_name ?? '', phone: user.phone ?? '', role: user.role, status: user.status, academy_id: user.academy_id ?? '', region_id: user.region_id ?? '' })
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const self = user.id === me?.id

  async function save(status: Status) {
    setErr(null)
    if (f.role === 'coach' && status === 'active' && !f.academy_id) return setErr('Link the coach to an academy before approving.')
    setBusy(status)
    const { error } = await supabase.rpc('admin_update_user', {
      p_user_id: user.id, p_role: f.role, p_status: status, p_full_name: f.full_name.trim() || null,
      p_phone: f.phone.trim() || null, p_academy_id: f.academy_id || null, p_region_id: f.region_id || null,
    })
    setBusy(null)
    if (error) return setErr(errMsg(error))
    onDone()
  }

  const pending = user.status === 'pending'
  return (
    <Modal open wide title={pending ? 'Review sign-up' : 'Edit user'} onClose={onClose}
      footer={pending ? (<>
        <Button variant="danger" loading={busy === 'locked'} onClick={() => save('locked')}>Reject</Button>
        <Button variant="primary" loading={busy === 'active'} onClick={() => save('active')}><Check size={15} /> Approve</Button>
      </>) : (<>
        {!self && (f.status === 'locked'
          ? <Button loading={busy === 'active'} onClick={() => save('active')}>Unlock</Button>
          : <Button variant="danger" loading={busy === 'locked'} onClick={() => save('locked')}>Lock account</Button>)}
        <Button variant="primary" loading={busy === f.status} onClick={() => save(f.status)}>Save</Button>
      </>)}>
      <div className="space-y-5">
        <div className="flex items-center gap-3 rounded-xl bg-paper p-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-ink font-display font-bold uppercase text-white">{(user.full_name || user.username).slice(0, 2)}</div>
          <div className="min-w-0">
            <div className="font-semibold">@{user.username}</div>
            <div className="text-xs text-muted">Joined {new Date(user.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
          </div>
          <div className="ml-auto"><Badge tone={statusTone[user.status]}>{user.status}</Badge></div>
        </div>
        {pending && user.requested_academy && <Alert tone="warn">The coach could not find the academy and wrote: <b>{user.requested_academy}</b>. Pick it below or add it.</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name"><Input value={f.full_name} onChange={e => setF({ ...f, full_name: e.target.value })} /></Field>
          <Field label="Phone"><Input value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} /></Field>
        </div>
        {!self && <Field label="Role"><RolePicker value={f.role} myRole={me?.role} onChange={role => setF({ ...f, role })} /></Field>}
        {f.role === 'coach' && <Field label="Academy" required><AcademyPicker value={f.academy_id} onChange={academy_id => setF({ ...f, academy_id })} academies={academies} districts={districts} onAdded={onAcademyAdded} suggestion={user.requested_academy} /></Field>}
        {f.role === 'scout' && (
          <Field label="Region">
            <Select value={f.region_id} onChange={e => setF({ ...f, region_id: e.target.value })}>
              <option value="">All regions</option>
              {regions.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </Select>
          </Field>
        )}
        {err && <Alert>{err}</Alert>}
      </div>
    </Modal>
  )
}

function ResetPasswordModal({ user, onClose }: { user: Profile; onClose: () => void }) {
  const [pw, setPw] = useState(generatePassword())
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  async function go() {
    setErr(null)
    if (pw.length < 8) return setErr('At least 8 characters.')
    setBusy(true)
    const { error } = await supabase.rpc('admin_set_password', { p_user_id: user.id, p_password: pw })
    setBusy(false)
    if (error) return setErr(errMsg(error))
    setDone(true)
  }
  return (
    <Modal open title="Set a new password" onClose={onClose}
      footer={done ? <Button variant="primary" onClick={onClose}>Done</Button> : <><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={go}>Set password</Button></>}>
      {done ? (
        <div className="space-y-3">
          <Alert tone="good">Password changed. @{user.username} was signed out of every device.</Alert>
          <div className="rounded-xl bg-ink p-4 font-mono text-sm text-white"><span className="text-white/50">Password </span><span className="text-lime">{pw}</span></div>
          <Button size="sm" onClick={() => navigator.clipboard.writeText(pw)}>Copy password</Button>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted">For <b className="text-text">@{user.username}</b>. They will be signed out everywhere and use the new password from now on.</p>
          <Field label="New password">
            <div className="flex gap-2">
              <Input value={pw} onChange={e => setPw(e.target.value)} className="font-mono" />
              <Button type="button" onClick={() => setPw(generatePassword())}><Wand2 size={15} /></Button>
            </div>
          </Field>
          {err && <Alert>{err}</Alert>}
        </div>
      )}
    </Modal>
  )
}

/* ─────────── Content access per user ─────────── */
interface AccessRow { area: string; default: number; override: number | null; level: number }
const AREA_LABEL: Record<string, [string, string]> = {
  academies: ['Academies', 'The academy register and visits'],
  camps: ['Camps and finals', 'Plan, camp sheets, results, invitations'],
  players: ['Players and pool', 'Player cards, merging duplicates, the potential pool'],
  insights: ['Dashboards and reports', 'Numbers, Excel and PDF reports'],
  files: ['Talent folder', 'Default for every folder below'],
  'files.private': ['Personal documents and finance', 'Birth certificates, contracts, health files, release letters, finance'],
}
const LEVELS = ['None', 'View', 'Edit']

export function AccessModal({ user, onClose }: { user: Profile; onClose: () => void }) {
  const [rows, setRows] = useState<AccessRow[] | null>(null)
  const [set, setSet] = useState<Record<string, number | null>>({})
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    supabase.rpc('admin_get_access', { p_user: user.id }).then(({ data, error }) => {
      if (error) setErr(errMsg(error)); else setRows(data as AccessRow[])
    })
  }, [user.id])

  const value = (r: AccessRow) => {
    const o = r.area in set ? set[r.area] : r.override
    if (o !== null && o !== undefined) return o
    if (r.area.startsWith('files:')) {
      const f = rows?.find(x => x.area === 'files')
      if (f) return value(f)
    }
    return r.default
  }
  const isOverride = (r: AccessRow) => { const o = r.area in set ? set[r.area] : r.override; return o !== null && o !== undefined }
  const choose = (r: AccessRow, lvl: number) => setSet(s => ({ ...s, [r.area]: lvl === (r.area.startsWith('files:') ? value(rows!.find(x => x.area === 'files')!) : r.default) ? null : lvl }))

  async function save() {
    setBusy(true); setErr(null)
    const { error } = await supabase.rpc('admin_set_access', { p_user: user.id, p: set })
    setBusy(false)
    if (error) return setErr(errMsg(error))
    onClose()
  }

  const line = (r: AccessRow, indent = false) => {
    const [label, hint] = AREA_LABEL[r.area] ?? [r.area.replace(/^files:/, ''), '']
    const v = value(r)
    const max = r.area === 'insights' ? 1 : 2
    return (
      <div key={r.area} className={cx('flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between', indent && 'sm:pl-6')}>
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold">{indent && <span className="text-faint">└</span>}{label}
            {isOverride(r) ? <Badge tone="lime">Set for this user</Badge> : <span className="text-xs font-normal text-faint">role default</span>}</div>
          {hint && <div className="text-xs text-muted">{hint}</div>}
        </div>
        <div className="flex shrink-0 gap-1 rounded-lg bg-black/5 p-1">
          {LEVELS.slice(0, max + 1).map((l, i) => (
            <button key={l} type="button" onClick={() => choose(r, i)}
              className={cx('rounded-md px-3 py-1 text-sm font-semibold', v === i ? (i === 0 ? 'bg-card text-red shadow-sm' : 'bg-ink text-white shadow-sm') : 'text-muted hover:text-text')}>{l}</button>
          ))}
        </div>
      </div>
    )
  }

  const main = rows?.filter(r => !r.area.startsWith('files')) ?? []
  const folders = rows?.filter(r => r.area.startsWith('files:')) ?? []
  const files = rows?.find(r => r.area === 'files')
  const priv = rows?.find(r => r.area === 'files.private')
  return (
    <Modal open wide title={`Access · ${user.full_name || user.username}`} onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} disabled={!rows} onClick={save}>Save access</Button></>}>
      {err && <div className="mb-3"><Alert>{err}</Alert></div>}
      {!rows ? <Spinner /> : (
        <div className="space-y-5">
          <p className="text-sm text-muted">The role <b>{ROLE_LABEL[user.role]}</b> sets the starting point. Change any line to give this user more or less. "None" hides the screen, "View" shows it read-only, "Edit" allows changes.</p>
          <div><div className="label-caps mb-1 text-muted">Scouting and insights</div><div className="divide-y divide-line">{main.map(r => line(r))}</div></div>
          <div>
            <div className="label-caps mb-1 text-muted">Talent folder</div>
            <div className="divide-y divide-line">
              {files && line(files)}
              {folders.map(r => line(r, true))}
              {priv && line(priv)}
            </div>
            <p className="mt-2 text-xs text-muted">Editing files from inside Pluribus starts with the SharePoint sync. Until then "Edit" works like "View".</p>
          </div>
        </div>
      )}
    </Modal>
  )
}
