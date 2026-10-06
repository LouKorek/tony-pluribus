import { useEffect, useMemo, useState } from 'react'
import { FileSpreadsheet, FileText, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { STAGE_LABEL, fmtDate, useRefData, type Camp, type Stage } from '../../lib/scouting'
import { Alert, Button, Card, Empty, Field, MultiSelect, PageHeader, Select, cx } from '../../components/ui'
import { REPORTS, type Params, type ReportData } from './reports'
import { downloadExcel, openPrint } from './export'

export default function ReportsPage() {
  const { seasons, viewSeason } = useAuth()
  const ref = useRefData()
  const [id, setId] = useState(REPORTS[0].id)
  const def = REPORTS.find(r => r.id === id)!
  const [p, setP] = useState<Omit<Params, 'seasonLabel'>>({ season: viewSeason?.id ?? '', stage: 'national_final' })
  const [camps, setCamps] = useState<Camp[]>([])
  const [data, setData] = useState<ReportData | null>(null)
  const [busy, setBusy] = useState(false)
  const [xl, setXl] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const seasonLabel = seasons.find(s => s.id === p.season)?.label ?? ''

  useEffect(() => {
    if (!p.season) return
    supabase.from('camps').select('*').eq('season_id', p.season).order('starts_on', { nullsFirst: false }).then(({ data }) => setCamps((data as Camp[]) ?? []))
  }, [p.season])

  const missing = (def.required ?? []).filter(k => { const v = p[k]; return Array.isArray(v) ? !v.length : !v })
  const key = JSON.stringify([id, p, ref.ready])
  useEffect(() => {
    setData(null); setErr(null)
    if (!ref.ready || !p.season || missing.length) return
    let live = true
    setBusy(true)
    def.load({ ...p, seasonLabel }, ref).then(d => { if (live) setData(d) }).catch(e => { if (live) setErr(e.message) }).finally(() => { if (live) setBusy(false) })
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const set = (k: keyof Params, v: string | string[]) => setP(s => ({ ...s, [k]: (Array.isArray(v) ? v.length : v) ? v : undefined }))
  const academies = useMemo(() => ref.academies.filter(a => a.is_active && (!p.region?.length || p.region.includes(ref.regionOf(a.district_id)?.id ?? ''))), [ref, p.region])
  const rowCount = data?.sections.reduce((s, x) => s + x.rows.length, 0) ?? 0

  return (
    <div>
      <PageHeader eyebrow="Insights" title="Reports" description="Ready reports from live data. Download them as Excel files laid out for printing, or as PDF." />

      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        <div data-tour="report-list" className="space-y-1.5">
          {REPORTS.map(r => (
            <button key={r.id} onClick={() => setId(r.id)}
              className={cx('w-full rounded-xl border p-3 text-left transition-colors', r.id === id ? 'border-ink bg-ink text-white' : 'border-line bg-card hover:border-ink/40')}>
              <div className="font-semibold">{r.title}</div>
              <div className={cx('mt-0.5 text-xs leading-snug', r.id === id ? 'text-white/60' : 'text-muted')}>{r.description}</div>
            </button>
          ))}
        </div>

        <div className="min-w-0 space-y-4">
          <Card className="p-4">
            <div data-tour="report-filters" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Field label="Scouting season">
                <Select value={p.season} onChange={e => setP(s => ({ ...s, season: e.target.value, camp: undefined }))}>
                  {seasons.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                </Select>
              </Field>
              {def.params.includes('camp') && (
                <Field label="Camp" required>
                  <Select value={p.camp ?? ''} onChange={e => set('camp', e.target.value)}>
                    <option value="">Choose a camp</option>
                    {(['district', 'province_final', 'national_final'] as Stage[]).map(st => (
                      <optgroup key={st} label={STAGE_LABEL[st]}>
                        {camps.filter(c => c.stage === st).map(c => <option key={c.id} value={c.id}>{c.name}{c.starts_on ? ` · ${fmtDate(c.starts_on, false)}` : ''}</option>)}
                      </optgroup>
                    ))}
                  </Select>
                </Field>
              )}
              {def.params.includes('stage') && (
                <Field label="Stage">
                  <Select value={p.stage ?? 'national_final'} onChange={e => set('stage', e.target.value)}>
                    <option value="national_final">National final</option>
                    <option value="province_final">Province finals</option>
                  </Select>
                </Field>
              )}
              {(def.params.includes('region') || def.params.includes('academy')) && (!def.params.includes('stage') || p.stage === 'province_final') && (
                <Field label="Provinces">
                  <MultiSelect placeholder="All provinces" value={p.region ?? []} options={ref.regions.map(r => ({ value: r.id, label: r.name }))}
                    onChange={v => setP(s => ({ ...s, region: v.length ? v : undefined, academy: s.academy?.filter(id => !v.length || v.includes(ref.regionOf(ref.academy(id)?.district_id)?.id ?? '')) }))} />
                </Field>
              )}
              {def.params.includes('academy') && (
                <Field label="Academies" required>
                  <MultiSelect placeholder="Choose academies" allLabel="Clear" searchable value={p.academy ?? []} onChange={v => set('academy', v)}
                    options={academies.map(a => ({ value: a.id, label: a.name, group: ref.district(a.district_id)?.name ?? '' })).sort((x, y) => x.group.localeCompare(y.group) || x.label.localeCompare(y.label))} />
                </Field>
              )}
              {def.params.includes('group') && (
                <Field label="Age groups">
                  <MultiSelect placeholder="All ages" value={p.group ?? []} onChange={v => set('group', v)} options={ref.groups.map(g => ({ value: g.code, label: `${g.code} · ${g.birth_year_from}–${g.birth_year_to}` }))} />
                </Field>
              )}
            </div>
            <div data-tour="report-export" className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
              <Button variant="primary" disabled={!data || xl} loading={xl}
                onClick={async () => { if (!data) return; setXl(true); try { await downloadExcel(data) } catch (e) { setErr(e instanceof Error ? e.message : String(e)) } setXl(false) }}>
                <FileSpreadsheet size={16} /> Download Excel
              </Button>
              <Button disabled={!data} onClick={() => { if (data && !openPrint(data)) setErr('The browser blocked the print window. Allow pop-ups for this site and try again.') }}>
                <FileText size={16} /> PDF / print
              </Button>
              {data && <span className="ml-auto text-sm text-muted">{rowCount} row{rowCount === 1 ? '' : 's'}</span>}
            </div>
          </Card>

          {err && <Alert>{err}</Alert>}

          <Card data-tour="report-preview" className="overflow-hidden">
            {missing.length ? (
              <Empty icon={<FileText size={20} />} title={`Choose ${missing.map(m => (m === 'camp' ? 'a camp' : 'an academy')).join(' and ')}`}>The preview appears here.</Empty>
            ) : busy || !data ? (
              <div className="flex items-center justify-center py-16 text-muted"><Loader2 className="animate-spin" /></div>
            ) : (
              <div>
                <div className="border-b border-line p-4">
                  <div className="font-display text-2xl font-bold uppercase leading-none">{data.title}</div>
                  <div className="mt-1 text-sm text-muted">{data.subtitle}</div>
                  {data.summary && <div className="mt-3 flex flex-wrap gap-2">{data.summary.map(([k, v]) => <span key={k} className="rounded-md border border-line px-2.5 py-1 text-sm"><b>{v}</b> <span className="text-muted">{k}</span></span>)}</div>}
                </div>
                {rowCount === 0 ? <Empty icon={<FileText size={20} />} title="Nothing to report yet">The report fills in as the season data is entered.</Empty> : (
                  <div className="max-h-[60vh] overflow-auto">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 z-10"><tr className="bg-ink text-left text-xs text-white">
                        {data.columns.map(c => <th key={c.key} className={cx('whitespace-nowrap px-3 py-2 font-semibold', c.align === 'right' && 'text-right', c.align === 'center' && 'text-center')}>{c.label}</th>)}
                      </tr></thead>
                      <tbody>
                        {data.sections.map((s, si) => [
                          s.title && <tr key={`s${si}`}><td colSpan={data.columns.length} className="border-l-4 border-red bg-paper px-3 py-1.5 font-semibold">{s.title}</td></tr>,
                          ...s.rows.slice(0, 300).map((row, ri) => (
                            <tr key={`${si}-${ri}`} className="border-b border-line">
                              {data.columns.map(c => <td key={c.key} className={cx('px-3 py-1.5 align-top', c.align === 'right' && 'text-right', c.align === 'center' && 'text-center', c.key === 'player' && 'font-semibold whitespace-nowrap')}>{row[c.key] ?? ''}</td>)}
                            </tr>
                          )),
                        ])}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
