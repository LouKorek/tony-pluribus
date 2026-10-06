import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  ChevronRight, ExternalLink, File, FileImage, FileSpreadsheet, FileText, FileVideo, Folder, FolderOpen, Lock, Presentation,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { Alert, Card, Empty, PageHeader, SearchInput, Spinner, cx, useDebounced } from '../components/ui'

interface Item { id: string; path: string; parent: string; name: string; is_folder: boolean; ext: string | null; size: number | null; modified_at: string | null; restricted: boolean }
interface Stats { files: number; folders: number; bytes: number; indexed_at: string | null; modified_at: string | null }

const OFFICE = ['xlsx', 'xls', 'docx', 'doc', 'pptx', 'ppt']
const fmtSize = (b: number | null) => b == null ? '' : b < 1024 ? `${b} B` : b < 1048576 ? `${Math.round(b / 1024)} KB` : b < 1073741824 ? `${(b / 1048576).toFixed(1)} MB` : `${(b / 1073741824).toFixed(1)} GB`
const fmtWhen = (d: string | null) => d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''

function icon(i: Item) {
  if (i.is_folder) return <Folder size={18} className="text-warn" />
  const e = i.ext ?? ''
  if (['xlsx', 'xls', 'csv'].includes(e)) return <FileSpreadsheet size={18} className="text-good" />
  if (['pptx', 'ppt'].includes(e)) return <Presentation size={18} className="text-red" />
  if (['docx', 'doc', 'pdf', 'txt'].includes(e)) return <FileText size={18} className="text-info" />
  if (['jpg', 'jpeg', 'png', 'heic', 'cr2'].includes(e)) return <FileImage size={18} className="text-muted" />
  if (['mp4', 'mov', 'avi'].includes(e)) return <FileVideo size={18} className="text-muted" />
  return <File size={18} className="text-muted" />
}

export default function FilesPage() {
  const { project, profile } = useAuth()
  const [params, setParams] = useSearchParams()
  const path = params.get('p') ?? ''
  const [q, setQ] = useState('')
  const dq = useDebounced(q, 300)
  const [items, setItems] = useState<Item[] | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const root = project?.sharepoint_root ?? ''
  const spUrl = (i: { path: string; is_folder?: boolean; ext?: string | null }) =>
    encodeURI(`${root}/${i.path}`) + (!i.is_folder && OFFICE.includes(i.ext ?? '') ? '?web=1' : '')

  useEffect(() => { supabase.rpc('talent_folder_stats').then(({ data }) => setStats(data as Stats)) }, [])

  useEffect(() => {
    setItems(null); setErr(null)
    const base = supabase.from('talent_files').select('id, path, parent, name, is_folder, ext, size, modified_at, restricted')
    const query = dq.trim().length >= 2
      ? base.ilike('name', `%${dq.trim().replace(/[%_]/g, '')}%`).order('is_folder', { ascending: false }).order('modified_at', { ascending: false }).limit(300)
      : base.eq('parent', path).order('is_folder', { ascending: false }).order('name').limit(2000)
    query.then(({ data, error }) => { if (error) setErr(error.message); else setItems((data as Item[]) ?? []) })
  }, [path, dq])

  const crumbs = useMemo(() => path ? path.split('/').map((name, i, a) => ({ name, path: a.slice(0, i + 1).join('/') })) : [], [path])
  const go = (p: string) => { setQ(''); setParams(p ? { p } : {}) }
  const searching = dq.trim().length >= 2

  return (
    <div>
      <PageHeader eyebrow="System" title="Files"
        description={<>The shared <b>Talent</b> folder that SL Benfica and TFEP work in. Open any file in SharePoint from here. Kept in sync with SharePoint every 15 minutes{stats?.indexed_at ? `, last read ${fmtWhen(stats.indexed_at)}` : ''}.</>}
        actions={root ? <a href={encodeURI(path ? `${root}/${path}` : root)} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-lg border border-line-2 bg-card px-4 text-sm font-semibold hover:border-text/40"><ExternalLink size={15} /> Open in SharePoint</a> : undefined} />

      {stats && (
        <div data-tour="file-stats" className="mb-4 flex flex-wrap gap-2 text-sm">
          <span className="rounded-md border border-line bg-card px-2.5 py-1"><b>{stats.folders.toLocaleString()}</b> <span className="text-muted">folders</span></span>
          <span className="rounded-md border border-line bg-card px-2.5 py-1"><b>{stats.files.toLocaleString()}</b> <span className="text-muted">files</span></span>
          <span className="rounded-md border border-line bg-card px-2.5 py-1"><span className="text-muted">last change</span> <b>{fmtWhen(stats.modified_at)}</b></span>
          {profile?.role !== 'owner' && <span className="flex items-center gap-1 rounded-md border border-line bg-card px-2.5 py-1 text-muted"><Lock size={13} /> Folders you do not have access to are hidden</span>}
        </div>
      )}

      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <nav data-tour="crumbs" className="flex min-w-0 flex-wrap items-center gap-1 text-sm" aria-label="Folder path">
          <button onClick={() => go('')} className={cx('rounded px-1.5 py-0.5 font-semibold', path ? 'text-red hover:underline' : 'text-text')}>Talent</button>
          {crumbs.map((c, i) => (
            <span key={c.path} className="flex items-center gap-1">
              <ChevronRight size={14} className="text-faint" />
              <button onClick={() => go(c.path)} className={cx('max-w-[220px] truncate rounded px-1.5 py-0.5', i === crumbs.length - 1 ? 'font-semibold' : 'text-red hover:underline')}>{c.name}</button>
            </span>
          ))}
        </nav>
        <SearchInput className="sm:w-80" value={q} onChange={setQ} placeholder="Search the whole folder by file name" />
      </div>

      {err && <Alert>{err}</Alert>}
      <Card data-tour="file-list" className="overflow-hidden">
        {!items ? <Spinner /> : items.length === 0 ? (
          <Empty icon={<FolderOpen size={20} />} title={searching ? 'No file matches' : 'This folder is empty'}>{searching ? 'Try another part of the name.' : ''}</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead><tr className="border-b border-line bg-paper/70 text-left text-xs text-muted">
                <th className="px-4 py-2.5 font-semibold">Name</th>
                <th className="px-3 py-2.5 font-semibold">{searching ? 'Folder' : 'Modified'}</th>
                <th className="px-3 py-2.5 text-right font-semibold">Size</th>
                <th className="w-10" />
              </tr></thead>
              <tbody>
                {items.map(i => (
                  <tr key={i.id} className="group border-b border-line last:border-0 hover:bg-paper/60">
                    <td className="px-4 py-2">
                      {i.is_folder
                        ? <button onClick={() => go(i.path)} className="flex items-center gap-2.5 text-left font-semibold">{icon(i)}<span className="truncate">{i.name}</span>{i.restricted && <Lock size={12} className="text-faint" />}</button>
                        : <a href={spUrl(i)} target="_blank" rel="noreferrer" className="flex items-center gap-2.5 hover:text-red">{icon(i)}<span className="truncate">{i.name}</span>{i.restricted && <Lock size={12} className="text-faint" />}</a>}
                    </td>
                    <td className="px-3 py-2 text-muted">
                      {searching
                        ? <button onClick={() => go(i.parent)} className="max-w-[320px] truncate text-left hover:text-red" title={i.parent}>{i.parent || 'Talent'}</button>
                        : fmtWhen(i.modified_at)}
                    </td>
                    <td className="px-3 py-2 text-right text-muted">{i.is_folder ? '' : fmtSize(i.size)}</td>
                    <td className="px-2 py-2 text-right">
                      <a href={spUrl(i)} target="_blank" rel="noreferrer" title="Open in SharePoint" className="inline-flex rounded p-1 text-faint opacity-0 hover:text-text group-hover:opacity-100"><ExternalLink size={14} /></a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {searching && items && items.length >= 300 && <p className="mt-2 text-sm text-muted">Showing the first 300 matches. Type more of the name to narrow it down.</p>}
    </div>
  )
}
