import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as RMouseEvent } from 'react'
import { CalendarPlus, ChevronLeft, ChevronRight, ClipboardCheck } from 'lucide-react'
import { supabase, errMsg } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { CODE_LABEL, TeamBar, pname, useRoster, useTeamSeason, useTeams, type Mark, type TeamDay } from '../../lib/teams'
import { Alert, Button, Card, Empty, Field, Input, Modal, PageHeader, Select, Spinner, cx } from '../../components/ui'

const CODES = ['A', 'JA', 'I', 'SI', 'S', 'M', 'SM', 'TM', 'PT', '*']
const codeTone = (c: string) => ['A'].includes(c) ? 'bg-red text-white' : ['I', 'SI'].includes(c) ? 'bg-warn text-white' : ['JA', 'S'].includes(c) ? 'bg-black/15 text-text' : ['M', 'SM'].includes(c) ? 'bg-ink text-lime' : 'bg-info-soft text-info'
const monthLabel = (m: string) => new Date(m + '-01T00:00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
const shiftMonth = (m: string, d: number) => { const x = new Date(m + '-01T00:00:00'); x.setMonth(x.getMonth() + d); return x.toISOString().slice(0, 7) }

export default function AttendancePage() {
  const { can, inTeam } = useAuth()
  const { season, setSeason, seasons } = useTeamSeason()
  const { teams, team, pick } = useTeams(season?.id)
  const { roster } = useRoster(team?.id)
  const [month, setMonth] = useState<string | null>(null)
  const [months, setMonths] = useState<string[]>([])
  const [days, setDays] = useState<TeamDay[] | null>(null)
  const [marks, setMarks] = useState<Record<string, Mark>>({})
  const [cell, setCell] = useState<{ day: TeamDay; players: string[]; x: number; y: number } | null>(null)
  const [rows, setRows] = useState<Set<string>>(new Set())
  const [adding, setAdding] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const canEdit = can('attendance', 2) && inTeam(team?.id)

  // months that have sessions, newest first; open the latest by default
  useEffect(() => {
    if (!team) return
    setMonth(null)
    supabase.from('team_days').select('day').eq('team_id', team.id).order('day', { ascending: false }).limit(1000).then(({ data }) => {
      const ms = [...new Set(((data as { day: string }[]) ?? []).map(d => d.day.slice(0, 7)))]
      setMonths(ms)
      setMonth(ms[0] ?? new Date().toISOString().slice(0, 7))
    })
  }, [team])

  const load = useCallback(async () => {
    if (!team || !month) return
    const end = shiftMonth(month, 1)
    const { data: d } = await supabase.from('team_days').select('*').eq('team_id', team.id).gte('day', `${month}-01`).lt('day', `${end}-01`).order('day').order('seq')
    const list = (d as TeamDay[]) ?? []
    setDays(list)
    if (!list.length) { setMarks({}); return }
    const { data: a } = await supabase.from('attendance').select('*').in('day_id', list.map(x => x.id))
    setMarks(Object.fromEntries(((a as Mark[]) ?? []).map(m => [m.day_id + m.player_id, m])))
  }, [team, month])
  useEffect(() => { setDays(null); load() }, [load])

  async function setMark(day: TeamDay, players: string[], minutes: number | null, code: string | null) {
    setErr(null); setCell(null)
    const clear = minutes === null && code === null
    const prev = { ...marks }
    setMarks(m => { const c = { ...m }; players.forEach(p => { if (clear) delete c[day.id + p]; else c[day.id + p] = { day_id: day.id, player_id: p, minutes, code } }); return c })
    const { error } = clear
      ? await supabase.from('attendance').delete().eq('day_id', day.id).in('player_id', players)
      : await supabase.from('attendance').upsert(players.map(p => ({ day_id: day.id, player_id: p, minutes, code })))
    if (error) { setMarks(prev); setErr(errMsg(error)) }
  }

  const players = useMemo(() => (roster ?? []).filter(r => r.status !== 'left'), [roster])
  const totals = (pid: string) => {
    const tr = (days ?? []).filter(d => d.kind === 'training')
    const att = tr.filter(d => (marks[d.id + pid]?.minutes ?? 0) > 0).length
    const mins = (days ?? []).reduce((s, d) => s + (marks[d.id + pid]?.minutes ?? 0), 0)
    return { att, of: tr.length, mins }
  }
  const openCell = (e: RMouseEvent, day: TeamDay, pids: string[]) => {
    if (!canEdit) return
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setCell({ day, players: pids, x: Math.min(r.left, window.innerWidth - 300), y: r.bottom + 6 > window.innerHeight - 220 ? r.top - 214 : r.bottom + 6 })
  }

  return (
    <div>
      <PageHeader eyebrow="Teams" title="Attendance" description="Minutes trained per player and day, with the same codes as the Presence Control sheets." />
      <TeamBar seasonId={season?.id} onSeason={setSeason} seasons={seasons} teams={teams} teamId={team?.id} onTeam={pick}
        extra={canEdit && team ? <Button variant="primary" onClick={() => setAdding(true)}><CalendarPlus size={16} /> Add a day</Button> : undefined} />

      {!team ? (teams ? <Card><Empty icon={<ClipboardCheck size={20} />} title="No team this season" /></Card> : <Spinner />) : (<>
        <div data-tour="att-month" className="mb-3 flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => month && setMonth(shiftMonth(month, -1))} aria-label="Previous month"><ChevronLeft size={15} /></Button>
          <Select className="w-48" value={month ?? ''} onChange={e => setMonth(e.target.value)}>
            {[...new Set([...(month ? [month] : []), ...months])].sort().reverse().map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </Select>
          <Button size="sm" onClick={() => month && setMonth(shiftMonth(month, 1))} aria-label="Next month"><ChevronRight size={15} /></Button>
          {rows.size > 0 && <span className="ml-2 text-sm text-muted">{rows.size} player{rows.size > 1 ? 's' : ''} ticked · click a day to mark them together</span>}
        </div>
        {err && <div className="mb-3"><Alert>{err}</Alert></div>}
        <Card data-tour="att-grid" className="overflow-hidden">
          {!days || !roster ? <Spinner /> : days.length === 0 ? <Empty icon={<ClipboardCheck size={20} />} title="No sessions this month">{canEdit ? 'Add a training day, a match or a meeting.' : ''}</Empty> : (
            <div className="scroll-thin overflow-x-auto">
              <table className="text-xs">
                <thead><tr className="border-b border-line bg-paper/70">
                  <th className="sticky left-0 z-10 min-w-[210px] bg-paper px-3 py-2 text-left font-semibold text-muted">
                    {canEdit && <input type="checkbox" className="mr-2 h-3.5 w-3.5 align-middle accent-red" checked={rows.size === players.length && players.length > 0} onChange={e => setRows(e.target.checked ? new Set(players.map(p => p.player_id)) : new Set())} aria-label="Tick all players" />}
                    Player
                  </th>
                  {days.map(d => (
                    <th key={d.id} className={cx('min-w-[38px] px-1 py-1.5 text-center font-semibold', d.kind === 'match' ? 'bg-ink text-lime' : 'text-muted', canEdit && 'cursor-pointer hover:bg-lime hover:text-ink')}
                      title={`${new Date(d.day + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })} · ${d.kind}${d.minutes ? ` · ${d.minutes}′` : ''}${canEdit ? ' · click to mark ' + (rows.size ? 'the ticked players' : 'everyone') : ''}`}
                      onClick={e => openCell(e, d, rows.size ? [...rows] : players.map(p => p.player_id))}>
                      <div>{+d.day.slice(8)}</div><div className="text-[9px] font-normal opacity-70">{d.kind === 'match' ? 'M' : d.kind === 'training' ? (d.seq > 1 ? '2' : '') : d.kind.slice(0, 2).toUpperCase()}</div>
                    </th>
                  ))}
                  <th className="px-2 py-2 text-right font-semibold text-muted">Sessions</th>
                  <th className="px-3 py-2 text-right font-semibold text-muted">Minutes</th>
                </tr></thead>
                <tbody>{players.map(r => {
                  const t = totals(r.player_id)
                  return (
                    <tr key={r.player_id} className={cx('border-b border-line last:border-0', rows.has(r.player_id) && 'bg-lime-soft')}>
                      <td className="sticky left-0 z-10 whitespace-nowrap bg-card px-3 py-1.5 font-semibold">
                        {canEdit && <input type="checkbox" className="mr-2 h-3.5 w-3.5 align-middle accent-red" checked={rows.has(r.player_id)} onChange={e => setRows(s => { const n = new Set(s); if (e.target.checked) n.add(r.player_id); else n.delete(r.player_id); return n })} />}
                        {pname(r.player)} <span className="font-normal text-faint">{r.position ?? ''}</span>
                      </td>
                      {days.map(d => {
                        const m = marks[d.id + r.player_id]
                        return (
                          <td key={d.id} className={cx('h-8 border-l border-line/60 p-0.5 text-center', canEdit && 'cursor-pointer hover:bg-paper')} onClick={e => openCell(e, d, [r.player_id])}>
                            {m?.code ? <span className={cx('inline-block min-w-[26px] rounded px-1 py-0.5 text-[10px] font-bold', codeTone(m.code))} title={CODE_LABEL[m.code] ?? m.code}>{m.code}</span>
                              : m?.minutes ? <span className={cx('font-semibold', m.minutes >= (d.minutes ?? 60) ? 'text-good' : 'text-warn')}>{m.minutes}</span> : <span className="text-faint">·</span>}
                          </td>
                        )
                      })}
                      <td className="px-2 py-1.5 text-right">{t.of ? `${t.att}/${t.of}` : '—'}</td>
                      <td className="px-3 py-1.5 text-right font-semibold">{t.mins || '—'}</td>
                    </tr>
                  )
                })}</tbody>
              </table>
            </div>
          )}
        </Card>
        <div data-tour="att-legend" className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted">
          <span><b className="text-good">90</b> minutes trained</span>
          {CODES.map(c => <span key={c} className="flex items-center gap-1"><span className={cx('rounded px-1 text-[10px] font-bold', codeTone(c))}>{c}</span>{CODE_LABEL[c]}</span>)}
        </div>
      </>)}

      {cell && <CellMenu cell={cell} onClose={() => setCell(null)} onPick={(mins, code) => setMark(cell.day, cell.players, mins, code)} />}
      {adding && team && <AddDayModal teamId={team.id} month={month} onClose={() => setAdding(false)} onDone={day => { setAdding(false); setMonth(day.slice(0, 7)); setMonths(m => [...new Set([day.slice(0, 7), ...m])]); load() }} />}
    </div>
  )
}

function CellMenu({ cell, onPick, onClose }: { cell: { day: TeamDay; players: string[]; x: number; y: number }; onPick: (minutes: number | null, code: string | null) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [mins, setMins] = useState(String(cell.day.minutes ?? 90))
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose() }
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    setTimeout(() => document.addEventListener('mousedown', h), 0); document.addEventListener('keydown', k)
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k) }
  }, [onClose])
  return (
    <div ref={ref} className="fixed z-50 w-[288px] rounded-xl border border-line bg-card p-3 shadow-2xl" style={{ left: cell.x, top: cell.y }}>
      <div className="mb-2 text-xs text-muted">{new Date(cell.day.day + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} · {cell.players.length > 1 ? `${cell.players.length} players` : '1 player'}</div>
      <div className="flex gap-2">
        <Input type="number" min={0} max={240} value={mins} onChange={e => setMins(e.target.value)} className="h-9 w-20" aria-label="Minutes" />
        <Button size="sm" variant="dark" className="h-9 flex-1" onClick={() => onPick(Number(mins) || 0, null)}>Trained {mins}′</Button>
      </div>
      <div className="mt-2 grid grid-cols-5 gap-1">
        {CODES.map(c => <button key={c} title={CODE_LABEL[c]} onClick={() => onPick(null, c)} className={cx('h-8 rounded text-xs font-bold', codeTone(c))}>{c}</button>)}
      </div>
      <button onClick={() => onPick(null, null)} className="mt-2 w-full rounded-md py-1 text-xs font-semibold text-muted hover:bg-paper hover:text-text">Clear</button>
    </div>
  )
}

function AddDayModal({ teamId, month, onClose, onDone }: { teamId: string; month: string | null; onClose: () => void; onDone: (day: string) => void }) {
  const today = new Date().toISOString().slice(0, 10)
  const [f, setF] = useState({ day: month && !today.startsWith(month) ? `${month}-01` : today, kind: 'training', minutes: '90', label: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  async function save() {
    setBusy(true); setErr(null)
    const { data: ex } = await supabase.from('team_days').select('seq').eq('team_id', teamId).eq('day', f.day)
    const seq = Math.max(0, ...((ex as { seq: number }[]) ?? []).map(x => x.seq)) + 1
    const { error } = await supabase.from('team_days').insert({ team_id: teamId, day: f.day, seq, kind: f.kind, minutes: f.minutes ? Number(f.minutes) : null, label: f.label || null })
    setBusy(false)
    if (error) return setErr(errMsg(error))
    onDone(f.day)
  }
  return (
    <Modal open title="Add a day" onClose={onClose} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>Add</Button></>}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date"><Input type="date" value={f.day} onChange={e => setF({ ...f, day: e.target.value })} /></Field>
          <Field label="Type"><Select value={f.kind} onChange={e => setF({ ...f, kind: e.target.value })}>
            <option value="training">Training</option><option value="match">Match</option><option value="test">Physical tests</option><option value="meeting">Team meeting</option><option value="video">Video analysis</option>
          </Select></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Planned minutes"><Input type="number" value={f.minutes} onChange={e => setF({ ...f, minutes: e.target.value })} /></Field>
          <Field label="Note"><Input value={f.label} onChange={e => setF({ ...f, label: e.target.value })} placeholder="Optional" /></Field>
        </div>
        {err && <Alert>{err}</Alert>}
      </div>
    </Modal>
  )
}
