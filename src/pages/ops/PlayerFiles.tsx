import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, FileText, FolderLock, Plus, X } from 'lucide-react'
import { supabase, errMsg } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { fileUrl, pname, useTeamSeason } from '../../lib/teams'
import { Alert, Button, Card, Empty, Field, Modal, MultiSelect, PageHeader, SearchInput, Select, Spinner, cx, useDebounced } from '../../components/ui'

export const DOC_KINDS: [string, string][] = [
  ['birth_certificate', 'Birth certificate'], ['id', 'Identity'], ['registration_agreement', 'Registration agreement'], ['non_registration', 'Non-registration statement'],
  ['parental_consent', 'Parental consent'], ['medical', 'Medical'], ['contract', 'Contract'], ['photo', 'Photo'], ['release', 'Release letter'], ['other', 'Other'],
]
const CHECK = ['birth_certificate', 'id', 'registration_agreement', 'non_registration', 'parental_consent', 'medical', 'photo']
interface Doc { id: string; player_id: string; kind: string; status: string; file: { id: string; path: string; name: string; ext: string | null } | null }
interface P { id: string; first_name: string; last_name: string; birth_year: number | null; teams: string[] }

export default function PlayerFilesPage() {
  const { can, project } = useAuth()
  const { season, setSeason, seasons } = useTeamSeason()
  const [players, setPlayers] = useState<P[] | null>(null)
  const [docs, setDocs] = useState<Doc[]>([])
  const [teams, setTeams] = useState<string[]>([])
  const [kinds, setKinds] = useState<string[]>([])
  const [q, setQ] = useState('')
  const [onlyMissing, setOnlyMissing] = useState(false)
  const [show, setShow] = useState<{ p: P; kind: string } | null>(null)
  const [adding, setAdding] = useState<P | null>(null)
  const canEdit = can('player_files', 2)

  const load = useCallback(async () => {
    if (!season) return
    const { data: tp } = await supabase.from('team_players').select('player_id, team:teams!inner(name, season_id), player:players(id, first_name, last_name, birth_year)').eq('team.season_id', season.id)
    const by = new Map<string, P>()
    for (const r of (tp as unknown as { player_id: string; team: { name: string }; player: Omit<P, 'teams'> }[]) ?? []) {
      const x = by.get(r.player_id) ?? { ...r.player, teams: [] }; x.teams.push(r.team.name); by.set(r.player_id, x)
    }
    const list = [...by.values()].sort((a, b) => pname(a).localeCompare(pname(b)))
    setPlayers(list)
    if (list.length) {
      const { data } = await supabase.from('player_documents').select('id, player_id, kind, status, file:talent_files(id, path, name, ext)').in('player_id', list.map(p => p.id))
      setDocs((data as unknown as Doc[]) ?? [])
    }
  }, [season])
  useEffect(() => { setPlayers(null); load() }, [load])

  const has = (pid: string, kind: string) => docs.filter(d => d.player_id === pid && d.kind === kind)
  const cols = kinds.length ? CHECK.filter(k => kinds.includes(k)) : CHECK
  const allTeams = [...new Set((players ?? []).flatMap(p => p.teams))].sort()
  const shown = useMemo(() => (players ?? []).filter(p =>
    (!teams.length || p.teams.some(t => teams.includes(t))) && (!q || pname(p).toLowerCase().includes(q.toLowerCase())) &&
    (!onlyMissing || cols.some(k => !has(p.id, k).length))), [players, teams, q, onlyMissing, docs, cols])
  const complete = (players ?? []).filter(p => CHECK.every(k => has(p.id, k).length)).length

  return (
    <div>
      <PageHeader eyebrow="Operations" title="Player files" description="The documents of every Tony player: birth certificate, identity, registration agreement, non-registration statement, consent, medical and photo. The files stay in the Talent folder." />
      <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-center">
        <Select className="lg:w-44" value={season?.id ?? ''} onChange={e => setSeason(e.target.value)}>{[...seasons].reverse().map(s => <option key={s.id} value={s.id}>Season {s.label}</option>)}</Select>
        <MultiSelect className="lg:w-48" placeholder="All teams" value={teams} onChange={setTeams} options={allTeams.map(t => ({ value: t, label: t }))} />
        <MultiSelect className="lg:w-56" placeholder="All documents" value={kinds} onChange={setKinds} options={CHECK.map(k => ({ value: k, label: DOC_KINDS.find(d => d[0] === k)![1] }))} />
        <SearchInput className="lg:w-56" value={q} onChange={setQ} placeholder="Find a player" />
        <label className="flex items-center gap-2 text-sm lg:ml-auto"><input type="checkbox" className="h-4 w-4 accent-red" checked={onlyMissing} onChange={e => setOnlyMissing(e.target.checked)} /> Only players with something missing</label>
      </div>
      {players && <p className="mb-3 text-sm text-muted"><b className="text-text">{complete}</b> of {players.length} players have every document.</p>}
      <Card data-tour="files-grid" className="overflow-hidden">
        {!players ? <Spinner /> : !shown.length ? <Empty icon={<FolderLock size={20} />} title="No players to show" /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead><tr className="border-b border-line bg-paper/70 text-xs text-muted">
                <th className="px-3 py-2.5 text-left font-semibold">Player</th><th className="px-3 py-2.5 text-left font-semibold">Team</th>
                {cols.map(k => <th key={k} className="px-2 py-2.5 text-center font-semibold">{DOC_KINDS.find(d => d[0] === k)![1]}</th>)}
                <th className="px-2 py-2.5 text-center font-semibold">Other</th>{canEdit && <th />}
              </tr></thead>
              <tbody>{shown.map(p => (
                <tr key={p.id} className="border-b border-line last:border-0">
                  <td className="whitespace-nowrap px-3 py-2 font-semibold">{pname(p)} <span className="font-normal text-faint">{p.birth_year ?? ''}</span></td>
                  <td className="px-3 py-2 text-muted">{p.teams.join(', ')}</td>
                  {cols.map(k => { const n = has(p.id, k).length; return (
                    <td key={k} className="px-2 py-2 text-center">
                      <button onClick={() => n && setShow({ p, kind: k })} className={cx('inline-flex h-7 min-w-7 items-center justify-center rounded-md px-1.5 text-xs font-bold', n ? 'bg-good-soft text-good hover:bg-good hover:text-white' : 'bg-red-soft text-red')} title={n ? `${n} file${n > 1 ? 's' : ''}` : 'Missing'}>
                        {n ? <><Check size={13} />{n > 1 ? n : ''}</> : <X size={13} />}
                      </button>
                    </td>) })}
                  <td className="px-2 py-2 text-center">{(() => { const n = docs.filter(d => d.player_id === p.id && !CHECK.includes(d.kind)).length; return n ? <button onClick={() => setShow({ p, kind: '*' })} className="text-xs font-semibold text-red hover:underline">{n}</button> : <span className="text-faint">—</span> })()}</td>
                  {canEdit && <td className="px-2 py-2 text-right"><Button size="sm" variant="ghost" onClick={() => setAdding(p)}><Plus size={13} /> Add</Button></td>}
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Card>
      {show && (
        <Modal open title={`${pname(show.p)} · ${show.kind === '*' ? 'Other documents' : DOC_KINDS.find(d => d[0] === show.kind)![1]}`} onClose={() => setShow(null)}>
          <ul className="space-y-1.5">{docs.filter(d => d.player_id === show.p.id && (show.kind === '*' ? !CHECK.includes(d.kind) : d.kind === show.kind)).map(d => (
            <li key={d.id} className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-sm">
              {d.file ? <a href={fileUrl(project?.sharepoint_root, d.file.path, d.file.ext)} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-2 hover:text-red"><FileText size={15} className="shrink-0 text-info" /><span className="truncate">{d.file.name}</span></a> : <span>No file linked</span>}
              {canEdit && <button className="text-xs text-muted hover:text-red" onClick={async () => { await supabase.from('player_documents').delete().eq('id', d.id); load() }}>Unlink</button>}
            </li>
          ))}</ul>
        </Modal>
      )}
      {adding && <LinkDocModal player={adding} onClose={() => setAdding(null)} onDone={() => { setAdding(null); load() }} />}
    </div>
  )
}

function LinkDocModal({ player, onClose, onDone }: { player: P; onClose: () => void; onDone: () => void }) {
  const [kind, setKind] = useState('birth_certificate')
  const [q, setQ] = useState(player.last_name !== '—' ? player.last_name : player.first_name)
  const dq = useDebounced(q, 250)
  const [files, setFiles] = useState<{ id: string; path: string; name: string }[]>([])
  const [pick, setPick] = useState<Set<string>>(new Set())
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    if (dq.trim().length < 2) { setFiles([]); return }
    supabase.from('talent_files').select('id, path, name').eq('is_folder', false).ilike('path', `%${dq.trim().replace(/[%_]/g, '')}%`).limit(60).then(({ data }) => setFiles((data as typeof files) ?? []))
  }, [dq])
  async function save() {
    const { error } = await supabase.from('player_documents').insert([...pick].map(id => ({ player_id: player.id, kind, file_id: id, status: 'received' })))
    if (error) return setErr(errMsg(error))
    onDone()
  }
  return (
    <Modal open wide title={`Link documents · ${pname(player)}`} onClose={onClose} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!pick.size} onClick={save}>Link {pick.size || ''}</Button></>}>
      <div className="grid gap-3 sm:grid-cols-[220px_1fr]">
        <Field label="Document type"><Select value={kind} onChange={e => setKind(e.target.value)}>{DOC_KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
        <Field label="Find the file in the Talent folder"><SearchInput value={q} onChange={setQ} placeholder="Part of the file or folder name" /></Field>
      </div>
      <div className="mt-3 max-h-80 overflow-y-auto rounded-lg border border-line">
        {files.length === 0 ? <p className="px-3 py-6 text-center text-sm text-muted">No file found.</p> : files.map(f => (
          <label key={f.id} className="flex cursor-pointer items-start gap-3 border-b border-line px-3 py-2 text-sm last:border-0 hover:bg-paper">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-red" checked={pick.has(f.id)} onChange={e => setPick(s => { const n = new Set(s); if (e.target.checked) n.add(f.id); else n.delete(f.id); return n })} />
            <span className="min-w-0"><span className="block truncate font-medium">{f.name}</span><span className="block truncate text-xs text-muted">{f.path}</span></span>
          </label>
        ))}
      </div>
      {err && <div className="mt-3"><Alert>{err}</Alert></div>}
    </Modal>
  )
}
