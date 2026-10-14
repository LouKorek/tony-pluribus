import { useState } from 'react'
import { Award, CalendarCheck, Camera, CheckCheck, ChevronDown, ChevronUp, ClipboardList, Clock, Crown, Eye, Flame, Goal, Hand, IdCard, Lock, Medal, Package, ShieldCheck, Shirt, Sparkles, Star, Swords, Tent, Trophy, UserPlus, Users, UsersRound, type LucideIcon } from 'lucide-react'
import { fmtDate } from '../../lib/scouting'
import { Card, Empty, cx } from '../../components/ui'
import { useT } from './i18n'
import { useCoach, type BadgeInfo, type Rule } from './data'
import { useGeo, usePointsName } from '../../lib/brand'
import { ScreenTitle, Section } from './shared'

const ICONS: Record<string, LucideIcon> = { 'user-plus': UserPlus, users: Users, camera: Camera, flame: Flame, star: Star, trophy: Trophy, medal: Medal, crown: Crown, clock: Clock, award: Award, 'id-card': IdCard, 'shield-check': ShieldCheck, shirt: Shirt, 'users-round': UsersRound, package: Package, 'clipboard-list': ClipboardList, sparkles: Sparkles, hand: Hand, 'check-check': CheckCheck, swords: Swords, goal: Goal, tent: Tent, eye: Eye, 'calendar-check': CalendarCheck }

export default function ProgressScreen() {
  const { t } = useT()
  const { progress, academy } = useCoach()
  const geo = useGeo()
  const pn = usePointsName()
  const [allHistory, setAllHistory] = useState(false)
  const [allRules, setAllRules] = useState(false)
  if (!progress) return <Card><Empty icon={<Trophy size={20} />} title={t('progress')}>{t('noProgressYet')}</Empty></Card>
  const { points, season_points, level, badges, rules, history, rank, province_board, reviews } = progress
  const next = level.next
  const span = next ? next.min_points - level.min_points : 1
  const pct = next ? Math.min(100, Math.round(((points - level.min_points) / span) * 100)) : 100
  const earned = badges.filter(b => b.earned_at)
  const shownHistory = allHistory ? history : history.slice(0, 6)
  const shownRules = allRules ? rules : rules.slice(0, 6)

  return (
    <div>
      <ScreenTitle eyebrow={academy?.name} title={t('progress')} />

      <Card className="overflow-hidden border-ink bg-ink p-5 text-white" data-tour="level">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="label-caps text-[11px] text-neon">{t('level')}</div>
            <div className="mt-1 font-display text-[40px] font-semibold leading-none">{level.label}</div>
          </div>
          <div className="text-right">
            <div className="font-display text-[40px] font-semibold leading-none text-neon">{points}</div>
            <div className="text-xs text-white/60">{pn.many} · {season_points} {t('thisSeason')}</div>
          </div>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-neon transition-all" style={{ width: `${pct}%` }} /></div>
        <div className="mt-2 flex justify-between text-xs text-white/60">
          <span>{level.label} · {level.min_points}</span>
          <span>{next ? `${next.min_points - points} ${t('toNext')} ${next.label}` : t('topLevel')}</span>
        </div>
      </Card>

      <div className="mt-3 grid grid-cols-3 gap-3" data-tour="ranks">
        {([['district', geo.district], ['province', geo.region], ['national', t('rankNational')]] as const).map(([k, l]) => (
          <Card key={k} className="p-3 text-center">
            <div className="label-caps text-[10px] text-muted">{l}</div>
            <div className="mt-1 font-display text-[28px] font-semibold leading-none">{rank[k] ? `#${rank[k]}` : '—'}</div>
          </Card>
        ))}
      </div>

      <Section title={`${t('badges')} · ${earned.length}/${badges.length}`} id="badges">
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {families(badges).map(f => <FamilyTile key={f.key} badges={f.badges} />)}
        </div>
      </Section>

      <Section title={`${t('howToEarn')} ${pn.many}`} id="rules">
        <Card className="divide-y divide-line">
          {shownRules.map(r => <RuleRow key={r.code} r={r} />)}
          {rules.length > 6 && (
            <button onClick={() => setAllRules(a => !a)} className="flex w-full items-center justify-center gap-1 px-4 py-2.5 text-sm font-semibold text-royal">
              {allRules ? <><ChevronUp size={15} />{t('showLess')}</> : <><ChevronDown size={15} />{t('showAllRules')} ({rules.length})</>}
            </button>
          )}
        </Card>
      </Section>

      <Section title={`${t('yourPts')} ${pn.many}`} id="history">
        {history.length === 0 ? (
          <Card><Empty icon={<Star size={20} />} title={t('noPointsYet')}>{t('noPointsHint')}</Empty></Card>
        ) : (
          <Card className="divide-y divide-line">
            {shownHistory.map(e => (
              <div key={e.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className={cx('w-14 shrink-0 font-display text-lg font-semibold', e.points >= 0 ? 'text-grass' : 'text-danger')}>{e.points >= 0 ? '+' : ''}{e.points}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{e.label}</span>
                  {e.note && <span className="block truncate text-xs text-muted">{e.note}</span>}
                </span>
                <span className="shrink-0 text-xs text-faint">{fmtDate(e.at.slice(0, 10), false)}</span>
              </div>
            ))}
            {history.length > 6 && (
              <button onClick={() => setAllHistory(a => !a)} className="flex w-full items-center justify-center gap-1 px-4 py-2.5 text-sm font-semibold text-royal">
                {allHistory ? <><ChevronUp size={15} />{t('showLess')}</> : <><ChevronDown size={15} />{t('showAll')}</>}
              </button>
            )}
          </Card>
        )}
      </Section>

      <Section title={`${t('academiesIn')} ${geo.region.toLowerCase()}`} id="board">
        {province_board.length === 0 ? (
          <Card><div className="px-4 py-4 text-sm text-muted">{t('boardEmpty')}</div></Card>
        ) : (
          <Card className="divide-y divide-line">
            {province_board.slice(0, 15).map(r => (
              <div key={r.academy_id} className={cx('flex items-center gap-3 px-4 py-2.5', r.mine && 'bg-neon/15')}>
                <span className={cx('w-8 shrink-0 font-display text-lg font-semibold', r.rank <= 3 ? 'text-royal' : 'text-muted')}>#{r.rank}</span>
                <span className="min-w-0 flex-1">
                  <span className={cx('block truncate text-sm', r.mine ? 'font-bold' : 'font-semibold')}>{r.name}{r.mine ? ` · ${t('you')}` : ''}</span>
                  {r.district && <span className="block truncate text-xs text-muted">{r.district}</span>}
                </span>
                <span className="shrink-0 font-display text-lg font-semibold">{r.points}</span>
              </div>
            ))}
          </Card>
        )}
      </Section>

      {reviews.length > 0 && (
        <Section title={t('staffFeedback')} id="reviews">
          <Card className="divide-y divide-line">
            {reviews.map(r => (
              <div key={r.id} className="px-4 py-3">
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                  {([['reliability', t('reliability')], ['player_quality', t('playerQuality')], ['engagement', t('engagement')], ['cooperation', t('cooperation')]] as const).map(([k, l]) => r[k] != null && <span key={k}>{l}: <b className="text-text">{'★'.repeat(r[k]!)}</b></span>)}
                </div>
                {r.comment && <p className="mt-1.5 whitespace-pre-line text-sm">{r.comment}</p>}
                <div className="mt-1 text-xs text-faint">{fmtDate(r.at.slice(0, 10), false)}</div>
              </div>
            ))}
          </Card>
        </Section>
      )}
    </div>
  )
}

/** Badges of one family (squad, streak, matches…) shown as one tile: the highest tier earned, and the next one to reach. */
function families(badges: BadgeInfo[]) {
  const map = new Map<string, BadgeInfo[]>()
  for (const b of badges) { const k = b.family ?? b.code; if (!map.has(k)) map.set(k, []); map.get(k)!.push(b) }
  return [...map].map(([key, bs]) => ({ key, badges: bs.sort((a, b) => a.tier - b.tier) }))
}

function FamilyTile({ badges }: { badges: BadgeInfo[] }) {
  const { t } = useT()
  const earned = badges.filter(b => b.earned_at)
  const top = earned[earned.length - 1]
  const next = badges.find(b => !b.earned_at)
  const show = top ?? badges[0]
  const Icon = ICONS[show.icon] ?? Award
  const on = !!top
  const title = `${badges.map(b => `${b.earned_at ? '✓' : '○'} ${b.label} – ${b.description}`).join('\n')}`
  return (
    <div title={title} className={cx('flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center', on ? 'border-ink bg-ink text-white' : 'border-line bg-card text-faint')}>
      <span className={cx('relative flex h-11 w-11 items-center justify-center rounded-full', on ? 'bg-neon text-ink' : 'bg-paper')}>
        <Icon size={20} />
        {!on && <Lock size={11} className="absolute -bottom-0.5 -right-0.5 rounded-full bg-card p-0.5 text-faint" />}
      </span>
      <span className={cx('text-[12px] font-semibold leading-tight', on ? 'text-white' : 'text-muted')}>{show.label}</span>
      {badges.length > 1 && (
        <span className="flex gap-0.5">{badges.map(b => <span key={b.code} className={cx('h-1.5 w-3 rounded-full', b.earned_at ? 'bg-neon' : on ? 'bg-white/25' : 'bg-black/10')} />)}</span>
      )}
      {on && next ? <span className="text-[10px] leading-tight text-white/60">{t('nextBadge')}: {next.label}</span>
        : on ? <span className="text-[10px] text-white/60">{fmtDate(top.earned_at!.slice(0, 10), false)}</span>
        : <span className="text-[10px] leading-tight text-faint">{badges[0].description}</span>}
    </div>
  )
}

function RuleRow({ r }: { r: Rule }) {
  const { t } = useT()
  const cap = !r.cap ? '' : r.cap_period === 'once' ? ` · ${t('onceOnly')}` : ` · ${t('upTo')} ${r.cap} ${r.cap_period === 'day' ? t('perDay') : r.cap_period === 'week' ? t('perWeek') : t('perSeason')}`
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <span className="w-14 shrink-0 font-display text-lg font-semibold text-grass">+{r.points}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{r.label}</span>
        <span className="block text-xs text-muted">{r.description}{cap}</span>
      </span>
    </div>
  )
}
