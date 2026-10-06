import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { SearchInput, cx, useDebounced } from './ui'

export interface PickedPlayer { id: string; first_name: string; last_name: string; birth_year: number | null; positions?: string | null }
export const playerName = (p: { first_name: string; last_name: string }) => `${p.first_name}${p.last_name && p.last_name !== '—' ? ' ' + p.last_name.toUpperCase() : ''}`

/** Find players by name. Single mode returns one player; multi mode toggles several. */
export function PlayerPicker({ value, onChange, multi, exclude = [] }: { value: PickedPlayer[]; onChange: (v: PickedPlayer[]) => void; multi?: boolean; exclude?: string[] }) {
  const [q, setQ] = useState('')
  const dq = useDebounced(q, 250)
  const [found, setFound] = useState<PickedPlayer[]>([])
  useEffect(() => {
    const words = dq.trim().replace(/[%,()]/g, ' ').split(/\s+/).filter(w => w.length >= 2)
    if (!words.length) { setFound([]); return }
    let qy = supabase.from('players').select('id, first_name, last_name, birth_year, positions').is('merged_into', null)
    for (const w of words) qy = qy.or(`first_name.ilike.%${w}%,last_name.ilike.%${w}%`)
    qy.order('last_name').limit(30).then(({ data }) => setFound(((data as PickedPlayer[]) ?? []).filter(p => !exclude.includes(p.id))))
  }, [dq, exclude.join(',')])
  const has = (id: string) => value.some(v => v.id === id)
  const toggle = (p: PickedPlayer) => multi ? onChange(has(p.id) ? value.filter(v => v.id !== p.id) : [...value, p]) : onChange([p])
  return (
    <div>
      <SearchInput value={q} onChange={setQ} placeholder="Type part of the player's name" />
      {value.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">{value.map(p => (
          <button key={p.id} type="button" onClick={() => onChange(value.filter(v => v.id !== p.id))} className="rounded-full bg-ink px-2.5 py-1 text-xs font-semibold text-white hover:bg-red" title="Remove">{playerName(p)} ×</button>
        ))}</div>
      )}
      {found.length > 0 && (
        <ul className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-line">{found.map(p => (
          <li key={p.id}><button type="button" onClick={() => toggle(p)} className={cx('flex w-full items-center gap-2 border-b border-line px-3 py-2 text-left text-sm last:border-0 hover:bg-paper', has(p.id) && 'bg-paper')}>
            <span className={cx('flex h-4 w-4 items-center justify-center rounded border', has(p.id) ? 'border-ink bg-ink text-white' : 'border-line-2')}>{has(p.id) && <Check size={11} />}</span>
            <span className="font-medium">{playerName(p)}</span><span className="text-muted">{p.birth_year ?? ''}{p.positions ? ` · ${p.positions}` : ''}</span>
          </button></li>
        ))}</ul>
      )}
    </div>
  )
}
