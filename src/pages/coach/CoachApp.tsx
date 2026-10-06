import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import {
  Bell, CalendarDays, Check, ChevronRight, CircleHelp, Home as HomeIcon, LogOut, MapPin, Plus, Printer, Share2, Trophy, Undo2, UserPlus, Users, X,
} from 'lucide-react'
import { useAuth } from '../../lib/auth'
import { supabase } from '../../lib/supabase'
import { fmtDate, fmtRange, POSITIONS } from '../../lib/scouting'
import { Alert, Badge, Button, Card, Drawer, Empty, Field, Input, Modal, SearchInput, Spinner, Textarea, cx } from '../../components/ui'
import { Brand } from '../../layouts/AppShell'
import { DECISION_T, LangProvider, STAGE_T, STATUS_T, useT } from './i18n'
import { TourProvider, useTour } from '../../lib/tour'
import { COACH_TOURS } from './tours'
import { CoachDataProvider, groupOf, openInvites, pendingInvites, useCoach, type JourneyItem, type OpenCamp, type SquadPlayer } from './data'

export default function CoachApp({ previewAcademy }: { previewAcademy?: string }) {
  return (
    <LangProvider>
      <CoachDataProvider previewAcademy={previewAcademy}>
        <CoachTours>
        <Shell>
          <Routes>
            <Route index element={<HomeScreen />} />
            <Route path="squad" element={<SquadScreen />} />
            <Route path="camps" element={<CampsScreen />} />
            <Route path="updates" element={<UpdatesScreen />} />
            <Route path="*" element={<Home404 />} />
          </Routes>
        </Shell>
        </CoachTours>
      </CoachDataProvider>
    </LangProvider>
  )
}

const name = (p: { first_name: string; last_name: string }) => `${p.first_name} ${p.last_name}`

/** Navigation that stays inside the portal, also when staff open it as a preview. */
function useGo() {
  const nav = useNavigate()
  const { base } = useCoach()
  return (path: string) => nav(base + path)
}
function Home404() {
  const { base } = useCoach()
  return <Navigate to={base || '/'} replace />
}

/* ───────────────────────── Guided tours ───────────────────────── */

function CoachTours({ children }: { children: ReactNode }) {
  const { profile } = useAuth()
  const { lang } = useT()
  const { base } = useCoach()
  const loc = useLocation()
  const rel = loc.pathname.slice(base.length) || '/'
  const screen = ({ '/': 'coach-home', '/squad': 'coach-squad', '/camps': 'coach-camps', '/updates': 'coach-updates' } as Record<string, string>)[rel] ?? null
  return (
    <TourProvider tours={COACH_TOURS} screen={screen} lang={lang} seen={profile?.tours_seen ?? []}
      onSeen={key => { supabase.rpc('tour_seen', { p_key: key }).then(() => {}) }}>
      {children}
    </TourProvider>
  )
}

function CoachHelp() {
  const { hasTour, start } = useTour()
  const { t } = useT()
  return (
    <button data-tour="help" onClick={() => start()} disabled={!hasTour} aria-label={t('tour')} title={t('tour')}
      className="rounded-md p-2 text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-30"><CircleHelp size={18} /></button>
  )
}

/* ───────────────────────── Shell ───────────────────────── */

function Shell({ children }: { children: ReactNode }) {
  const { signOut } = useAuth()
  const { t, lang, setLang } = useT()
  const { loading, error, notifs, squad, preview, base, academy } = useCoach()
  const unread = notifs.filter(n => !n.read_at).length
  const waiting = pendingInvites(squad).length
  const tabs = [
    { to: base || '/', label: t('home'), icon: HomeIcon, count: 0 },
    { to: base + '/squad', label: t('squad'), icon: Users, count: 0 },
    { to: base + '/camps', label: t('camps'), icon: CalendarDays, count: waiting },
    ...(preview ? [] : [{ to: '/updates', label: t('updates'), icon: Bell, count: unread }]),
  ]
  return (
    <div className="min-h-full bg-paper">
      {preview && (
        <div className="flex items-center justify-between gap-3 bg-lime px-4 py-2 text-sm text-ink">
          <span className="min-w-0 truncate"><b>Preview</b> · what the coach of {academy?.name ?? 'this academy'} sees · read only</span>
          <Link to="/scouting/academies" className="shrink-0 font-semibold underline">Back to Pluribus</Link>
        </div>
      )}
      <header className="sticky top-0 z-30 bg-ink text-white">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <Brand compact />
          <div className="flex items-center gap-1">
            <div data-tour="lang" className="mr-1 flex rounded-md bg-white/8 p-0.5 text-[12px] font-bold" role="group" aria-label={t('language')}>
              {(['en', 'rw'] as const).map(l => (
                <button key={l} onClick={() => setLang(l)} aria-pressed={lang === l}
                  className={cx('rounded px-2 py-1 uppercase', lang === l ? 'bg-lime text-ink' : 'text-white/60 hover:text-white')}>{l}</button>
              ))}
            </div>
            <CoachHelp />
            {!preview && <NavLink to="/updates" className="relative rounded-md p-2 text-white/70 hover:bg-white/10 hover:text-white" aria-label={t('updates')}>
              <Bell size={18} />
              {unread > 0 && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-lime" />}
            </NavLink>}
            {!preview && <button onClick={signOut} className="rounded-md p-2 text-white/60 hover:bg-white/10 hover:text-white" aria-label={t('signOut')} title={t('signOut')}><LogOut size={17} /></button>}
          </div>
        </div>
        <nav data-tour="coach-tabs" className="mx-auto hidden max-w-3xl gap-1 px-3 pb-2 sm:flex">
          {tabs.map(tb => (
            <NavLink key={tb.to} to={tb.to} end={tb.to === (base || '/')}
              className={({ isActive }) => cx('flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-semibold', isActive ? 'bg-lime text-ink' : 'text-white/70 hover:bg-white/8 hover:text-white')}>
              <tb.icon size={15} />{tb.label}
              {tb.count > 0 && <span className="rounded-full bg-red px-1.5 text-[11px] text-white">{tb.count}</span>}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-28 pt-6 sm:pb-12">
        {error && <div className="mb-4"><Alert>{error}</Alert></div>}
        {loading ? <Spinner /> : children}
      </main>

      <nav data-tour="coach-tabs" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card pb-[env(safe-area-inset-bottom)] sm:hidden">
        <div className={cx('grid', preview ? 'grid-cols-3' : 'grid-cols-4')}>
          {tabs.map(tb => (
            <NavLink key={tb.to} to={tb.to} end={tb.to === (base || '/')}
              className={({ isActive }) => cx('relative flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold', isActive ? 'text-red' : 'text-muted')}>
              <tb.icon size={20} />
              <span className="truncate">{tb.label}</span>
              {tb.count > 0 && <span className="absolute left-1/2 top-1.5 ml-2 rounded-full bg-red px-1.5 text-[10px] leading-4 text-white">{tb.count}</span>}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}

function ScreenTitle({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: ReactNode }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-3">
      <div className="min-w-0">
        {eyebrow && <div className="label-caps mb-1 text-red">{eyebrow}</div>}
        <h1 className="font-display text-[32px] font-bold uppercase leading-none tracking-tight">{title}</h1>
      </div>
      {action}
    </div>
  )
}

function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="mt-7">
      <div className="mb-2.5 flex items-center justify-between">
        <h2 className="label-caps text-muted">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

/* ───────────────────────── Status helpers ───────────────────────── */

function JourneyBadge({ item }: { item: JourneyItem | undefined }) {
  const { t, pick } = useT()
  if (!item) return <Badge>{t('inSquad')}</Badge>
  if (item.decision) {
    const tone = item.decision === 'selected' ? 'good' : item.decision === 'see_again' ? 'warn' : 'neutral'
    return <Badge tone={tone}>{pick(DECISION_T[item.decision])}</Badge>
  }
  const tone = item.status === 'invited' ? 'bad' : item.status === 'confirmed' ? 'info' : item.status === 'declined' || item.status === 'absent' ? 'neutral' : 'lime'
  return <Badge tone={tone}>{pick(STATUS_T[item.status])}{item.stage !== 'district' ? ' · ' + pick(STAGE_T[item.stage]) : ''}</Badge>
}

const lastItem = (p: SquadPlayer) => p.journey[p.journey.length - 1]

/* ───────────────────────── Home ───────────────────────── */

function HomeScreen() {
  const { profile, scoutingSeason } = useAuth()
  const { t, pick } = useT()
  const { academy, squad, standing, camps, notifs, groups, preview } = useCoach()
  const nav = useGo()
  const invites = pendingInvites(squad)
  const campsWithRoom = camps.filter(c => eligibleFor(c, squad, groups).some(e => !e.already)).length
  const first = preview ? 'coach' : (profile?.full_name || profile?.username || '').split(' ')[0]

  return (
    <div>
      <div className="label-caps text-red">{t('coachPortal')} · {t('scoutingSeason')} {scoutingSeason?.label ?? ''}</div>
      <h1 className="mt-1 font-display text-[38px] font-bold uppercase leading-none tracking-tight">{t('welcome')}, {first}</h1>
      {academy && (
        <div className="mt-2 flex items-center gap-1.5 text-[15px] text-muted">
          <MapPin size={15} className="shrink-0" />
          <span className="truncate"><b className="text-text">{academy.name}</b>{academy.district ? ` · ${academy.district.name}` : ''}{academy.district?.region ? ` · ${academy.district.region.name}` : ''}</span>
        </div>
      )}

      <div className="mt-6 grid grid-cols-2 gap-3" data-tour="coach-stats">
        <MiniStat label={t('playersInSquad')} value={squad.length} />
        <MiniStat label={t('submitted')} value={standing?.submitted ?? 0} />
        <MiniStat label={t('selected')} value={standing?.selected ?? 0} accent />
        <MiniStat label={t('provinceRank')} value={standing?.rank ? `#${standing.rank}` : '—'}
          sub={standing?.rank ? `${t('rankOf')} ${standing.academies}` : t('noRankYet')} />
      </div>

      <Section title={t('actionNeeded')}>
        <Card className="divide-y divide-line" data-tour="coach-actions">
          {invites.map(({ player, item }) => (
            <button key={item.id} onClick={() => nav('/camps')} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-paper">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-soft text-red"><Trophy size={17} /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{name(player)} · {pick(STAGE_T[item.stage])}</span>
                <span className="block truncate text-sm text-muted">{t('replyInvite')}{item.rsvp_deadline ? ` · ${t('replyBy')} ${fmtDate(item.rsvp_deadline, false)}` : ''}</span>
              </span>
              <ChevronRight size={18} className="text-faint" />
            </button>
          ))}
          {campsWithRoom > 0 && (
            <button onClick={() => nav('/camps')} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-paper">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-lime text-ink"><CalendarDays size={17} /></span>
              <span className="min-w-0 flex-1 font-semibold">{t('openCampsCta')}: {campsWithRoom}</span>
              <ChevronRight size={18} className="text-faint" />
            </button>
          )}
          {squad.length === 0 && (
            <button onClick={() => nav('/squad?add=1')} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-paper">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink text-lime"><UserPlus size={17} /></span>
              <span className="min-w-0 flex-1"><span className="block font-semibold">{t('addPlayer')}</span><span className="block text-sm text-muted">{t('emptySquadHint')}</span></span>
              <ChevronRight size={18} className="text-faint" />
            </button>
          )}
          {!invites.length && !campsWithRoom && squad.length > 0 && <div className="px-4 py-4 text-sm text-muted">{t('allClear')}</div>}
        </Card>
      </Section>

      {notifs.length > 0 && (
        <Section title={t('latestUpdates')} action={<button onClick={() => nav('/updates')} className="text-sm font-semibold text-red">{t('seeAll')}</button>}>
          <Card className="divide-y divide-line">
            {notifs.slice(0, 3).map(n => <NotifRow key={n.id} n={n} />)}
          </Card>
        </Section>
      )}
    </div>
  )
}

function MiniStat({ label, value, sub, accent }: { label: string; value: ReactNode; sub?: string; accent?: boolean }) {
  return (
    <Card className={cx('p-4', accent && 'border-ink bg-ink text-white')}>
      <div className={cx('label-caps text-[11px]', accent ? 'text-lime' : 'text-muted')}>{label}</div>
      <div className="mt-1 font-display text-[40px] font-bold leading-none">{value}</div>
      {sub && <div className={cx('mt-1 text-xs', accent ? 'text-white/60' : 'text-muted')}>{sub}</div>}
    </Card>
  )
}

/* ───────────────────────── Squad ───────────────────────── */

function SquadScreen() {
  const { t } = useT()
  const { squad, groups, preview } = useCoach()
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<SquadPlayer | 'new' | null>(params.get('add') ? 'new' : null)
  const openId = params.get('player')
  const open = squad.find(p => p.id === openId) ?? null
  const setOpen = (id: string | null) => setParams(id ? { player: id } : {}, { replace: true })

  const list = useMemo(() => {
    const s = q.trim().toLowerCase()
    return squad.filter(p => !s || name(p).toLowerCase().includes(s))
  }, [squad, q])

  return (
    <div>
      <ScreenTitle title={t('squad')} action={!preview && <Button data-tour="add-player" variant="primary" onClick={() => setEditing('new')}><Plus size={16} />{t('addPlayer')}</Button>} />
      {squad.length > 6 && <SearchInput value={q} onChange={setQ} placeholder={t('search')} className="mb-3" />}
      {squad.length === 0 ? (
        <Card><Empty icon={<Users size={20} />} title={t('emptySquad')}>{t('emptySquadHint')}</Empty></Card>
      ) : (
        <Card className="divide-y divide-line" data-tour="squad-list">
          {list.map(p => {
            const g = groupOf(p.birth_year, groups)
            return (
              <button key={p.id} onClick={() => setOpen(p.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-paper">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink font-display text-sm font-bold uppercase text-lime">{p.first_name[0]}{p.last_name[0]}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{name(p)}</span>
                  <span className="flex items-center gap-1.5 text-sm text-muted">
                    {p.birth_year}
                    {g ? <span className="font-semibold text-text">· {g}</span> : groups.length > 0 && <span className="text-warn">· {t('outsideAge')}</span>}
                    {p.positions && <span className="truncate">· {p.positions}</span>}
                  </span>
                </span>
                <JourneyBadge item={lastItem(p)} />
              </button>
            )
          })}
        </Card>
      )}

      <PlayerDrawer player={open} onClose={() => setOpen(null)} onEdit={p => setEditing(p)} />
      {editing && <PlayerForm player={editing === 'new' ? null : editing} onClose={() => { setEditing(null); if (params.get('add')) setParams({}, { replace: true }) }} />}
    </div>
  )
}

function PlayerForm({ player, onClose }: { player: SquadPlayer | null; onClose: () => void }) {
  const { t } = useT()
  const { reload } = useCoach()
  const [f, setF] = useState({
    first_name: player?.first_name ?? '', last_name: player?.last_name ?? '', birth_year: player?.birth_year ? String(player.birth_year) : '',
    birth_date: player?.birth_date ?? '', positions: player?.positions ?? '', preferred_foot: player?.preferred_foot ?? '',
    guardian_name: player?.guardian_name ?? '', guardian_phone: player?.guardian_phone ?? '', guardian_consent: player?.guardian_consent ?? false,
    coach_notes: player?.coach_notes ?? '',
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const set = (k: keyof typeof f, v: string | boolean) => setF(s => ({ ...s, [k]: v }))
  const pos = f.positions ? f.positions.split(',').map(s => s.trim()).filter(Boolean) : []
  const togglePos = (p: string) => set('positions', (pos.includes(p) ? pos.filter(x => x !== p) : [...pos, p]).join(', '))

  async function save() {
    setErr(null)
    if (!f.first_name.trim() || !f.last_name.trim() || !/^\d{4}$/.test(f.birth_year)) { setErr(`${t('firstName')}, ${t('lastName')}, ${t('birthYear')}`); return }
    setBusy(true)
    const payload = { ...f, birth_year: f.birth_date ? f.birth_date.slice(0, 4) : f.birth_year }
    const { error } = await supabase.rpc('coach_save_player', { p_id: player?.id ?? null, p: payload })
    setBusy(false)
    if (error) { setErr(error.message); return }
    await reload()
    onClose()
  }

  return (
    <Modal open onClose={onClose} title={player ? t('editPlayer') : t('addPlayer')}
      footer={<><Button variant="ghost" onClick={onClose}>{t('cancel')}</Button><Button variant="primary" loading={busy} onClick={save}>{t('save')}</Button></>}>
      <div className="space-y-4">
        {err && <Alert>{err}</Alert>}
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('firstName')} required><Input value={f.first_name} onChange={e => set('first_name', e.target.value)} autoFocus /></Field>
          <Field label={t('lastName')} required><Input value={f.last_name} onChange={e => set('last_name', e.target.value)} /></Field>
          <Field label={t('birthYear')} required><Input inputMode="numeric" maxLength={4} value={f.birth_year} onChange={e => set('birth_year', e.target.value.replace(/\D/g, ''))} placeholder="2014" /></Field>
          <Field label={`${t('birthDate')} (${t('optional')})`}><Input type="date" value={f.birth_date} onChange={e => set('birth_date', e.target.value)} /></Field>
        </div>
        <div>
          <div className="mb-1.5 text-[13px] font-semibold">{t('positions')}</div>
          <div className="flex flex-wrap gap-1.5">
            {POSITIONS.map(p => (
              <button key={p} type="button" onClick={() => togglePos(p)} aria-pressed={pos.includes(p)}
                className={cx('h-8 min-w-11 rounded-md border px-2 text-sm font-semibold', pos.includes(p) ? 'border-ink bg-ink text-lime' : 'border-line-2 bg-card text-muted hover:text-text')}>{p}</button>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-1.5 text-[13px] font-semibold">{t('foot')}</div>
          <div className="flex gap-1.5">
            {(['left', 'right', 'both'] as const).map(o => (
              <button key={o} type="button" onClick={() => set('preferred_foot', f.preferred_foot === o ? '' : o)} aria-pressed={f.preferred_foot === o}
                className={cx('h-9 flex-1 rounded-md border text-sm font-semibold', f.preferred_foot === o ? 'border-ink bg-ink text-lime' : 'border-line-2 bg-card text-muted hover:text-text')}>{t(o)}</button>
            ))}
          </div>
        </div>
        <div className="rounded-lg border border-line bg-paper/60 p-3">
          <div className="text-[13px] font-semibold">{t('guardian')} <span className="font-normal text-muted">({t('optional')})</span></div>
          <div className="mt-0.5 text-xs text-muted">{t('guardianHint')}</div>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={t('guardianName')}><Input value={f.guardian_name} onChange={e => set('guardian_name', e.target.value)} /></Field>
            <Field label={t('guardianPhone')}><Input type="tel" inputMode="tel" value={f.guardian_phone} onChange={e => set('guardian_phone', e.target.value)} placeholder="07…" /></Field>
          </div>
          <label className="mt-3 flex items-start gap-2 text-sm">
            <input type="checkbox" checked={f.guardian_consent} onChange={e => set('guardian_consent', e.target.checked)} className="mt-0.5 h-4 w-4 accent-red" />
            {t('guardianConsent')}
          </label>
        </div>
        <Field label={`${t('notes')} (${t('optional')})`}><Textarea rows={2} value={f.coach_notes} onChange={e => set('coach_notes', e.target.value)} /></Field>
      </div>
    </Modal>
  )
}

function PlayerDrawer({ player, onClose, onEdit }: { player: SquadPlayer | null; onClose: () => void; onEdit: (p: SquadPlayer) => void }) {
  const { t, pick } = useT()
  const { groups, reload, preview } = useCoach()
  const [confirm, setConfirm] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [cert, setCert] = useState<JourneyItem | null>(null)
  useEffect(() => { setConfirm(false); setErr(null) }, [player?.id])
  if (!player) return <Drawer open={false} onClose={onClose} title=""><span /></Drawer>
  const g = groupOf(player.birth_year, groups)

  async function remove() {
    const { error } = await supabase.rpc('coach_remove_player', { p_id: player!.id })
    if (error) { setErr(error.message); setConfirm(false); return }
    await reload(); onClose()
  }

  return (
    <Drawer open onClose={onClose} width={520}
      title={name(player)}
      subtitle={<span>{player.birth_year}{g ? ` · ${g}` : ''}{player.positions ? ` · ${player.positions}` : ''}</span>}
      footer={preview ? undefined :
        <div className="flex w-full items-center justify-between gap-2">
          {player.journey.length === 0 ? (confirm
            ? <div className="flex items-center gap-2"><span className="text-sm">{t('removeConfirm')}</span><Button size="sm" variant="danger" onClick={remove}>{t('yesRemove')}</Button></div>
            : <Button size="sm" variant="ghost" onClick={() => setConfirm(true)}>{t('remove')}</Button>) : <span />}
          <Button variant="dark" onClick={() => onEdit(player)}>{t('edit')}</Button>
        </div>
      }>
      {err && <div className="mb-4"><Alert>{err}</Alert></div>}

      <h3 className="label-caps mb-3 text-muted">{t('journey')}</h3>
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
                  <div className="label-caps mb-0.5 text-[10px] text-red">{t('messageFromStaff')}</div>
                  {j.message}
                </div>
              )}
              {j.decision === 'selected' && (
                <Button size="sm" className="mt-2" onClick={() => setCert(j)}><Trophy size={14} />{t('certificate')}</Button>
              )}
            </li>
          ))}
        </ol>
      )}

      <h3 className="label-caps mb-2 mt-7 text-muted">{t('details')}</h3>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        <dt className="text-muted">{t('birthDate')}</dt><dd>{player.birth_date ? fmtDate(player.birth_date) : '—'}</dd>
        <dt className="text-muted">{t('foot')}</dt><dd>{player.preferred_foot ? t(player.preferred_foot) : '—'}</dd>
        <dt className="text-muted">{t('guardianName')}</dt><dd>{player.guardian_name || '—'}</dd>
        <dt className="text-muted">{t('guardianPhone')}</dt><dd>{player.guardian_phone ? <a className="text-red" href={`tel:${player.guardian_phone}`}>{player.guardian_phone}</a> : '—'}</dd>
        <dt className="text-muted">{t('notes')}</dt><dd className="whitespace-pre-wrap">{player.coach_notes || '—'}</dd>
      </dl>

      {cert && <Certificate player={player} item={cert} onClose={() => setCert(null)} />}
    </Drawer>
  )
}

function Certificate({ player, item, onClose }: { player: SquadPlayer; item: JourneyItem; onClose: () => void }) {
  const { t } = useT()
  const { academy } = useCoach()
  const text = `${name(player)} (${academy?.name ?? ''}) has been selected at the ${STAGE_T[item.stage][0]}: ${item.camp}. Tony Football Excellence Programme × SL Benfica.`
  const canShare = typeof navigator !== 'undefined' && !!navigator.share
  return (
    <Modal open onClose={onClose} title={t('certificate')} wide
      footer={<>
        {canShare && <Button onClick={() => navigator.share({ title: t('certificate'), text }).catch(() => {})}><Share2 size={15} />{t('share')}</Button>}
        <Button variant="primary" onClick={() => window.print()}><Printer size={15} />{t('print')}</Button>
      </>}>
      <div className="print-area overflow-hidden rounded-xl bg-ink p-6 text-white sm:p-9">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/brand/tony.png" alt="Tony" className="h-5" />
            <span className="h-6 w-px bg-white/20" />
            <img src="/brand/benfica.png" alt="SL Benfica" className="h-9 w-9" />
          </div>
          <div className="label-caps text-[11px] text-white/50">TFEP Rwanda</div>
        </div>
        <div className="mt-10 label-caps text-lime">Certificate of selection</div>
        <div className="mt-2 font-display text-[44px] font-bold uppercase leading-[.95] sm:text-[56px]">{name(player)}</div>
        <div className="mt-3 text-[15px] text-white/75">{academy?.name}{academy?.district ? ` · ${academy.district.name}` : ''}</div>
        <div className="mt-8 border-t border-white/15 pt-5 text-[15px] leading-relaxed text-white/85">
          has been <b className="text-lime">selected</b> at the {STAGE_T[item.stage][0].toLowerCase()}
          <div className="font-semibold text-white">{item.camp}{item.starts_on ? ` · ${fmtRange(item.starts_on, item.ends_on)}` : ''}</div>
        </div>
        <div className="mt-8 flex items-end justify-between gap-4 text-xs text-white/50">
          <span>Tony Football Excellence Programme<br />in partnership with SL Benfica</span>
          <span className="h-1.5 w-16 rounded-full bg-red" />
        </div>
      </div>
    </Modal>
  )
}

/* ───────────────────────── Camps ───────────────────────── */

function eligibleFor(c: OpenCamp, squad: SquadPlayer[], groups: ReturnType<typeof useCoach>['groups']) {
  return squad
    .map(p => ({ player: p, group: groupOf(p.birth_year, groups), already: p.journey.some(j => j.camp_id === c.id) }))
    .filter(e => !groups.length || (e.group && (!c.age_groups?.length || c.age_groups.includes(e.group))))
}

function CampsScreen() {
  const { t } = useT()
  const { camps, squad } = useCoach()
  const invites = openInvites(squad)
  const [submitTo, setSubmitTo] = useState<OpenCamp | null>(null)

  return (
    <div>
      <ScreenTitle title={t('camps')} />

      {invites.length > 0 && (
        <Section title={t('invitations')}>
          <div className="space-y-3" data-tour="invites">{invites.map(({ player, item }) => <InviteCard key={item.id} player={player} item={item} />)}</div>
        </Section>
      )}

      <div data-tour="open-camps"><Section title={t('openCamps')}>
        <p className="-mt-1 mb-3 text-sm text-muted">{t('openCampsHint')}</p>
        {camps.length === 0 ? (
          <Card><Empty icon={<CalendarDays size={20} />} title={t('noOpenCamps')}>{t('noOpenCampsHint')}</Empty></Card>
        ) : (
          <div className="space-y-3">{camps.map(c => <CampCard key={c.id} camp={c} onSubmit={() => setSubmitTo(c)} />)}</div>
        )}
      </Section></div>

      {submitTo && <SubmitModal camp={submitTo} onClose={() => setSubmitTo(null)} />}
    </div>
  )
}

function CampCard({ camp, onSubmit }: { camp: OpenCamp; onSubmit: () => void }) {
  const { t, pick } = useT()
  const { squad, reload, preview } = useCoach()
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const mine = squad.flatMap(p => p.journey.filter(j => j.camp_id === camp.id).map(j => ({ player: p, item: j })))

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
            {camp.own_district && <div className="mb-1"><Badge tone="lime">{t('yourDistrict')}</Badge></div>}
            <div className="font-display text-xl font-bold uppercase leading-tight">{camp.name}</div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-muted">
              <span className="flex items-center gap-1"><CalendarDays size={14} />{camp.starts_on ? fmtRange(camp.starts_on, camp.ends_on) : t('dateTbc')}</span>
              {(camp.venue || camp.district) && <span className="flex items-center gap-1"><MapPin size={14} />{camp.venue || camp.district}</span>}
            </div>
            {!!camp.age_groups?.length && <div className="mt-2 flex gap-1">{camp.age_groups.map(g => <Badge key={g} tone="dark">{g}</Badge>)}</div>}
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
                  ? <button disabled={busy === item.id} onClick={() => withdraw(item.id)} className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-semibold text-muted hover:bg-red-soft hover:text-red disabled:opacity-50"><Undo2 size={12} />{t('withdraw')}</button>
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
        {free.length > 1 && <button className="text-xs font-semibold text-red" onClick={() => setPicked(picked.size === free.length ? new Set() : new Set(free.map(o => o.player.id)))}>{picked.size === free.length ? t('clear') : t('selectAll')}</button>}
      </div>
      {options.length === 0 ? <p className="rounded-lg bg-paper px-3 py-4 text-sm text-muted">{t('noneEligible')}</p> : (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {options.map(({ player, group, already }) => (
            <li key={player.id}>
              <label className={cx('flex items-center gap-3 px-3 py-2.5', already ? 'opacity-50' : 'cursor-pointer hover:bg-paper')}>
                <input type="checkbox" disabled={already} checked={already || picked.has(player.id)} onChange={() => toggle(player.id)} className="h-4 w-4 accent-red" />
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
    <Card className={cx('p-4', item.status === 'invited' && 'border-red')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="label-caps text-[11px] text-red">{pick(STAGE_T[item.stage])}</div>
          <div className="text-lg font-semibold leading-tight">{name(player)}</div>
          <div className="mt-0.5 text-sm text-muted">{item.camp}</div>
          <div className="mt-1 flex flex-wrap gap-x-3 text-sm text-muted">
            <span className="flex items-center gap-1"><CalendarDays size={14} />{item.starts_on ? fmtRange(item.starts_on, item.ends_on) : t('dateTbc')}</span>
            {item.venue && <span className="flex items-center gap-1"><MapPin size={14} />{item.venue}</span>}
          </div>
          {item.rsvp_deadline && item.status === 'invited' && <div className="mt-1 text-sm font-semibold text-red">{t('replyBy')} {fmtDate(item.rsvp_deadline)}</div>}
        </div>
        {(item.status !== 'invited' || preview) && <JourneyBadge item={item} />}
      </div>
      {err && <div className="mt-3"><Alert>{err}</Alert></div>}
      {preview ? null : !editing ? (
        <div className="mt-3 flex items-center justify-between gap-2 text-sm">
          <span className="text-muted">{item.status === 'declined' && item.absence_reason ? `${t('reason')}: ${item.absence_reason}` : ''}</span>
          <button onClick={() => setEditing(true)} className="font-semibold text-red">{t('change')}</button>
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
          <Button variant="dark" loading={busy} onClick={() => answer(true)}><Check size={16} />{t('willAttend')}</Button>
          <Button variant="secondary" onClick={() => setMode('decline')}><X size={16} />{t('cannotAttend')}</Button>
        </div>
      )}
    </Card>
  )
}

/* ───────────────────────── Updates ───────────────────────── */

function UpdatesScreen() {
  const { t } = useT()
  const { notifs, markRead } = useCoach()
  // Keep the "new" marks visible while the screen is open, then mark everything read in the background.
  const unreadAtOpen = useRef(new Set(notifs.filter(n => !n.read_at).map(n => n.id)))
  useEffect(() => { if (unreadAtOpen.current.size) markRead() }, [markRead])
  return (
    <div>
      <ScreenTitle title={t('updates')} />
      {notifs.length === 0 ? (
        <Card><Empty icon={<Bell size={20} />} title={t('noUpdates')}>{t('noUpdatesHint')}</Empty></Card>
      ) : (
        <Card className="divide-y divide-line" data-tour="updates">{notifs.map(n => <NotifRow key={n.id} n={n} fresh={unreadAtOpen.current.has(n.id)} />)}</Card>
      )}
    </div>
  )
}

function NotifRow({ n, fresh }: { n: ReturnType<typeof useCoach>['notifs'][number]; fresh?: boolean }) {
  const nav = useGo()
  const go = () => {
    if (!n.link) return
    if (n.link === 'invites') nav('/camps')
    else if (n.link.startsWith('player:')) nav(`/squad?player=${n.link.slice(7)}`)
  }
  const isNew = fresh ?? !n.read_at
  return (
    <button onClick={go} className={cx('flex w-full gap-3 px-4 py-3 text-left', n.link ? 'hover:bg-paper' : 'cursor-default')}>
      <span className={cx('mt-1.5 h-2 w-2 shrink-0 rounded-full', isNew ? 'bg-red' : 'bg-transparent')} />
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{n.title}</span>
        {n.body && <span className="block whitespace-pre-line text-sm text-muted">{n.body}</span>}
        <span className="mt-0.5 block text-xs text-faint">{fmtDate(n.created_at.slice(0, 10))}</span>
      </span>
      {n.link && <ChevronRight size={18} className="mt-1 shrink-0 text-faint" />}
    </button>
  )
}
