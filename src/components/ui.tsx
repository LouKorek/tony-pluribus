import { useEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { X, Loader2 } from 'lucide-react'

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')
export { cx }

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'dark'
export function Button({ variant = 'secondary', size = 'md', loading, className, children, ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md'; loading?: boolean }) {
  const v: Record<Variant, string> = {
    primary: 'bg-red text-white hover:bg-red-dark border-red',
    secondary: 'bg-card text-text border-line-2 hover:border-text/40',
    ghost: 'bg-transparent text-muted border-transparent hover:bg-black/5 hover:text-text',
    danger: 'bg-card text-red border-red/30 hover:bg-red-soft',
    dark: 'bg-ink text-white border-ink hover:bg-ink-3',
  }
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-lg border font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap',
        size === 'sm' ? 'h-8 px-3 text-[13px]' : 'h-10 px-4 text-sm',
        v[variant], className)}
    >
      {loading && <Loader2 size={15} className="animate-spin" />}
      {children}
    </button>
  )
}

export function Field({ label, hint, error, children, required }: { label: string; hint?: ReactNode; error?: string | null; children: ReactNode; required?: boolean }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-semibold text-text">{label}{required && <span className="text-red"> *</span>}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-muted">{hint}</span>}
      {error && <span className="mt-1 block text-xs font-medium text-red">{error}</span>}
    </label>
  )
}

const inputCls = 'focus-visible:outline-none w-full rounded-lg border border-line-2 bg-card px-3 text-[15px] text-text placeholder:text-faint focus:border-ink focus:outline-none focus:ring-2 focus:ring-lime/70'
export function Input(p: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...p} className={cx(inputCls, 'h-10', p.className)} />
}
export function Select({ children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...p} className={cx(inputCls, 'h-10 pr-8', p.className)}>{children}</select>
}
export function Textarea(p: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...p} className={cx(inputCls, 'py-2', p.className)} />
}

export function Card({ children, className, ...rest }: { children: ReactNode; className?: string; 'data-tour'?: string }) {
  return <div {...rest} className={cx('rounded-xl border border-line bg-card', className)}>{children}</div>
}

type Tone = 'neutral' | 'good' | 'warn' | 'bad' | 'info' | 'lime' | 'dark'
export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  const t: Record<Tone, string> = {
    neutral: 'bg-black/5 text-muted',
    good: 'bg-good-soft text-good',
    warn: 'bg-warn-soft text-warn',
    bad: 'bg-red-soft text-red',
    info: 'bg-info-soft text-info',
    lime: 'bg-lime text-ink',
    dark: 'bg-ink text-white',
  }
  return <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap', t[tone])}>{children}</span>
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div data-tour="page-header">
        {eyebrow && <div className="label-caps mb-1 text-red">{eyebrow}</div>}
        <h1 className="font-display text-3xl font-bold uppercase leading-none tracking-tight text-text sm:text-[34px]">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-[15px] text-muted">{description}</p>}
      </div>
      {actions && <div data-tour="page-actions" className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/60 p-0 sm:items-center sm:p-6" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={cx('flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl bg-card shadow-2xl sm:rounded-2xl', wide ? 'sm:max-w-2xl' : 'sm:max-w-lg')} role="dialog" aria-modal="true" aria-label={title}>
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="font-display text-xl font-bold uppercase tracking-tight">{title}</h2>
          <button onClick={onClose} className="rounded-md p-1 text-muted hover:bg-black/5 hover:text-text" aria-label="Close"><X size={18} /></button>
        </div>
        <div className="scroll-thin flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line bg-paper/60 px-5 py-3">{footer}</div>}
      </div>
    </div>
  )
}

export function Empty({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-paper text-muted">{icon}</div>
      <div className="font-semibold">{title}</div>
      {children && <div className="mt-1 max-w-sm text-sm text-muted">{children}</div>}
    </div>
  )
}

export function Alert({ tone = 'bad', children }: { tone?: 'bad' | 'good' | 'info' | 'warn'; children: ReactNode }) {
  const t = { bad: 'border-red/25 bg-red-soft text-red', good: 'border-good/25 bg-good-soft text-good', info: 'border-info/25 bg-info-soft text-info', warn: 'border-warn/25 bg-warn-soft text-warn' }
  return <div className={cx('rounded-lg border px-3 py-2 text-sm font-medium', t[tone])}>{children}</div>
}

export function Spinner() {
  return <div className="flex h-full min-h-[40vh] items-center justify-center text-muted"><Loader2 className="animate-spin" /></div>
}

export function Stat({ label, value, sub, accent }: { label: string; value: ReactNode; sub?: ReactNode; accent?: boolean }) {
  return (
    <Card className={cx('p-4', accent && 'border-ink bg-ink text-white')}>
      <div data-tour="stat" className={cx('label-caps', accent ? 'text-lime' : 'text-muted')}>{label}</div>
      <div className="mt-1 font-display text-4xl font-bold leading-none">{value}</div>
      {sub && <div className={cx('mt-1.5 text-xs', accent ? 'text-white/60' : 'text-muted')}>{sub}</div>}
    </Card>
  )
}

export function generatePassword() {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'
  const a = new Uint32Array(10); crypto.getRandomValues(a)
  return Array.from(a, n => chars[n % chars.length]).join('')
}

export function Drawer({ open, onClose, title, subtitle, children, footer, width = 560 }: { open: boolean; onClose: () => void; title: ReactNode; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode; width?: number }) {
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink/50" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="flex h-full w-full flex-col bg-card shadow-2xl" style={{ maxWidth: width }} role="dialog" aria-modal="true">
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate font-display text-2xl font-bold uppercase leading-tight tracking-tight">{title}</h2>
            {subtitle && <div className="mt-0.5 text-sm text-muted">{subtitle}</div>}
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-muted hover:bg-black/5 hover:text-text" aria-label="Close"><X size={18} /></button>
        </div>
        <div className="scroll-thin flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line bg-paper/60 px-5 py-3">{footer}</div>}
      </div>
    </div>
  )
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode; count?: number }[] }) {
  return (
    <div data-tour="tabs" className="inline-flex flex-wrap gap-1 rounded-lg bg-black/5 p-1">
      {options.map(o => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)}
          className={cx('flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold transition-colors', value === o.value ? 'bg-card text-text shadow-sm' : 'text-muted hover:text-text')}>
          {o.label}
          {o.count !== undefined && <span className="rounded-full bg-black/8 px-1.5 text-[11px] text-muted">{o.count}</span>}
        </button>
      ))}
    </div>
  )
}

export function SearchInput({ value, onChange, placeholder, className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <div data-tour="search" className={cx('relative', className)}>
      <svg className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="h-10 w-full rounded-lg border border-line-2 bg-card pl-9 pr-3 text-[15px] placeholder:text-faint focus:border-ink focus:outline-none focus:ring-2 focus:ring-lime/70" />
    </div>
  )
}

export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return <th className={cx('whitespace-nowrap px-3 py-2.5 text-left text-xs font-semibold text-muted', className)}>{children}</th>
}
export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return <td className={cx('px-3 py-2.5 align-middle', className)}>{children}</td>
}

export function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = useState(value)
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t) }, [value, ms])
  return v
}

/** Print only the element marked .print-area (for example a certificate). */
export function printArea() {
  document.body.classList.add('print-only')
  const done = () => { document.body.classList.remove('print-only'); window.removeEventListener('afterprint', done) }
  window.addEventListener('afterprint', done)
  window.print()
}

/** Pick any number of options. Empty selection means "all" unless `noneLabel` says otherwise. */
export function MultiSelect({ options, value, onChange, placeholder = 'All', className, disabled, searchable, allLabel }: {
  options: { value: string; label: string; group?: string }[]; value: string[]; onChange: (v: string[]) => void
  placeholder?: string; className?: string; disabled?: boolean; searchable?: boolean; allLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [up, setUp] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false) }
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', h); document.addEventListener('keydown', k)
    if (box.current) setUp(box.current.getBoundingClientRect().bottom > window.innerHeight - 300)
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k) }
  }, [open])
  const sel = new Set(value)
  const shown = options.filter(o => !q || o.label.toLowerCase().includes(q.toLowerCase()))
  const toggle = (v: string) => onChange(sel.has(v) ? value.filter(x => x !== v) : [...value, v])
  const label = value.length === 0 ? placeholder : value.length === 1 ? (options.find(o => o.value === value[0])?.label ?? '1 selected') : `${value.length} selected`
  let lastGroup: string | undefined
  return (
    <div ref={box} className={cx('relative', className)}>
      <button type="button" disabled={disabled} onClick={() => setOpen(o => !o)} aria-haspopup="listbox" aria-expanded={open}
        className={cx('flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-line-2 bg-card px-3 text-left text-[15px] focus:border-ink focus:outline-none focus:ring-2 focus:ring-lime/70 disabled:opacity-60', value.length ? 'text-text' : 'text-muted')}>
        <span className="truncate">{label}</span>
        <span className="flex items-center gap-1">
          {value.length > 0 && !disabled && <span role="button" tabIndex={-1} aria-label="Clear" onMouseDown={e => { e.stopPropagation(); onChange([]) }} className="rounded p-0.5 text-faint hover:bg-black/5 hover:text-text"><X size={13} /></span>}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-faint"><path d="m6 9 6 6 6-6" /></svg>
        </span>
      </button>
      {open && (
        <div className={cx('absolute left-0 z-40 w-full min-w-[220px] overflow-hidden rounded-lg border border-line bg-card shadow-xl', up ? 'bottom-full mb-1' : 'top-full mt-1')} role="listbox" aria-multiselectable="true">
          {(searchable ?? options.length > 8) && <div className="border-b border-line p-2"><input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search" className="h-8 w-full rounded-md border border-line-2 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-lime/70" /></div>}
          <div className="flex items-center justify-between border-b border-line px-3 py-1.5 text-xs">
            <button type="button" className="font-semibold text-red hover:underline" onClick={() => onChange(shown.map(o => o.value))}>Select {q ? 'shown' : 'all'}</button>
            <button type="button" className="text-muted hover:text-text" onClick={() => onChange([])}>{allLabel ?? 'Clear'}</button>
          </div>
          <div className="scroll-thin max-h-64 overflow-y-auto py-1">
            {shown.map(o => {
              const head = o.group && o.group !== lastGroup ? o.group : null
              lastGroup = o.group
              return (
                <div key={o.value}>
                  {head && <div className="px-3 pb-0.5 pt-2 text-[11px] font-semibold uppercase tracking-wide text-faint">{head}</div>}
                  <label className="flex cursor-pointer items-center gap-2.5 px-3 py-1.5 text-sm hover:bg-paper">
                    <input type="checkbox" className="h-4 w-4 accent-red" checked={sel.has(o.value)} onChange={() => toggle(o.value)} />
                    <span className="truncate">{o.label}</span>
                  </label>
                </div>
              )
            })}
            {!shown.length && <div className="px-3 py-3 text-sm text-muted">Nothing found</div>}
          </div>
        </div>
      )}
    </div>
  )
}
