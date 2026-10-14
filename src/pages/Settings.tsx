import { useCallback, useEffect, useState } from 'react'
import { Save, Trophy } from 'lucide-react'
import { supabase, errMsg, type AgeGroup, type District, type Region } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { Alert, Badge, Button, Card, Field, Input, Modal, PageHeader, SearchInput, Select, Textarea, cx } from '../components/ui'
import { LANGUAGE_NAMES, Logo, useGeo, type Partner, type ProjectSettings } from '../lib/brand'
import { clearCache } from '../lib/offline'
import { BASE_STRINGS } from './coach/i18n'
import { useNavigate } from 'react-router-dom'

export default function SettingsPage() {
  const { project, seasons, scoutingSeason, refresh, profile } = useAuth()
  const geo = useGeo()
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
        <PointsCard projectId={project?.id} />
        <LocaleCard project={project} onSaved={refresh} />
        <LanguagesCard project={project} onSaved={refresh} />
        {profile?.role === 'owner' && <ProjectsCard onSwitched={refresh} />}

        <Card className="p-5 lg:col-span-2" data-tour="geo">
          <div className="flex items-start justify-between gap-3">
            <div className="label-caps text-muted">{geo.regions} and {geo.districts.toLowerCase()}</div>
            <GeoImport projectId={project?.id} geo={geo} onDone={load} />
          </div>
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

/* ───────────────────────── Points and levels ───────────────────────── */

interface RuleRow { code: string; points: number; label: string; description: string; cap: number | null; cap_period: string | null; active: boolean; sort: number }
interface LevelRow { code: string; label: string; min_points: number; sort: number }

function PointsCard({ projectId }: { projectId: string | undefined }) {
  const [rules, setRules] = useState<RuleRow[]>([])
  const [levels, setLevels] = useState<LevelRow[]>([])
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null)
  const load = useCallback(async () => {
    if (!projectId) return
    const [r, l] = await Promise.all([
      supabase.from('point_rules').select('*').eq('project_id', projectId).order('sort'),
      supabase.from('point_levels').select('*').eq('project_id', projectId).order('min_points'),
    ])
    setRules((r.data as RuleRow[]) ?? []); setLevels((l.data as LevelRow[]) ?? []); setDirty(false)
  }, [projectId])
  useEffect(() => { load() }, [load])

  const setRule = (code: string, patch: Partial<RuleRow>) => { setRules(rs => rs.map(r => (r.code === code ? { ...r, ...patch } : r))); setDirty(true) }
  const setLevel = (code: string, min: number) => { setLevels(ls => ls.map(l => (l.code === code ? { ...l, min_points: min } : l))); setDirty(true) }

  async function save() {
    if (!projectId) return
    const sorted = [...levels].sort((a, b) => a.sort - b.sort)
    for (let i = 1; i < sorted.length; i++) if (sorted[i].min_points <= sorted[i - 1].min_points) return setMsg({ tone: 'bad', text: `${sorted[i].label} must need more points than ${sorted[i - 1].label}.` })
    setBusy(true); setMsg(null)
    for (const r of rules) {
      const { error } = await supabase.from('point_rules').update({ points: r.points, cap: r.cap, cap_period: r.cap ? (r.cap_period ?? 'day') : null, active: r.active }).eq('project_id', projectId).eq('code', r.code)
      if (error) { setBusy(false); return setMsg({ tone: 'bad', text: errMsg(error) }) }
    }
    for (const l of levels) {
      const { error } = await supabase.from('point_levels').update({ min_points: l.min_points }).eq('project_id', projectId).eq('code', l.code)
      if (error) { setBusy(false); return setMsg({ tone: 'bad', text: errMsg(error) }) }
    }
    setBusy(false); setDirty(false); setMsg({ tone: 'good', text: 'Points and levels saved. They apply from the next award.' })
  }

  return (
    <Card data-tour="points" className="p-5 lg:col-span-2">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="label-caps text-muted"><Trophy size={12} className="mr-1 inline" />Points and levels</div>
          <p className="mt-1 text-sm text-muted">What a coach earns for each action, the caps, and the points each level needs. The coach sees the active rules in the portal. Rewards to redeem come in a later stage.</p>
        </div>
        <Button variant="primary" loading={busy} disabled={!dirty} onClick={save}><Save size={15} />Save</Button>
      </div>
      {msg && <div className="mt-3"><Alert tone={msg.tone}>{msg.text}</Alert></div>}

      <div className="mt-4 grid gap-5 lg:grid-cols-[1fr_280px]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-xs text-muted"><tr><th className="py-1.5 pr-2">Action</th><th className="py-1.5 pr-2 text-right">Points</th><th className="py-1.5 pr-2">Cap</th><th className="py-1.5">On</th></tr></thead>
            <tbody className="divide-y divide-line">
              {rules.map(r => (
                <tr key={r.code} className={cx(!r.active && 'opacity-50')}>
                  <td className="py-1.5 pr-2"><div className="font-semibold">{r.label}</div><div className="text-xs text-muted">{r.description}</div></td>
                  <td className="py-1.5 pr-2 text-right">{['staff.bonus', 'staff.penalty'].includes(r.code) ? <span className="text-xs text-faint">set each time</span> : <Input type="number" value={r.points} onChange={e => setRule(r.code, { points: parseInt(e.target.value, 10) || 0 })} className="w-20 text-right" />}</td>
                  <td className="py-1.5 pr-2">
                    {['staff.bonus', 'staff.penalty'].includes(r.code) ? null : (
                      <div className="flex items-center gap-1">
                        <Input type="number" min={0} value={r.cap ?? ''} placeholder="—" onChange={e => setRule(r.code, { cap: e.target.value === '' ? null : Math.max(0, parseInt(e.target.value, 10) || 0) || null })} className="w-16" />
                        <Select value={r.cap_period ?? 'day'} disabled={!r.cap} onChange={e => setRule(r.code, { cap_period: e.target.value })} className="w-24"><option value="day">a day</option><option value="week">a week</option><option value="season">a season</option><option value="once">once</option></Select>
                      </div>
                    )}
                  </td>
                  <td className="py-1.5"><input type="checkbox" checked={r.active} onChange={e => setRule(r.code, { active: e.target.checked })} className="h-4 w-4 accent-ink" aria-label={`${r.label} active`} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <div className="label-caps mb-2 text-muted">Levels</div>
          <div className="space-y-2">
            {[...levels].sort((a, b) => a.sort - b.sort).map((l, i) => (
              <div key={l.code} className="flex items-center gap-2">
                <span className="w-20 font-display text-base font-semibold">{l.label}</span>
                {i === 0 ? <span className="text-sm text-muted">from 0</span> : <><span className="text-xs text-muted">from</span><Input type="number" min={1} value={l.min_points} onChange={e => setLevel(l.code, parseInt(e.target.value, 10) || 0)} className="w-24" /><span className="text-xs text-muted">pts</span></>}
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-lg bg-paper p-3 text-xs text-muted">Badges come in families with tiers (squad, profiles, academy, streaks, sessions, method, matches, competition, pathway, camps, habit) and are earned automatically; they are not edited here.</div>
        </div>
      </div>
    </Card>
  )
}

/* ───────────────────────── Locale: currency, geography words ───────────────────────── */

function LocaleCard({ project, onSaved }: { project: ReturnType<typeof useAuth>['project']; onSaved: () => Promise<void> }) {
  const st = (project?.settings ?? {}) as ProjectSettings
  const [currency, setCurrency] = useState(st.currency ?? 'USD')
  const [region, setRegion] = useState(st.geo_labels?.region ?? 'Province')
  const [district, setDistrict] = useState(st.geo_labels?.district ?? 'District')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null)
  useEffect(() => { const x = (project?.settings ?? {}) as ProjectSettings; setCurrency(x.currency ?? 'USD'); setRegion(x.geo_labels?.region ?? 'Province'); setDistrict(x.geo_labels?.district ?? 'District') }, [project])
  async function save() {
    if (!project) return
    setBusy(true); setMsg(null)
    const settings = { ...(project.settings ?? {}), currency: currency.trim().toUpperCase() || 'USD', geo_labels: { region: region.trim() || 'Province', district: district.trim() || 'District' } }
    const { error } = await supabase.from('projects').update({ settings }).eq('id', project.id)
    setBusy(false)
    if (error) return setMsg({ tone: 'bad', text: errMsg(error) })
    await onSaved(); setMsg({ tone: 'good', text: 'Saved.' })
  }
  return (
    <Card data-tour="locale" className="p-5">
      <div className="label-caps text-muted">Country words</div>
      <p className="mt-1 text-sm text-muted">What this country calls its two levels of geography, and the currency of its finance.</p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Field label="Upper level" hint="e.g. Province, Region, State"><Input value={region} onChange={e => setRegion(e.target.value)} /></Field>
        <Field label="Lower level" hint="e.g. District, County"><Input value={district} onChange={e => setDistrict(e.target.value)} /></Field>
        <Field label="Currency" hint="ISO code"><Input value={currency} maxLength={3} onChange={e => setCurrency(e.target.value)} className="w-24 uppercase" /></Field>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        {msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : <span />}
        <Button variant="primary" loading={busy} onClick={save}><Save size={15} />Save</Button>
      </div>
    </Card>
  )
}

/* ───────────────────────── Portal languages and wording ───────────────────────── */

function LanguagesCard({ project, onSaved }: { project: ReturnType<typeof useAuth>['project']; onSaved: () => Promise<void> }) {
  const st = (project?.settings ?? {}) as ProjectSettings
  const [codes, setCodes] = useState<string[]>(st.languages ?? ['en', 'rw'])
  const [add, setAdd] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null)
  useEffect(() => { setCodes(((project?.settings ?? {}) as ProjectSettings).languages ?? ['en', 'rw']) }, [project])
  async function save(next: string[]) {
    if (!project) return
    setBusy(true); setMsg(null)
    const { error } = await supabase.from('projects').update({ settings: { ...(project.settings ?? {}), languages: next } }).eq('id', project.id)
    setBusy(false)
    if (error) return setMsg({ tone: 'bad', text: errMsg(error) })
    setCodes(next); await onSaved()
  }
  const addLang = () => { const c = add.trim().toLowerCase(); if (!/^[a-z]{2,3}$/.test(c)) return setMsg({ tone: 'bad', text: 'Use a two-letter language code, e.g. fr.' }); if (codes.includes(c)) return; save([...codes, c]); setAdd('') }
  return (
    <Card data-tour="languages" className="p-5">
      <div className="label-caps text-muted">Coach portal languages</div>
      <p className="mt-1 text-sm text-muted">Coaches switch between these in the portal. English and Kinyarwanda are built in; for any language you can set the project's own wording, word by word.</p>
      {msg && <div className="mt-2"><Alert tone={msg.tone}>{msg.text}</Alert></div>}
      <ul className="mt-3 divide-y divide-line rounded-lg border border-line">
        {codes.map(c => (
          <li key={c} className="flex items-center gap-2 px-3 py-2 text-sm">
            <span className="w-10 rounded bg-ink px-1.5 py-0.5 text-center text-[11px] font-bold uppercase text-neon">{c}</span>
            <span className="flex-1 font-semibold">{LANGUAGE_NAMES[c] ?? c}</span>
            <span className="text-xs text-muted">{c === 'en' ? 'base' : c === 'rw' ? 'built in' : 'English until translated'}</span>
            <button onClick={() => setEditing(c)} className="text-xs font-semibold text-royal hover:underline">Wording</button>
            {c !== 'en' && <button onClick={() => save(codes.filter(x => x !== c))} disabled={busy} className="text-xs font-semibold text-danger hover:underline">Remove</button>}
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-end gap-2">
        <Field label="Add a language" hint="ISO code, e.g. fr, sw, pt"><Input value={add} onChange={e => setAdd(e.target.value)} className="w-28" placeholder="fr" /></Field>
        <Button onClick={addLang} loading={busy}>Add</Button>
      </div>
      {editing && project && <StringsModal projectId={project.id} lang={editing} onClose={() => setEditing(null)} />}
    </Card>
  )
}

function StringsModal({ projectId, lang, onClose }: { projectId: string; lang: string; onClose: () => void }) {
  const [over, setOver] = useState<Record<string, string>>({})
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  useEffect(() => { supabase.from('portal_strings').select('key,text').eq('project_id', projectId).eq('lang', lang).then(({ data }) => { const m: Record<string, string> = {}; (data ?? []).forEach((r: { key: string; text: string }) => { m[r.key] = r.text }); setOver(m); setDraft(m) }) }, [projectId, lang])
  const keys = (Object.keys(BASE_STRINGS) as (keyof typeof BASE_STRINGS)[]).filter(k => !q || k.toLowerCase().includes(q.toLowerCase()) || BASE_STRINGS[k][0].toLowerCase().includes(q.toLowerCase()))
  const base = (k: keyof typeof BASE_STRINGS) => (lang === 'rw' ? BASE_STRINGS[k][1] : BASE_STRINGS[k][0])
  const changed = Object.keys(draft).filter(k => (draft[k] ?? '') !== (over[k] ?? ''))
  async function save() {
    setBusy(true); setMsg(null)
    for (const k of changed) {
      const v = draft[k]?.trim()
      const { error } = v ? await supabase.from('portal_strings').upsert({ project_id: projectId, lang, key: k, text: v, updated_at: new Date().toISOString() }) : await supabase.from('portal_strings').delete().eq('project_id', projectId).eq('lang', lang).eq('key', k)
      if (error) { setBusy(false); return setMsg(errMsg(error)) }
    }
    await clearCache()
    setOver({ ...draft }); setBusy(false); setMsg(`Saved ${changed.length} change${changed.length === 1 ? '' : 's'}. Coaches see them after their next refresh.`)
  }
  return (
    <Modal open onClose={onClose} title={`Wording · ${LANGUAGE_NAMES[lang] ?? lang.toUpperCase()}`} wide
      footer={<><span className="mr-auto text-xs text-muted">{changed.length ? `${changed.length} unsaved` : ''}</span><Button variant="ghost" onClick={onClose}>Close</Button><Button variant="primary" loading={busy} disabled={!changed.length} onClick={save}>Save</Button></>}>
      <p className="mb-3 text-sm text-muted">Every text of the coach portal. Leave a line empty to keep the built-in text ({lang === 'rw' ? 'Kinyarwanda draft' : 'English'}).</p>
      {msg && <div className="mb-3"><Alert tone={msg.startsWith('Saved') ? 'good' : 'bad'}>{msg}</Alert></div>}
      <SearchInput value={q} onChange={setQ} placeholder="Find a text" className="mb-3" />
      <div className="max-h-[60vh] overflow-y-auto rounded-lg border border-line">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-paper text-left text-xs text-muted"><tr><th className="px-3 py-2">Key</th><th className="px-3 py-2">Built in</th><th className="px-3 py-2">This project</th></tr></thead>
          <tbody className="divide-y divide-line">
            {keys.map(k => (
              <tr key={k}>
                <td className="px-3 py-1.5 align-top text-xs text-faint">{k}</td>
                <td className="px-3 py-1.5 align-top text-muted">{base(k)}</td>
                <td className="px-3 py-1.5 align-top"><Input value={draft[k] ?? ''} placeholder={BASE_STRINGS[k][0]} onChange={e => setDraft(d => ({ ...d, [k]: e.target.value }))} className={cx('h-8 text-sm', (draft[k] ?? '') && 'border-ink')} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  )
}

/* ───────────────────────── Projects (owner): list, switch, create ───────────────────────── */

interface MyProject { id: string; name: string; slug: string; country: string | null; is_active: boolean; current: boolean }

function ProjectsCard({ onSwitched }: { onSwitched: () => Promise<void> }) {
  const nav = useNavigate()
  const [list, setList] = useState<MyProject[]>([])
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState(false)
  const load = useCallback(() => supabase.rpc('my_projects').then(({ data }) => setList((data as MyProject[]) ?? [])), [])
  useEffect(() => { load() }, [load])
  async function switchTo(id: string) {
    setBusy(true)
    const { error } = await supabase.rpc('switch_project', { p_project: id })
    if (!error) { await clearCache(); try { sessionStorage.removeItem('tonynext.viewSeason') } catch { /* storage blocked */ } await onSwitched(); nav('/') }
    setBusy(false)
  }
  return (
    <Card data-tour="projects" className="p-5 lg:col-span-2">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="label-caps text-muted">Projects · countries</div>
          <p className="mt-1 text-sm text-muted">One Tony Next for every country. Each project has its own seasons, geography, academies, players, users, points and brand line; nothing crosses over. You switch projects from the box at the top of the menu.</p>
        </div>
        <Button variant="primary" onClick={() => setCreating(true)}>New project</Button>
      </div>
      <ul className="mt-3 divide-y divide-line rounded-lg border border-line">
        {list.map(p => (
          <li key={p.id} className="flex items-center gap-3 px-3 py-2 text-sm">
            <span className="flex-1"><span className="font-semibold">{p.name}</span><span className="text-muted"> · {p.country ?? '—'} · /join/{p.slug}</span></span>
            {p.current ? <Badge tone="neon">Current</Badge> : <Button size="sm" loading={busy} onClick={() => switchTo(p.id)}>Open</Button>}
          </li>
        ))}
      </ul>
      {creating && <NewProjectModal onClose={() => setCreating(false)} onCreated={async id => { setCreating(false); await load(); await switchTo(id) }} />}
    </Card>
  )
}

function NewProjectModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const year = new Date().getFullYear()
  const [step, setStep] = useState(1)
  const [f, setF] = useState({ name: '', slug: '', country: '', timezone: 'UTC', currency: 'USD', tagline: 'The global stars of tomorrow', region: 'Province', district: 'District', languages: 'en', partner: '',
    season: `${year}-${year + 1}`, season_start: '', season_end: '', groups: 'U11:' + (year - 11) + '-' + (year - 10) + '\nU13:' + (year - 13) + '-' + (year - 12) + '\nU15:' + (year - 15) + '-' + (year - 14), geo: '' })
  const set = (k: keyof typeof f, v: string) => setF(s => ({ ...s, [k]: v }))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  async function create() {
    setBusy(true); setErr(null)
    const age_groups = f.groups.split('\n').map(l => l.trim()).filter(Boolean).map(l => { const [code, yrs] = l.split(':'); const [a, b] = (yrs ?? '').split('-').map(x => parseInt(x.trim(), 10)); return { code: code.trim(), from: a, to: b || a } }).filter(g => g.code && g.from)
    const { data, error } = await supabase.rpc('admin_create_project', { p: {
      name: f.name, slug: f.slug, country: f.country, timezone: f.timezone, currency: f.currency, tagline: f.tagline, geo_labels: { region: f.region, district: f.district },
      languages: f.languages.split(',').map(x => x.trim().toLowerCase()).filter(Boolean), partner: f.partner ? { name: f.partner } : null,
      season: f.season, season_start: f.season_start || null, season_end: f.season_end || null, age_groups,
    } })
    if (error) { setBusy(false); return setErr(errMsg(error)) }
    if (f.geo.trim()) { const { error: e2 } = await supabase.rpc('admin_import_geo', { p_project: data, p_text: f.geo }); if (e2) { setBusy(false); return setErr(errMsg(e2)) } }
    setBusy(false); onCreated(data as string)
  }
  return (
    <Modal open onClose={onClose} title={`New project · step ${step} of 3`} wide
      footer={<>{step > 1 && <Button variant="ghost" onClick={() => setStep(s => s - 1)}>Back</Button>}<Button variant="ghost" onClick={onClose}>Cancel</Button>
        {step < 3 ? <Button variant="primary" disabled={step === 1 && !f.name.trim()} onClick={() => setStep(s => s + 1)}>Next</Button> : <Button variant="primary" loading={busy} onClick={create}>Create project</Button>}</>}>
      {err && <div className="mb-3"><Alert>{err}</Alert></div>}
      {step === 1 && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Project name" required><Input value={f.name} onChange={e => set('name', e.target.value)} placeholder="Tony Kenya" /></Field>
          <Field label="Join link slug" hint="letters and dashes; coaches sign up at /join/<slug>"><Input value={f.slug} onChange={e => set('slug', e.target.value)} placeholder="tony-kenya" /></Field>
          <Field label="Country"><Input value={f.country} onChange={e => set('country', e.target.value)} placeholder="Kenya" /></Field>
          <Field label="Time zone" hint="IANA name"><Input value={f.timezone} onChange={e => set('timezone', e.target.value)} placeholder="Africa/Nairobi" /></Field>
          <Field label="Currency"><Input value={f.currency} onChange={e => set('currency', e.target.value.toUpperCase())} maxLength={3} className="w-24" /></Field>
          <Field label="Project line" hint="shown under the Tony logo"><Input value={f.tagline} onChange={e => set('tagline', e.target.value)} /></Field>
          <Field label="Partner" hint="optional; appears only on certificates, reports and shared pages"><Input value={f.partner} onChange={e => set('partner', e.target.value)} /></Field>
          <Field label="Coach portal languages" hint="codes, comma separated; en is always first"><Input value={f.languages} onChange={e => set('languages', e.target.value)} placeholder="en, sw" /></Field>
        </div>
      )}
      {step === 2 && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="First scouting season" required><Input value={f.season} onChange={e => set('season', e.target.value)} /></Field>
          <div />
          <Field label="Starts"><Input type="date" value={f.season_start} onChange={e => set('season_start', e.target.value)} /></Field>
          <Field label="Ends"><Input type="date" value={f.season_end} onChange={e => set('season_end', e.target.value)} /></Field>
          <div className="sm:col-span-2"><Field label="Age groups" hint="one per line: CODE:first birth year-last birth year"><Textarea rows={4} value={f.groups} onChange={e => set('groups', e.target.value)} /></Field></div>
        </div>
      )}
      {step === 3 && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Upper geography level" hint="e.g. Province, Region, County"><Input value={f.region} onChange={e => set('region', e.target.value)} /></Field>
          <Field label="Lower geography level" hint="e.g. District, Sub-county"><Input value={f.district} onChange={e => set('district', e.target.value)} /></Field>
          <div className="sm:col-span-2"><Field label={`${f.region}s and ${f.district.toLowerCase()}s`} hint={`one ${f.region.toLowerCase()} per line: Name: ${f.district} A, ${f.district} B. You can add more later.`}><Textarea rows={8} value={f.geo} onChange={e => set('geo', e.target.value)} placeholder={`Nairobi: Westlands, Kasarani, Embakasi\nMombasa: Nyali, Likoni`} /></Field></div>
        </div>
      )}
    </Modal>
  )
}

function GeoImport({ projectId, geo, onDone }: { projectId: string | undefined; geo: ReturnType<typeof useGeo>; onDone: () => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null)
  async function run() {
    if (!projectId) return
    setBusy(true); setMsg(null)
    const { data, error } = await supabase.rpc('admin_import_geo', { p_project: projectId, p_text: text })
    setBusy(false)
    if (error) return setMsg({ tone: 'bad', text: errMsg(error) })
    setMsg({ tone: 'good', text: `${data} ${geo.districts.toLowerCase()} added or confirmed.` }); setText(''); await onDone()
  }
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>Add {geo.regions.toLowerCase()}</Button>
      {open && (
        <Modal open onClose={() => setOpen(false)} title={`Add ${geo.regions.toLowerCase()} and ${geo.districts.toLowerCase()}`}
          footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Close</Button><Button variant="primary" loading={busy} disabled={!text.trim()} onClick={run}>Add</Button></>}>
          {msg && <div className="mb-3"><Alert tone={msg.tone}>{msg.text}</Alert></div>}
          <Field label={`One ${geo.region.toLowerCase()} per line`} hint={`Name: ${geo.district} A, ${geo.district} B. Existing names are kept.`}><Textarea rows={8} value={text} onChange={e => setText(e.target.value)} /></Field>
        </Modal>
      )}
    </>
  )
}
