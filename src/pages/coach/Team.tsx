import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Camera, CalendarCheck, ImageOff, MapPin, Plus, Printer, Share2, Trash2, Trophy, Users } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { Bolts, Logo, usePartner, useTagline } from '../../lib/brand'
import { fmtDate, fmtRange, POSITIONS } from '../../lib/scouting'
import { Alert, Badge, Button, Card, Drawer, Empty, Field, Input, Modal, SearchInput, Select, Textarea, cx, printArea } from '../../components/ui'
import { STAGE_T, useT } from './i18n'
import { groupOf, uploadPhoto, useCoach, type JourneyItem, type LogItem, type MyAcademy, type Session, type SquadPlayer } from './data'
import { Avatar, JourneyBadge, PendingDot, ScreenTitle, SubTabs, lastItem, name } from './shared'

type Tab = 'players' | 'training' | 'academy'

export default function TeamScreen() {
  const { t } = useT()
  const { squad, sessions, academy, preview } = useCoach()
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab) || 'players'
  const setTab = (v: Tab) => setParams(p => { const n = new URLSearchParams(p); n.set('tab', v); n.delete('player'); n.delete('add'); return n }, { replace: true })
  const [editing, setEditing] = useState<SquadPlayer | 'new' | null>(params.get('add') ? 'new' : null)
  const [logging, setLogging] = useState<Session | 'new' | null>(null)
  const active = squad.filter(p => p.squad_status === 'active').length
  const action = preview ? null
    : tab === 'players' ? <Button data-tour="add-player" variant="primary" onClick={() => setEditing('new')}><Plus size={16} />{t('addPlayer')}</Button>
    : tab === 'training' ? <Button data-tour="log-session" variant="primary" onClick={() => setLogging('new')}><Plus size={16} />{t('logSession')}</Button>
    : null
  return (
    <div>
      <ScreenTitle title={t('team')} eyebrow={academy?.name} action={action} />
      <SubTabs id="team-tabs" value={tab} onChange={setTab} items={[['players', t('players'), active], ['training', t('training'), sessions.length], ['academy', t('academy')]]} />
      {tab === 'players' && <PlayersPanel onEdit={setEditing} />}
      {tab === 'training' && <TrainingPanel onEdit={setLogging} />}
      {tab === 'academy' && <AcademyPanel />}
      {editing && <PlayerForm player={editing === 'new' ? null : editing} onClose={() => { setEditing(null); if (params.get('add')) setParams(p => { const n = new URLSearchParams(p); n.delete('add'); return n }, { replace: true }) }} />}
      {logging && <SessionForm session={logging === 'new' ? null : logging} onClose={() => setLogging(null)} />}
    </div>
  )
}

/* ───────────────────────── Players ───────────────────────── */

function PlayersPanel({ onEdit }: { onEdit: (p: SquadPlayer) => void }) {
  const { t } = useT()
  const { squad, groups } = useCoach()
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState('')
  const openId = params.get('player')
  const open = squad.find(p => p.id === openId) ?? null
  const setOpen = (id: string | null) => setParams(p => { const n = new URLSearchParams(p); if (id) n.set('player', id); else n.delete('player'); return n }, { replace: true })
  const list = useMemo(() => { const s = q.trim().toLowerCase(); return squad.filter(p => !s || name(p).toLowerCase().includes(s)) }, [squad, q])
  const incomplete = squad.filter(p => p.squad_status === 'active' && !p.photo_path).length

  return (
    <div>
      {squad.length > 6 && <SearchInput value={q} onChange={setQ} placeholder={t('search')} className="mb-3" />}
      {incomplete > 0 && squad.length > 0 && <p className="mb-3 text-sm text-muted">{t('completeProfiles')}: <b className="text-text">{incomplete}</b> · {t('profileIncomplete')}</p>}
      {squad.length === 0 ? (
        <Card><Empty icon={<Users size={20} />} title={t('emptySquad')}>{t('emptySquadHint')}</Empty></Card>
      ) : (
        <Card className="divide-y divide-line" data-tour="squad-list">
          {list.map(p => {
            const g = groupOf(p.birth_year, groups)
            return (
              <button key={p.id} onClick={() => setOpen(p.id)} className={cx('flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-paper', p.squad_status !== 'active' && 'opacity-60')}>
                <Avatar player={p} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5"><span className="truncate font-semibold">{name(p)}</span>{p.shirt_no != null && <span className="rounded bg-paper px-1 text-[11px] font-bold text-muted">#{p.shirt_no}</span>}{p.pending && <PendingDot />}</span>
                  <span className="flex items-center gap-1.5 text-sm text-muted">
                    {p.birth_year}
                    {g ? <span className="font-semibold text-text">· {g}</span> : groups.length > 0 && <span className="text-warn">· {t('outsideAge')}</span>}
                    {p.positions && <span className="truncate">· {p.positions}</span>}
                  </span>
                </span>
                {p.squad_status !== 'active' ? <Badge tone="neutral">{p.squad_status === 'left' ? t('statusLeft') : t('statusUnavailable')}</Badge> : <JourneyBadge item={lastItem(p)} />}
              </button>
            )
          })}
        </Card>
      )}
      <PlayerDrawer player={open} onClose={() => setOpen(null)} onEdit={onEdit} />
    </div>
  )
}

function PhotoPicker({ url, onFile, onClear, label, busy, round = true }: { url: string | null; onFile: (f: File) => void; onClear?: () => void; label: string; busy?: boolean; round?: boolean }) {
  const { t } = useT()
  const input = useRef<HTMLInputElement>(null)
  return (
    <div className="flex items-center gap-3">
      <button type="button" onClick={() => input.current?.click()} disabled={busy}
        className={cx('relative flex shrink-0 items-center justify-center overflow-hidden border-2 border-dashed border-line-2 bg-paper text-muted hover:border-text/40', round ? 'h-20 w-20 rounded-full' : 'h-20 w-28 rounded-lg')}>
        {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : <Camera size={22} />}
        {busy && <span className="absolute inset-0 flex items-center justify-center bg-white/70 text-xs font-semibold">…</span>}
      </button>
      <div className="text-sm">
        <div className="font-semibold">{label}</div>
        <div className="mt-1 flex gap-3">
          <button type="button" onClick={() => input.current?.click()} className="font-semibold text-royal">{url ? t('changePhoto') : t('addPhoto')}</button>
          {url && onClear && <button type="button" onClick={onClear} className="text-muted hover:text-danger">{t('removePhoto')}</button>}
        </div>
      </div>
      <input ref={input} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = '' }} />
    </div>
  )
}

function PlayerForm({ player, onClose }: { player: SquadPlayer | null; onClose: () => void }) {
  const { t } = useT()
  const { reload, academy, photoUrl } = useCoach()
  const [f, setF] = useState({
    first_name: player?.first_name ?? '', last_name: player?.last_name ?? '', birth_year: player?.birth_year ? String(player.birth_year) : '',
    birth_date: player?.birth_date ?? '', positions: player?.positions ?? '', preferred_foot: player?.preferred_foot ?? '',
    guardian_name: player?.guardian_name ?? '', guardian_phone: player?.guardian_phone ?? '', guardian_consent: player?.guardian_consent ?? false,
    coach_notes: player?.coach_notes ?? '', shirt_no: player?.shirt_no != null ? String(player.shirt_no) : '', height_cm: player?.height_cm != null ? String(player.height_cm) : '',
    weight_kg: player?.weight_kg != null ? String(player.weight_kg) : '', school: player?.school ?? '', sector: player?.sector ?? '', joined_year: player?.joined_year ? String(player.joined_year) : '',
    squad_status: player?.squad_status ?? 'active', photo_path: player?.photo_path ?? '',
  })
  const [localPhoto, setLocalPhoto] = useState<string | null>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const set = (k: keyof typeof f, v: string | boolean) => setF(s => ({ ...s, [k]: v }))
  const pos = f.positions ? f.positions.split(',').map(s => s.trim()).filter(Boolean) : []
  const togglePos = (p: string) => set('positions', (pos.includes(p) ? pos.filter(x => x !== p) : [...pos, p]).join(', '))

  async function save() {
    setErr(null)
    if (!f.first_name.trim() || !f.last_name.trim() || !/^\d{4}$/.test(f.birth_year)) { setErr(`${t('firstName')}, ${t('lastName')}, ${t('birthYear')}`); return }
    setBusy(true)
    try {
      let photo_path = f.photo_path
      const payload = { ...f, birth_year: f.birth_date ? f.birth_date.slice(0, 4) : f.birth_year }
      // the phone chooses the id of a new player, so the photo can be named after it even without network
      const id = player?.id ?? crypto.randomUUID()
      const { error } = await supabase.rpc('coach_save_player', { p_id: id, p: { ...payload, photo_path } })
      if (error) throw error
      if (pendingFile && academy) {
        photo_path = await uploadPhoto(academy.id, pendingFile, 'player', id)
        const { error: e2 } = await supabase.rpc('coach_save_player', { p_id: id, p: { ...payload, photo_path } })
        if (e2) throw e2
      }
      await reload(); onClose()
    } catch (e) { setErr((e as Error).message?.includes('upload') || (e as { statusCode?: string }).statusCode ? t('uploadFailed') : (e as Error).message) }
    setBusy(false)
  }

  return (
    <Modal open onClose={onClose} title={player ? t('editPlayer') : t('addPlayer')}
      footer={<><Button variant="ghost" onClick={onClose}>{t('cancel')}</Button><Button variant="primary" loading={busy} onClick={save}>{t('save')}</Button></>}>
      <div className="space-y-4">
        {err && <Alert>{err}</Alert>}
        <PhotoPicker url={localPhoto ?? photoUrl(f.photo_path || null)} label={t('photo')} busy={busy}
          onFile={file => { setPendingFile(file); setLocalPhoto(URL.createObjectURL(file)) }}
          onClear={() => { setPendingFile(null); setLocalPhoto(null); set('photo_path', '') }} />
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('firstName')} required><Input value={f.first_name} onChange={e => set('first_name', e.target.value)} autoFocus={!player} /></Field>
          <Field label={t('lastName')} required><Input value={f.last_name} onChange={e => set('last_name', e.target.value)} /></Field>
          <Field label={t('birthYear')} required><Input inputMode="numeric" maxLength={4} value={f.birth_year} onChange={e => set('birth_year', e.target.value.replace(/\D/g, ''))} placeholder="2014" /></Field>
          <Field label={`${t('birthDate')} (${t('optional')})`}><Input type="date" value={f.birth_date} onChange={e => set('birth_date', e.target.value)} /></Field>
        </div>
        <div>
          <div className="mb-1.5 text-[13px] font-semibold">{t('positions')}</div>
          <div className="flex flex-wrap gap-1.5">
            {POSITIONS.map(p => (
              <button key={p} type="button" onClick={() => togglePos(p)} aria-pressed={pos.includes(p)}
                className={cx('h-8 min-w-11 rounded-md border px-2 text-sm font-semibold', pos.includes(p) ? 'border-ink bg-ink text-neon' : 'border-line-2 bg-card text-muted hover:text-text')}>{p}</button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label={t('foot')}>
            <div className="flex gap-1">
              {(['left', 'right', 'both'] as const).map(o => (
                <button key={o} type="button" onClick={() => set('preferred_foot', f.preferred_foot === o ? '' : o)} aria-pressed={f.preferred_foot === o}
                  className={cx('h-10 flex-1 rounded-md border text-xs font-semibold', f.preferred_foot === o ? 'border-ink bg-ink text-neon' : 'border-line-2 bg-card text-muted hover:text-text')}>{t(o)}</button>
              ))}
            </div>
          </Field>
          <Field label={t('shirtNo')}><Input inputMode="numeric" maxLength={2} value={f.shirt_no} onChange={e => set('shirt_no', e.target.value.replace(/\D/g, ''))} /></Field>
          <Field label={t('height')}><Input inputMode="decimal" value={f.height_cm} onChange={e => set('height_cm', e.target.value.replace(/[^\d.]/g, ''))} placeholder="152" /></Field>
          <Field label={t('weight')}><Input inputMode="decimal" value={f.weight_kg} onChange={e => set('weight_kg', e.target.value.replace(/[^\d.]/g, ''))} placeholder="42" /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={`${t('school')} (${t('optional')})`}><Input value={f.school} onChange={e => set('school', e.target.value)} /></Field>
          <Field label={`${t('sector')} (${t('optional')})`}><Input value={f.sector} onChange={e => set('sector', e.target.value)} /></Field>
          <Field label={t('joinedYear')}><Input inputMode="numeric" maxLength={4} value={f.joined_year} onChange={e => set('joined_year', e.target.value.replace(/\D/g, ''))} placeholder={String(new Date().getFullYear())} /></Field>
          {player && <Field label={t('squadStatus')}>
            <Select value={f.squad_status} onChange={e => set('squad_status', e.target.value)}>
              <option value="active">{t('statusActive')}</option><option value="unavailable">{t('statusUnavailable')}</option><option value="left">{t('statusLeft')}</option>
            </Select>
          </Field>}
        </div>
        <div className="rounded-lg border border-line bg-paper/60 p-3">
          <div className="text-[13px] font-semibold">{t('guardian')} <span className="font-normal text-muted">({t('optional')})</span></div>
          <div className="mt-0.5 text-xs text-muted">{t('guardianHint')}</div>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={t('guardianName')}><Input value={f.guardian_name} onChange={e => set('guardian_name', e.target.value)} /></Field>
            <Field label={t('guardianPhone')}><Input type="tel" inputMode="tel" value={f.guardian_phone} onChange={e => set('guardian_phone', e.target.value)} placeholder="07…" /></Field>
          </div>
          <label className="mt-3 flex items-start gap-2 text-sm">
            <input type="checkbox" checked={f.guardian_consent} onChange={e => set('guardian_consent', e.target.checked)} className="mt-0.5 h-4 w-4 accent-royal" />
            {t('guardianConsent')}
          </label>
        </div>
        <Field label={`${t('notes')} (${t('optional')})`}><Textarea rows={2} value={f.coach_notes} onChange={e => set('coach_notes', e.target.value)} /></Field>
      </div>
    </Modal>
  )
}

const KINDS: [LogItem['kind'], string][] = [['note', 'noteKindNote'], ['match', 'noteKindMatch'], ['absent', 'noteKindAbsent'], ['injury', 'noteKindInjury']]

function PlayerDrawer({ player, onClose, onEdit }: { player: SquadPlayer | null; onClose: () => void; onEdit: (p: SquadPlayer) => void }) {
  const { t, pick } = useT()
  const { groups, reload, preview, photoUrl } = useCoach()
  const [confirm, setConfirm] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [cert, setCert] = useState<JourneyItem | null>(null)
  const [note, setNote] = useState('')
  const [kind, setKind] = useState<LogItem['kind']>('note')
  const [busy, setBusy] = useState(false)
  useEffect(() => { setConfirm(false); setErr(null); setNote('') }, [player?.id])
  if (!player) return <Drawer open={false} onClose={onClose} title=""><span /></Drawer>
  const g = groupOf(player.birth_year, groups)
  const url = photoUrl(player.photo_path)

  async function remove() {
    const { error } = await supabase.rpc('coach_remove_player', { p_id: player!.id })
    if (error) { setErr(error.message); setConfirm(false); return }
    await reload(); onClose()
  }
  async function addNote() {
    if (!note.trim()) return
    setBusy(true); setErr(null)
    const { error } = await supabase.rpc('coach_log_player', { p_player: player!.id, p_kind: kind, p_text: note })
    setBusy(false)
    if (error) return setErr(error.message)
    setNote(''); await reload()
  }
  async function delNote(id: string) { await supabase.rpc('coach_delete_log', { p_id: id }); await reload() }

  return (
    <Drawer open onClose={onClose} width={540}
      title={name(player)}
      subtitle={<span>{player.birth_year}{g ? ` · ${g}` : ''}{player.positions ? ` · ${player.positions}` : ''}{player.shirt_no != null ? ` · #${player.shirt_no}` : ''}</span>}
      footer={preview ? undefined :
        <div className="flex w-full items-center justify-between gap-2">
          {player.journey.length === 0 ? (confirm
            ? <div className="flex items-center gap-2"><span className="text-sm">{t('removeConfirm')}</span><Button size="sm" variant="danger" onClick={remove}>{t('yesRemove')}</Button></div>
            : <Button size="sm" variant="ghost" onClick={() => setConfirm(true)}>{t('remove')}</Button>) : <span />}
          <Button variant="primary" onClick={() => onEdit(player)}>{t('edit')}</Button>
        </div>
      }>
      {err && <div className="mb-4"><Alert>{err}</Alert></div>}

      <div className="flex items-center gap-4">
        {url ? <img src={url} alt="" className="h-24 w-24 rounded-xl object-cover" /> : <div className="flex h-24 w-24 items-center justify-center rounded-xl bg-paper text-faint"><ImageOff size={22} /></div>}
        <div className="grid flex-1 grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-paper p-2"><div className="font-display text-2xl font-semibold leading-none">{player.height_cm ?? '—'}</div><div className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-muted">cm</div></div>
          <div className="rounded-lg bg-paper p-2"><div className="font-display text-2xl font-semibold leading-none">{player.weight_kg ?? '—'}</div><div className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-muted">kg</div></div>
          <div className="rounded-lg bg-paper p-2"><div className="font-display text-2xl font-semibold leading-none">{player.sessions}</div><div className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-muted">{t('sessionsLast90')}</div></div>
        </div>
      </div>
      {player.squad_status !== 'active' && <div className="mt-3"><Badge tone="neutral">{player.squad_status === 'left' ? t('statusLeft') : t('statusUnavailable')}</Badge></div>}

      <h3 className="label-caps mb-3 mt-6 text-muted">{t('journey')}</h3>
      {player.journey.length === 0 ? <p className="text-sm text-muted">{t('noJourney')}</p> : (
        <ol className="relative ml-2 border-l-2 border-line">
          {player.journey.map(j => (
            <li key={j.id} className="relative mb-5 pl-5 last:mb-0">
              <span className={cx('absolute -left-[7px] top-1 h-3 w-3 rounded-full border-2 border-card',
                j.decision === 'selected' ? 'bg-good' : j.decision === 'see_again' ? 'bg-warn' : j.decision ? 'bg-faint' : 'bg-ink')} />
              <div className="label-caps text-[11px] text-muted">{pick(STAGE_T[j.stage])} · {j.starts_on ? fmtRange(j.starts_on, j.ends_on) : t('dateTbc')}</div>
              <div className="font-semibold">{j.camp}</div>
              {j.venue && <div className="text-sm text-muted">{j.venue}</div>}
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <JourneyBadge item={j} />
                {!j.decision && ['attended'].includes(j.status) && <span className="text-xs text-muted">{t('waitingResult')}</span>}
              </div>
              {j.absence_reason && <div className="mt-1 text-sm text-muted">{t('reason')}: {j.absence_reason}</div>}
              {j.message && (
                <div className="mt-2 rounded-lg border border-line bg-paper px-3 py-2 text-sm">
                  <div className="label-caps mb-0.5 text-[10px] text-royal">{t('messageFromStaff')}</div>
                  {j.message}
                </div>
              )}
              {j.decision === 'selected' && <Button size="sm" className="mt-2" onClick={() => setCert(j)}><Trophy size={14} />{t('certificate')}</Button>}
            </li>
          ))}
        </ol>
      )}

      <h3 className="label-caps mb-2 mt-7 text-muted">{t('playerLog')}</h3>
      {!preview && (
        <div className="mb-3 rounded-lg border border-line bg-paper/60 p-3">
          <div className="mb-2 flex flex-wrap gap-1">
            {KINDS.map(([k, l]) => <button key={k} type="button" onClick={() => setKind(k)} aria-pressed={kind === k} className={cx('h-7 rounded-md border px-2 text-xs font-semibold', kind === k ? 'border-ink bg-ink text-neon' : 'border-line-2 bg-card text-muted')}>{t(l as 'noteKindNote')}</button>)}
          </div>
          <div className="flex gap-2">
            <Input value={note} onChange={e => setNote(e.target.value)} placeholder={t('addNote')} onKeyDown={e => { if (e.key === 'Enter') addNote() }} />
            <Button variant="primary" size="md" loading={busy} disabled={!note.trim()} onClick={addNote}><Plus size={15} /></Button>
          </div>
        </div>
      )}
      {player.log.length === 0 ? <p className="text-sm text-muted">{t('noLog')}</p> : (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {player.log.map(l => (
            <li key={l.id} className="flex items-start gap-2 px-3 py-2 text-sm">
              <Badge tone={l.kind === 'match' ? 'info' : l.kind === 'absent' || l.kind === 'injury' ? 'warn' : 'neutral'}>{t(KINDS.find(k => k[0] === l.kind)?.[1] as 'noteKindNote' ?? 'noteKindNote')}</Badge>
              <span className="min-w-0 flex-1"><span className="block">{l.text}</span><span className="text-xs text-faint">{fmtDate(l.at.slice(0, 10))}</span></span>
              {!preview && <button onClick={() => delNote(l.id)} className="rounded p-1 text-faint hover:text-danger" aria-label="Delete"><Trash2 size={13} /></button>}
            </li>
          ))}
        </ul>
      )}

      <h3 className="label-caps mb-2 mt-7 text-muted">{t('details')}</h3>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        <dt className="text-muted">{t('birthDate')}</dt><dd>{player.birth_date ? fmtDate(player.birth_date) : '—'}</dd>
        <dt className="text-muted">{t('foot')}</dt><dd>{player.preferred_foot ? t(player.preferred_foot) : '—'}</dd>
        <dt className="text-muted">{t('school')}</dt><dd>{player.school || '—'}</dd>
        <dt className="text-muted">{t('sector')}</dt><dd>{player.sector || '—'}</dd>
        <dt className="text-muted">{t('joinedYear')}</dt><dd>{player.joined_year ?? '—'}</dd>
        <dt className="text-muted">{t('measured')}</dt><dd>{player.measured_on ? fmtDate(player.measured_on) : '—'}</dd>
        <dt className="text-muted">{t('guardianName')}</dt><dd>{player.guardian_name || '—'}</dd>
        <dt className="text-muted">{t('guardianPhone')}</dt><dd>{player.guardian_phone ? <a className="text-royal" href={`tel:${player.guardian_phone}`}>{player.guardian_phone}</a> : '—'}</dd>
        <dt className="text-muted">{t('notes')}</dt><dd className="whitespace-pre-wrap">{player.coach_notes || '—'}</dd>
      </dl>

      {cert && <Certificate player={player} item={cert} onClose={() => setCert(null)} />}
    </Drawer>
  )
}

export function Certificate({ player, item, onClose }: { player: SquadPlayer; item: JourneyItem; onClose: () => void }) {
  const { t } = useT()
  const { academy } = useCoach()
  const { project } = useAuth()
  const partner = usePartner('certificates')
  const tagline = useTagline()
  const programme = project?.name ?? 'Tony'
  const text = `${name(player)} (${academy?.name ?? ''}) has been selected at the ${STAGE_T[item.stage][0]}: ${item.camp}. ${programme}${partner ? ' × ' + partner.name : ''}.`
  const canShare = typeof navigator !== 'undefined' && !!navigator.share
  return (
    <Modal open onClose={onClose} title={t('certificate')} wide
      footer={<>
        {canShare && <Button onClick={() => navigator.share({ title: t('certificate'), text }).catch(() => {})}><Share2 size={15} />{t('share')}</Button>}
        <Button variant="primary" onClick={printArea}><Printer size={15} />{t('print')}</Button>
      </>}>
      <div className="print-area relative overflow-hidden rounded-2xl bg-ink p-6 text-white sm:p-9">
        <Bolts className="absolute inset-0 h-full w-full" width={800} height={600} stroke="rgba(255,255,255,.1)" />
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Logo variant="wordmark" color="neon" className="h-5" />
            {partner?.logo && <><span className="h-6 w-px bg-white/20" /><img src={partner.logo} alt={partner.name} className="h-9 w-9" /></>}
          </div>
          <div className="label-caps text-[11px] text-white/50">{programme}</div>
        </div>
        <div className="relative mt-10 label-caps text-neon">Certificate of selection</div>
        <div className="relative mt-2 font-display text-[44px] font-semibold leading-[.95] sm:text-[56px]">{name(player)}</div>
        <div className="relative mt-3 text-[15px] text-white/75">{academy?.name}{academy?.district ? ` · ${academy.district}` : ''}</div>
        <div className="relative mt-8 border-t border-white/15 pt-5 text-[15px] leading-relaxed text-white/85">
          has been <b className="text-neon">selected</b> at the {STAGE_T[item.stage][0].toLowerCase()}
          <div className="font-semibold text-white">{item.camp}{item.starts_on ? ` · ${fmtRange(item.starts_on, item.ends_on)}` : ''}</div>
        </div>
        <div className="relative mt-8 flex items-end justify-between gap-4 text-xs text-white/50">
          <span>{tagline}{partner ? <><br />in partnership with {partner.name}</> : <><br />{programme}</>}</span>
          <Logo variant="emblem" color="neon" className="h-10 opacity-90" />
        </div>
      </div>
    </Modal>
  )
}

/* ───────────────────────── Training ───────────────────────── */

const TOPICS: [string, string][] = [['Technique', 'topicTechnique'], ['Tactics', 'topicTactics'], ['Fitness', 'topicFitness'], ['Match', 'topicMatch'], ['Other', 'topicOther']]

function TrainingPanel({ onEdit }: { onEdit: (s: Session) => void }) {
  const { t } = useT()
  const { sessions, squad, preview, reload } = useCoach()
  const active = squad.filter(p => p.squad_status === 'active').length
  const [del, setDel] = useState<string | null>(null)
  async function remove(id: string) { await supabase.rpc('coach_delete_session', { p_id: id }); setDel(null); await reload() }
  const topicLabel = (s: string | null) => { const k = TOPICS.find(x => x[0] === s)?.[1]; return k ? t(k as 'topicTechnique') : s ?? '' }
  if (sessions.length === 0) return <Card><Empty icon={<CalendarCheck size={20} />} title={t('noSessions')}>{t('noSessionsHint')}</Empty></Card>
  return (
    <Card className="divide-y divide-line" data-tour="sessions">
      {sessions.map(s => (
        <div key={s.id} className="flex items-center gap-3 px-4 py-3">
          <div className="w-12 shrink-0 text-center"><div className="font-display text-xl font-semibold leading-none">{new Date(s.held_on + 'T00:00:00').getDate()}</div><div className="text-[10px] font-semibold uppercase text-muted">{new Date(s.held_on + 'T00:00:00').toLocaleDateString('en-GB', { month: 'short' })}</div></div>
          <button className="min-w-0 flex-1 text-left" onClick={() => !preview && onEdit(s)} disabled={preview}>
            <div className="flex items-center gap-1.5"><span className="truncate font-semibold">{topicLabel(s.topic) || t('training')}{s.duration_min ? <span className="font-normal text-muted"> · {s.duration_min} min</span> : ''}</span>{s.pending && <PendingDot />}</div>
            <div className="text-sm text-muted">{s.present}/{active} {t('present')}{s.notes ? ` · ${s.notes}` : ''}</div>
          </button>
          <div className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-black/8"><div className="h-full bg-grass" style={{ width: `${active ? Math.min(100, Math.round((s.present / active) * 100)) : 0}%` }} /></div>
          {!preview && (del === s.id
            ? <Button size="sm" variant="danger" onClick={() => remove(s.id)}>{t('deleteSession')}</Button>
            : <button onClick={() => setDel(s.id)} className="rounded p-1.5 text-faint hover:text-danger" aria-label={t('deleteSession')}><Trash2 size={14} /></button>)}
        </div>
      ))}
    </Card>
  )
}

function SessionForm({ session, onClose }: { session: Session | null; onClose: () => void }) {
  const { t } = useT()
  const { squad, reload } = useCoach()
  const active = squad.filter(p => p.squad_status === 'active')
  const today = new Date().toISOString().slice(0, 10)
  const [f, setF] = useState({ held_on: session?.held_on ?? today, topic: session?.topic ?? 'Technique', duration_min: session?.duration_min ? String(session.duration_min) : '90', notes: session?.notes ?? '' })
  const [present, setPresent] = useState<Set<string>>(new Set(session?.players ?? active.map(p => p.id)))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const toggle = (id: string) => setPresent(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  async function save() {
    setBusy(true); setErr(null)
    const { error } = await supabase.rpc('coach_save_session', { p_id: session?.id ?? crypto.randomUUID(), p: { ...f, players: [...present] } })
    setBusy(false)
    if (error) return setErr(error.message)
    await reload(); onClose()
  }
  return (
    <Modal open onClose={onClose} title={session ? t('editSession') : t('logSession')}
      footer={<><Button variant="ghost" onClick={onClose}>{t('cancel')}</Button><Button variant="primary" loading={busy} onClick={save}>{t('save')}</Button></>}>
      <div className="space-y-4">
        {err && <Alert>{err}</Alert>}
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('sessionDay')} required><Input type="date" max={today} value={f.held_on} onChange={e => setF({ ...f, held_on: e.target.value })} /></Field>
          <Field label={t('duration')}><Input inputMode="numeric" value={f.duration_min} onChange={e => setF({ ...f, duration_min: e.target.value.replace(/\D/g, '') })} /></Field>
        </div>
        <div>
          <div className="mb-1.5 text-[13px] font-semibold">{t('topic')}</div>
          <div className="flex flex-wrap gap-1.5">
            {TOPICS.map(([k, l]) => <button key={k} type="button" onClick={() => setF({ ...f, topic: k })} aria-pressed={f.topic === k} className={cx('h-8 rounded-md border px-3 text-sm font-semibold', f.topic === k ? 'border-ink bg-ink text-neon' : 'border-line-2 bg-card text-muted hover:text-text')}>{t(l as 'topicTechnique')}</button>)}
          </div>
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between"><span className="text-[13px] font-semibold">{t('attendance')} · {present.size}/{active.length}</span>
            <button type="button" className="text-xs font-semibold text-royal" onClick={() => setPresent(present.size === active.length ? new Set() : new Set(active.map(p => p.id)))}>{present.size === active.length ? t('clear') : t('selectAll')}</button></div>
          <ul className="grid max-h-72 grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2">
            {active.map(p => (
              <li key={p.id}>
                <label className={cx('flex cursor-pointer items-center gap-2 rounded-lg border px-2 py-1.5 text-sm', present.has(p.id) ? 'border-ink bg-ink/5' : 'border-line')}>
                  <input type="checkbox" className="h-4 w-4 accent-royal" checked={present.has(p.id)} onChange={() => toggle(p.id)} />
                  <Avatar player={p} size={26} /><span className="truncate font-medium">{name(p)}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
        <Field label={`${t('notes')} (${t('optional')})`}><Textarea rows={2} value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} /></Field>
      </div>
    </Modal>
  )
}

/* ───────────────────────── Academy ───────────────────────── */

const DAYS: [string, 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'][] = [['Mon', 'mon'], ['Tue', 'tue'], ['Wed', 'wed'], ['Thu', 'thu'], ['Fri', 'fri'], ['Sat', 'sat'], ['Sun', 'sun']]

export function ProgrammeStatusCard({ academy, compact }: { academy: MyAcademy; compact?: boolean }) {
  const { t } = useT()
  const s = academy.programme_status
  const tone = s === 'official' ? 'good' : s === 'partner' ? 'info' : s === 'observed' ? 'neon' : 'neutral'
  return (
    <Card className={cx('p-4', !compact && 'border-ink bg-ink text-white')} data-tour="programme-status">
      <div className={cx('label-caps text-[11px]', compact ? 'text-muted' : 'text-neon')}>{t('programmeStatus')}</div>
      <div className="mt-1.5 flex items-center gap-2"><Badge tone={tone}>{t(`st_${s}` as 'st_registered')}</Badge></div>
      <p className={cx('mt-2 text-sm', compact ? 'text-muted' : 'text-white/75')}>{t(`st_${s}_hint` as 'st_registered_hint')}</p>
    </Card>
  )
}

function AcademyPanel() {
  const { t } = useT()
  const { academy, groups, reload, preview, photoUrl } = useCoach()
  const [f, setF] = useState(() => ({ contact_name: academy?.contact_name ?? '', contact_phone: academy?.contact_phone ?? '', venue: academy?.venue ?? '', training_days: academy?.training_days ?? [], training_time: academy?.training_time ?? '', players_count: academy?.players_count != null ? String(academy.players_count) : '', age_groups: academy?.age_groups ?? [], photo_path: academy?.photo_path ?? '' }))
  const [localPhoto, setLocalPhoto] = useState<string | null>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null)
  if (!academy) return null
  const toggle = (k: 'training_days' | 'age_groups', v: string) => setF(s => ({ ...s, [k]: s[k].includes(v) ? s[k].filter(x => x !== v) : [...s[k], v] }))
  async function save() {
    setBusy(true); setMsg(null)
    try {
      let photo_path = f.photo_path
      if (pendingFile) photo_path = await uploadPhoto(academy!.id, pendingFile, 'academy', academy!.id)
      const { error } = await supabase.rpc('coach_save_academy', { p: { ...f, photo_path } })
      if (error) throw error
      setPendingFile(null); await reload(); setMsg({ tone: 'good', text: t('done') })
    } catch (e) { setMsg({ tone: 'bad', text: (e as Error).message }) }
    setBusy(false)
  }
  return (
    <div className="space-y-4">
      <ProgrammeStatusCard academy={academy} />
      <Card className="p-4" data-tour="academy-profile">
        <div className="flex items-start justify-between gap-3">
          <div><div className="font-semibold">{t('academyProfile')}</div><p className="mt-0.5 text-sm text-muted">{t('academyProfileHint')}</p></div>
          {!preview && <Button variant="primary" size="sm" loading={busy} onClick={save}>{t('save')}</Button>}
        </div>
        <div className="mt-2 flex items-center gap-1.5 text-sm text-muted"><MapPin size={14} /> {academy.name}{academy.district ? ` · ${academy.district}` : ''}{academy.region ? ` · ${academy.region}` : ''}</div>
        <div className="mt-4 space-y-4">
          <PhotoPicker round={false} url={localPhoto ?? photoUrl(f.photo_path || null)} label={t('teamPhoto')} busy={busy}
            onFile={file => { setPendingFile(file); setLocalPhoto(URL.createObjectURL(file)) }} onClear={() => { setPendingFile(null); setLocalPhoto(null); setF({ ...f, photo_path: '' }) }} />
          <Field label={t('venue')}><Input value={f.venue} onChange={e => setF({ ...f, venue: e.target.value })} disabled={preview} /></Field>
          <div>
            <div className="mb-1.5 text-[13px] font-semibold">{t('trainingDays')}</div>
            <div className="flex flex-wrap gap-1.5">{DAYS.map(([k, l]) => <button key={k} type="button" disabled={preview} onClick={() => toggle('training_days', k)} aria-pressed={f.training_days.includes(k)} className={cx('h-9 w-12 rounded-md border text-sm font-semibold', f.training_days.includes(k) ? 'border-ink bg-ink text-neon' : 'border-line-2 bg-card text-muted hover:text-text')}>{t(l)}</button>)}</div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('trainingTime')}><Input value={f.training_time} onChange={e => setF({ ...f, training_time: e.target.value })} placeholder="16:00" disabled={preview} /></Field>
            <Field label={t('playersCount')}><Input inputMode="numeric" value={f.players_count} onChange={e => setF({ ...f, players_count: e.target.value.replace(/\D/g, '') })} disabled={preview} /></Field>
          </div>
          <div>
            <div className="mb-1.5 text-[13px] font-semibold">{t('ageGroupsLabel')}</div>
            <div className="flex flex-wrap gap-1.5">{(groups.length ? groups.map(g => g.code) : ['U11', 'U13', 'U15', 'U17']).map(g => <button key={g} type="button" disabled={preview} onClick={() => toggle('age_groups', g)} aria-pressed={f.age_groups.includes(g)} className={cx('h-9 rounded-md border px-3 text-sm font-semibold', f.age_groups.includes(g) ? 'border-ink bg-ink text-neon' : 'border-line-2 bg-card text-muted hover:text-text')}>{g}</button>)}</div>
          </div>
          <Field label={t('contactPhone')}><Input type="tel" value={f.contact_phone} onChange={e => setF({ ...f, contact_phone: e.target.value })} placeholder="07…" disabled={preview} /></Field>
          {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
        </div>
      </Card>
    </div>
  )
}
