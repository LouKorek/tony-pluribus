import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarDays, Check, Plus, Trash2 } from 'lucide-react'
import { supabase, errMsg } from '../../lib/supabase'
import { type Camp, type Participant, type Player, fmtDate } from '../../lib/scouting'
import { Alert, Badge, Button, Card, Field, Input, Modal, Select, cx } from '../../components/ui'

interface Day { id: string; camp_id: string; day_date: string; start_time: string | null; end_time: string | null; capacity_players: number | null; notes: string | null }
interface Booking { id: string; camp_id: string; academy_id: string; day_id: string | null; report_time: string | null; players_expected: number | null; status: 'proposed' | 'confirmed' | 'change_requested' | 'declined' | 'arrived'; coach_note: string | null; staff_note: string | null; confirmed_at: string | null; arrived_at: string | null }
type Row = Participant & { player: Player }

const TONE: Record<Booking['status'], 'warn' | 'good' | 'info' | 'neutral'> = { proposed: 'warn', confirmed: 'good', change_requested: 'info', declined: 'neutral', arrived: 'good' }
const LABEL: Record<Booking['status'], string> = { proposed: 'Waiting for coach', confirmed: 'Confirmed', change_requested: 'Change requested', declined: 'Not coming', arrived: 'Arrived' }
const hhmm = (t: string | null) => (t ? t.slice(0, 5) : '')

/** Camp days and the day each academy comes: staff assign, coaches confirm in their portal. */
export function CampDaysPanel({ camp, rows, canEdit, academyName }: { camp: Camp; rows: Row[]; canEdit: boolean; academyName: (id: string | null) => string }) {
  const [days, setDays] = useState<Day[]>([])
  const [bookings, setBookings] = useState<Booking[]>([])
  const [adding, setAdding] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [open, setOpen] = useState(rows.length > 0)

  const load = useCallback(async () => {
    const [d, b] = await Promise.all([
      supabase.from('camp_days').select('*').eq('camp_id', camp.id).order('day_date').order('start_time'),
      supabase.from('camp_bookings').select('*').eq('camp_id', camp.id),
    ])
    setDays((d.data as Day[]) ?? []); setBookings((b.data as Booking[]) ?? [])
  }, [camp.id])
  useEffect(() => { load() }, [load])

  // every academy with players in this camp
  const academies = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of rows) if (r.player.academy_id && r.status !== 'removed') m.set(r.player.academy_id, (m.get(r.player.academy_id) ?? 0) + 1)
    return [...m.entries()].map(([id, n]) => ({ id, n, name: academyName(id) })).sort((a, b) => a.name.localeCompare(b.name))
  }, [rows, academyName])
  const byAcademy = useMemo(() => Object.fromEntries(bookings.map(b => [b.academy_id, b])), [bookings])
  const perDay = (dayId: string) => bookings.filter(b => b.day_id === dayId && b.status !== 'declined').reduce((s, b) => s + (b.players_expected ?? rows.filter(r => r.player.academy_id === b.academy_id && r.status !== 'removed').length), 0)

  async function assign(academyId: string, dayId: string | null, reportTime?: string | null) {
    setErr(null)
    const b = byAcademy[academyId]
    const n = rows.filter(r => r.player.academy_id === academyId && r.status !== 'removed').length
    const { error } = b
      ? await supabase.from('camp_bookings').update({ day_id: dayId, report_time: reportTime === undefined ? b.report_time : reportTime, status: dayId && (dayId !== b.day_id || reportTime !== undefined) ? 'proposed' : b.status }).eq('id', b.id)
      : await supabase.from('camp_bookings').insert({ camp_id: camp.id, academy_id: academyId, day_id: dayId, report_time: reportTime ?? null, players_expected: n, status: 'proposed' })
    if (error) setErr(errMsg(error))
    load()
  }
  async function setStatus(b: Booking, status: Booking['status']) {
    const { error } = await supabase.from('camp_bookings').update({ status, arrived_at: status === 'arrived' ? new Date().toISOString() : b.arrived_at }).eq('id', b.id)
    if (error) setErr(errMsg(error)); load()
  }
  async function note(b: Booking, staff_note: string) { await supabase.from('camp_bookings').update({ staff_note: staff_note || null }).eq('id', b.id); load() }
  async function removeDay(id: string) { const { error } = await supabase.from('camp_days').delete().eq('id', id); if (error) setErr(errMsg(error)); load() }

  const assignAll = async (dayId: string) => { for (const a of academies) if (!byAcademy[a.id]?.day_id) await assign(a.id, dayId) }

  return (
    <Card className="mb-5 overflow-hidden" data-tour="camp-days">
      <button onClick={() => setOpen(o => !o)} className="flex w-full items-center justify-between px-4 py-3 text-left">
        <div className="flex items-center gap-2"><CalendarDays size={16} className="text-royal" /><span className="font-semibold">Days and academies</span>
          <span className="text-sm text-muted">· {days.length} day{days.length === 1 ? '' : 's'} · {academies.length} academ{academies.length === 1 ? 'y' : 'ies'}{bookings.filter(b => b.status === 'confirmed' || b.status === 'arrived').length ? ` · ${bookings.filter(b => b.status === 'confirmed' || b.status === 'arrived').length} confirmed` : ''}</span></div>
        <span className="text-xs font-semibold text-muted">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && (
        <div className="border-t border-line px-4 py-4">
          <p className="mb-3 text-sm text-muted">Split the camp into days and give each academy the day and time it comes. The coach gets a notification and confirms in the portal.</p>
          {err && <div className="mb-3"><Alert>{err}</Alert></div>}
          <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
            <div>
              <div className="label-caps mb-2 text-muted">Camp days</div>
              <div className="space-y-2">
                {days.map(d => (
                  <div key={d.id} className="rounded-lg border border-line p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <div className="font-semibold">{fmtDate(d.day_date)}</div>
                      {canEdit && <button onClick={() => removeDay(d.id)} className="rounded p-1 text-faint hover:text-danger" aria-label="Remove day"><Trash2 size={13} /></button>}
                    </div>
                    <div className="text-muted">{hhmm(d.start_time) || '—'}{d.end_time ? ` – ${hhmm(d.end_time)}` : ''}{d.capacity_players ? ` · up to ${d.capacity_players} players` : ''}</div>
                    <div className="mt-1 text-xs text-muted">{perDay(d.id)} players expected · {bookings.filter(b => b.day_id === d.id && b.status !== 'declined').length} academies</div>
                    {canEdit && academies.some(a => !byAcademy[a.id]?.day_id) && <button onClick={() => assignAll(d.id)} className="mt-1 text-xs font-semibold text-royal">Put every unassigned academy on this day</button>}
                  </div>
                ))}
                {days.length === 0 && <p className="text-sm text-muted">No days yet.</p>}
                {canEdit && <Button size="sm" onClick={() => setAdding(true)}><Plus size={14} /> Add day</Button>}
              </div>
            </div>
            <div>
              <div className="label-caps mb-2 text-muted">Academies in this camp</div>
              {academies.length === 0 ? <p className="text-sm text-muted">No academy has players in this camp yet.</p> : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead><tr className="border-b border-line text-xs text-muted"><th className="py-1.5 pr-3 font-semibold">Academy</th><th className="py-1.5 pr-3 font-semibold">Players</th><th className="py-1.5 pr-3 font-semibold">Day</th><th className="py-1.5 pr-3 font-semibold">Report at</th><th className="py-1.5 pr-3 font-semibold">Coach</th><th className="py-1.5 font-semibold" /></tr></thead>
                    <tbody>
                      {academies.map(a => {
                        const b = byAcademy[a.id]
                        return (
                          <tr key={a.id} className="border-b border-line last:border-0 align-top">
                            <td className="py-2 pr-3 font-semibold">{a.name}{b?.coach_note && <div className="mt-0.5 text-xs font-normal text-muted">Coach: {b.coach_note}</div>}</td>
                            <td className="py-2 pr-3 text-muted">{a.n}{b?.players_expected != null && b.players_expected !== a.n ? <span className="text-xs"> · brings {b.players_expected}</span> : ''}</td>
                            <td className="py-2 pr-3">
                              <Select className="h-8 w-40 text-sm" disabled={!canEdit} value={b?.day_id ?? ''} onChange={e => assign(a.id, e.target.value || null)}>
                                <option value="">— not set —</option>
                                {days.map(d => <option key={d.id} value={d.id}>{fmtDate(d.day_date, false)}{d.start_time ? ` ${hhmm(d.start_time)}` : ''}</option>)}
                              </Select>
                            </td>
                            <td className="py-2 pr-3"><Input type="time" className="h-8 w-28" disabled={!canEdit || !b} defaultValue={b?.report_time?.slice(0, 5) ?? ''} onBlur={e => b && e.target.value !== (b.report_time?.slice(0, 5) ?? '') && assign(a.id, b.day_id, e.target.value || null)} /></td>
                            <td className="py-2 pr-3">{b?.day_id ? <Badge tone={TONE[b.status]}>{LABEL[b.status]}</Badge> : <span className="text-xs text-faint">—</span>}</td>
                            <td className="py-2 text-right">
                              {b?.day_id && canEdit && b.status !== 'arrived' && <Button size="sm" variant="ghost" onClick={() => setStatus(b, 'arrived')} title="Mark the academy as arrived"><Check size={13} /> Arrived</Button>}
                              {b && canEdit && <button className={cx('ml-1 text-xs font-semibold', b.staff_note ? 'text-royal' : 'text-muted')} onClick={() => { const v = window.prompt('Note for the coach (what to bring, where to report)', b.staff_note ?? ''); if (v !== null) note(b, v) }}>{b.staff_note ? 'Note ✓' : 'Note'}</button>}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {adding && <DayModal camp={camp} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load() }} />}
    </Card>
  )
}

function DayModal({ camp, onClose, onSaved }: { camp: Camp; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ day_date: camp.starts_on ?? '', start_time: '08:30', end_time: '12:30', capacity_players: '', notes: '' })
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  async function save() {
    if (!f.day_date) return setErr('Choose the date.')
    setBusy(true); setErr(null)
    const { error } = await supabase.from('camp_days').insert({ camp_id: camp.id, day_date: f.day_date, start_time: f.start_time || null, end_time: f.end_time || null, capacity_players: f.capacity_players ? +f.capacity_players : null, notes: f.notes || null })
    setBusy(false)
    if (error) return setErr(errMsg(error))
    onSaved()
  }
  return (
    <Modal open title="Add a camp day" onClose={onClose} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>Add day</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Date" required><Input type="date" value={f.day_date} min={camp.starts_on ?? undefined} max={camp.ends_on ?? undefined} onChange={e => setF({ ...f, day_date: e.target.value })} /></Field>
        <Field label="Capacity (players)"><Input inputMode="numeric" value={f.capacity_players} onChange={e => setF({ ...f, capacity_players: e.target.value.replace(/\D/g, '') })} placeholder="60" /></Field>
        <Field label="Start"><Input type="time" value={f.start_time} onChange={e => setF({ ...f, start_time: e.target.value })} /></Field>
        <Field label="End"><Input type="time" value={f.end_time} onChange={e => setF({ ...f, end_time: e.target.value })} /></Field>
      </div>
      <div className="mt-3"><Field label="Notes"><Input value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} placeholder="U11 and U13 in the morning" /></Field></div>
      {err && <div className="mt-3"><Alert>{err}</Alert></div>}
    </Modal>
  )
}
