import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, FileText, Plus, FileStack } from 'lucide-react'
import { supabase, errMsg } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { useFileLinks } from '../../lib/teams'
import { Alert, Badge, Button, Card, DeleteButton, Empty, Field, Input, Modal, MultiSelect, PageHeader, SearchInput, Spinner, Textarea, cx, useDebounced } from '../../components/ui'

interface Act { id: string; day: string; time_text: string | null; location: string | null; contact: string | null; activity: string; status: string | null; feedback: string | null; staff: string | null; file_id: string | null }
const monday = (d: Date) => { const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const w = (x.getUTCDay() + 6) % 7; x.setUTCDate(x.getUTCDate() - w); return x.toISOString().slice(0, 10) }
const addDays = (s: string, n: number) => { const x = new Date(s + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10) }
const dayLabel = (s: string) => new Date(s + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })

export default function StaffReportsPage() {
  const { can } = useAuth()
  const [week, setWeek] = useState(monday(new Date()))
  const [acts, setActs] = useState<Act[] | null>(null)
  const [q, setQ] = useState('')
  const dq = useDebounced(q, 300)
  const [kinds, setKinds] = useState<string[]>([])
  const [editing, setEditing] = useState<Act | 'new' | null>(null)
  const canEdit = can('staff_reports', 2)
  const files = useFileLinks(acts?.map(a => a.file_id) ?? [])

  // open the latest week that has a report
  useEffect(() => {
    supabase.from('staff_activities').select('day').order('day', { ascending: false }).limit(1).then(({ data }) => {
      const d = (data as { day: string }[])?.[0]?.day
      if (d && d < monday(new Date())) setWeek(monday(new Date(d + 'T00:00:00')))
    })
  }, [])

  const load = useCallback(async () => {
    let query = supabase.from('staff_activities').select('*')
    if (dq.trim().length >= 2) { const t = dq.trim().replace(/[%_,()]/g, ''); query = query.or(`activity.ilike.%${t}%,feedback.ilike.%${t}%,location.ilike.%${t}%,staff.ilike.%${t}%`).order('day', { ascending: false }).limit(200) }
    else query = query.gte('day', week).lte('day', addDays(week, 6)).order('day').order('time_text')
    const { data } = await query
    setActs((data as Act[]) ?? [])
  }, [week, dq])
  useEffect(() => { setActs(null); load() }, [load])

  const kindOf = (a: Act) => /match/i.test(a.activity) ? 'Match' : /train/i.test(a.activity) ? 'Training' : /scout/i.test(a.activity) ? 'Scouting' : /meet/i.test(a.activity) ? 'Meeting' : /day off|off/i.test(a.activity) ? 'Day off' : 'Other'
  const shown = (acts ?? []).filter(a => !kinds.length || kinds.includes(kindOf(a)))
  const byDay = useMemo(() => { const m = new Map<string, Act[]>(); shown.forEach(a => m.set(a.day, [...(m.get(a.day) ?? []), a])); return [...m.entries()] }, [shown])
  const searching = dq.trim().length >= 2

  return (
    <div>
      <PageHeader eyebrow="Operations" title="Staff reports" description="The weekly coordinator report: every activity of the staff day by day, where, who and how it went. Earlier weeks come from the Reports folder."
        actions={canEdit ? <Button variant="primary" onClick={() => setEditing('new')}><Plus size={16} /> Add activity</Button> : undefined} />
      <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-center">
        {!searching && (
          <div data-tour="week" className="flex items-center gap-2">
            <Button size="sm" onClick={() => setWeek(addDays(week, -7))} aria-label="Previous week"><ChevronLeft size={15} /></Button>
            <div className="min-w-[220px] text-center font-semibold">{new Date(week + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – {new Date(addDays(week, 6) + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
            <Button size="sm" onClick={() => setWeek(addDays(week, 7))} aria-label="Next week"><ChevronRight size={15} /></Button>
            <Button size="sm" variant="ghost" onClick={() => setWeek(monday(new Date()))}>This week</Button>
          </div>
        )}
        <MultiSelect className="lg:w-52" placeholder="All activities" value={kinds} onChange={setKinds} options={['Training', 'Match', 'Scouting', 'Meeting', 'Day off', 'Other'].map(k => ({ value: k, label: k }))} />
        <SearchInput className="lg:ml-auto lg:w-72" value={q} onChange={setQ} placeholder="Search every report" />
      </div>
      {!acts ? <Spinner /> : !byDay.length ? <Card><Empty icon={<FileStack size={20} />} title={searching ? 'Nothing found' : 'No activity this week'}>{canEdit && !searching ? 'Add what the staff did.' : ''}</Empty></Card> : (
        <div data-tour="days" className="space-y-4">
          {byDay.map(([d, list]) => (
            <Card key={d} className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-line bg-paper/70 px-4 py-2"><span className="font-semibold">{dayLabel(d)}{searching ? ` ${d.slice(0, 4)}` : ''}</span><span className="text-xs text-muted">{list.length} activit{list.length > 1 ? 'ies' : 'y'}</span></div>
              <ul className="divide-y divide-line">{list.map(a => (
                <li key={a.id} className={cx('grid gap-x-4 gap-y-1 px-4 py-3 sm:grid-cols-[90px_1fr_auto]', canEdit && 'cursor-pointer hover:bg-paper/50')} onClick={() => canEdit && setEditing(a)}>
                  <span className="text-sm text-muted">{a.time_text ?? ''}</span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{a.activity}</span><Badge>{kindOf(a)}</Badge>{a.status && <Badge tone={/done|ok|complete/i.test(a.status) ? 'good' : /cancel/i.test(a.status) ? 'bad' : 'neutral'}>{a.status}</Badge>}</div>
                    <div className="mt-0.5 text-sm text-muted">{[a.location, a.contact && `contact: ${a.contact}`, a.staff && `staff: ${a.staff}`].filter(Boolean).join(' · ')}</div>
                    {a.feedback && <p className="mt-1 whitespace-pre-line text-sm">{a.feedback}</p>}
                  </div>
                  {a.file_id && files[a.file_id] && <a onClick={e => e.stopPropagation()} href={files[a.file_id].url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 self-start text-xs font-semibold text-red hover:underline"><FileText size={13} /> Week file</a>}
                </li>
              ))}</ul>
            </Card>
          ))}
        </div>
      )}
      {editing && <ActModal act={editing === 'new' ? null : editing} day={editing === 'new' ? (week <= new Date().toISOString().slice(0, 10) && addDays(week, 6) >= new Date().toISOString().slice(0, 10) ? new Date().toISOString().slice(0, 10) : week) : editing.day} onClose={() => setEditing(null)} onDone={() => { setEditing(null); load() }} />}
    </div>
  )
}

function ActModal({ act, day, onClose, onDone }: { act: Act | null; day: string; onClose: () => void; onDone: () => void }) {
  const { project, profile } = useAuth()
  const [f, setF] = useState({ day: act?.day ?? day, time_text: act?.time_text ?? '', location: act?.location ?? '', contact: act?.contact ?? '', activity: act?.activity ?? '', status: act?.status ?? '', feedback: act?.feedback ?? '', staff: act?.staff ?? (profile?.full_name ?? '') })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  async function save() {
    if (!f.activity.trim()) return setErr('What was the activity?')
    setBusy(true)
    const row = { ...f, project_id: project!.id, time_text: f.time_text || null, location: f.location || null, contact: f.contact || null, status: f.status || null, feedback: f.feedback || null, staff: f.staff || null }
    const { error } = act ? await supabase.from('staff_activities').update(row).eq('id', act.id) : await supabase.from('staff_activities').insert({ ...row, created_by: profile?.id })
    setBusy(false)
    if (error) return setErr(errMsg(error))
    onDone()
  }
  async function remove() { if (!act) return; const { error } = await supabase.from('staff_activities').delete().eq('id', act.id); if (error) setErr(errMsg(error)); else onDone() }
  return (
    <Modal open wide title={act ? 'Edit activity' : 'Add activity'} onClose={onClose}
      footer={<div className="flex w-full justify-between">{act ? <DeleteButton onConfirm={remove} /> : <span />}<div className="flex gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>Save</Button></div></div>}>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Date"><Input type="date" value={f.day} onChange={e => setF({ ...f, day: e.target.value })} /></Field>
          <Field label="Time"><Input value={f.time_text} onChange={e => setF({ ...f, time_text: e.target.value })} placeholder="16:30" /></Field>
          <Field label="Status"><Input value={f.status} onChange={e => setF({ ...f, status: e.target.value })} placeholder="Done / TBC / Cancelled" list="act-status" /><datalist id="act-status"><option>Done</option><option>TBC</option><option>Cancelled</option><option>Postponed</option></datalist></Field>
        </div>
        <Field label="Activity" required><Input value={f.activity} onChange={e => setF({ ...f, activity: e.target.value })} placeholder="Training U15, scouting visit, meeting with FERWAFA…" /></Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Location"><Input value={f.location} onChange={e => setF({ ...f, location: e.target.value })} /></Field>
          <Field label="Contact person"><Input value={f.contact} onChange={e => setF({ ...f, contact: e.target.value })} /></Field>
          <Field label="Staff"><Input value={f.staff} onChange={e => setF({ ...f, staff: e.target.value })} /></Field>
        </div>
        <Field label="Feedback"><Textarea rows={5} value={f.feedback} onChange={e => setF({ ...f, feedback: e.target.value })} /></Field>
        {err && <Alert>{err}</Alert>}
      </div>
    </Modal>
  )
}
