import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeftRight, FileText, Plus } from 'lucide-react'
import { supabase, errMsg } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { useFileLinks } from '../../lib/teams'
import { PlayerPicker, playerName, type PickedPlayer } from '../../components/PlayerPicker'
import { Alert, Badge, Button, Card, DeleteButton, Empty, Field, Input, Modal, MultiSelect, PageHeader, SearchInput, Segmented, Select, Spinner, Textarea, cx } from '../../components/ui'
import { MOVE_KIND, MOVE_STATUS, usePartners } from './Partners'

interface Move {
  id: string; player_id: string; partner_id: string | null; club: string | null; kind: string; status: string; starts_on: string | null; ends_on: string | null
  amount: number | null; currency: string | null; notes: string | null; file_id: string | null; created_at: string
  player: PickedPlayer; partner: { name: string } | null
}
const STAGES = ['open', 'in_progress', 'agreed', 'completed'] as const
const CLOSED = ['declined', 'cancelled']

export default function TransfersPage() {
  const { can } = useAuth()
  const [rows, setRows] = useState<Move[] | null>(null)
  const [view, setView] = useState<'board' | 'list'>('board')
  const [kinds, setKinds] = useState<string[]>([])
  const [clubs, setClubs] = useState<string[]>([])
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<Move | 'new' | null>(null)
  const canEdit = can('transfers', 2)
  const files = useFileLinks(rows?.map(r => r.file_id) ?? [])

  const load = useCallback(async () => {
    const { data } = await supabase.from('player_moves').select('*, player:players(id, first_name, last_name, birth_year, positions), partner:partners(name)').order('created_at', { ascending: false })
    setRows((data as unknown as Move[]) ?? [])
  }, [])
  useEffect(() => { load() }, [load])

  const clubOf = (m: Move) => m.partner?.name ?? m.club ?? '—'
  const allClubs = [...new Set((rows ?? []).map(clubOf))].sort()
  const shown = useMemo(() => (rows ?? []).filter(m => (!kinds.length || kinds.includes(m.kind)) && (!clubs.length || clubs.includes(clubOf(m))) &&
    (!q || `${playerName(m.player)} ${clubOf(m)}`.toLowerCase().includes(q.toLowerCase()))), [rows, kinds, clubs, q])

  const card = (m: Move) => (
    <button key={m.id} onClick={() => canEdit && setEditing(m)} className={cx('w-full rounded-lg border border-line bg-card p-3 text-left text-sm shadow-sm', canEdit && 'hover:border-ink/30')}>
      <div className="flex items-start justify-between gap-2"><b className="leading-tight">{playerName(m.player)}</b><Badge>{MOVE_KIND[m.kind]}</Badge></div>
      <div className="mt-1 text-muted">{clubOf(m)}{m.player.birth_year ? ` · ${m.player.birth_year}` : ''}</div>
      {(m.starts_on || m.amount) && <div className="mt-1 text-xs text-muted">{m.starts_on ? new Date(m.starts_on + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}{m.ends_on ? ` – ${new Date(m.ends_on + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}{m.amount ? ` · ${Number(m.amount).toLocaleString('en-GB')} ${m.currency ?? ''}` : ''}</div>}
      {m.file_id && files[m.file_id] && <a onClick={e => e.stopPropagation()} href={files[m.file_id].url} target="_blank" rel="noreferrer" className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-red hover:underline"><FileText size={12} /> Document</a>}
    </button>
  )

  return (
    <div>
      <PageHeader eyebrow="Operations" title="Transfer desk" description="Every step of a player towards a club: interest, trial, offer, loan or transfer, from the first call to the signed letter."
        actions={canEdit ? <Button variant="primary" onClick={() => setEditing('new')}><Plus size={16} /> New move</Button> : undefined} />
      <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-center">
        <div data-tour="move-view"><Segmented value={view} onChange={setView} options={[{ value: 'board', label: 'Board' }, { value: 'list', label: 'List' }]} /></div>
        <MultiSelect className="lg:w-48" placeholder="All kinds" value={kinds} onChange={setKinds} options={Object.entries(MOVE_KIND).map(([value, label]) => ({ value, label }))} />
        <MultiSelect className="lg:w-56" placeholder="All clubs" value={clubs} onChange={setClubs} options={allClubs.map(c => ({ value: c, label: c }))} searchable />
        <SearchInput className="lg:ml-auto lg:w-64" value={q} onChange={setQ} placeholder="Player or club" />
      </div>
      {!rows ? <Spinner /> : !rows.length ? <Card><Empty icon={<ArrowLeftRight size={20} />} title="No player moves yet">{canEdit ? 'When a club shows interest in a player, open a move with "New move" and follow it to the end.' : ''}</Empty></Card> : view === 'board' ? (
        <div data-tour="move-board" className="grid gap-3 lg:grid-cols-5">
          {[...STAGES, 'closed' as const].map(s => {
            const list = shown.filter(m => s === 'closed' ? CLOSED.includes(m.status) : m.status === s)
            return (
              <div key={s} className="rounded-xl bg-paper/70 p-2.5">
                <div className="mb-2 flex items-center justify-between px-1"><span className="label-caps text-muted">{s === 'closed' ? 'Declined / cancelled' : MOVE_STATUS[s][0]}</span><span className="text-xs font-bold text-muted">{list.length}</span></div>
                <div className="space-y-2">{list.map(card)}</div>
              </div>
            )
          })}
        </div>
      ) : (
        <Card data-tour="move-board" className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead><tr className="border-b border-line bg-paper/70 text-left text-xs text-muted">{['Player', 'Club', 'Kind', 'Status', 'Dates', 'Amount', ''].map(h => <th key={h} className="px-3 py-2.5 font-semibold">{h}</th>)}</tr></thead>
            <tbody>{shown.map(m => (
              <tr key={m.id} onClick={() => canEdit && setEditing(m)} className={cx('border-b border-line last:border-0', canEdit && 'cursor-pointer hover:bg-paper/50')}>
                <td className="px-3 py-2 font-semibold">{playerName(m.player)}</td><td className="px-3 py-2">{clubOf(m)}</td><td className="px-3 py-2">{MOVE_KIND[m.kind]}</td>
                <td className="px-3 py-2"><Badge tone={MOVE_STATUS[m.status][1]}>{MOVE_STATUS[m.status][0]}</Badge></td>
                <td className="px-3 py-2 text-muted">{[m.starts_on, m.ends_on].filter(Boolean).join(' – ')}</td>
                <td className="px-3 py-2 text-muted">{m.amount ? `${Number(m.amount).toLocaleString('en-GB')} ${m.currency ?? ''}` : ''}</td>
                <td className="px-3 py-2 text-right">{m.file_id && files[m.file_id] && <a onClick={e => e.stopPropagation()} href={files[m.file_id].url} target="_blank" rel="noreferrer" className="text-xs font-semibold text-red hover:underline">Document</a>}</td>
              </tr>
            ))}</tbody>
          </table>
        </Card>
      )}
      {editing && <MoveModal move={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); load() }} />}
    </div>
  )
}

function MoveModal({ move, onClose, onDone }: { move: Move | null; onClose: () => void; onDone: () => void }) {
  const { profile } = useAuth()
  const partners = usePartners()
  const [players, setPlayers] = useState<PickedPlayer[]>(move ? [move.player] : [])
  const [f, setF] = useState({ partner_id: move?.partner_id ?? '', club: move?.club ?? '', kind: move?.kind ?? 'interest', status: move?.status ?? 'open', starts_on: move?.starts_on ?? '', ends_on: move?.ends_on ?? '', amount: move?.amount?.toString() ?? '', currency: move?.currency ?? 'EUR', notes: move?.notes ?? '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  async function save() {
    if (!players.length) return setErr('Choose the player.')
    if (!f.partner_id && !f.club.trim()) return setErr('Choose the club, or type its name.')
    setBusy(true)
    const row = { partner_id: f.partner_id || null, club: f.partner_id ? null : f.club.trim(), kind: f.kind, status: f.status, starts_on: f.starts_on || null, ends_on: f.ends_on || null, amount: f.amount ? Number(f.amount) : null, currency: f.currency || null, notes: f.notes || null }
    const { error } = move ? await supabase.from('player_moves').update({ ...row, player_id: players[0].id }).eq('id', move.id)
      : await supabase.from('player_moves').insert(players.map(p => ({ ...row, player_id: p.id, created_by: profile?.id })))
    setBusy(false)
    if (error) return setErr(errMsg(error))
    onDone()
  }
  async function remove() { if (!move) return; const { error } = await supabase.from('player_moves').delete().eq('id', move.id); if (error) setErr(errMsg(error)); else onDone() }
  return (
    <Modal open wide title={move ? 'Edit move' : 'New move'} onClose={onClose}
      footer={<div className="flex w-full justify-between">{move ? <DeleteButton onConfirm={remove} /> : <span />}<div className="flex gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>Save</Button></div></div>}>
      <div className="space-y-4">
        <Field label={move ? 'Player' : 'Players'} hint={move ? undefined : 'Pick several players to open the same move for each, for example a group trial.'} required><PlayerPicker multi={!move} value={players} onChange={v => setPlayers(move ? v.slice(-1) : v)} /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Club"><Select value={f.partner_id} onChange={e => setF({ ...f, partner_id: e.target.value })}><option value="">Another club (type below)</option>{partners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
          {!f.partner_id && <Field label="Club name"><Input value={f.club} onChange={e => setF({ ...f, club: e.target.value })} placeholder="APR FC" /></Field>}
          <Field label="Kind"><Select value={f.kind} onChange={e => setF({ ...f, kind: e.target.value })}>{Object.entries(MOVE_KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
          <Field label="Status"><Select value={f.status} onChange={e => setF({ ...f, status: e.target.value })}>{Object.entries(MOVE_STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
          <Field label="From"><Input type="date" value={f.starts_on} onChange={e => setF({ ...f, starts_on: e.target.value })} /></Field>
          <Field label="To"><Input type="date" value={f.ends_on} onChange={e => setF({ ...f, ends_on: e.target.value })} /></Field>
          <Field label="Amount"><Input inputMode="decimal" value={f.amount} onChange={e => setF({ ...f, amount: e.target.value.replace(/[^\d.]/g, '') })} /></Field>
          <Field label="Currency"><Select value={f.currency} onChange={e => setF({ ...f, currency: e.target.value })}>{['EUR', 'RWF', 'USD'].map(c => <option key={c}>{c}</option>)}</Select></Field>
        </div>
        <Field label="Notes"><Textarea rows={3} value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} /></Field>
        {err && <Alert>{err}</Alert>}
      </div>
    </Modal>
  )
}
