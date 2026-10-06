import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight, X } from 'lucide-react'
import { cx } from '../components/ui'

// Guided tours. Every screen has a short tour that starts by itself the first time a user opens it.
// It can be skipped at any step, and the "?" button replays the tour of the screen you are on.
// Steps point at elements carrying data-tour="…" (or any CSS selector); a step without a target is shown centred.

export type Text = string | readonly [string, string]   // English, or [English, Kinyarwanda]
export interface TourStep { target?: string; title: Text; body: Text }
export type TourMap = Record<string, TourStep[]>

interface Labels { next: string; back: string; skip: string; done: string; of: string }
const EN: Labels = { next: 'Next', back: 'Back', skip: 'Skip tour', done: 'Done', of: 'of' }
const RW: Labels = { next: 'Komeza', back: 'Subira inyuma', skip: 'Simbuka', done: 'Ndabyumvise', of: 'muri' }

interface TourCtx { screen: string | null; hasTour: boolean; start: (key?: string) => void }
const Ctx = createContext<TourCtx>({ screen: null, hasTour: false, start: () => {} })
export const useTour = () => useContext(Ctx)

export function TourProvider({ tours, screen, seen, onSeen, lang = 'en', children }: {
  tours: TourMap; screen: string | null; seen: string[]; onSeen: (key: string) => void; lang?: 'en' | 'rw'; children: ReactNode
}) {
  const [active, setActive] = useState<{ key: string; i: number } | null>(null)
  const done = useRef(new Set(seen))
  useEffect(() => { seen.forEach(k => done.current.add(k)) }, [seen])

  // First visit to a screen: start its tour once the page has rendered.
  useEffect(() => {
    if (!screen || !tours[screen] || done.current.has(screen)) return
    const t = window.setTimeout(() => setActive(a => a ?? { key: screen, i: 0 }), 900)
    return () => window.clearTimeout(t)
  }, [screen, tours])

  // Leaving the screen closes a tour that belongs to it.
  useEffect(() => { setActive(a => (a && a.key !== screen ? null : a)) }, [screen])

  const finish = useCallback((key: string) => {
    setActive(null)
    if (!done.current.has(key)) { done.current.add(key); onSeen(key) }
  }, [onSeen])

  const start = useCallback((key?: string) => {
    const k = key ?? screen
    if (k && tours[k]) setActive({ key: k, i: 0 })
  }, [screen, tours])

  const steps = active ? tours[active.key] : null
  return (
    <Ctx.Provider value={{ screen, hasTour: !!(screen && tours[screen]), start }}>
      {children}
      {active && steps && (
        <TourOverlay key={active.key + active.i} steps={steps} index={active.i} lang={lang}
          onNext={() => (active.i + 1 >= steps.length ? finish(active.key) : setActive({ ...active, i: active.i + 1 }))}
          onBack={() => setActive({ ...active, i: Math.max(0, active.i - 1) })}
          onSkip={() => finish(active.key)} />
      )}
    </Ctx.Provider>
  )
}

const pick = (t: Text, lang: 'en' | 'rw') => (typeof t === 'string' ? t : lang === 'rw' ? t[1] : t[0])

function findTarget(sel?: string): HTMLElement | null {
  if (!sel) return null
  const list = [...document.querySelectorAll<HTMLElement>(sel.startsWith('[') || sel.includes(' ') || sel.startsWith('.') ? sel : `[data-tour="${sel}"]`)]
  return list.find(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 }) ?? null
}

function TourOverlay({ steps, index, lang, onNext, onBack, onSkip }: {
  steps: TourStep[]; index: number; lang: 'en' | 'rw'; onNext: () => void; onBack: () => void; onSkip: () => void
}) {
  const step = steps[index]
  const L = lang === 'rw' ? RW : EN
  const [rect, setRect] = useState<DOMRect | null>(null)
  const card = useRef<HTMLDivElement>(null)
  const [cardH, setCardH] = useState(180)

  useLayoutEffect(() => {
    const el = findTarget(step.target)
    if (el) el.scrollIntoView({ block: 'center', inline: 'nearest' })
    const measure = () => setRect(findTarget(step.target)?.getBoundingClientRect() ?? null)
    measure()
    const t = window.setTimeout(measure, 350)   // after smooth scrolling settles
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => { window.clearTimeout(t); window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure, true) }
  }, [step.target])

  useLayoutEffect(() => { if (card.current) setCardH(card.current.offsetHeight) })

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onSkip()
      else if (e.key === 'ArrowRight' || e.key === 'Enter') onNext()
      else if (e.key === 'ArrowLeft' && index > 0) onBack()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onNext, onBack, onSkip, index])

  const vw = window.innerWidth, vh = window.innerHeight
  const mobile = vw < 640
  const W = Math.min(360, vw - 24)
  const pad = 8
  let style: CSSProperties
  if (!rect || mobile) {
    style = mobile ? { left: 12, right: 12, bottom: 12 } : { left: (vw - W) / 2, top: Math.max(24, (vh - cardH) / 2), width: W }
  } else {
    const below = rect.bottom + pad + 12 + cardH < vh
    const top = below ? rect.bottom + pad + 12 : Math.max(12, rect.top - pad - 12 - cardH)
    const left = Math.min(Math.max(12, rect.left + rect.width / 2 - W / 2), vw - W - 12)
    style = { left, top, width: W }
  }

  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label={pick(step.title, lang)}>
      {rect ? (
        <div className="pointer-events-none absolute rounded-lg ring-2 ring-lime transition-all duration-200"
          style={{ left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2, boxShadow: '0 0 0 9999px rgba(14,19,17,.62)' }} />
      ) : <div className="absolute inset-0 bg-ink/60" />}
      <div ref={card} className={cx('absolute rounded-xl bg-card p-4 text-text shadow-2xl', mobile && 'pb-[max(1rem,env(safe-area-inset-bottom))]')} style={style}>
        <div className="flex items-start justify-between gap-3">
          <div className="label-caps text-[11px] text-red">{index + 1} {L.of} {steps.length}</div>
          <button onClick={onSkip} className="-mr-1 -mt-1 rounded-md p-1 text-muted hover:bg-black/5 hover:text-text" aria-label={L.skip}><X size={16} /></button>
        </div>
        <div className="mt-1 font-display text-xl font-bold uppercase leading-tight">{pick(step.title, lang)}</div>
        <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{pick(step.body, lang)}</p>
        <div className="mt-4 flex items-center justify-between gap-2">
          <button onClick={onSkip} className="text-sm font-semibold text-muted hover:text-text">{L.skip}</button>
          <div className="flex items-center gap-2">
            {index > 0 && <button onClick={onBack} className="flex h-9 items-center gap-1 rounded-lg border border-line-2 px-3 text-sm font-semibold hover:border-text/40"><ArrowLeft size={14} />{L.back}</button>}
            <button onClick={onNext} autoFocus className="flex h-9 items-center gap-1 rounded-lg bg-ink px-3.5 text-sm font-semibold text-white hover:bg-ink-3">
              {index + 1 === steps.length ? L.done : <>{L.next}<ArrowRight size={14} /></>}
            </button>
          </div>
        </div>
        <div className="mt-3 flex gap-1">{steps.map((_, i) => <span key={i} className={cx('h-1 flex-1 rounded-full', i <= index ? 'bg-red' : 'bg-line')} />)}</div>
      </div>
    </div>
  )
}
