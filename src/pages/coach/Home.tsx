import { CalendarCheck, CalendarDays, Camera, ChevronRight, ClipboardList, MapPin, Package, Swords, Trophy, UserPlus } from 'lucide-react'
import { useAuth } from '../../lib/auth'
import { Card, cx } from '../../components/ui'
import { STAGE_T, useCoachPointsName, useFmt, useLocal, useT } from './i18n'
import { pendingInvites, useCoach } from './data'
import { MiniStat, Section, fmtTime, name, useGo } from './shared'
import { eligibleFor } from './Schedule'
import { ProgrammeStatusCard } from './Team'
import { NotifRow } from './CoachApp'

export default function HomeScreen() {
  const { profile, scoutingSeason } = useAuth()
  const { t, pick } = useT()
  const { academy, squad, standing, camps, schedule, sessions, matches, notifs, groups, preview, progress } = useCoach()
  const nav = useGo()
  const pn = useCoachPointsName()
  const F = useFmt()
  const L = useLocal()
  const invites = pendingInvites(squad)
  const campsWithRoom = camps.filter(c => eligibleFor(c, squad, groups).some(e => !e.already)).length
  const first = preview ? 'coach' : (profile?.full_name || profile?.username || '').split(' ')[0]
  const active = squad.filter(p => p.squad_status === 'active')
  const noPhoto = active.filter(p => !p.photo_path).length
  const today = new Date().toISOString().slice(0, 10)
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)
  const sessions30 = sessions.filter(s => s.held_on >= new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)).length
  const loggedThisWeek = sessions.some(s => s.held_on >= weekAgo)
  const toConfirm = schedule.filter(c => c.booking?.status === 'proposed' && c.booking.day_date && c.booking.day_date >= today)
  const next = schedule.filter(c => c.booking?.day_date && c.booking.day_date >= today).sort((a, b) => a.booking!.day_date!.localeCompare(b.booking!.day_date!))[0]
    ?? schedule.filter(c => c.starts_on && c.starts_on >= today && c.my_players > 0).sort((a, b) => a.starts_on!.localeCompare(b.starts_on!))[0]

  const actions: { key: string; icon: typeof Trophy; iconCls: string; title: string; sub?: string; to: string }[] = []
  for (const { player, item } of invites) actions.push({ key: item.id, icon: Trophy, iconCls: 'bg-royal-soft text-royal', title: `${name(player)} · ${pick(STAGE_T[item.stage])}`, sub: `${t('replyInvite')}${item.rsvp_deadline ? ` · ${t('replyBy')} ${F.date(item.rsvp_deadline, false)}` : ''}`, to: '/schedule' })
  for (const c of toConfirm) actions.push({ key: 'b' + c.id, icon: CalendarCheck, iconCls: 'bg-ink text-neon', title: t('confirmYourDay'), sub: `${c.name} · ${F.date(c.booking!.day_date!, false)}${c.booking!.report_time || c.booking!.start_time ? ` · ${fmtTime(c.booking!.report_time ?? c.booking!.start_time)}` : ''}`, to: '/schedule' })
  if (campsWithRoom > 0) actions.push({ key: 'open', icon: CalendarDays, iconCls: 'bg-neon text-ink', title: `${t('openCampsCta')}: ${campsWithRoom}`, to: '/schedule' })
  if (squad.length === 0) actions.push({ key: 'add', icon: UserPlus, iconCls: 'bg-ink text-neon', title: t('addPlayer'), sub: t('emptySquadHint'), to: '/team?add=1' })
  if (squad.length > 0 && !loggedThisWeek && !preview) actions.push({ key: 'log', icon: ClipboardList, iconCls: 'bg-grass-soft text-grass', title: t('logThisWeek'), sub: t('noSessionsHint'), to: '/team?tab=training' })
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
  if (squad.length >= 8 && !matches.some(m => m.played_on >= monthAgo) && !preview) actions.push({ key: 'match', icon: Swords, iconCls: 'bg-royal-soft text-royal', title: t('logMatch'), sub: t('noMatchesHint'), to: '/team?tab=matches' })
  if (academy && !academy.equipment_updated_at && squad.length > 0 && !preview) actions.push({ key: 'equip', icon: Package, iconCls: 'bg-paper text-muted', title: t('equipmentTitle'), sub: t('equipmentHint'), to: '/team?tab=academy' })
  if (academy && !academy.complete && !preview) actions.push({ key: 'acad', icon: MapPin, iconCls: 'bg-paper text-muted', title: t('completeAcademy'), sub: t('academyProfileHint'), to: '/team?tab=academy' })
  if (noPhoto > 0 && squad.length > 0 && !preview) actions.push({ key: 'photo', icon: Camera, iconCls: 'bg-paper text-muted', title: `${t('completeProfiles')}: ${noPhoto}`, sub: t('profileIncomplete'), to: '/team' })

  return (
    <div>
      <div className="label-caps text-royal">{t('coachPortal')} · {t('scoutingSeason')} {scoutingSeason?.label ?? ''}</div>
      <h1 className="mt-1 font-display text-[38px] font-semibold leading-none tracking-tight">{t('welcome')}, {first}</h1>
      {academy && (
        <div className="mt-2 flex items-center gap-1.5 text-[15px] text-muted">
          <MapPin size={15} className="shrink-0" />
          <span className="truncate"><b className="text-text">{academy.name}</b>{academy.district ? ` · ${academy.district}` : ''}{academy.region ? ` · ${academy.region}` : ''}</span>
        </div>
      )}

      <div className="mt-6 grid grid-cols-2 gap-3" data-tour="coach-stats">
        <MiniStat label={t('activeTeam')} value={active.length} onClick={() => nav('/team')} />
        <MiniStat label={t('sessions30')} value={sessions30} onClick={() => nav('/team?tab=training')} />
        <MiniStat label={t('selected')} value={standing?.selected ?? 0} accent sub={`${standing?.submitted ?? 0} ${t('submittedN')}`} />
        <MiniStat label={t('nextCamp')} value={next?.booking?.day_date ? new Date(next.booking.day_date + 'T00:00:00').getDate() : next?.starts_on ? new Date(next.starts_on + 'T00:00:00').getDate() : '—'}
          sub={next ? `${next.booking?.day_date ? F.month(next.booking.day_date) + ' · ' : next.starts_on ? F.month(next.starts_on) + ' · ' : ''}${next.name}` : t('noOpenCamps')} onClick={() => nav('/schedule')} />
      </div>

      <Section title={t('actionNeeded')}>
        <Card className="divide-y divide-line" data-tour="coach-actions">
          {actions.map(a => (
            <button key={a.key} onClick={() => nav(a.to)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-paper">
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${a.iconCls}`}><a.icon size={17} /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{a.title}</span>
                {a.sub && <span className="block truncate text-sm text-muted">{a.sub}</span>}
              </span>
              <ChevronRight size={18} className="text-faint" />
            </button>
          ))}
          {actions.length === 0 && <div className="px-4 py-4 text-sm text-muted">{t('allClear')}</div>}
        </Card>
      </Section>

      {progress && (
        <button onClick={() => nav('/progress')} data-tour="coach-progress" className="mt-7 flex w-full items-center gap-4 rounded-xl border border-ink bg-ink p-4 text-left text-white hover:border-neon">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-neon text-ink"><Trophy size={22} /></span>
          <span className="min-w-0 flex-1">
            <span className="label-caps block text-[11px] text-neon">{t('yourLevel')} · {L(progress.level).label}</span>
            <span className="mt-0.5 block font-display text-[26px] font-semibold leading-none">{progress.points} <span className="text-base font-medium text-white/60">{pn.many}</span></span>
            <span className="mt-1.5 block h-1.5 w-full overflow-hidden rounded-full bg-white/15">
              <span className={cx('block h-full rounded-full bg-neon')} style={{ width: `${progress.level.next ? Math.min(100, Math.round(((progress.points - progress.level.min_points) / (progress.level.next.min_points - progress.level.min_points)) * 100)) : 100}%` }} />
            </span>
            <span className="mt-1 block text-xs text-white/60">{progress.level.next ? `${progress.level.next.min_points - progress.points} ${pn.many} ${t('toNext')} ${L(progress.level.next).label}` : t('topLevel')}{progress.rank.province ? ` · ${t('rankProvince')} #${progress.rank.province}` : ''}</span>
          </span>
          <ChevronRight size={18} className="text-white/60" />
        </button>
      )}

      {academy && <div className="mt-7"><ProgrammeStatusCard academy={academy} /></div>}

      {notifs.length > 0 && (
        <Section title={t('latestUpdates')} action={<button onClick={() => nav('/updates')} className="text-sm font-semibold text-royal">{t('seeAll')}</button>}>
          <Card className="divide-y divide-line">
            {notifs.slice(0, 3).map(n => <NotifRow key={n.id} n={n} />)}
          </Card>
        </Section>
      )}
      {!progress && standing?.rank && <p className="mt-6 text-center text-xs text-muted">{t('provinceRank')}: #{standing.rank} {t('rankOf')} {standing.academies}{standing.region ? ` · ${standing.region}` : ''}</p>}
    </div>
  )
}
