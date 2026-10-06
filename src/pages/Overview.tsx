import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, CheckCircle2, Circle, Clock } from 'lucide-react'
import { supabase, type AgeGroup } from '../lib/supabase'
import { useAuth, isAdmin } from '../lib/auth'
import { BUILD_STAGE, STAGE_NAME } from '../lib/nav'
import { Badge, Card, PageHeader, Stat } from '../components/ui'

interface Counts { users: number; pending: number; academies: number; players: number; camps: number }

export default function Overview() {
  const { profile, project, scoutingSeason } = useAuth()
  const [c, setC] = useState<Counts | null>(null)
  const [groups, setGroups] = useState<AgeGroup[]>([])
  const admin = isAdmin(profile)

  useEffect(() => {
    const head = { count: 'exact' as const, head: true }
    Promise.all([
      admin ? supabase.from('profiles').select('id', head) : Promise.resolve({ count: 0 }),
      admin ? supabase.from('profiles').select('id', head).eq('status', 'pending') : Promise.resolve({ count: 0 }),
      supabase.from('academies').select('id', head),
      supabase.from('players').select('id', head),
      scoutingSeason ? supabase.from('camps').select('id', head).eq('season_id', scoutingSeason.id) : Promise.resolve({ count: 0 }),
    ]).then(([u, p, a, pl, ca]) => setC({ users: u.count ?? 0, pending: p.count ?? 0, academies: a.count ?? 0, players: pl.count ?? 0, camps: ca.count ?? 0 }))
    if (scoutingSeason) supabase.from('age_groups').select('*').eq('season_id', scoutingSeason.id).order('sort').then(({ data }) => setGroups((data as AgeGroup[]) ?? []))
  }, [admin, scoutingSeason])

  const first = (profile?.full_name || profile?.username || '').split(' ')[0]
  const hour = new Date().getHours()
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  const stages = [1, 2, 3, 4, 5, 6]
  return (
    <div>
      <PageHeader eyebrow={`${project?.name ?? ''} · ${project?.partner ?? ''}`} title={`${greet}, ${first}`} description={`Scouting season ${scoutingSeason?.label ?? ''}. District camps, provincial finals and the national final all live here.`} />

      {admin && c && c.pending > 0 && (
        <Link to="/users" className="mb-6 flex items-center gap-3 rounded-xl border border-warn/30 bg-warn-soft px-4 py-3 text-warn hover:border-warn/60">
          <Clock size={18} />
          <span className="font-semibold">{c.pending} coach{c.pending > 1 ? 'es' : ''} waiting for approval</span>
          <ArrowRight size={16} className="ml-auto" />
        </Link>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat accent label="Scouting season" value={scoutingSeason?.label.replace('-20', '/') ?? '—'} sub={groups.map(g => `${g.code} ${g.birth_year_from}–${g.birth_year_to}`).join(' · ')} />
        <Stat label="Academies" value={c?.academies ?? '—'} sub="In the academy register" />
        <Stat label="Players" value={c?.players ?? '—'} sub="Across all seasons" />
        <Stat label="Camps" value={c?.camps ?? '—'} sub={`Planned for ${scoutingSeason?.label ?? ''}`} />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card className="p-5">
          <div className="label-caps text-muted">The 2027/28 pathway</div>
          <div className="mt-4 grid grid-cols-4 gap-2">
            {[
              ['District camps', 'Academies submit players, scouts test and grade'],
              ['Province finals', 'Best of each province, five finals'],
              ['National final', 'Selected, see again, absent'],
              ['Tony squads', 'U13 · U15 · U17 · U20'],
            ].map(([t, d], i) => (
              <div key={t} className="relative">
                <div className={`h-1.5 rounded-full ${i === 3 ? 'bg-lime' : 'bg-ink'}`} style={{ opacity: 1 - i * 0.15 }} />
                <div className="mt-3 font-display text-base font-bold uppercase leading-tight">{t}</div>
                <div className="mt-1 text-xs leading-snug text-muted">{d}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <div className="label-caps text-muted">Build progress</div>
          <ul className="mt-3 space-y-2.5">
            {stages.map(s => {
              const done = s <= BUILD_STAGE
              const name = s === 1 ? 'Foundations: login, users, menu' : STAGE_NAME[s]
              return (
                <li key={s} className="flex items-center gap-2.5 text-sm">
                  {done ? <CheckCircle2 size={17} className="text-good" /> : <Circle size={17} className="text-line-2" />}
                  <span className={done ? 'font-semibold' : 'text-muted'}>{name}</span>
                  {s === BUILD_STAGE + 1 && <span className="ml-auto"><Badge tone="lime">Next</Badge></span>}
                </li>
              )
            })}
          </ul>
        </Card>
      </div>
    </div>
  )
}
