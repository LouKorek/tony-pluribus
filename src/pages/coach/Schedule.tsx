import { useState } from 'react'
import { CalendarDays, Check, Clock, MapPin, Plus, Undo2, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { Alert, Badge, Button, Card, Empty, Field, Input, Modal, Textarea, cx } from '../../components/ui'
import { STAGE_T, STATUS_T, useFmt, useT } from './i18n'
import { groupOf, openInvites, useCoach, type Booking, type JourneyItem, type OpenCamp, type ScheduleCamp, type SquadPlayer } from './data'
import { JourneyBadge, ScreenTitle, Section, fmtTime, name } from './shared'

export function eligibleFor(c: { id: string; age_groups: string[] | null }, squad: SquadPlayer[], groups: ReturnType<typeof useCoach>['groups']) {
  return squad
    .filter(p => p.squad_status === 'active')
    .map(p => ({ player: p, group: groupOf(p.birth_year, groups), already: p.journey.some(j => j.camp_id === c.id) }))
    .filter(e => !groups.length || (e.group && (!c.age_groups?.length || c.age_groups.includes(e.group))))
}

const today = () => new Date().toISOString().slice(0, 10)

export default function ScheduleScreen() {
  const { t } = useT()
  const { schedule, squad, camps } = useCoach()
  const invites = openInvites(squad)
  const [submitTo, setSubmitTo] = useState<OpenCamp | null>(null)
  const d = today()
  const upcoming = schedule.filter(c => !c.starts_on || (c.ends_on ?? c.starts_on) >= d)
  const past = schedule.filter(c => c.starts_on && (c.ends_on ?? c.starts_on) < d)
  const withDay = upcoming.filter(c => c.booking?.day_id)
  const openCamps = camps   // district camps open for submissions (own + province), from coach_camps

  return (
    <div>
      <ScreenTitle title={t('schedule')} />

      {withDay.length > 0 && (
        <Section title={t('yourDay')} id="your-day">
          <div className="space-y-3">{withDay.map(c => <BookingCard key={c.id} camp={c} />)}</div>
        </Section>
      )}

      {invites.length > 0 && (
        <Section title={t('invitations')} id="invites">
          <div className="space-y-3">{invites.map(({ player, item }) => <InviteCard key={item.id} player={player} item={item} />)}</div>
        </Section>
      )}

      <Section title={t('openCamps')} id="open-camps">
        <p className="-mt-1 mb-3 text-sm text-muted">{t('openCampsHint')}</p>
        {openCamps.length === 0 ? (
          <Card><Empty icon={<CalendarDays size={20} />} title={t('noOpenCamps')}>{t('noOpenCampsHint')}</Empty></Card>
        ) : (
          <div className="space-y-3">{openCamps.map(c => <CampCard key={c.id} camp={c} onSubmit={() => setSubmitTo(c)} />)}</div>
        )}
      </Section>

      {upcoming.filter(c => !c.booking?.day_id && !openCamps.some(o => o.id === c.id)).length > 0 && (
        <Section title={t('upcoming')}>
          <Card className="divide-y divide-line">
            {upcoming.filter(c => !c.booking?.day_id && !openCamps.some(o => o.id === c.id)).map(c => <TimelineRow key={c.id} camp={c} />)}
          </Card>
        </Section>
      )}

      {past.length > 0 && (
        <Section title={t('past')}>
          <Card className="divide-y divide-line">{past.map(c => <TimelineRow key={c.id} camp={c} past />)}</Card>
        </Section>
      )}

      {submitTo && <SubmitModal camp={submitTo} onClose={() => setSubmitTo(null)} />}
    </div>
  )
}

function TimelineRow({ camp, past }: { camp: ScheduleCamp; past?: boolean }) {
  const F = useFmt()
  const { t, pick } = useT()
  return (
    <div className={cx('flex items-center gap-3 px-4 py-3', past && 'opacity-70')}>
      <div className="w-12 shrink-0 text-center">
        {camp.starts_on ? <><div className="font-display text-xl font-semibold leading-none">{new Date(camp.starts_on + 'T00:00:00').getDate()}</div><div className="text-[10px] font-semibold uppercase text-muted">{F.month(camp.starts_on)}</div></> : <Clock size={18} className="mx-auto text-faint" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold">{camp.name}</div>
        <div className="text-sm text-muted">{pick(STAGE_T[camp.stage])}{camp.venue ? ` · ${camp.venue}` : camp.district ? ` · ${camp.district}` : ''}{camp.my_players ? ` · ${camp.my_players} ${t('yourPlayersInCamp')}` : ''}</div>
      </div>
      {camp.booking?.status === 'arrived' && <Badge tone="good">{t('dayArrived')}</Badge>}
    </div>
  )
}

const statusTone: Record<Booking['status'], 'warn' | 'good' | 'info' | 'neutral'> = { proposed: 'warn', confirmed: 'good', change_requested: 'info', declined: 'neutral', arrived: 'good' }

function BookingCard({ camp }: { camp: ScheduleCamp }) {
  const F = useFmt()
  const { t, pick } = useT()
  const { reload, preview } = useCoach()
  const b = camp.booking!
  const [mode, setMode] = useState<'view' | 'change' | 'decline'>('view')
  const [note, setNote] = useState('')
  const [expected, setExpected] = useState(b.players_expected != null ? String(b.players_expected) : String(camp.my_players))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const label = { proposed: t('dayProposed'), confirmed: t('dayConfirmed'), change_requested: t('dayChangeRequested'), declined: t('dayDeclined'), arrived: t('dayArrived') }[b.status]
  async function answer(action: 'confirm' | 'change' | 'decline') {
    setBusy(true); setErr(null)
    const { error } = await supabase.rpc('coach_answer_booking', { p_booking: b.id, p_action: action, p_note: note || null, p_players_expected: expected ? +expected : null })
    setBusy(false)
    if (error) return setErr(error.message)
    setMode('view'); setNote(''); await reload()
  }
  return (
    <Card className={cx('overflow-hidden', b.status === 'proposed' && 'border-royal')}>
      <div className="flex items-start gap-4 p-4">
        <div className="shrink-0 rounded-xl bg-ink px-3 py-2 text-center text-white">
          <div className="font-display text-3xl font-semibold leading-none">{new Date(b.day_date! + 'T00:00:00').getDate()}</div>
          <div className="text-[10px] font-semibold uppercase text-neon">{F.dayMonth(b.day_date!)}</div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="label-caps text-[11px] text-royal">{pick(STAGE_T[camp.stage])}</div>
          <div className="font-display text-xl font-semibold leading-tight">{camp.name}</div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-muted">
            <span className="flex items-center gap-1"><Clock size={14} />{t('reportAt')} <b className="text-text">{fmtTime(b.report_time ?? b.start_time) || '—'}</b>{b.end_time ? ` – ${fmtTime(b.end_time)}` : ''}</span>
            {camp.venue && <span className="flex items-center gap-1"><MapPin size={14} />{camp.venue}</span>}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2"><Badge tone={statusTone[b.status]}>{label}</Badge><span className="text-sm text-muted">{camp.my_players} {t('yourPlayersInCamp')}</span></div>
          {b.staff_note && <div className="mt-2 rounded-lg border border-line bg-paper px-3 py-2 text-sm"><div className="label-caps mb-0.5 text-[10px] text-royal">{t('staffNote')}</div>{b.staff_note}</div>}
        </div>
      </div>
      {err && <div className="px-4 pb-3"><Alert>{err}</Alert></div>}
      {!preview && b.status !== 'arrived' && (
        <div className="border-t border-line bg-paper/60 px-4 py-3">
          {mode === 'view' ? (
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2 text-sm"><span className="text-muted">{t('playersExpected')}</span><Input inputMode="numeric" className="h-8 w-16" value={expected} onChange={e => setExpected(e.target.value.replace(/\D/g, ''))} /></div>
              <div className="ml-auto flex gap-2">
                {b.status !== 'confirmed' && <Button size="sm" variant="primary" loading={busy} onClick={() => answer('confirm')}><Check size={14} />{t('confirmDay')}</Button>}
                <Button size="sm" variant="secondary" onClick={() => setMode('change')}>{t('requestChange')}</Button>
                {b.status !== 'declined' && <Button size="sm" variant="ghost" onClick={() => setMode('decline')}><X size={14} />{t('cannotCome')}</Button>}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Field label={mode === 'change' ? t('changeNote') : t('reason')} required><Textarea rows={2} value={note} onChange={e => setNote(e.target.value)} autoFocus /></Field>
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => { setMode('view'); setErr(null) }}>{t('cancel')}</Button>
                <Button size="sm" variant={mode === 'decline' ? 'danger' : 'primary'} loading={busy} onClick={() => answer(mode)}>{mode === 'change' ? t('requestChange') : t('cannotCome')}</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}

function CampCard({ camp, onSubmit }: { camp: OpenCamp; onSubmit: () => void }) {
  const F = useFmt()
  const { t, pick } = useT()
  const { squad, reload, preview, schedule } = useCoach()
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const mine = squad.flatMap(p => p.journey.filter(j => j.camp_id === camp.id).map(j => ({ player: p, item: j })))
  const sc = schedule.find(s => s.id === camp.id)
  async function withdraw(id: string) {
    setBusy(id); setErr(null)
    const { error } = await supabase.rpc('coach_withdraw', { p_participant: id })
    if (error) setErr(error.message)
    await reload(); setBusy(null)
  }
  return (
    <Card className={cx('overflow-hidden', camp.own_district && 'border-ink')}>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {camp.own_district && <div className="mb-1"><Badge tone="neon">{t('yourDistrict')}</Badge></div>}
            <div className="font-display text-xl font-semibold leading-tight">{camp.name}</div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-muted">
              <span className="flex items-center gap-1"><CalendarDays size={14} />{camp.starts_on ? F.range(camp.starts_on, camp.ends_on) : t('dateTbc')}</span>
              {(camp.venue || camp.district) && <span className="flex items-center gap-1"><MapPin size={14} />{camp.venue || camp.district}</span>}
            </div>
            {!!camp.age_groups?.length && <div className="mt-2 flex gap-1">{camp.age_groups.map(g => <Badge key={g} tone="dark">{g}</Badge>)}</div>}
            {sc && !sc.booking?.day_id && mine.length > 0 && <p className="mt-2 text-xs text-muted">{t('noDayYet')}</p>}
          </div>
          {!preview && <Button variant="primary" size="sm" onClick={onSubmit}><Plus size={14} />{t('submitPlayers')}</Button>}
        </div>
        {err && <div className="mt-3"><Alert>{err}</Alert></div>}
      </div>
      {mine.length > 0 && (
        <div className="border-t border-line bg-paper/60 px-4 py-3">
          <div className="label-caps mb-1.5 text-[11px] text-muted">{t('yourSubmissions')} · {mine.length}</div>
          <ul className="space-y-1">
            {mine.map(({ player, item }) => (
              <li key={item.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate font-medium">{name(player)} <span className="text-muted">· {player.birth_year}</span></span>
                {item.status === 'submitted' && !preview
                  ? <button disabled={busy === item.id} onClick={() => withdraw(item.id)} className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-semibold text-muted hover:bg-danger-soft hover:text-danger disabled:opacity-50"><Undo2 size={12} />{t('withdraw')}</button>
                  : <Badge>{pick(STATUS_T[item.status])}</Badge>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  )
}

function SubmitModal({ camp, onClose }: { camp: OpenCamp; onClose: () => void }) {
  const { t } = useT()
  const { squad, groups, reload } = useCoach()
  const options = eligibleFor(camp, squad, groups)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const toggle = (id: string) => setPicked(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const free = options.filter(o => !o.already)
  async function submit() {
    setBusy(true); setErr(null)
    const { error } = await supabase.rpc('coach_submit', { p_camp: camp.id, p_players: [...picked], p_note: note })
    setBusy(false)
    if (error) { setErr(error.message); return }
    await reload(); onClose()
  }
  return (
    <Modal open onClose={onClose} title={`${t('submitTo')} ${camp.name}`}
      footer={<><Button variant="ghost" onClick={onClose}>{t('cancel')}</Button><Button variant="primary" loading={busy} disabled={!picked.size} onClick={submit}>{t('submitPlayers')}{picked.size ? ` (${picked.size})` : ''}</Button></>}>
      {err && <div className="mb-3"><Alert>{err}</Alert></div>}
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[13px] font-semibold">{t('chooseEligible')}{camp.age_groups?.length ? ` (${camp.age_groups.join(', ')})` : ''}</div>
        {free.length > 1 && <button className="text-xs font-semibold text-royal" onClick={() => setPicked(picked.size === free.length ? new Set() : new Set(free.map(o => o.player.id)))}>{picked.size === free.length ? t('clear') : t('selectAll')}</button>}
      </div>
      {options.length === 0 ? <p className="rounded-lg bg-paper px-3 py-4 text-sm text-muted">{t('noneEligible')}</p> : (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {options.map(({ player, group, already }) => (
            <li key={player.id}>
              <label className={cx('flex items-center gap-3 px-3 py-2.5', already ? 'opacity-50' : 'cursor-pointer hover:bg-paper')}>
                <input type="checkbox" disabled={already} checked={already || picked.has(player.id)} onChange={() => toggle(player.id)} className="h-4 w-4 accent-royal" />
                <span className="min-w-0 flex-1 truncate font-medium">{name(player)}</span>
                <span className="text-sm text-muted">{player.birth_year}{group ? ` · ${group}` : ''}</span>
                {already && <Badge>{t('alreadyIn')}</Badge>}
              </label>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4"><Field label={`${t('noteForScouts')} (${t('optional')})`}><Textarea rows={2} value={note} onChange={e => setNote(e.target.value)} /></Field></div>
    </Modal>
  )
}

function InviteCard({ player, item }: { player: SquadPlayer; item: JourneyItem }) {
  const F = useFmt()
  const { t, pick } = useT()
  const { reload, preview } = useCoach()
  const [mode, setMode] = useState<'view' | 'decline'>('view')
  const [editing, setEditing] = useState(item.status === 'invited')
  const [reason, setReason] = useState(item.absence_reason ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  async function answer(attend: boolean) {
    if (!attend && !reason.trim()) { setErr(t('reasonNeeded')); return }
    setBusy(true); setErr(null)
    const { error } = await supabase.rpc('coach_rsvp', { p_participant: item.id, p_attend: attend, p_reason: attend ? null : reason })
    setBusy(false)
    if (error) { setErr(error.message); return }
    setMode('view'); setEditing(false); await reload()
  }
  return (
    <Card className={cx('p-4', item.status === 'invited' && 'border-royal')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="label-caps text-[11px] text-royal">{pick(STAGE_T[item.stage])}</div>
          <div className="text-lg font-semibold leading-tight">{name(player)}</div>
          <div className="mt-0.5 text-sm text-muted">{item.camp}</div>
          <div className="mt-1 flex flex-wrap gap-x-3 text-sm text-muted">
            <span className="flex items-center gap-1"><CalendarDays size={14} />{item.starts_on ? F.range(item.starts_on, item.ends_on) : t('dateTbc')}</span>
            {item.venue && <span className="flex items-center gap-1"><MapPin size={14} />{item.venue}</span>}
          </div>
          {item.rsvp_deadline && item.status === 'invited' && <div className="mt-1 text-sm font-semibold text-royal">{t('replyBy')} {F.date(item.rsvp_deadline)}</div>}
        </div>
        {(item.status !== 'invited' || preview) && <JourneyBadge item={item} />}
      </div>
      {err && <div className="mt-3"><Alert>{err}</Alert></div>}
      {preview ? null : !editing ? (
        <div className="mt-3 flex items-center justify-between gap-2 text-sm">
          <span className="text-muted">{item.status === 'declined' && item.absence_reason ? `${t('reason')}: ${item.absence_reason}` : ''}</span>
          <button onClick={() => setEditing(true)} className="font-semibold text-royal">{t('change')}</button>
        </div>
      ) : mode === 'decline' ? (
        <div className="mt-3 space-y-2">
          <Field label={t('reason')} required><Input value={reason} onChange={e => setReason(e.target.value)} autoFocus /></Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => { setMode('view'); setErr(null) }}>{t('cancel')}</Button>
            <Button variant="danger" size="sm" loading={busy} onClick={() => answer(false)}>{t('cannotAttend')}</Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button variant="primary" loading={busy} onClick={() => answer(true)}><Check size={16} />{t('willAttend')}</Button>
          <Button variant="secondary" onClick={() => setMode('decline')}><X size={16} />{t('cannotAttend')}</Button>
        </div>
      )}
    </Card>
  )
}
