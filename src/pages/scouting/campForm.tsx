import { useState } from 'react'
import { supabase, errMsg } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { useRefData, STAGE_LABEL, type Camp, type Stage } from '../../lib/scouting'
import { Alert, Button, Field, Input, Modal, Select, Textarea, cx } from '../../components/ui'

export function CampFormModal({ camp, defaults, onClose, onSaved }: { camp?: Camp | null; defaults?: Partial<Camp>; onClose: () => void; onSaved: (id: string) => void }) {
  const { viewSeason, project } = useAuth()
  const ref = useRefData()
  const init = { ...defaults, ...camp }
  const [f, setF] = useState({
    stage: (init.stage ?? 'district') as Stage,
    region_id: init.region_id ?? (init.district_id ? ref.district(init.district_id)?.region_id ?? '' : ''),
    district_id: init.district_id ?? '',
    name: init.name ?? '',
    starts_on: init.starts_on ?? '', ends_on: init.ends_on ?? '',
    venue: init.venue ?? '', duration: init.duration ?? '', staff: init.staff ?? '', notes: init.notes ?? '',
    age_groups: init.age_groups ?? ref.groups.map(g => g.code),
    status: init.status ?? 'planned', submissions_open: init.submissions_open ?? false, rsvp_deadline: init.rsvp_deadline ?? '',
  })
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const autoName = () => {
    const groups = f.age_groups.join(', ')
    if (f.stage === 'national_final') return `National final · ${groups}`
    if (f.stage === 'province_final') return `${ref.regions.find(r => r.id === f.region_id)?.name ?? 'Province'} final · ${groups}`
    return `${ref.district(f.district_id)?.name ?? 'District'} camp · ${groups}`
  }

  async function save() {
    setErr(null)
    if (f.stage === 'district' && !f.district_id) return setErr('Choose the district.')
    if (f.stage === 'province_final' && !f.region_id) return setErr('Choose the province.')
    if (!f.age_groups.length) return setErr('Choose at least one age group.')
    if (f.ends_on && f.starts_on && f.ends_on < f.starts_on) return setErr('The end date is before the start date.')
    setBusy(true)
    const region = f.stage === 'district' ? ref.district(f.district_id)?.region_id ?? null : f.stage === 'province_final' ? f.region_id : null
    const payload = {
      stage: f.stage, region_id: region, district_id: f.stage === 'district' ? f.district_id : null,
      name: f.name.trim() || autoName(), starts_on: f.starts_on || null, ends_on: f.ends_on || f.starts_on || null,
      venue: f.venue.trim() || null, duration: f.duration.trim() || null, staff: f.staff.trim() || null, notes: f.notes.trim() || null,
      age_groups: f.age_groups, status: f.status, submissions_open: f.submissions_open, rsvp_deadline: f.rsvp_deadline || null,
    }
    const res = camp
      ? await supabase.from('camps').update(payload).eq('id', camp.id).select('id').single()
      : await supabase.from('camps').insert({ ...payload, project_id: project?.id, season_id: viewSeason?.id }).select('id').single()
    setBusy(false)
    if (res.error) return setErr(errMsg(res.error))
    onSaved(res.data.id)
  }

  const toggleGroup = (g: string) => setF({ ...f, age_groups: f.age_groups.includes(g) ? f.age_groups.filter(x => x !== g) : [...f.age_groups, g].sort() })

  return (
    <Modal open wide title={camp ? 'Edit camp' : 'New camp'} onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>{camp ? 'Save' : 'Create camp'}</Button></>}>
      <div className="space-y-4">
        <Field label="Stage" required>
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(STAGE_LABEL) as Stage[]).map(s => (
              <button key={s} type="button" onClick={() => setF({ ...f, stage: s })}
                className={cx('rounded-lg border px-3 py-2.5 text-sm font-semibold', f.stage === s ? 'border-ink bg-ink text-white' : 'border-line-2 hover:border-text/40')}>{STAGE_LABEL[s]}</button>
            ))}
          </div>
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          {f.stage === 'district' && (
            <Field label="District" required>
              <Select value={f.district_id} onChange={e => setF({ ...f, district_id: e.target.value })}>
                <option value="">Choose district</option>
                {ref.regions.map(r => <optgroup key={r.id} label={r.name}>{ref.districts.filter(d => d.region_id === r.id).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</optgroup>)}
              </Select>
            </Field>
          )}
          {f.stage === 'province_final' && (
            <Field label="Province" required>
              <Select value={f.region_id} onChange={e => setF({ ...f, region_id: e.target.value })}>
                <option value="">Choose province</option>{ref.regions.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </Select>
            </Field>
          )}
          <Field label="Age groups" required>
            <div className="flex h-10 gap-2">
              {ref.groups.map(g => (
                <button key={g.code} type="button" onClick={() => toggleGroup(g.code)}
                  className={cx('flex-1 rounded-lg border text-sm font-semibold', f.age_groups.includes(g.code) ? 'border-red bg-red-soft text-red' : 'border-line-2 text-muted')}>{g.code}</button>
              ))}
            </div>
          </Field>
        </div>
        <Field label="Name" hint={`Leave empty for "${autoName()}"`}><Input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Start date"><Input type="date" value={f.starts_on} onChange={e => setF({ ...f, starts_on: e.target.value })} /></Field>
          <Field label="End date"><Input type="date" value={f.ends_on} onChange={e => setF({ ...f, ends_on: e.target.value })} /></Field>
          <Field label="Duration"><Input value={f.duration} onChange={e => setF({ ...f, duration: e.target.value })} placeholder="3 hours each day" /></Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Field / venue"><Input value={f.venue} onChange={e => setF({ ...f, venue: e.target.value })} placeholder="Academies provide the field" /></Field>
          <Field label="Staff"><Input value={f.staff} onChange={e => setF({ ...f, staff: e.target.value })} placeholder="Joseph; Ernest; Didier" /></Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Status">
            <Select value={f.status} onChange={e => setF({ ...f, status: e.target.value as Camp['status'] })}>
              <option value="planned">Planned</option><option value="open">Open</option><option value="completed">Completed</option><option value="published">Results published</option><option value="cancelled">Cancelled</option>
            </Select>
          </Field>
          <Field label="Reply deadline" hint="For invited players"><Input type="date" value={f.rsvp_deadline} onChange={e => setF({ ...f, rsvp_deadline: e.target.value })} /></Field>
          {f.stage === 'district' && (
            <Field label="Coach submissions">
              <label className="flex h-10 items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-red" checked={f.submissions_open} onChange={e => setF({ ...f, submissions_open: e.target.checked })} /> Open to academy coaches</label>
            </Field>
          )}
        </div>
        <Field label="Notes"><Textarea rows={2} value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} /></Field>
        {err && <Alert>{err}</Alert>}
      </div>
    </Modal>
  )
}
