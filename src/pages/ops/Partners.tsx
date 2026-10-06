import { useCallback, useEffect, useMemo, useState } from 'react'
import { Globe, Handshake, Mail, Phone, Plus, Trash2, UserRound } from 'lucide-react'
import { supabase, errMsg } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { Alert, Badge, Button, Card, DeleteButton, Drawer, Empty, Field, Input, Modal, MultiSelect, PageHeader, SearchInput, Select, Spinner, Textarea, cx } from '../../components/ui'

export interface Partner { id: string; name: string; kind: string; country: string | null; city: string | null; website: string | null; status: string; folder: string | null; notes: string | null }
interface Contact { id: string; partner_id: string; name: string; role: string | null; phone: string | null; email: string | null; notes: string | null }
interface Note { id: string; partner_id: string; day: string; note: string; created_at: string }

export const PARTNER_KIND: Record<string, string> = { club: 'Club', federation: 'Federation', school: 'School', sponsor: 'Sponsor', academy: 'Academy', agency: 'Agency', media: 'Media', government: 'Government', other: 'Other' }
const STATUS: Record<string, [string, 'good' | 'warn' | 'neutral']> = { active: ['Active', 'good'], prospect: ['Prospect', 'warn'], past: ['Past', 'neutral'] }

/** All partners, for pickers on other screens. */
export function usePartners() {
  const [list, setList] = useState<Partner[]>([])
  useEffect(() => { supabase.from('partners').select('*').order('name').then(({ data }) => setList((data as Partner[]) ?? [])) }, [])
  return list
}

export default function PartnersPage() {
  const { can } = useAuth()
  const [rows, setRows] = useState<Partner[] | null>(null)
  const [counts, setCounts] = useState<Record<string, { contacts: number; notes: number; moves: number }>>({})
  const [kinds, setKinds] = useState<string[]>([])
  const [statuses, setStatuses] = useState<string[]>([])
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [editing, setEditing] = useState<Partner | 'new' | null>(null)
  const canEdit = can('partners', 2)

  const load = useCallback(async () => {
    const [p, c, n, m] = await Promise.all([
      supabase.from('partners').select('*').order('name'),
      supabase.from('partner_contacts').select('partner_id'),
      supabase.from('partner_notes').select('partner_id'),
      supabase.from('player_moves').select('partner_id'),
    ])
    setRows((p.data as Partner[]) ?? [])
    const k: typeof counts = {}
    const bump = (id: string | null, f: 'contacts' | 'notes' | 'moves') => { if (!id) return; k[id] ??= { contacts: 0, notes: 0, moves: 0 }; k[id][f]++ }
    ;((c.data as { partner_id: string }[]) ?? []).forEach(x => bump(x.partner_id, 'contacts'))
    ;((n.data as { partner_id: string }[]) ?? []).forEach(x => bump(x.partner_id, 'notes'))
    ;((m.data as { partner_id: string | null }[]) ?? []).forEach(x => bump(x.partner_id, 'moves'))
    setCounts(k)
  }, [])
  useEffect(() => { load() }, [load])

  const shown = useMemo(() => (rows ?? []).filter(p =>
    (!kinds.length || kinds.includes(p.kind)) && (!statuses.length || statuses.includes(p.status)) &&
    (!q || `${p.name} ${p.city ?? ''} ${p.country ?? ''}`.toLowerCase().includes(q.toLowerCase()))), [rows, kinds, statuses, q])
  const current = rows?.find(p => p.id === open) ?? null

  return (
    <div>
      <PageHeader eyebrow="Operations" title="Club & partners" description="SL Benfica, the federation, schools, sponsors and every club Tony works with: the people to call, and a log of every contact."
        actions={canEdit ? <Button variant="primary" onClick={() => setEditing('new')}><Plus size={16} /> New partner</Button> : undefined} />
      <div data-tour="partner-filters" className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-center">
        <MultiSelect className="lg:w-52" placeholder="All kinds" value={kinds} onChange={setKinds} options={Object.entries(PARTNER_KIND).map(([value, label]) => ({ value, label }))} />
        <MultiSelect className="lg:w-48" placeholder="Any status" value={statuses} onChange={setStatuses} options={Object.entries(STATUS).map(([value, [label]]) => ({ value, label }))} />
        <SearchInput className="lg:ml-auto lg:w-72" value={q} onChange={setQ} placeholder="Find a partner" />
      </div>
      {!rows ? <Spinner /> : !shown.length ? <Card><Empty icon={<Handshake size={20} />} title="No partners to show">{canEdit ? 'Add the first one with "New partner".' : ''}</Empty></Card> : (
        <div data-tour="partner-grid" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map(p => {
            const k = counts[p.id] ?? { contacts: 0, notes: 0, moves: 0 }
            return (
              <button key={p.id} onClick={() => setOpen(p.id)} className="rounded-xl border border-line bg-card p-4 text-left shadow-sm transition hover:border-ink/30 hover:shadow">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0"><div className="truncate font-display text-lg font-bold uppercase leading-tight">{p.name}</div><div className="mt-0.5 text-sm text-muted">{PARTNER_KIND[p.kind]}{p.city || p.country ? ` · ${[p.city, p.country].filter(Boolean).join(', ')}` : ''}</div></div>
                  <Badge tone={STATUS[p.status][1]}>{STATUS[p.status][0]}</Badge>
                </div>
                <div className="mt-3 flex gap-4 text-xs text-muted"><span><b className="text-text">{k.contacts}</b> contacts</span><span><b className="text-text">{k.notes}</b> notes</span><span><b className="text-text">{k.moves}</b> player moves</span></div>
              </button>
            )
          })}
        </div>
      )}
      {current && <PartnerDrawer partner={current} canEdit={canEdit} onClose={() => setOpen(null)} onEdit={() => setEditing(current)} onChanged={load} />}
      {editing && <PartnerModal partner={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onDone={id => { setEditing(null); load(); if (id) setOpen(id) }} />}
    </div>
  )
}

function PartnerDrawer({ partner, canEdit, onClose, onEdit, onChanged }: { partner: Partner; canEdit: boolean; onClose: () => void; onEdit: () => void; onChanged: () => void }) {
  const { profile } = useAuth()
  const [contacts, setContacts] = useState<Contact[]>([])
  const [notes, setNotes] = useState<Note[]>([])
  const [moves, setMoves] = useState<{ id: string; kind: string; status: string; starts_on: string | null; player: { first_name: string; last_name: string } }[]>([])
  const [contact, setContact] = useState<Contact | 'new' | null>(null)
  const [draft, setDraft] = useState('')
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [c, n, m] = await Promise.all([
      supabase.from('partner_contacts').select('*').eq('partner_id', partner.id).order('name'),
      supabase.from('partner_notes').select('*').eq('partner_id', partner.id).order('day', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('player_moves').select('id, kind, status, starts_on, player:players(first_name, last_name)').eq('partner_id', partner.id).order('created_at', { ascending: false }),
    ])
    setContacts((c.data as Contact[]) ?? []); setNotes((n.data as Note[]) ?? []); setMoves((m.data as unknown as typeof moves) ?? [])
  }, [partner.id])
  useEffect(() => { load() }, [load])

  async function addNote() {
    if (!draft.trim()) return
    const { error } = await supabase.from('partner_notes').insert({ partner_id: partner.id, note: draft.trim(), created_by: profile?.id })
    if (error) return setErr(errMsg(error))
    setDraft(''); load(); onChanged()
  }

  return (
    <Drawer open onClose={onClose} title={partner.name} subtitle={`${PARTNER_KIND[partner.kind]} · ${STATUS[partner.status][0]}`}
      footer={canEdit ? <Button onClick={onEdit}>Edit details</Button> : undefined}>
      <div className="space-y-6">
        {(partner.website || partner.city || partner.country || partner.notes) && (
          <section className="space-y-1.5 text-sm">
            {(partner.city || partner.country) && <div className="text-muted">{[partner.city, partner.country].filter(Boolean).join(', ')}</div>}
            {partner.website && <a href={/^https?:/.test(partner.website) ? partner.website : `https://${partner.website}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-semibold text-red hover:underline"><Globe size={14} /> {partner.website.replace(/^https?:\/\//, '')}</a>}
            {partner.notes && <p className="whitespace-pre-line">{partner.notes}</p>}
          </section>
        )}
        <section>
          <div className="mb-2 flex items-center justify-between"><div className="label-caps text-muted">People</div>{canEdit && <Button size="sm" variant="ghost" onClick={() => setContact('new')}><Plus size={13} /> Add</Button>}</div>
          {!contacts.length ? <p className="text-sm text-muted">No contact person yet.</p> : (
            <ul className="space-y-2">{contacts.map(c => (
              <li key={c.id} className={cx('rounded-lg border border-line px-3 py-2.5 text-sm', canEdit && 'cursor-pointer hover:border-ink/30')} onClick={() => canEdit && setContact(c)}>
                <div className="flex items-center gap-2"><UserRound size={15} className="text-muted" /><b>{c.name}</b>{c.role && <span className="text-muted">· {c.role}</span>}</div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-muted">
                  {c.phone && <a onClick={e => e.stopPropagation()} href={`tel:${c.phone.replace(/\s/g, '')}`} className="inline-flex items-center gap-1 hover:text-red"><Phone size={13} /> {c.phone}</a>}
                  {c.email && <a onClick={e => e.stopPropagation()} href={`mailto:${c.email}`} className="inline-flex items-center gap-1 hover:text-red"><Mail size={13} /> {c.email}</a>}
                </div>
                {c.notes && <p className="mt-1 text-muted">{c.notes}</p>}
              </li>
            ))}</ul>
          )}
        </section>
        {moves.length > 0 && (
          <section>
            <div className="label-caps mb-2 text-muted">Player moves</div>
            <ul className="space-y-1 text-sm">{moves.map(m => <li key={m.id} className="flex justify-between gap-2"><span>{m.player.first_name} {m.player.last_name !== '—' ? m.player.last_name.toUpperCase() : ''} · {MOVE_KIND[m.kind]}</span><span className="text-muted">{MOVE_STATUS[m.status]?.[0]}{m.starts_on ? ` · ${m.starts_on}` : ''}</span></li>)}</ul>
          </section>
        )}
        <section>
          <div className="label-caps mb-2 text-muted">Contact log</div>
          {canEdit && (
            <div className="mb-3 space-y-2">
              <Textarea rows={2} value={draft} onChange={e => setDraft(e.target.value)} placeholder="Call, meeting or e-mail: what was agreed" />
              <div className="flex justify-end"><Button size="sm" variant="primary" disabled={!draft.trim()} onClick={addNote}>Add to log</Button></div>
            </div>
          )}
          {err && <Alert>{err}</Alert>}
          {!notes.length ? <p className="text-sm text-muted">Nothing logged yet.</p> : (
            <ol className="space-y-3 border-l-2 border-line pl-4">{notes.map(n => (
              <li key={n.id} className="relative text-sm">
                <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-ink" />
                <div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold text-muted">{new Date(n.day + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                  {canEdit && <button aria-label="Delete note" className="text-faint hover:text-red" onClick={async () => { await supabase.from('partner_notes').delete().eq('id', n.id); load(); onChanged() }}><Trash2 size={13} /></button>}</div>
                <p className="whitespace-pre-line">{n.note}</p>
              </li>
            ))}</ol>
          )}
        </section>
      </div>
      {contact && <ContactModal partnerId={partner.id} contact={contact === 'new' ? null : contact} onClose={() => setContact(null)} onDone={() => { setContact(null); load(); onChanged() }} />}
    </Drawer>
  )
}

export const MOVE_KIND: Record<string, string> = { interest: 'Interest', trial: 'Trial', offer: 'Offer', loan: 'Loan', transfer: 'Transfer', release: 'Release', return: 'Return' }
export const MOVE_STATUS: Record<string, [string, 'good' | 'warn' | 'bad' | 'neutral' | 'dark']> = {
  open: ['Open', 'neutral'], in_progress: ['In progress', 'warn'], agreed: ['Agreed', 'dark'], completed: ['Completed', 'good'], declined: ['Declined', 'bad'], cancelled: ['Cancelled', 'neutral'],
}

function PartnerModal({ partner, onClose, onDone }: { partner: Partner | null; onClose: () => void; onDone: (id?: string) => void }) {
  const { project } = useAuth()
  const [f, setF] = useState({ name: partner?.name ?? '', kind: partner?.kind ?? 'club', status: partner?.status ?? 'active', country: partner?.country ?? '', city: partner?.city ?? '', website: partner?.website ?? '', notes: partner?.notes ?? '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  async function save() {
    if (!f.name.trim()) return setErr('Give the partner a name.')
    setBusy(true)
    const row = { ...f, name: f.name.trim(), country: f.country || null, city: f.city || null, website: f.website || null, notes: f.notes || null }
    const res = partner ? await supabase.from('partners').update(row).eq('id', partner.id).select('id').single() : await supabase.from('partners').insert({ ...row, project_id: project!.id }).select('id').single()
    setBusy(false)
    if (res.error) return setErr(errMsg(res.error))
    onDone((res.data as { id: string }).id)
  }
  async function remove() {
    if (!partner) return
    const { error } = await supabase.from('partners').delete().eq('id', partner.id)
    if (error) return setErr(errMsg(error))
    onDone()
  }
  return (
    <Modal open title={partner ? 'Edit partner' : 'New partner'} onClose={onClose}
      footer={<div className="flex w-full justify-between">{partner ? <DeleteButton onConfirm={remove} /> : <span />}<div className="flex gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>Save</Button></div></div>}>
      <div className="space-y-4">
        <Field label="Name" required><Input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Kind"><Select value={f.kind} onChange={e => setF({ ...f, kind: e.target.value })}>{Object.entries(PARTNER_KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
          <Field label="Status"><Select value={f.status} onChange={e => setF({ ...f, status: e.target.value })}>{Object.entries(STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
          <Field label="Country"><Input value={f.country} onChange={e => setF({ ...f, country: e.target.value })} /></Field>
          <Field label="City"><Input value={f.city} onChange={e => setF({ ...f, city: e.target.value })} /></Field>
        </div>
        <Field label="Website"><Input value={f.website} onChange={e => setF({ ...f, website: e.target.value })} placeholder="slbenfica.pt" /></Field>
        <Field label="Notes"><Textarea rows={3} value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} /></Field>
        {err && <Alert>{err}</Alert>}
      </div>
    </Modal>
  )
}

function ContactModal({ partnerId, contact, onClose, onDone }: { partnerId: string; contact: Contact | null; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ name: contact?.name ?? '', role: contact?.role ?? '', phone: contact?.phone ?? '', email: contact?.email ?? '', notes: contact?.notes ?? '' })
  const [err, setErr] = useState<string | null>(null)
  async function save() {
    if (!f.name.trim()) return setErr('Who is the contact?')
    const row = { name: f.name.trim(), role: f.role || null, phone: f.phone || null, email: f.email || null, notes: f.notes || null }
    const { error } = contact ? await supabase.from('partner_contacts').update(row).eq('id', contact.id) : await supabase.from('partner_contacts').insert({ ...row, partner_id: partnerId })
    if (error) return setErr(errMsg(error))
    onDone()
  }
  async function remove() { if (!contact) return; const { error } = await supabase.from('partner_contacts').delete().eq('id', contact.id); if (error) setErr(errMsg(error)); else onDone() }
  return (
    <Modal open title={contact ? 'Edit contact' : 'Add contact'} onClose={onClose}
      footer={<div className="flex w-full justify-between">{contact ? <DeleteButton onConfirm={remove} /> : <span />}<div className="flex gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Save</Button></div></div>}>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name" required><Input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Role"><Input value={f.role} onChange={e => setF({ ...f, role: e.target.value })} placeholder="Head of scouting" /></Field>
          <Field label="Phone"><Input value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} placeholder="+250 7…" /></Field>
          <Field label="E-mail"><Input type="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} /></Field>
        </div>
        <Field label="Notes"><Textarea rows={2} value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} /></Field>
        {err && <Alert>{err}</Alert>}
      </div>
    </Modal>
  )
}
