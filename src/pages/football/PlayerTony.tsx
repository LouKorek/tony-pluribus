import { useEffect, useState } from 'react'
import { Camera, FileText } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { GRADE_LABEL, METRIC_LABEL, POS_LABEL, useFileLinks, type Measurement } from '../../lib/teams'
import { Badge, cx } from '../../components/ui'

interface Membership { position: string | null; status: string; team: { id: string; name: string; season: { label: string } } }
interface Ev { grade: string | null; summary: string | null; report_file_id: string | null; season: { label: string } }

/** The player's life at Tony: squads, attendance, matches, tests and evaluations. Shown inside the player card. */
export function PlayerTony({ playerId, photoId }: { playerId: string; photoId?: string | null }) {
  const [teams, setTeams] = useState<Membership[] | null>(null)
  const [meas, setMeas] = useState<Measurement[]>([])
  const [mt, setMt] = useState({ matches: 0, goals: 0, assists: 0, yellow: 0, red: 0 })
  const [att, setAtt] = useState({ trained: 0, minutes: 0 })
  const [evs, setEvs] = useState<Ev[]>([])
  const links = useFileLinks([photoId, ...evs.map(e => e.report_file_id)])

  useEffect(() => {
    Promise.all([
      supabase.from('team_players').select('position, status, team:teams(id, name, season:seasons(label))').eq('player_id', playerId),
      supabase.from('measurements').select('*').eq('player_id', playerId).order('taken_on'),
      supabase.from('match_players').select('goals, assists, yellow, red').eq('player_id', playerId),
      supabase.from('attendance').select('minutes').eq('player_id', playerId).gt('minutes', 0),
      supabase.from('evaluations').select('grade, summary, report_file_id, season:seasons(label)').eq('player_id', playerId),
    ]).then(([t, m, mp, a, e]) => {
      setTeams(((t.data as unknown as Membership[]) ?? []).sort((x, y) => y.team.season.label.localeCompare(x.team.season.label)))
      setMeas((m.data as Measurement[]) ?? [])
      const ms = (mp.data as { goals: number; assists: number; yellow: number; red: number }[]) ?? []
      setMt({ matches: ms.length, goals: ms.reduce((s, x) => s + x.goals, 0), assists: ms.reduce((s, x) => s + x.assists, 0), yellow: ms.reduce((s, x) => s + x.yellow, 0), red: ms.reduce((s, x) => s + x.red, 0) })
      const as = (a.data as { minutes: number }[]) ?? []
      setAtt({ trained: as.length, minutes: as.reduce((s, x) => s + (x.minutes ?? 0), 0) })
      setEvs(((e.data as unknown as Ev[]) ?? []).sort((x, y) => y.season.label.localeCompare(x.season.label)))
    })
  }, [playerId])

  if (!teams || (!teams.length && !meas.length && !evs.length)) return null
  const latest = (metric: Measurement['metric']) => [...meas].reverse().find(x => x.metric === metric)
  const first = (metric: Measurement['metric']) => meas.find(x => x.metric === metric)

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <div className="label-caps text-muted">At Tony</div>
        {photoId && links[photoId] && <a href={links[photoId].url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-red hover:underline"><Camera size={13} /> Photo</a>}
      </div>
      {teams.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {teams.map(t => <Badge key={t.team.id} tone={t.status === 'left' ? 'neutral' : 'dark'}>{t.team.season.label.replace('-20', '/')} · {t.team.name}{t.position ? ` · ${POS_LABEL[t.position] ?? t.position}` : ''}{t.status !== 'active' ? ` · ${t.status}` : ''}</Badge>)}
        </div>
      )}
      <div className="grid grid-cols-3 gap-2 text-center sm:grid-cols-6">
        {[['Sessions', att.trained], ['Minutes', att.minutes.toLocaleString()], ['Matches', mt.matches], ['Goals', mt.goals], ['Assists', mt.assists], ['Cards', `${mt.yellow}/${mt.red}`]].map(([l, v]) => (
          <div key={l as string} className="rounded-lg bg-paper px-2 py-2"><div className="font-display text-xl font-bold leading-none">{v}</div><div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">{l}</div></div>
        ))}
      </div>
      {meas.length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(['sprint_10m', 'sprint_20m', 'weight_kg', 'height_cm'] as const).map(k => {
            const l = latest(k), f = first(k)
            if (!l) return null
            const d = f && f !== l ? Number(l.value) - Number(f.value) : null
            const good = d === null ? null : k.startsWith('sprint') ? d < 0 : d > 0
            return (
              <div key={k} className="rounded-lg border border-line px-3 py-2">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-muted">{METRIC_LABEL[k][0]}</div>
                <div className="font-semibold">{Number(l.value)} {METRIC_LABEL[k][1]}</div>
                {d !== null && <div className={cx('text-xs', k === 'weight_kg' ? 'text-muted' : good ? 'text-good' : 'text-red')}>{d > 0 ? '+' : ''}{Math.round(d * 100) / 100} since {f!.taken_on?.slice(0, 7)}</div>}
              </div>
            )
          })}
        </div>
      )}
      {evs.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {evs.map(e => (
            <li key={e.season.label} className="flex items-start gap-2 text-sm">
              {e.grade && <span className={cx('mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-bold', GRADE_LABEL[e.grade][1])}>{e.grade}</span>}
              <span className="flex-1"><b>{e.season.label.replace('-20', '/')}</b> · {e.grade ? GRADE_LABEL[e.grade][0] : 'Not graded'}{e.summary ? <span className="block text-muted">{e.summary}</span> : null}</span>
              {e.report_file_id && links[e.report_file_id] && <a href={links[e.report_file_id].url} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-red hover:underline"><FileText size={13} /> Report</a>}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
