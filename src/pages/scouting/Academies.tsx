import { useCallback, useEffect, useMemo, useState } from 'react'
import { Eye, Phone, Plus, School } from 'lucide-react'
import { Link } from 'react-router-dom'
import { supabase, errMsg, type Academy } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { useRefData, fmtDate } from '../../lib/scouting'
import { Alert, Badge, Button, Card, Drawer, Empty, Field, Input, MultiSelect, PageHeader, SearchInput, Select, Spinner, Td, Textarea, Th, cx } from '../../components/ui'

interface AcSeason { academy_id: string; season_id: string; visit_date: string | null; scouted: number | null; selected: number | null; obs: string | null; rating: string | null; status: string | null }

export default function AcademiesPage() {
  const { seasons, scoutingSeason, can } = useAuth()
  const ref = useRefData()
  const [rows, setRows] = useState<AcSeason[] | null>(null)
  const [coaches, setCoaches] = useState<Record<string, number>>({})
  const [q, setQ] = useState('')
  const [region, setRegion] = useState<string[]>([])
  const [district, setDistrict] = useState<string[]>([])
  const [show, setShow] = useState<'active' | 'visited' | 'not_visited' | 'inactive' | 'all'>('active')
  const [open, setOpen] = useState<Academy | 'new' | null>(null)
  const canEdit = can('academies', 2)

  // the latest season that has academy visit data = last completed scouting cycle
  const ordered = useMemo(() => [...seasons].sort((a, b) => b.label.localeCompare(a.label)), [seasons])
  const [seasonId, setSeasonId] = useState('')
  const load = useCallback(async () => {
    const all: AcSeason[] = []
    for (let from = 0; ; from += 1000) {
      const { data } = await supabase.from('academy_seasons').select('academy_id,season_id,visit_date,scouted,selected,obs,rating,status').range(from, from + 999)
      all.push(...((data as AcSeason[]) ?? [])); if (!data || data.length < 1000) break
    }
    setRows(all)
    const { data: pr } = await supabase.from('profiles').select('academy_id').eq('role', 'coach').not('academy_id', 'is', null)
    const c: Record<string, number> = {}; (pr ?? []).forEach((p: { academy_id: string }) => { c[p.academy_id] = (c[p.academy_id] ?? 0) + 1 }); setCoaches(c)
    if (!seasonId) {
      const withData = ordered.find(s => all.some(r => r.season_id === s.id))
      setSeasonId(withData?.id ?? scoutingSeason?.id ?? '')
    }
  }, [ordered, scoutingSeason, seasonId])
  useEffect(() => { load() }, [load])

  const bySeason = useMemo(() => {
    const m = new Map<string, AcSeason>()
    rows?.filter(r => r.season_id === seasonId).forEach(r => m.set(r.academy_id, r))
    return m
  }, [rows, seasonId])
  const prevSeasonId = useMemo(() => { const i = ordered.findIndex(s => s.id === seasonId); return ordered[i + 1]?.id }, [ordered, seasonId])
  const prev = useMemo(() => { const m = new Map<string, AcSeason>(); rows?.filter(r => r.season_id === prevSeasonId).forEach(r => m.set(r.academy_id, r)); return m }, [rows, prevSeasonId])

  const districtsInRegion = ref.districts.filter(d => !region.length || region.includes(d.region_id))
  const list = ref.academies.filter(a => {
    if (region.length && !region.includes(ref.regionOf(a.district_id)?.id ?? '')) return false
    if (district.length && !district.includes(a.district_id ?? '')) return false
    const s = bySeason.get(a.id)
    if (show === 'active' && !a.is_active) return false
    if (show === 'inactive' && a.is_active) return false
    if (show === 'visited' && !(s?.scouted)) return false
    if (show === 'not_visited' && (s?.scouted || !a.is_active)) return false
    if (q && !`${a.name} ${a.contact_name ?? ''} ${a.contact_phone ?? ''} ${ref.district(a.district_id)?.name ?? ''}`.toLowerCase().includes(q.toLowerCase())) return false
    return true
  }).sort((a, b) => (ref.regionOf(a.district_id)?.sort ?? 9) - (ref.regionOf(b.district_id)?.sort ?? 9) || (ref.district(a.district_id)?.name ?? '').localeCompare(ref.district(b.district_id)?.name ?? '') || a.name.localeCompare(b.name))

  const visited = ref.academies.filter(a => bySeason.get(a.id)?.scouted).length
  const seen = [...bySeason.values()].reduce((s, r) => s + (r.scouted ?? 0), 0)
  const sel = [...bySeason.values()].reduce((s, r) => s + (r.selected ?? 0), 0)
  const seasonLabel = seasons.find(s => s.id === seasonId)?.label

  return (
    <div>
      <PageHeader eyebrow="Scouting" title="Academies"
        description="The academy register for every district: contacts, visits and how many players each academy brings and has selected."
        actions={canEdit && <Button variant="primary" onClick={() => setOpen('new')}><Plus size={16} /> New academy</Button>} />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4" data-tour="academy-stats">
        <Card className="p-4"><div className="label-caps text-muted">Academies</div><div className="mt-1 font-display text-4xl font-bold">{ref.academies.filter(a => a.is_active).length}</div><div className="text-xs text-muted">active in the register</div></Card>
        <Card className="p-4"><div className="label-caps text-muted">Visited</div><div className="mt-1 font-display text-4xl font-bold">{visited}</div><div className="text-xs text-muted">scouting for {seasonLabel}</div></Card>
        <Card className="p-4"><div className="label-caps text-muted">Players seen</div><div className="mt-1 font-display text-4xl font-bold">{seen.toLocaleString()}</div><div className="text-xs text-muted">as reported by the scouts</div></Card>
        <Card className="p-4"><div className="label-caps text-muted">Selected</div><div className="mt-1 font-display text-4xl font-bold">{sel}</div><div className="text-xs text-muted">{seen ? Math.round((sel / seen) * 100) : 0}% of players seen</div></Card>
      </div>

      <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-center" data-tour="filters">
        <SearchInput className="lg:w-72" value={q} onChange={setQ} placeholder="Search academy, contact, district" />
        <MultiSelect className="lg:w-48" placeholder="All provinces" value={region} onChange={v => { setRegion(v); setDistrict(district.filter(id => !v.length || v.includes(ref.district(id)?.region_id ?? ''))) }} options={ref.regions.map(r => ({ value: r.id, label: r.name }))} />
        <MultiSelect className="lg:w-48" placeholder="All districts" value={district} onChange={setDistrict} searchable options={districtsInRegion.map(d => ({ value: d.id, label: d.name, group: ref.regions.find(r => r.id === d.region_id)?.name }))} />
        <Select className="lg:w-56" value={show} onChange={e => setShow(e.target.value as typeof show)}>
          <option value="active">Active</option><option value="visited">Visited this season</option><option value="not_visited">Not visited this season</option><option value="inactive">Inactive</option><option value="all">All</option>
        </Select>
        <Select data-tour="season" className="lg:ml-auto lg:w-56" value={seasonId} onChange={e => setSeasonId(e.target.value)} title="Scouting season">
          {ordered.map(s => <option key={s.id} value={s.id}>Scouting for {s.label}</option>)}
        </Select>
      </div>

      <Card className="overflow-hidden">
        {!rows || !ref.ready ? <Spinner /> : list.length === 0 ? <Empty icon={<School size={20} />} title="No academies match">Change the filters or clear the search.</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-sm">
              <thead className="border-b border-line bg-paper/70"><tr>
                <Th>Academy</Th><Th>District</Th><Th>Contact</Th><Th>Visit</Th><Th className="text-right">Seen</Th><Th className="text-right">Selected</Th><Th className="text-right">Prev. season</Th><Th>Notes</Th><Th className="text-right">Coaches</Th>
              </tr></thead>
              <tbody>
                {list.map(a => {
                  const s = bySeason.get(a.id); const p = prev.get(a.id)
                  return (
                    <tr key={a.id} onClick={() => setOpen(a)} className="cursor-pointer border-b border-line last:border-0 hover:bg-paper/60">
                      <Td><div className={cx('font-semibold', !a.is_active && 'text-faint line-through')}>{a.name}</div></Td>
                      <Td className="text-muted">{ref.district(a.district_id)?.name}</Td>
                      <Td className="text-muted">{a.contact_phone ?? ''}{a.contact_name ? <span className="text-faint"> · {a.contact_name}</span> : ''}</Td>
                      <Td className="whitespace-nowrap text-muted">{s?.visit_date ? fmtDate(s.visit_date) : ''}</Td>
                      <Td className="text-right font-semibold">{s?.scouted ?? ''}</Td>
                      <Td className="text-right">{s?.selected ? <Badge tone="good">{s.selected}</Badge> : ''}</Td>
                      <Td className="text-right text-muted">{p?.scouted ? `${p.selected ?? 0}/${p.scouted}` : ''}</Td>
                      <Td className="max-w-[260px] truncate text-muted" >{s?.obs ?? ''}</Td>
                      <Td className="text-right">{coaches[a.id] ? <Badge tone="info">{coaches[a.id]}</Badge> : ''}</Td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <div className="mt-2 text-xs text-muted">{list.length} academies shown</div>

      {open && <AcademyDrawer academy={open === 'new' ? null : open} history={rows?.filter(r => open !== 'new' && r.academy_id === open.id) ?? []} canEdit={canEdit}
        onClose={() => setOpen(null)} onSaved={async () => { await ref.reloadAcademies(); await load(); setOpen(null) }} />}
    </div>
  )
}

function AcademyDrawer({ academy, history, canEdit, onClose, onSaved }: { academy: Academy | null; history: AcSeason[]; canEdit: boolean; onClose: () => void; onSaved: () => void }) {
  const ref = useRefData()
  const { seasons, project } = useAuth()
  const [f, setF] = useState({
    name: academy?.name ?? '', district_id: academy?.district_id ?? '', contact_name: academy?.contact_name ?? '',
    contact_phone: academy?.contact_phone ?? '', notes: academy?.notes ?? '', is_active: academy?.is_active ?? true,
  })
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [players, setPlayers] = useState<number | null>(null)

  useEffect(() => {
    if (academy) supabase.from('players').select('id', { count: 'exact', head: true }).eq('academy_id', academy.id).then(({ count }) => setPlayers(count ?? 0))
  }, [academy])

  async function save() {
    setErr(null)
    if (!f.name.trim() || !f.district_id) return setErr('Name and district are required.')
    setBusy(true)
    const payload = { name: f.name.trim().toUpperCase(), district_id: f.district_id, contact_name: f.contact_name.trim() || null, contact_phone: f.contact_phone.trim() || null, notes: f.notes.trim() || null, is_active: f.is_active }
    const { error } = academy ? await supabase.from('academies').update(payload).eq('id', academy.id) : await supabase.from('academies').insert({ ...payload, project_id: project?.id })
    setBusy(false)
    if (error) return setErr(error.code === '23505' ? 'This district already has an academy with that name.' : errMsg(error))
    onSaved()
  }

  const sortedHistory = [...history].sort((a, b) => (seasons.find(s => s.id === b.season_id)?.label ?? '').localeCompare(seasons.find(s => s.id === a.season_id)?.label ?? ''))
  return (
    <Drawer open onClose={onClose} title={academy ? academy.name : 'New academy'}
      subtitle={academy ? `${ref.district(academy.district_id)?.name ?? ''} · ${ref.regionOf(academy.district_id)?.name ?? ''}` : 'Add an academy to the register'}
      footer={canEdit ? <><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>Save</Button></> : undefined}>
      <div className="space-y-4">
        <Field label="Academy name" required><Input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} disabled={!canEdit} /></Field>
        <Field label="District" required>
          <Select value={f.district_id} onChange={e => setF({ ...f, district_id: e.target.value })} disabled={!canEdit}>
            <option value="">Choose district</option>
            {ref.regions.map(r => <optgroup key={r.id} label={r.name}>{ref.districts.filter(d => d.region_id === r.id).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</optgroup>)}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Contact person"><Input value={f.contact_name} onChange={e => setF({ ...f, contact_name: e.target.value })} disabled={!canEdit} /></Field>
          <Field label="Phone"><div className="flex gap-2"><Input value={f.contact_phone} onChange={e => setF({ ...f, contact_phone: e.target.value })} disabled={!canEdit} />{f.contact_phone && <a href={`tel:${f.contact_phone}`} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-line-2 text-muted hover:text-text" title="Call"><Phone size={15} /></a>}</div></Field>
        </div>
        <Field label="Notes"><Textarea rows={2} value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} disabled={!canEdit} /></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.is_active} onChange={e => setF({ ...f, is_active: e.target.checked })} disabled={!canEdit} className="h-4 w-4 accent-red" /> Active academy</label>
        {err && <Alert>{err}</Alert>}

        {academy && (
          <div className="pt-2">
            <div className="label-caps mb-2 text-muted">Scouting history</div>
            {sortedHistory.length === 0 ? <p className="text-sm text-muted">No visits recorded yet.</p> : (
              <div className="overflow-hidden rounded-lg border border-line">
                <table className="w-full text-sm">
                  <thead className="bg-paper/70"><tr><Th>Scouting for</Th><Th>Visit</Th><Th className="text-right">Seen</Th><Th className="text-right">Selected</Th><Th>Notes</Th></tr></thead>
                  <tbody>{sortedHistory.map(h => (
                    <tr key={h.season_id} className="border-t border-line">
                      <Td className="font-semibold">{seasons.find(s => s.id === h.season_id)?.label}</Td>
                      <Td className="text-muted">{fmtDate(h.visit_date)}</Td>
                      <Td className="text-right">{h.scouted ?? '—'}</Td>
                      <Td className="text-right">{h.selected ?? '—'}</Td>
                      <Td className="text-muted">{[h.obs, h.rating, h.status].filter(Boolean).join(' · ')}</Td>
                    </tr>))}</tbody>
                </table>
              </div>
            )}
            <p className="mt-3 text-sm text-muted">{players === null ? '' : `${players} player${players === 1 ? '' : 's'} linked to this academy in the system.`}</p>
            <Link to={`/coach-preview/${academy.id}`} className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-red hover:underline"><Eye size={15} />See this academy's coach portal</Link>
          </div>
        )}
      </div>
    </Drawer>
  )
}
