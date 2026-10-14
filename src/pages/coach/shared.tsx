import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, Card, cx } from '../../components/ui'
import { DECISION_T, STAGE_T, STATUS_T, useT } from './i18n'
import { useCoach, type JourneyItem, type SquadPlayer } from './data'

export const name = (p: { first_name: string; last_name: string }) => `${p.first_name} ${p.last_name}`

/** Navigation that stays inside the portal, also when staff open it as a preview. */
export function useGo() {
  const nav = useNavigate()
  const { base } = useCoach()
  return (path: string) => nav(base + path)
}

export function ScreenTitle({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: ReactNode }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-3">
      <div className="min-w-0">
        {eyebrow && <div className="label-caps mb-1 text-royal">{eyebrow}</div>}
        <h1 className="font-display text-[32px] font-semibold leading-none tracking-tight">{title}</h1>
      </div>
      {action}
    </div>
  )
}

export function Section({ title, children, action, id }: { title: string; children: ReactNode; action?: ReactNode; id?: string }) {
  return (
    <section className="mt-7" data-tour={id}>
      <div className="mb-2.5 flex items-center justify-between">
        <h2 className="label-caps text-muted">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

export function MiniStat({ label, value, sub, accent, onClick }: { label: string; value: ReactNode; sub?: string; accent?: boolean; onClick?: () => void }) {
  const inner = (<>
    <div className={cx('label-caps text-[11px]', accent ? 'text-neon' : 'text-muted')}>{label}</div>
    <div className="mt-1 font-display text-[40px] font-semibold leading-none">{value}</div>
    {sub && <div className={cx('mt-1 text-xs', accent ? 'text-white/60' : 'text-muted')}>{sub}</div>}
  </>)
  return onClick
    ? <button onClick={onClick} className={cx('rounded-xl border border-line bg-card p-4 text-left shadow-sm hover:border-text/30', accent && 'border-ink bg-ink text-white')}>{inner}</button>
    : <Card className={cx('p-4', accent && 'border-ink bg-ink text-white')}>{inner}</Card>
}

/** Sub-tabs inside a screen (Players · Training · Academy). */
export function SubTabs<T extends string>({ value, onChange, items, id }: { value: T; onChange: (v: T) => void; items: [T, string, number?][]; id?: string }) {
  return (
    <div data-tour={id} className="mb-4 flex gap-1 rounded-lg bg-black/5 p-1">
      {items.map(([k, l, n]) => (
        <button key={k} onClick={() => onChange(k)} className={cx('flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-semibold transition-colors', value === k ? 'bg-card text-text shadow-sm' : 'text-muted hover:text-text')}>
          {l}{n != null && n > 0 && <span className={cx('rounded-full px-1.5 text-[11px]', value === k ? 'bg-neon text-ink' : 'bg-black/8 text-muted')}>{n}</span>}
        </button>
      ))}
    </div>
  )
}

export function JourneyBadge({ item }: { item: JourneyItem | undefined }) {
  const { t, pick } = useT()
  if (!item) return <Badge>{t('inSquad')}</Badge>
  if (item.decision) {
    const tone = item.decision === 'selected' ? 'good' : item.decision === 'see_again' ? 'warn' : 'neutral'
    return <Badge tone={tone}>{pick(DECISION_T[item.decision])}</Badge>
  }
  const tone = item.status === 'invited' ? 'bad' : item.status === 'confirmed' ? 'info' : item.status === 'declined' || item.status === 'absent' ? 'neutral' : 'neon'
  return <Badge tone={tone}>{pick(STATUS_T[item.status])}{item.stage !== 'district' ? ' · ' + pick(STAGE_T[item.stage]) : ''}</Badge>
}

export const lastItem = (p: SquadPlayer) => p.journey[p.journey.length - 1]

/** Photo or initials. */
export function Avatar({ player, size = 40, className }: { player: SquadPlayer; size?: number; className?: string }) {
  const { photoUrl } = useCoach()
  const url = photoUrl(player.photo_path)
  const style = { width: size, height: size, fontSize: Math.round(size * 0.36) }
  return url
    ? <img src={url} alt="" style={style} className={cx('shrink-0 rounded-full object-cover', className)} />
    : <span style={style} className={cx('flex shrink-0 items-center justify-center rounded-full bg-ink font-display font-semibold uppercase text-neon', className)}>{player.first_name[0]}{player.last_name[0]}</span>
}

export const fmtTime = (t: string | null | undefined) => (t ? t.slice(0, 5) : '')

/** Marks something written while offline that still waits to be sent. */
export function PendingDot() {
  const { t } = useT()
  return <span title={t('waitingToSend')} aria-label={t('waitingToSend')} className="inline-block h-2 w-2 shrink-0 rounded-full bg-warn" />
}
