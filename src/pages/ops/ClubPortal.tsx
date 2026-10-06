import { useCallback, useEffect, useState } from 'react'
import { Building2, Copy, ExternalLink, Eye, Plus } from 'lucide-react'
import { supabase, errMsg } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { PlayerPicker, playerName, type PickedPlayer } from '../../components/PlayerPicker'
import { Alert, Badge, Button, Card, DeleteButton, Empty, Field, Input, Modal, PageHeader, Spinner, Textarea } from '../../components/ui'

interface Showcase { id: string; title: string; audience: string | null; intro: string | null; token: string; active: boolean; expires_on: string | null; show_stats: boolean; show_tests: boolean; views: number; created_at: string; showcase_players: { player_id: string }[] }
const shareUrl = (token: string) => `${window.location.origin}/share/${token}`
const live = (s: Showcase) => s.active && (!s.expires_on || s.expires_on >= new Date().toISOString().slice(0, 10))

export default function ClubPortalPage() {
  const { can } = useAuth()
  const [rows, setRows] = useState<Showcase[] | null>(null)
  const [editing, setEditing] = useState<Showcase | 'new' | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const canEdit = can('club_portal', 2)

  const load = useCallback(async () => {
    const { data } = await supabase.from('showcases').select('*, showcase_players(player_id)').order('created_at', { ascending: false })
    setRows((data as Showcase[]) ?? [])
  }, [])
  useEffect(() => { load() }, [load])

  async function copy(s: Showcase) {
    try { await navigator.clipboard.writeText(shareUrl(s.token)); setCopied(s.id); setTimeout(() => setCopied(null), 1800) } catch { window.prompt('Copy the link', shareUrl(s.token)) }
  }

  return (
    <div>
      <PageHeader eyebrow="Operations" title="Club portal" description="Pick players and share them with a club by link. The club sees a clean player list with the numbers you choose to show, and nothing else: no contacts, no documents, no sign-in needed."
        actions={canEdit ? <Button variant="primary" onClick={() => setEditing('new')}><Plus size={16} /> New list</Button> : undefined} />
      {!rows ? <Spinner /> : !rows.length ? <Card><Empty icon={<Building2 size={20} />} title="No shared lists yet">{canEdit ? 'Create a list, add players and send the link to the club.' : ''}</Empty></Card> : (
        <div data-tour="showcases" className="grid gap-3 lg:grid-cols-2">
          {rows.map(s => (
            <Card key={s.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0"><div className="truncate font-display text-lg font-bold uppercase leading-tight">{s.title}</div><div className="mt-0.5 text-sm text-muted">{s.audience ? `For ${s.audience} · ` : ''}{s.showcase_players.length} players</div></div>
                <Badge tone={live(s) ? 'good' : 'neutral'}>{live(s) ? 'Live' : s.active ? 'Expired' : 'Off'}</Badge>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 text-xs text-muted"><span className="inline-flex items-center gap-1"><Eye size={12} /> {s.views} view{s.views === 1 ? "" : "s"}</span>{s.expires_on && <span>Until {new Date(s.expires_on + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>}</div>
              <div data-tour="share-link" className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => copy(s)} disabled={!live(s)}><Copy size={13} /> {copied === s.id ? 'Copied' : 'Copy link'}</Button>
                {live(s) && <Button size="sm" variant="ghost" onClick={() => window.open(shareUrl(s.token), '_blank', 'noopener')}><ExternalLink size={13} /> Open as the club sees it</Button>}
                {canEdit && <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setEditing(s)}>Edit</Button>}
              </div>
            </Card>
          ))}
        </div>
      )}
      {editing && <ShowcaseModal showcase={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); load() }} />}
    </div>
  )
}

function ShowcaseModal({ showcase, onClose, onDone }: { showcase: Showcase | null; onClose: () => void; onDone: () => void }) {
  const { project, profile } = useAuth()
  const [f, setF] = useState({ title: showcase?.title ?? '', audience: showcase?.audience ?? '', intro: showcase?.intro ?? '', expires_on: showcase?.expires_on ?? '', active: showcase?.active ?? true, show_stats: showcase?.show_stats ?? true, show_tests: showcase?.show_tests ?? true })
  const [players, setPlayers] = useState<PickedPlayer[]>([])
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!showcase) return
    supabase.from('showcase_players').select('note, sort, player:players(id, first_name, last_name, birth_year, positions)').eq('showcase_id', showcase.id).order('sort').then(({ data }) => {
      const list = (data as unknown as { note: string | null; player: PickedPlayer }[]) ?? []
      setPlayers(list.map(x => x.player)); setNotes(Object.fromEntries(list.map(x => [x.player.id, x.note ?? ''])))
    })
  }, [showcase])

  async function save() {
    if (!f.title.trim()) return setErr('Give the list a title.')
    if (!players.length) return setErr('Add at least one player.')
    setBusy(true)
    const row = { title: f.title.trim(), audience: f.audience || null, intro: f.intro || null, expires_on: f.expires_on || null, active: f.active, show_stats: f.show_stats, show_tests: f.show_tests }
    const res = showcase ? await supabase.from('showcases').update(row).eq('id', showcase.id).select('id').single()
      : await supabase.from('showcases').insert({ ...row, project_id: project!.id, created_by: profile?.id }).select('id').single()
    if (res.error) { setBusy(false); return setErr(errMsg(res.error)) }
    const id = (res.data as { id: string }).id
    await supabase.from('showcase_players').delete().eq('showcase_id', id)
    const { error } = await supabase.from('showcase_players').insert(players.map((p, i) => ({ showcase_id: id, player_id: p.id, note: notes[p.id] || null, sort: i })))
    setBusy(false)
    if (error) return setErr(errMsg(error))
    onDone()
  }
  async function remove() { if (!showcase) return; const { error } = await supabase.from('showcases').delete().eq('id', showcase.id); if (error) setErr(errMsg(error)); else onDone() }

  return (
    <Modal open wide title={showcase ? 'Edit shared list' : 'New shared list'} onClose={onClose}
      footer={<div className="flex w-full justify-between">{showcase ? <DeleteButton onConfirm={remove} /> : <span />}<div className="flex gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>Save</Button></div></div>}>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Title" required><Input value={f.title} onChange={e => setF({ ...f, title: e.target.value })} placeholder="U17 talents · October 2026" /></Field>
          <Field label="For"><Input value={f.audience} onChange={e => setF({ ...f, audience: e.target.value })} placeholder="SL Benfica scouting" /></Field>
        </div>
        <Field label="Message to the club"><Textarea rows={2} value={f.intro} onChange={e => setF({ ...f, intro: e.target.value })} /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Link works until" hint="Leave empty for no end date."><Input type="date" value={f.expires_on} onChange={e => setF({ ...f, expires_on: e.target.value })} /></Field>
          <div className="space-y-2 pt-6 text-sm">
            {([['active', 'Link is on'], ['show_stats', 'Show matches, goals and assists'], ['show_tests', 'Show speed, height and weight']] as const).map(([k, l]) => (
              <label key={k} className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-red" checked={f[k]} onChange={e => setF({ ...f, [k]: e.target.checked })} /> {l}</label>
            ))}
          </div>
        </div>
        <Field label="Players" required><PlayerPicker multi value={players} onChange={setPlayers} /></Field>
        {players.length > 0 && (
          <div className="space-y-2">
            <div className="label-caps text-muted">A line about each player (optional)</div>
            {players.map(p => (
              <div key={p.id} className="grid items-center gap-2 sm:grid-cols-[200px_1fr]"><span className="truncate text-sm font-semibold">{playerName(p)}</span><Input value={notes[p.id] ?? ''} onChange={e => setNotes({ ...notes, [p.id]: e.target.value })} placeholder="Quick, two-footed winger" /></div>
            ))}
          </div>
        )}
        {err && <Alert>{err}</Alert>}
      </div>
    </Modal>
  )
}
