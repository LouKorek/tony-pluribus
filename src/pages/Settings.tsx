import { useCallback, useEffect, useState } from 'react'
import { Save } from 'lucide-react'
import { supabase, errMsg, type AgeGroup, type District, type Region } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { Alert, Badge, Button, Card, Input, PageHeader } from '../components/ui'

export default function SettingsPage() {
  const { project, seasons, scoutingSeason } = useAuth()
  const [groups, setGroups] = useState<AgeGroup[]>([])
  const [regions, setRegions] = useState<Region[]>([])
  const [districts, setDistricts] = useState<District[]>([])
  const [msg, setMsg] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!scoutingSeason) return
    const [g, r, d] = await Promise.all([
      supabase.from('age_groups').select('*').eq('season_id', scoutingSeason.id).order('sort'),
      supabase.from('regions').select('*').order('sort'),
      supabase.from('districts').select('*').order('name'),
    ])
    setGroups((g.data as AgeGroup[]) ?? []); setRegions((r.data as Region[]) ?? []); setDistricts((d.data as District[]) ?? [])
  }, [scoutingSeason])
  useEffect(() => { load() }, [load])

  async function saveGroups() {
    setBusy(true); setMsg(null)
    for (const g of groups) {
      if (g.birth_year_from > g.birth_year_to) { setBusy(false); return setMsg({ tone: 'bad', text: `${g.code}: the first year must not be after the last year.` }) }
      const { error } = await supabase.from('age_groups').update({ birth_year_from: g.birth_year_from, birth_year_to: g.birth_year_to }).eq('id', g.id)
      if (error) { setBusy(false); return setMsg({ tone: 'bad', text: errMsg(error) }) }
    }
    setBusy(false); setMsg({ tone: 'good', text: 'Age groups saved.' })
  }

  return (
    <div>
      <PageHeader eyebrow="System" title="Settings" description="Project details, seasons and the age groups the scouting season uses." />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5" data-tour="project">
          <div className="label-caps text-muted">Project</div>
          <dl className="mt-3 grid grid-cols-[130px_1fr] gap-y-2 text-sm">
            <dt className="text-muted">Name</dt><dd className="font-semibold">{project?.name}</dd>
            <dt className="text-muted">Country</dt><dd>{project?.country}</dd>
            <dt className="text-muted">Partner</dt><dd>{project?.partner}</dd>
            <dt className="text-muted">Time zone</dt><dd>{project?.timezone}</dd>
            <dt className="text-muted">Shared folder</dt><dd className="truncate"><a href={project?.sharepoint_root ?? '#'} target="_blank" rel="noreferrer" className="text-red hover:underline">Talent (SharePoint)</a></dd>
          </dl>
        </Card>

        <Card data-tour="seasons" className="p-5">
          <div className="label-caps text-muted">Seasons</div>
          <ul className="mt-3 divide-y divide-line text-sm">
            {seasons.map(s => (
              <li key={s.id} className="flex items-center justify-between py-2">
                <span className="font-semibold">{s.label}</span>
                <span className="flex gap-1.5">
                  {s.is_current_operational && <Badge tone="info">Current season</Badge>}
                  {s.is_current_scouting && <Badge tone="lime">Scouting for</Badge>}
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <Card data-tour="age-groups" className="p-5 lg:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <div className="label-caps text-muted">Age groups · scouting {scoutingSeason?.label}</div>
              <p className="mt-1 text-sm text-muted">Taken from last season's national final, moved on by one year. Change them here if needed.</p>
            </div>
            <Button variant="primary" size="sm" loading={busy} onClick={saveGroups}><Save size={14} /> Save</Button>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {groups.map((g, i) => (
              <div key={g.id} className="rounded-lg border border-line p-3">
                <div className="font-display text-2xl font-bold">{g.code}</div>
                <div className="mt-2 flex items-center gap-2 text-sm">
                  <span className="text-muted">Born</span>
                  <Input type="number" className="h-9 w-24" value={g.birth_year_from} onChange={e => setGroups(groups.map((x, j) => j === i ? { ...x, birth_year_from: +e.target.value } : x))} />
                  <span className="text-muted">to</span>
                  <Input type="number" className="h-9 w-24" value={g.birth_year_to} onChange={e => setGroups(groups.map((x, j) => j === i ? { ...x, birth_year_to: +e.target.value } : x))} />
                </div>
              </div>
            ))}
          </div>
          {msg && <div className="mt-3"><Alert tone={msg.tone}>{msg.text}</Alert></div>}
        </Card>

        <Card className="p-5 lg:col-span-2">
          <div className="label-caps text-muted">Provinces and districts</div>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {regions.map(r => (
              <div key={r.id}>
                <div className="text-sm font-semibold">{r.name}</div>
                <ul className="mt-1 space-y-0.5 text-sm text-muted">
                  {districts.filter(d => d.region_id === r.id).map(d => <li key={d.id}>{d.name}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
