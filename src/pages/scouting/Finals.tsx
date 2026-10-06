import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Trophy } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { useRefData, fmtRange, fullName, type Camp, type Participant, type Player } from '../../lib/scouting'
import { Badge, Button, Card, Empty, PageHeader, Segmented, Spinner, cx } from '../../components/ui'
import { useCamps, STATUS_LABEL, statusTone } from './Camps'
import { CampFormModal } from './campForm'
import { PlayerDrawer } from './Players'

type Row = Participant & { player: Player }

export default function FinalsPage() {
  const { scoutingSeason, profile } = useAuth()
  const ref = useRefData()
  const nav = useNavigate()
  const { camps, stats, reload } = useCamps()
  const [creating, setCreating] = useState<Partial<Camp> | null>(null)
  const canEdit = profile?.role !== 'observer'
  const finals = (camps ?? []).filter(c => c.stage !== 'district')
  const national = finals.find(c => c.stage === 'national_final')
  const provinces = ref.regions.map(r => ({ region: r, camp: finals.find(c => c.stage === 'province_final' && c.region_id === r.id) }))

  return (
    <div>
      <PageHeader eyebrow={`Scouting ${scoutingSeason?.label ?? ''}`} title="Finals"
        description="The five province finals and the national final. The national result lists match the SELECTED, SEE AGAIN and ABSENCES sheets." />

      {!camps ? <Spinner /> : (<>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {provinces.map(({ region, camp }) => camp ? (
            <FinalCard key={region.id} camp={camp} title={region.name} total={stats[camp.id]?.total} selected={stats[camp.id]?.selected} onClick={() => nav(`/scouting/camps/${camp.id}`)} />
          ) : (
            <Card key={region.id} className="flex flex-col justify-between border-dashed p-4">
              <div><div className="label-caps text-muted">Province final</div><div className="mt-1 font-display text-xl font-bold uppercase">{region.name}</div><div className="mt-1 text-sm text-faint">Not planned yet</div></div>
              {canEdit && <Button size="sm" className="mt-3 self-start" onClick={() => setCreating({ stage: 'province_final', region_id: region.id })}><Plus size={14} /> Plan it</Button>}
            </Card>
          ))}
          {national ? <FinalCard camp={national} title="National final" dark total={stats[national.id]?.total} selected={stats[national.id]?.selected} onClick={() => nav(`/scouting/camps/${national.id}`)} /> : (
            <Card className="flex flex-col justify-between border-dashed border-ink p-4">
              <div><div className="label-caps text-red">National final</div><div className="mt-1 font-display text-xl font-bold uppercase">Rwanda</div><div className="mt-1 text-sm text-faint">Not planned yet</div></div>
              {canEdit && <Button size="sm" variant="dark" className="mt-3 self-start" onClick={() => setCreating({ stage: 'national_final' })}><Plus size={14} /> Plan it</Button>}
            </Card>
          )}
        </div>

        <NationalBoard camp={national ?? null} />
      </>)}

      {creating && <CampFormModal defaults={creating} onClose={() => setCreating(null)} onSaved={() => { setCreating(null); reload() }} />}
    </div>
  )
}

function FinalCard({ camp, title, total, selected, dark, onClick }: { camp: Camp; title: string; total?: number; selected?: number; dark?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={cx('rounded-xl border p-4 text-left transition-colors hover:border-red', dark ? 'border-ink bg-ink text-white' : 'border-line bg-card')}>
      <div className="flex items-center justify-between">
        <div className={cx('label-caps', dark ? 'text-lime' : 'text-muted')}>{dark ? 'National final' : 'Province final'}</div>
        <Badge tone={statusTone(camp.status)}>{STATUS_LABEL[camp.status]}</Badge>
      </div>
      <div className="mt-1 font-display text-xl font-bold uppercase">{title}</div>
      <div className={cx('mt-1 text-sm', dark ? 'text-white/60' : 'text-muted')}>{fmtRange(camp.starts_on, camp.ends_on)}{camp.venue ? ` · ${camp.venue}` : ''}</div>
      <div className="mt-3 flex gap-4 text-sm">
        <span><b className="font-display text-2xl">{total ?? 0}</b> invited</span>
        <span><b className={cx('font-display text-2xl', dark ? 'text-lime' : 'text-good')}>{selected ?? 0}</b> selected</span>
      </div>
    </button>
  )
}

function NationalBoard({ camp }: { camp: Camp | null }) {
  const ref = useRefData()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [tab, setTab] = useState<'selected' | 'see_again' | 'absent'>('selected')
  const [open, setOpen] = useState<string | null>(null)
  useEffect(() => {
    if (!camp) { setRows([]); return }
    supabase.from('camp_participants').select('*, player:players(*)').eq('camp_id', camp.id).then(({ data }) => setRows((data as Row[]) ?? []))
  }, [camp])

  const lists = useMemo(() => ({
    selected: (rows ?? []).filter(r => r.decision === 'selected'),
    see_again: (rows ?? []).filter(r => r.decision === 'see_again'),
    absent: (rows ?? []).filter(r => r.status === 'absent' || r.status === 'declined'),
  }), [rows])
  const groups = Array.from(new Set([...(camp?.age_groups ?? []), ...lists[tab].map(r => r.age_group ?? 'Other')]))

  return (
    <div className="mt-8">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div><div className="label-caps text-red">National result</div><h2 className="font-display text-2xl font-bold uppercase">The {ref.groups.map(g => g.code).join(' · ')} intake</h2></div>
        <Segmented value={tab} onChange={setTab} options={[
          { value: 'selected', label: 'Selected', count: lists.selected.length },
          { value: 'see_again', label: 'See again', count: lists.see_again.length },
          { value: 'absent', label: 'Absences', count: lists.absent.length },
        ]} />
      </div>
      {!rows ? <Spinner /> : !camp ? <Card><Empty icon={<Trophy size={20} />} title="No national final yet">Plan the national final above. Its results appear here by age group.</Empty></Card> :
        lists[tab].length === 0 ? <Card><Empty icon={<Trophy size={20} />} title="Nothing here yet">Decisions entered in the national final camp sheet show up here.</Empty></Card> : (
          <div className="grid gap-3 lg:grid-cols-3">
            {groups.map(g => {
              const list = lists[tab].filter(r => (r.age_group ?? 'Other') === g)
              if (!list.length) return null
              return (
                <Card key={g} className="overflow-hidden">
                  <div className="flex items-center justify-between border-b border-line bg-paper/70 px-4 py-2.5"><span className="font-display text-lg font-bold">{g}</span><span className="text-sm text-muted">{list.length}</span></div>
                  <ul className="divide-y divide-line">
                    {list.sort((a, b) => (a.team ?? 'Z').localeCompare(b.team ?? 'Z') || a.player.last_name.localeCompare(b.player.last_name)).map(r => (
                      <li key={r.id}>
                        <button onClick={() => setOpen(r.player_id)} className="w-full px-4 py-2 text-left hover:bg-paper/60">
                          <div className="flex items-center justify-between gap-2"><span className="font-semibold">{fullName(r.player)}</span><span className="text-xs text-muted">{r.player.birth_year}</span></div>
                          <div className="truncate text-xs text-muted">{[ref.academy(r.player.academy_id)?.name, r.position, r.team, tab === 'absent' ? r.absence_reason : r.comment].filter(Boolean).join(' · ')}</div>
                        </button>
                      </li>
                    ))}
                  </ul>
                </Card>
              )
            })}
          </div>
        )}
      {open && <PlayerDrawer playerId={open} onClose={() => setOpen(null)} />}
    </div>
  )
}
