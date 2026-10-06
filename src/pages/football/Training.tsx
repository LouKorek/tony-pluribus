import { useCallback, useEffect, useMemo, useState } from 'react'
import { Dumbbell, FileText, Plus } from 'lucide-react'
import { supabase, errMsg } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { TeamBar, useFileLinks, useTeamSeason, useTeams, type TrainingPlan } from '../../lib/teams'
import { Alert, Badge, Button, Card, DeleteButton, Empty, Field, Input, Modal, PageHeader, Spinner, Textarea } from '../../components/ui'

const monthLabel = (m: string) => new Date(m + '-01T00:00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

export default function TrainingPage() {
  const { can, inTeam } = useAuth()
  const { season, setSeason, seasons } = useTeamSeason()
  const { teams, team, pick } = useTeams(season?.id)
  const [plans, setPlans] = useState<TrainingPlan[] | null>(null)
  const [editing, setEditing] = useState<TrainingPlan | 'new' | null>(null)
  const canEdit = can('training', 2) && inTeam(team?.id)
  const files = useFileLinks(plans?.map(p => p.file_id) ?? [])

  const load = useCallback(async () => {
    if (!team) return
    const { data } = await supabase.from('training_sessions').select('*').eq('team_id', team.id).order('month', { ascending: false }).order('number', { ascending: false })
    setPlans((data as TrainingPlan[]) ?? [])
  }, [team])
  useEffect(() => { setPlans(null); load() }, [load])

  const byMonth = useMemo(() => {
    const m = new Map<string, TrainingPlan[]>()
    for (const p of plans ?? []) { const k = p.month ?? p.day?.slice(0, 7) ?? 'Undated'; m.set(k, [...(m.get(k) ?? []), p]) }
    return [...m.entries()]
  }, [plans])

  return (
    <div>
      <PageHeader eyebrow="Teams" title="Training" description="Every session plan of the team by month and microcycle. The plans written in the Talent folder open from here." />
      <TeamBar seasonId={season?.id} onSeason={setSeason} seasons={seasons} teams={teams} teamId={team?.id} onTeam={pick}
        extra={canEdit && team ? <Button variant="primary" onClick={() => setEditing('new')}><Plus size={16} /> New session plan</Button> : undefined} />
      {!team ? (teams ? <Card><Empty icon={<Dumbbell size={20} />} title="No team this season" /></Card> : <Spinner />) : !plans ? <Spinner /> : !plans.length ? (
        <Card><Empty icon={<Dumbbell size={20} />} title="No session plans yet">{canEdit ? 'Add the first plan of the season.' : ''}</Empty></Card>
      ) : (
        <div data-tour="plans" className="space-y-6">
          {byMonth.map(([m, list]) => (
            <section key={m}>
              <div className="mb-2 flex items-baseline justify-between"><h2 className="font-display text-xl font-bold uppercase">{m === 'Undated' ? m : monthLabel(m)}</h2><span className="text-sm text-muted">{list.length} session{list.length > 1 ? 's' : ''}</span></div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {list.map(p => (
                  <Card key={p.id} className="flex flex-col p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-display text-2xl font-bold leading-none">{p.number ? `T${p.number}` : 'Session'}</span>
                      {p.microcycle && <Badge>{p.microcycle}</Badge>}
                    </div>
                    {p.day && <div className="mt-1 text-xs text-muted">{new Date(p.day + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</div>}
                    {p.objective && <div className="mt-2 text-sm">{p.objective}</div>}
                    <div className="mt-auto flex items-center justify-between pt-3">
                      {p.file_id && files[p.file_id] ? <a href={files[p.file_id].url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-red hover:underline"><FileText size={13} /> Plan (PDF)</a> : <span />}
                      {canEdit && <button onClick={() => setEditing(p)} className="text-xs font-semibold text-muted hover:text-text">Edit</button>}
                    </div>
                  </Card>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
      {editing && team && <PlanModal teamId={team.id} plan={editing === 'new' ? null : editing} next={Math.max(0, ...(plans ?? []).map(p => p.number ?? 0)) + 1} onClose={() => setEditing(null)} onDone={() => { setEditing(null); load() }} />}
    </div>
  )
}

function PlanModal({ teamId, plan, next, onClose, onDone }: { teamId: string; plan: TrainingPlan | null; next: number; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ day: plan?.day ?? new Date().toISOString().slice(0, 10), number: String(plan?.number ?? next), microcycle: plan?.microcycle ?? '', objective: plan?.objective ?? '', notes: plan?.notes ?? '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  async function save() {
    setBusy(true); setErr(null)
    const row = { team_id: teamId, day: f.day || null, month: (f.day || '').slice(0, 7) || plan?.month || null, number: f.number ? Number(f.number) : null, microcycle: f.microcycle || null, objective: f.objective || null, notes: f.notes || null }
    const { error } = plan ? await supabase.from('training_sessions').update(row).eq('id', plan.id) : await supabase.from('training_sessions').insert(row)
    setBusy(false)
    if (error) return setErr(errMsg(error))
    onDone()
  }
  async function remove() { if (!plan) return; const { error } = await supabase.from('training_sessions').delete().eq('id', plan.id); if (error) setErr(errMsg(error)); else onDone() }
  return (
    <Modal open title={plan ? 'Edit session plan' : 'New session plan'} onClose={onClose}
      footer={<div className="flex w-full justify-between">{plan ? <DeleteButton onConfirm={remove} /> : <span />}<div className="flex gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>Save</Button></div></div>}>
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <Field label="Date"><Input type="date" value={f.day} onChange={e => setF({ ...f, day: e.target.value })} /></Field>
          <Field label="Session no."><Input type="number" value={f.number} onChange={e => setF({ ...f, number: e.target.value })} /></Field>
          <Field label="Microcycle"><Input value={f.microcycle} onChange={e => setF({ ...f, microcycle: e.target.value })} placeholder="Microcycle 4" /></Field>
        </div>
        <Field label="Objective"><Input value={f.objective} onChange={e => setF({ ...f, objective: e.target.value })} placeholder="Build-up from the back, 1v1 defending…" /></Field>
        <Field label="Plan and notes"><Textarea rows={6} value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} placeholder="Warm-up, exercises, duration, load" /></Field>
        {err && <Alert>{err}</Alert>}
      </div>
    </Modal>
  )
}
