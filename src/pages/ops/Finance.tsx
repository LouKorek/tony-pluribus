import { useCallback, useEffect, useMemo, useState } from 'react'
import { FileText, Plus, Wallet } from 'lucide-react'
import { supabase, errMsg } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { useFileLinks } from '../../lib/teams'
import { Alert, Button, Card, Empty, Field, Input, Modal, MultiSelect, PageHeader, SearchInput, Select, Spinner, Stat, cx, useDebounced } from '../../components/ui'

interface Account { id: string; name: string; kind: string; currency: string; holder: string | null }
interface Tx { id: string; account_id: string; day: string; amount_out: number; amount_in: number; description: string | null; type: string | null; subtype: string | null; payee: string | null; invoice_ref: string | null; file_id: string | null; balance: number | null }
const rwf = (n: number) => Math.round(n).toLocaleString('en-GB')
const monthLabel = (m: string) => new Date(m + '-01T00:00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

export default function FinancePage() {
  const { can } = useAuth()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [acc, setAcc] = useState<string[]>([])
  const [months, setMonths] = useState<string[]>([])
  const [month, setMonth] = useState<string>('')
  const [types, setTypes] = useState<string[]>([])
  const [q, setQ] = useState('')
  const dq = useDebounced(q, 300)
  const [rows, setRows] = useState<Tx[] | null>(null)
  const [editing, setEditing] = useState<Tx | 'new' | null>(null)
  const canEdit = can('finance', 2)
  const files = useFileLinks(rows?.slice(0, 400).map(r => r.file_id) ?? [])

  useEffect(() => {
    supabase.from('finance_accounts').select('*').order('name').then(({ data }) => setAccounts((data as Account[]) ?? []))
    supabase.from('finance_tx').select('day').order('day', { ascending: false }).limit(5000).then(({ data }) => {
      const ms = [...new Set(((data as { day: string }[]) ?? []).map(d => d.day.slice(0, 7)))]
      setMonths(ms); setMonth(ms[0] ?? new Date().toISOString().slice(0, 7))
    })
  }, [])

  const load = useCallback(async () => {
    if (!month) return
    let query = supabase.from('finance_tx').select('*').order('day').order('created_at')
    if (dq.trim().length >= 2) { const t = dq.trim().replace(/[%_,()]/g, ''); query = query.or(`description.ilike.%${t}%,payee.ilike.%${t}%,type.ilike.%${t}%`).limit(500) }
    else if (month !== 'all') { const [y, m] = month.split('-').map(Number); const end = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`; query = query.gte('day', `${month}-01`).lt('day', `${end}-01`) }
    if (acc.length) query = query.in('account_id', acc)
    const { data } = await query
    setRows((data as Tx[]) ?? [])
  }, [month, acc, dq])
  useEffect(() => { setRows(null); load() }, [load])

  const shown = (rows ?? []).filter(r => !types.length || types.includes(r.type ?? '—'))
  const totals = useMemo(() => ({ out: shown.reduce((s, r) => s + Number(r.amount_out), 0), inn: shown.reduce((s, r) => s + Number(r.amount_in), 0) }), [shown])
  const byType = useMemo(() => {
    const m = new Map<string, number>(); shown.forEach(r => { if (Number(r.amount_out) > 0) m.set(r.type ?? '—', (m.get(r.type ?? '—') ?? 0) + Number(r.amount_out)) })
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
  }, [shown])
  const maxType = Math.max(1, ...byType.map(x => x[1]))
  const allTypes = [...new Set((rows ?? []).map(r => r.type ?? '—'))].sort()
  const accName = (id: string) => accounts.find(a => a.id === id)?.name ?? ''

  return (
    <div>
      <PageHeader eyebrow="Operations" title="Finance" description="Every expense and income of the mobile-money account and the staff cash books, with the receipt from the Finance folder. Amounts in RWF."
        actions={canEdit ? <Button variant="primary" onClick={() => setEditing('new')}><Plus size={16} /> New entry</Button> : undefined} />
      <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-center">
        <Select data-tour="fin-month" className="lg:w-52" value={month} onChange={e => setMonth(e.target.value)}>
          <option value="all">All months</option>{months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
        </Select>
        <MultiSelect className="lg:w-52" placeholder="All accounts" value={acc} onChange={setAcc} options={accounts.map(a => ({ value: a.id, label: a.name }))} />
        <MultiSelect className="lg:w-60" placeholder="All types" value={types} onChange={setTypes} options={allTypes.map(t => ({ value: t, label: t.replace(/_/g, ' ') }))} searchable />
        <SearchInput className="lg:ml-auto lg:w-64" value={q} onChange={setQ} placeholder="Search description or payee" />
      </div>
      <div data-tour="fin-totals" className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat accent label="Spent" value={rwf(totals.out)} sub="RWF" />
        <Stat label="Received" value={rwf(totals.inn)} sub="RWF" />
        <Stat label="Entries" value={shown.length} />
        <Stat label="With receipt" value={shown.filter(r => r.file_id || r.invoice_ref).length} sub={`of ${shown.length}`} />
      </div>
      {byType.length > 0 && (
        <Card className="mb-5 p-5">
          <div className="label-caps mb-3 text-muted">Spending by type</div>
          <div className="space-y-1.5">{byType.map(([t, v]) => (
            <div key={t} className="grid grid-cols-[minmax(0,220px)_1fr_auto] items-center gap-3 text-sm">
              <span className="truncate text-muted" title={t}>{t.replace(/_/g, ' ')}</span>
              <div className="h-4 rounded bg-black/5"><div className="h-4 rounded bg-ink" style={{ width: `${(v / maxType) * 100}%` }} /></div>
              <span className="w-28 text-right font-semibold">{rwf(v)}</span>
            </div>
          ))}</div>
        </Card>
      )}
      <Card data-tour="fin-table" className="overflow-hidden">
        {!rows ? <Spinner /> : !shown.length ? <Empty icon={<Wallet size={20} />} title="No entries" /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-sm">
              <thead><tr className="border-b border-line bg-paper/70 text-left text-xs text-muted">{['Date', 'Account', 'Description', 'Type', 'Payee', 'Out', 'In', 'Balance', 'Receipt'].map((h, i) => <th key={h} className={cx('px-3 py-2.5 font-semibold', i >= 5 && i <= 7 && 'text-right')}>{h}</th>)}</tr></thead>
              <tbody>{shown.map(r => (
                <tr key={r.id} onClick={() => canEdit && setEditing(r)} className={cx('border-b border-line last:border-0', canEdit && 'cursor-pointer hover:bg-paper/60')}>
                  <td className="whitespace-nowrap px-3 py-2">{new Date(r.day + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })}</td>
                  <td className="px-3 py-2 text-muted">{accName(r.account_id)}</td>
                  <td className="max-w-[300px] px-3 py-2">{r.description}</td>
                  <td className="px-3 py-2 text-xs text-muted">{(r.type ?? '').replace(/_/g, ' ')}{r.subtype ? ` · ${r.subtype.replace(/_/g, ' ')}` : ''}</td>
                  <td className="px-3 py-2 text-muted">{r.payee}</td>
                  <td className="px-3 py-2 text-right font-semibold">{Number(r.amount_out) ? rwf(Number(r.amount_out)) : ''}</td>
                  <td className="px-3 py-2 text-right font-semibold text-good">{Number(r.amount_in) ? rwf(Number(r.amount_in)) : ''}</td>
                  <td className="px-3 py-2 text-right text-muted">{r.balance != null ? rwf(Number(r.balance)) : ''}</td>
                  <td className="px-3 py-2">{r.file_id && files[r.file_id] ? <a onClick={e => e.stopPropagation()} href={files[r.file_id].url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-red hover:underline"><FileText size={13} /> Open</a> : r.invoice_ref ? <span className="text-xs text-faint" title={r.invoice_ref}>Named</span> : ''}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Card>
      {editing && <TxModal tx={editing === 'new' ? null : editing} accounts={accounts} types={allTypes} onClose={() => setEditing(null)} onDone={() => { setEditing(null); load() }} />}
    </div>
  )
}

function TxModal({ tx, accounts, types, onClose, onDone }: { tx: Tx | null; accounts: Account[]; types: string[]; onClose: () => void; onDone: () => void }) {
  const { profile } = useAuth()
  const [f, setF] = useState({ account_id: tx?.account_id ?? accounts[0]?.id ?? '', day: tx?.day ?? new Date().toISOString().slice(0, 10), out: tx ? String(Number(tx.amount_out) || '') : '', inn: tx ? String(Number(tx.amount_in) || '') : '', description: tx?.description ?? '', type: tx?.type ?? '', subtype: tx?.subtype ?? '', payee: tx?.payee ?? '', invoice_ref: tx?.invoice_ref ?? '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  async function save() {
    if (!f.account_id) return setErr('Choose the account.')
    if (!Number(f.out) && !Number(f.inn)) return setErr('Enter an amount out or in.')
    setBusy(true)
    const row = { account_id: f.account_id, day: f.day, amount_out: Number(f.out) || 0, amount_in: Number(f.inn) || 0, description: f.description || null, type: f.type || null, subtype: f.subtype || null, payee: f.payee || null, invoice_ref: f.invoice_ref || null }
    const { error } = tx ? await supabase.from('finance_tx').update(row).eq('id', tx.id) : await supabase.from('finance_tx').insert({ ...row, source: 'Pluribus', created_by: profile?.id })
    setBusy(false)
    if (error) return setErr(errMsg(error))
    onDone()
  }
  async function remove() { if (!tx) return; const { error } = await supabase.from('finance_tx').delete().eq('id', tx.id); if (error) setErr(errMsg(error)); else onDone() }
  return (
    <Modal open wide title={tx ? 'Edit entry' : 'New entry'} onClose={onClose}
      footer={<div className="flex w-full justify-between">{tx ? <Button variant="ghost" size="sm" onClick={remove}>Delete</Button> : <span />}<div className="flex gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>Save</Button></div></div>}>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Account"><Select value={f.account_id} onChange={e => setF({ ...f, account_id: e.target.value })}>{accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field>
          <Field label="Date"><Input type="date" value={f.day} onChange={e => setF({ ...f, day: e.target.value })} /></Field>
          <Field label="Out (RWF)"><Input inputMode="numeric" value={f.out} onChange={e => setF({ ...f, out: e.target.value.replace(/[^\d.]/g, '') })} /></Field>
          <Field label="In (RWF)"><Input inputMode="numeric" value={f.inn} onChange={e => setF({ ...f, inn: e.target.value.replace(/[^\d.]/g, '') })} /></Field>
        </div>
        <Field label="Description"><Input value={f.description} onChange={e => setF({ ...f, description: e.target.value })} /></Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Type"><Input list="fin-types" value={f.type} onChange={e => setF({ ...f, type: e.target.value })} /><datalist id="fin-types">{types.map(t => <option key={t} value={t} />)}</datalist></Field>
          <Field label="Sub-type"><Input value={f.subtype} onChange={e => setF({ ...f, subtype: e.target.value })} /></Field>
          <Field label="Payee"><Input value={f.payee} onChange={e => setF({ ...f, payee: e.target.value })} /></Field>
        </div>
        <Field label="Receipt / invoice" hint="The receipt's file name in the Finance folder."><Input value={f.invoice_ref} onChange={e => setF({ ...f, invoice_ref: e.target.value })} /></Field>
        {err && <Alert>{err}</Alert>}
      </div>
    </Modal>
  )
}
