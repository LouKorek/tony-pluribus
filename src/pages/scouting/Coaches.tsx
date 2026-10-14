import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Award, Eye, MessageSquare, Minus, Plus, Star, Trophy, Users2 } from 'lucide-react'
import { supabase, errMsg } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { useRefData, fmtDate } from '../../lib/scouting'
import { fmtWhen } from '../../lib/notifications'
import { Alert, Badge, Button, Card, Drawer, Empty, Field, Input, MultiSelect, PageHeader, SearchInput, Segmented, Select, Spinner, Stat, Td, Textarea, Th, cx } from '../../components/ui'

interface Row {
  id: string; name: string; username: string; phone: string | null; status: string; last_seen_at: string | null; created_at: string
  academy_id: string | null; academy: string | null; district: string | null; region: string | null; region_id: string | null; programme_status: string | null
  players: number; sessions_30d: number; submitted: number; selected: number; points: number; season_points: number; level: string | null; review: number | null; reviews: number
}
interface Detail {
  points: number; season_points: number; level: { code: string; label: string; min_points: number; next: { label: string; min_points: number } | null }
  badges: { code: string; label: string; earned_at: string }[]
  history: { id: string; at: string; rule: string; points: number; label: string; note: string | null; voided: boolean }[]
  activity: { at: string; kind: string }[]; visits_30d: number
  sessions: { held_on: string; topic: string | null; present: number }[]
  reviews: { id: string; at: string; reviewer: string | null; reliability: number | null; player_quality: number | null; engagement: number | null; cooperation: number | null; comment: string | null; visible_to_coach: boolean }[]
}
interface BoardRow { academy_id: string; name: string; district: string | null; region: string | null; points: number; rank: number }

const PROGRAMME: Record<string, [string, 'neutral' | 'info' | 'good' | 'neon']> = { registered: ['Registered', 'neutral'], observed: ['Observed', 'info'], partner: ['Partner', 'good'], official: ['Official', 'neon'] }
const LEVEL_TONE: Record<string, string> = { Rookie: 'bg-black/5 text-muted', Bronze: 'bg-warn-soft text-warn', Silver: 'bg-info-soft text-info', Gold: 'bg-neon text-ink', Platinum: 'bg-ink text-white' }

export default function CoachesPage() {
  const { can } = useAuth()
  const ref = useRefData()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [board, setBoard] = useState<BoardRow[] | null>(null)
  const [view, setView] = useState<'coaches' | 'board'>('coaches')
  const [q, setQ] = useState('')
  const [region, setRegion] = useState<string[]>([])
  const [prog, setProg] = useState<string[]>([])
  const [sort, setSort] = useState<'points' | 'name' | 'activity' | 'review'>('points')
  const [open, setOpen] = useState<Row | null>(null)
  const [error, setError] = useState<string | null>(null)
  const canEdit = can('coaches', 2)

  const load = useCallback(async () => {
    const [o, b] = await Promise.all([supabase.rpc('coaches_overview'), supabase.rpc('leaderboard', { p_scope: 'national' })])
    if (o.error) setError(errMsg(o.error))
    setRows((o.data as Row[]) ?? []); setBoard((b.data as BoardRow[]) ?? [])
  }, [])
  useEffect(() => { load() }, [load])

  const list = useMemo(() => {
    const s = q.trim().toLowerCase()
    const out = (rows ?? []).filter(r => {
      if (region.length && !region.includes(r.region_id ?? '')) return false
      if (prog.length && !prog.includes(r.programme_status ?? '')) return false
      if (s && ![r.name, r.username, r.academy, r.district, r.phone].some(v => v?.toLowerCase().includes(s))) return false
      return true
    })
    const key = (r: Row) => sort === 'points' ? -r.season_points : sort === 'activity' ? -(r.last_seen_at ? new Date(r.last_seen_at).getTime() : 0) : sort === 'review' ? -(r.review ?? -1) : 0
    return out.sort((a, b) => key(a) - key(b) || a.name.localeCompare(b.name))
  }, [rows, q, region, prog, sort])

  const active = rows?.filter(r => r.status === 'active') ?? []
  const seen7 = active.filter(r => r.last_seen_at && Date.now() - new Date(r.last_seen_at).getTime() < 7 * 86400000).length
  const logging = active.filter(r => r.sessions_30d > 0).length
  const reviewed = active.filter(r => r.reviews > 0).length

  return (
    <div>
      <PageHeader eyebrow="Scouting" title="Coaches" description="Every coach in the programme: how active they are, what they earn, and what the staff think of them. The coach sees points, level, badges and rank; the reviews stay with the staff unless you share one." />
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-tour="coach-stats">
        <Stat accent label="Active coaches" value={active.length} sub={`${rows?.filter(r => r.status === 'pending').length ?? 0} waiting for approval`} />
        <Stat label="Seen this week" value={seen7} sub={`of ${active.length} opened the portal`} />
        <Stat label="Logging training" value={logging} sub="sessions in the last 30 days" />
        <Stat label="Reviewed" value={reviewed} sub="have at least one staff review" />
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Segmented value={view} onChange={setView} options={[{ value: 'coaches', label: 'Coaches', count: rows?.length }, { value: 'board', label: 'Leaderboard' }]} />
        {view === 'coaches' && (
          <div className="flex flex-1 flex-wrap items-center gap-2" data-tour="filters">
            <SearchInput value={q} onChange={setQ} placeholder="Coach, academy, district, phone" className="min-w-[220px] flex-1" />
            <MultiSelect options={ref.regions.map(r => ({ value: r.id, label: r.name }))} value={region} onChange={setRegion} placeholder="All provinces" className="w-44" />
            <MultiSelect options={Object.entries(PROGRAMME).map(([v, [l]]) => ({ value: v, label: l }))} value={prog} onChange={setProg} placeholder="All statuses" className="w-40" />
            <Select value={sort} onChange={e => setSort(e.target.value as typeof sort)}>
              <option value="points">Sort: season points</option><option value="name">Sort: name</option><option value="activity">Sort: last seen</option><option value="review">Sort: review</option>
            </Select>
          </div>
        )}
      </div>

      {rows === null ? <div className="mt-8"><Spinner /></div> : view === 'coaches' ? (
        <Card className="mt-4 overflow-x-auto" data-tour="main table">
          {list.length === 0 ? <Empty icon={<Users2 size={20} />} title="No coaches match">Change the filters or wait for coaches to sign up with the join link.</Empty> : (
            <table className="w-full text-sm">
              <thead className="border-b border-line bg-paper/60"><tr>
                <Th>Coach</Th><Th>Academy</Th><Th>Status</Th><Th className="text-right">Players</Th><Th className="text-right">Training 30d</Th><Th className="text-right">Submitted</Th><Th className="text-right">Selected</Th><Th className="text-right">Season pts</Th><Th>Level</Th><Th>Review</Th><Th>Last seen</Th>
              </tr></thead>
              <tbody className="divide-y divide-line">
                {list.map(r => (
                  <tr key={r.id} onClick={() => setOpen(r)} className="cursor-pointer hover:bg-paper">
                    <Td><div className="font-semibold">{r.name}</div><div className="text-xs text-muted">@{r.username}{r.phone ? ` · ${r.phone}` : ''}</div></Td>
                    <Td><div className={cx(!r.academy && 'text-faint')}>{r.academy ?? 'No academy'}</div><div className="text-xs text-muted">{[r.district, r.region].filter(Boolean).join(' · ')}</div></Td>
                    <Td>{r.status !== 'active' ? <Badge tone="warn">{r.status}</Badge> : r.programme_status ? <Badge tone={PROGRAMME[r.programme_status]?.[1] ?? 'neutral'}>{PROGRAMME[r.programme_status]?.[0] ?? r.programme_status}</Badge> : null}</Td>
                    <Td className="text-right tabular-nums">{r.players}</Td>
                    <Td className={cx('text-right tabular-nums', r.sessions_30d === 0 && 'text-faint')}>{r.sessions_30d}</Td>
                    <Td className="text-right tabular-nums">{r.submitted}</Td>
                    <Td className="text-right tabular-nums font-semibold">{r.selected || ''}</Td>
                    <Td className="text-right font-display text-base font-semibold tabular-nums">{r.season_points}<span className="ml-1 text-xs font-normal text-faint">/ {r.points}</span></Td>
                    <Td>{r.level && <span className={cx('rounded-full px-2 py-0.5 text-xs font-semibold', LEVEL_TONE[r.level] ?? 'bg-black/5')}>{r.level}</span>}</Td>
                    <Td>{r.review != null ? <span className="inline-flex items-center gap-1"><Star size={13} className="text-warn" />{r.review}<span className="text-xs text-faint">({r.reviews})</span></span> : <span className="text-faint">—</span>}</Td>
                    <Td className="whitespace-nowrap text-xs text-muted">{r.last_seen_at ? fmtWhen(r.last_seen_at) : 'Never'}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      ) : (
        <Card className="mt-4 overflow-x-auto" data-tour="board">
          {!board?.length ? <Empty icon={<Trophy size={20} />} title="No points yet this season">The board fills as coaches add players, log training and come to camps.</Empty> : (
            <table className="w-full text-sm">
              <thead className="border-b border-line bg-paper/60"><tr><Th className="w-16">Rank</Th><Th>Academy</Th><Th>District</Th><Th>Province</Th><Th className="text-right">Season points</Th></tr></thead>
              <tbody className="divide-y divide-line">
                {board.map(r => (
                  <tr key={r.academy_id} className={cx(r.rank <= 3 && 'bg-neon/10')}>
                    <Td className="font-display text-lg font-semibold">#{r.rank}</Td>
                    <Td className="font-semibold">{r.name}</Td><Td>{r.district}</Td><Td>{r.region}</Td>
                    <Td className="text-right font-display text-lg font-semibold tabular-nums">{r.points}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {open && <CoachDrawer row={open} canEdit={canEdit} onClose={() => setOpen(null)} onChanged={load} />}
    </div>
  )
}

/* ───────────────────────── Drawer ───────────────────────── */

function CoachDrawer({ row, canEdit, onClose, onChanged }: { row: Row; canEdit: boolean; onClose: () => void; onChanged: () => void }) {
  const [d, setD] = useState<Detail | null>(null)
  const [tab, setTab] = useState<'overview' | 'review' | 'points' | 'message'>('overview')
  const [msg, setMsg] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null)
  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('coach_detail', { p_coach: row.id })
    if (error) setMsg({ tone: 'bad', text: errMsg(error) }); else setD(data as Detail)
  }, [row.id])
  useEffect(() => { load() }, [load])
  const refresh = () => { load(); onChanged() }

  return (
    <Drawer open onClose={onClose} title={row.name} subtitle={<span>{row.academy ?? 'No academy'}{row.district ? ` · ${row.district}` : ''}{row.region ? ` · ${row.region}` : ''} · @{row.username}{row.phone ? ` · ${row.phone}` : ''}</span>} width={640}>
      {msg && <div className="mb-3"><Alert tone={msg.tone}>{msg.text}</Alert></div>}
      {!d ? <Spinner /> : (
        <div>
          <div className="grid grid-cols-4 gap-2">
            <Stat accent label="Level" value={d.level.label} sub={`${d.points} pts${d.level.next ? ` · ${d.level.next.min_points - d.points} to ${d.level.next.label}` : ''}`} />
            <Stat label="Season" value={d.season_points} sub="points" />
            <Stat label="Visits 30d" value={d.visits_30d} sub={row.last_seen_at ? `last ${fmtWhen(row.last_seen_at)}` : 'never seen'} />
            <Stat label="Badges" value={d.badges.length} sub={d.badges.slice(-1)[0]?.label ?? '—'} />
          </div>
          <div className="mt-4 flex items-center justify-between gap-2">
            <Segmented value={tab} onChange={setTab} options={[{ value: 'overview', label: 'Overview' }, { value: 'review', label: 'Reviews', count: d.reviews.length }, { value: 'points', label: 'Points', count: d.history.length }, { value: 'message', label: 'Message' }]} />
            {row.academy_id && <Link to={`/coach-preview/${row.academy_id}`} className="inline-flex items-center gap-1 text-sm font-semibold text-royal hover:underline"><Eye size={14} />Open as coach</Link>}
          </div>

          {tab === 'overview' && (
            <div className="mt-4 space-y-5">
              <div className="grid grid-cols-4 gap-2 text-center">
                {[['Players', row.players], ['Training 30d', row.sessions_30d], ['Submitted', row.submitted], ['Selected', row.selected]].map(([l, v]) => (
                  <div key={l as string} className="rounded-lg border border-line p-2"><div className="font-display text-xl font-semibold">{v}</div><div className="text-[11px] text-muted">{l}</div></div>
                ))}
              </div>
              <div>
                <div className="label-caps mb-2 text-muted">Badges</div>
                {d.badges.length === 0 ? <p className="text-sm text-faint">No badges yet.</p> : (
                  <div className="flex flex-wrap gap-1.5">{d.badges.map(b => <Badge key={b.code} tone="dark"><Award size={12} />{b.label} · {fmtDate(b.earned_at.slice(0, 10), false)}</Badge>)}</div>
                )}
              </div>
              <div>
                <div className="label-caps mb-2 text-muted">Last training sessions</div>
                {d.sessions.length === 0 ? <p className="text-sm text-faint">The coach has not logged training yet.</p> : (
                  <ul className="divide-y divide-line rounded-lg border border-line text-sm">
                    {d.sessions.map((s, i) => <li key={i} className="flex justify-between px-3 py-1.5"><span>{fmtDate(s.held_on, false)} · {s.topic ?? 'Training'}</span><span className="text-muted">{s.present} present</span></li>)}
                  </ul>
                )}
              </div>
              <div>
                <div className="label-caps mb-2 text-muted">Portal activity</div>
                {d.activity.length === 0 ? <p className="text-sm text-faint">No visits recorded yet.</p> : (
                  <div className="flex flex-wrap gap-1">{d.activity.slice(0, 20).map((a, i) => <span key={i} className="rounded bg-black/5 px-1.5 py-0.5 text-[11px] text-muted">{a.kind} · {fmtWhen(a.at)}</span>)}</div>
                )}
              </div>
            </div>
          )}

          {tab === 'review' && <ReviewsTab d={d} row={row} canEdit={canEdit} onDone={refresh} />}
          {tab === 'points' && <PointsTab d={d} row={row} canEdit={canEdit} onDone={refresh} />}
          {tab === 'message' && <MessageTab row={row} canEdit={canEdit} />}
        </div>
      )}
    </Drawer>
  )
}

const CRITERIA: [keyof Pick<Detail['reviews'][number], 'reliability' | 'player_quality' | 'engagement' | 'cooperation'>, string, string][] = [
  ['reliability', 'Reliability', 'Answers in time, comes when confirmed, keeps information up to date'],
  ['player_quality', 'Player quality', 'The level of the players submitted'],
  ['engagement', 'Engagement', 'Uses the portal, logs training, takes part'],
  ['cooperation', 'Cooperation', 'Easy to work with on camp days and with the staff'],
]

function Stars({ value, onChange }: { value: number | null; onChange?: (v: number) => void }) {
  return (
    <span className="inline-flex gap-0.5">
      {[1, 2, 3, 4, 5].map(n => (
        <button key={n} type="button" disabled={!onChange} onClick={() => onChange?.(n)} className={cx('p-0.5', onChange && 'hover:scale-110')} aria-label={`${n} of 5`}>
          <Star size={18} className={cx(value != null && n <= value ? 'fill-warn text-warn' : 'text-line-2')} />
        </button>
      ))}
    </span>
  )
}

function ReviewsTab({ d, row, canEdit, onDone }: { d: Detail; row: Row; canEdit: boolean; onDone: () => void }) {
  const { profile, scoutingSeason } = useAuth()
  const [form, setForm] = useState<{ reliability: number | null; player_quality: number | null; engagement: number | null; cooperation: number | null; comment: string; visible: boolean }>({ reliability: null, player_quality: null, engagement: null, cooperation: null, comment: '', visible: false })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  async function save() {
    if (![form.reliability, form.player_quality, form.engagement, form.cooperation].some(v => v) && !form.comment.trim()) return setErr('Give at least one rating or a comment.')
    setBusy(true); setErr(null)
    const { error } = await supabase.from('coach_reviews').insert({
      project_id: profile?.project_id, season_id: scoutingSeason?.id ?? null, coach_id: row.id, academy_id: row.academy_id, reviewer: profile?.id,
      reliability: form.reliability, player_quality: form.player_quality, engagement: form.engagement, cooperation: form.cooperation, comment: form.comment.trim() || null, visible_to_coach: form.visible,
    })
    setBusy(false)
    if (error) return setErr(errMsg(error))
    setForm({ reliability: null, player_quality: null, engagement: null, cooperation: null, comment: '', visible: false }); onDone()
  }
  async function toggle(id: string, visible: boolean) {
    const { error } = await supabase.from('coach_reviews').update({ visible_to_coach: visible }).eq('id', id)
    if (error) setErr(errMsg(error)); else onDone()
  }
  async function remove(id: string) {
    if (!confirm('Delete this review?')) return
    const { error } = await supabase.from('coach_reviews').delete().eq('id', id)
    if (error) setErr(errMsg(error)); else onDone()
  }
  return (
    <div className="mt-4 space-y-5">
      {canEdit && (
        <Card className="p-4" data-tour="review-form">
          <div className="label-caps mb-3 text-muted">New review</div>
          {err && <div className="mb-3"><Alert>{err}</Alert></div>}
          <div className="space-y-2">
            {CRITERIA.map(([k, l, h]) => (
              <div key={k} className="flex items-center justify-between gap-3">
                <div className="min-w-0"><div className="text-sm font-semibold">{l}</div><div className="truncate text-xs text-muted">{h}</div></div>
                <Stars value={form[k]} onChange={v => setForm(f => ({ ...f, [k]: f[k] === v ? null : v }))} />
              </div>
            ))}
          </div>
          <Field label="Comment" hint="What the coach does well, what to improve."><Textarea rows={3} value={form.comment} onChange={e => setForm(f => ({ ...f, comment: e.target.value }))} /></Field>
          <label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={form.visible} onChange={e => setForm(f => ({ ...f, visible: e.target.checked }))} className="h-4 w-4 accent-ink" />Share this review with the coach <span className="text-xs text-muted">(hidden by default)</span></label>
          <div className="mt-3 flex justify-end"><Button variant="primary" loading={busy} onClick={save}>Save review</Button></div>
        </Card>
      )}
      {d.reviews.length === 0 ? <p className="text-sm text-faint">No reviews yet.</p> : d.reviews.map(r => (
        <Card key={r.id} className="p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="text-xs text-muted">{r.reviewer ?? 'Staff'} · {fmtDate(r.at.slice(0, 10))}</div>
            <div className="flex items-center gap-2">
              {r.visible_to_coach ? <Badge tone="neon"><Eye size={12} />Coach sees it</Badge> : <Badge>Staff only</Badge>}
              {canEdit && <button onClick={() => toggle(r.id, !r.visible_to_coach)} className="text-xs font-semibold text-royal hover:underline">{r.visible_to_coach ? 'Hide' : 'Share'}</button>}
              {canEdit && <button onClick={() => remove(r.id)} className="text-xs font-semibold text-danger hover:underline">Delete</button>}
            </div>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
            {CRITERIA.map(([k, l]) => r[k] != null && <div key={k} className="flex items-center justify-between text-sm"><span className="text-muted">{l}</span><Stars value={r[k]} /></div>)}
          </div>
          {r.comment && <p className="mt-2 whitespace-pre-line text-sm">{r.comment}</p>}
        </Card>
      ))}
    </div>
  )
}

function PointsTab({ d, row, canEdit, onDone }: { d: Detail; row: Row; canEdit: boolean; onDone: () => void }) {
  const [pts, setPts] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  async function give(sign: 1 | -1) {
    const n = Math.abs(parseInt(pts, 10)) * sign
    if (!n) return setErr('How many points?')
    setBusy(true); setErr(null)
    const { error } = await supabase.rpc('admin_award_points', { p_user: row.id, p_points: n, p_note: note })
    setBusy(false)
    if (error) return setErr(errMsg(error))
    setPts(''); setNote(''); onDone()
  }
  async function voidEvent(id: string) {
    if (!confirm('Void this award? The points are removed from the coach.')) return
    const { error } = await supabase.rpc('admin_void_points', { p_event: id })
    if (error) setErr(errMsg(error)); else onDone()
  }
  return (
    <div className="mt-4 space-y-4">
      {canEdit && (
        <Card className="p-4" data-tour="bonus">
          <div className="label-caps mb-2 text-muted">Bonus or deduction</div>
          {err && <div className="mb-3"><Alert>{err}</Alert></div>}
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Points"><Input type="number" min={1} value={pts} onChange={e => setPts(e.target.value)} className="w-24" /></Field>
            <div className="min-w-[200px] flex-1"><Field label="Reason" hint="The coach sees it with the points."><Input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Brought 12 players to the camp in the rain" /></Field></div>
            <Button variant="primary" loading={busy} onClick={() => give(1)}><Plus size={14} />Bonus</Button>
            <Button variant="danger" loading={busy} onClick={() => give(-1)}><Minus size={14} />Deduct</Button>
          </div>
        </Card>
      )}
      {d.history.length === 0 ? <p className="text-sm text-faint">No points yet.</p> : (
        <Card className="divide-y divide-line">
          {d.history.map(e => (
            <div key={e.id} className={cx('flex items-center gap-3 px-4 py-2', e.voided && 'opacity-50')}>
              <span className={cx('w-12 shrink-0 font-display text-base font-semibold', e.points >= 0 ? 'text-grass' : 'text-danger', e.voided && 'line-through')}>{e.points >= 0 ? '+' : ''}{e.points}</span>
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{e.label}</span>{e.note && <span className="block truncate text-xs text-muted">{e.note}</span>}</span>
              <span className="shrink-0 text-xs text-faint">{fmtWhen(e.at)}</span>
              {canEdit && !e.voided && <button onClick={() => voidEvent(e.id)} className="shrink-0 text-xs font-semibold text-danger hover:underline">Void</button>}
              {e.voided && <Badge>Voided</Badge>}
            </div>
          ))}
        </Card>
      )}
    </div>
  )
}

function MessageTab({ row, canEdit }: { row: Row; canEdit: boolean }) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null)
  async function send() {
    setBusy(true); setMsg(null)
    const { error } = await supabase.rpc('staff_message_coach', { p_user: row.id, p_title: title, p_body: body })
    setBusy(false)
    if (error) return setMsg({ tone: 'bad', text: errMsg(error) })
    setTitle(''); setBody(''); setMsg({ tone: 'good', text: `Sent to ${row.name}. It appears in the coach's Updates and as a push notification if enabled.` })
  }
  if (!canEdit) return <p className="mt-4 text-sm text-faint">You can view coaches but not message them.</p>
  return (
    <Card className="mt-4 p-4" data-tour="message">
      <div className="label-caps mb-2 text-muted"><MessageSquare size={12} className="mr-1 inline" />Personal message</div>
      {msg && <div className="mb-3"><Alert tone={msg.tone}>{msg.text}</Alert></div>}
      <Field label="Title" required><Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Well done at the Rubavu camp" /></Field>
      <Field label="Message"><Textarea rows={4} value={body} onChange={e => setBody(e.target.value)} /></Field>
      <div className="mt-3 flex justify-end"><Button variant="primary" loading={busy} disabled={!title.trim()} onClick={send}>Send to coach</Button></div>
    </Card>
  )
}
