import { useEffect, useMemo, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { useRefData, POOL_LABEL, fullName, ageGroupFor, type Player, type PoolStatus } from '../../lib/scouting'
import { Card, Empty, MultiSelect, PageHeader, SearchInput, Spinner, cx } from '../../components/ui'
import { PlayerDrawer } from './Players'

const COLUMNS: { key: PoolStatus; hint: string }[] = [
  { key: 'submitted', hint: 'Waiting for a district camp' },
  { key: 'observed', hint: 'Seen, not moved on' },
  { key: 'province_final', hint: 'Invited to a province final' },
  { key: 'national_final', hint: 'Invited to the national final' },
  { key: 'see_again', hint: 'Watch again next season' },
  { key: 'selected', hint: 'Selected for Tony' },
  { key: 'tony_squad', hint: 'In a Tony squad' },
]

export default function PoolPage() {
  const { viewSeason } = useAuth()
  const ref = useRefData()
  const [players, setPlayers] = useState<Player[] | null>(null)
  const [group, setGroup] = useState<string[]>([])
  const [region, setRegion] = useState<string[]>([])
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<string | null>(null)

  const load = () => {
    if (!viewSeason) return
    supabase.rpc('season_players', { p_season: viewSeason.id }).then(({ data }) => setPlayers((data as Player[]) ?? []))
  }
  useEffect(load, [viewSeason])

  const list = useMemo(() => (players ?? []).filter(p =>
    (!group.length || group.includes(ageGroupFor(p.birth_year, ref.groups) ?? '')) &&
    (!region.length || region.includes(ref.district(p.district_id ?? ref.academy(p.academy_id)?.district_id)?.region_id ?? '')) &&
    (!q || fullName(p).toLowerCase().includes(q.toLowerCase()))), [players, group, region, q, ref])

  return (
    <div>
      <PageHeader eyebrow={`Scouting ${viewSeason?.label ?? ''}`} title="Potential pool"
        description="Every player in this season's scouting, by how far they have come. It replaces the yearly Draft – Potential presentation." />
      <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-center" data-tour="filters">
        <MultiSelect className="lg:w-48" placeholder="All ages" value={group} onChange={setGroup} options={ref.groups.map(g => ({ value: g.code, label: `${g.code} · ${g.birth_year_from}–${g.birth_year_to}` }))} />
        <MultiSelect className="lg:w-52" placeholder="All provinces" value={region} onChange={setRegion} options={ref.regions.map(r => ({ value: r.id, label: r.name }))} />
        <SearchInput className="lg:ml-auto lg:w-64" value={q} onChange={setQ} placeholder="Find a player" />
      </div>

      {!players ? <Spinner /> : players.length === 0 ? (
        <Card><Empty icon={<Sparkles size={20} />} title="The pool is empty">Players join the pool as soon as they are submitted to, or added in, a camp of this season.</Empty></Card>
      ) : (
        <div className="scroll-thin -mx-4 flex gap-3 overflow-x-auto px-4 pb-3 sm:-mx-8 sm:px-8" data-tour="columns">
          {COLUMNS.map(col => {
            const items = list.filter(p => p.pool_status === col.key)
            return (
              <div key={col.key} className="flex w-64 shrink-0 flex-col rounded-xl bg-black/[.04]">
                <div className="px-3 pb-2 pt-3">
                  <div className="flex items-center justify-between">
                    <span className={cx('font-display text-base font-bold uppercase', col.key === 'selected' && 'text-good')}>{POOL_LABEL[col.key]}</span>
                    <span className={cx('rounded-full px-2 text-xs font-bold', col.key === 'selected' ? 'bg-good text-white' : 'bg-black/10 text-muted')}>{items.length}</span>
                  </div>
                  <div className="text-xs text-muted">{col.hint}</div>
                </div>
                <div className="scroll-thin max-h-[62vh] flex-1 space-y-1.5 overflow-y-auto px-2 pb-2">
                  {items.slice(0, 300).map(p => (
                    <button key={p.id} onClick={() => setOpen(p.id)} className="w-full rounded-lg border border-line bg-card px-2.5 py-2 text-left hover:border-ink">
                      <div className="flex items-center justify-between gap-2"><span className="truncate text-sm font-semibold">{fullName(p)}</span><span className="text-xs text-muted">{ageGroupFor(p.birth_year, ref.groups) ?? p.birth_year}</span></div>
                      <div className="truncate text-xs text-muted">{ref.academy(p.academy_id)?.name ?? 'No academy'}{p.positions ? ` · ${p.positions}` : ''}</div>
                    </button>
                  ))}
                  {items.length > 300 && <div className="px-2 py-1 text-xs text-muted">+{items.length - 300} more — narrow the filters</div>}
                </div>
              </div>
            )
          })}
        </div>
      )}
      {open && <PlayerDrawer playerId={open} onClose={() => setOpen(null)} onSaved={load} onOpenOther={setOpen} />}
    </div>
  )
}
