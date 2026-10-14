import { useCallback, useEffect, useState } from 'react'
import { Save } from 'lucide-react'
import { supabase, errMsg, type AgeGroup, type District, type Region } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { Alert, Badge, Button, Card, Field, Input, PageHeader } from '../components/ui'
import { Logo, type Partner, type ProjectSettings } from '../lib/brand'

export default function SettingsPage() {
  const { project, seasons, scoutingSeason, refresh } = useAuth()
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
            <dt className="text-muted">Shared folder</dt><dd className="truncate"><a href={project?.sharepoint_root ?? '#'} target="_blank" rel="noreferrer" className="text-royal hover:underline">Talent (SharePoint)</a></dd>
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
                  {s.is_current_scouting && <Badge tone="neon">Scouting for</Badge>}
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
                <div className="font-display text-2xl font-semibold">{g.code}</div>
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

        <BrandCard project={project} onSaved={refresh} />

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


const SHOW_IN: [Partner['show_in'][number], string][] = [['certificates', 'Selection certificates'], ['exports', 'Excel and PDF reports'], ['share', 'Pages shared with clubs']]

/** The project line of the brand: tagline and partner. Tony is always the brand; the partner appears only where it is ticked. */
function BrandCard({ project, onSaved }: { project: ReturnType<typeof useAuth>['project']; onSaved: () => Promise<void> }) {
  const st = (project?.settings ?? {}) as ProjectSettings
  const [tagline, setTagline] = useState(st.tagline ?? '')
  const [partner, setPartner] = useState<Partner>({ name: st.partner?.name ?? '', logo: st.partner?.logo ?? null, show_in: st.partner?.show_in ?? ['certificates', 'exports', 'share'] })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null)
  useEffect(() => { const x = (project?.settings ?? {}) as ProjectSettings; setTagline(x.tagline ?? ''); setPartner({ name: x.partner?.name ?? '', logo: x.partner?.logo ?? null, show_in: x.partner?.show_in ?? ['certificates', 'exports', 'share'] }) }, [project])
  const toggle = (k: Partner['show_in'][number]) => setPartner(p => ({ ...p, show_in: p.show_in.includes(k) ? p.show_in.filter(x => x !== k) : [...p.show_in, k] }))

  async function save() {
    if (!project) return
    setBusy(true); setMsg(null)
    const settings = { ...(project.settings ?? {}), tagline: tagline.trim() || null, partner: partner.name.trim() ? { name: partner.name.trim(), logo: partner.logo?.trim() || null, show_in: partner.show_in } : null }
    const { error } = await supabase.from('projects').update({ settings }).eq('id', project.id)
    setBusy(false)
    if (error) return setMsg({ tone: 'bad', text: errMsg(error) })
    await onSaved(); setMsg({ tone: 'good', text: 'Saved.' })
  }

  return (
    <Card data-tour="brand" className="p-5 lg:col-span-2">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="label-caps text-muted">Brand and partner</div>
          <p className="mt-1 text-sm text-muted">Tony is the brand of the whole system. A partner of this project is shown only in the places ticked below, never in the app itself.</p>
        </div>
        <Button variant="primary" size="sm" loading={busy} onClick={save}><Save size={14} /> Save</Button>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div className="space-y-3">
          <Field label="Project line" hint="Under the Tony logo on certificates and shared pages. Example: Rwandan Youth Football Talents."><Input value={tagline} onChange={e => setTagline(e.target.value)} placeholder="Rwandan Youth Football Talents" /></Field>
          <Field label="Partner name" hint="Leave empty if the project has no partner."><Input value={partner.name} onChange={e => setPartner({ ...partner, name: e.target.value })} placeholder="SL Benfica" /></Field>
          <Field label="Partner logo" hint="Path of a square PNG in the app, e.g. /brand/benfica.png."><Input value={partner.logo ?? ''} onChange={e => setPartner({ ...partner, logo: e.target.value })} placeholder="/brand/partner.png" /></Field>
          <div>
            <div className="mb-1.5 text-[13px] font-semibold">Show the partner in</div>
            <div className="space-y-1.5 text-sm">
              {SHOW_IN.map(([k, l]) => <label key={k} className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-royal" checked={partner.show_in.includes(k)} onChange={() => toggle(k)} /> {l}</label>)}
            </div>
          </div>
        </div>
        <div className="rounded-xl bg-ink p-5 text-white">
          <div className="label-caps text-[10px] text-white/40">Preview · certificate header</div>
          <div className="mt-3 flex items-center gap-3">
            <Logo variant="wordmark" color="neon" className="h-5" />
            {partner.name && partner.logo && partner.show_in.includes('certificates') && <><span className="h-6 w-px bg-white/20" /><img src={partner.logo} alt={partner.name} className="h-9 w-9" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} /></>}
          </div>
          <div className="mt-4 text-xs text-white/60">{tagline || 'The global stars of tomorrow'}{partner.name && partner.show_in.includes('certificates') ? <><br />in partnership with {partner.name}</> : null}</div>
        </div>
      </div>
      {msg && <div className="mt-3"><Alert tone={msg.tone}>{msg.text}</Alert></div>}
    </Card>
  )
}
