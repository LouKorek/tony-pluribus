import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Bot, Send, Sparkles, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth, isAdmin } from '../../lib/auth'
import { Alert, Button, Card, PageHeader, cx } from '../../components/ui'

interface Msg { role: 'user' | 'assistant'; content: string }
const SUGGEST = [
  'How many players did each province send to the finals this season?',
  'Who are the top scorers of the U15 this season?',
  'Which U17 players improved their 20 m sprint the most?',
  'How much did we spend on transport last month?',
  'Which Tony players are missing a birth certificate?',
  'What did the staff do last week?',
]

/** Tiny markdown: paragraphs, lists, bold and simple tables. */
function Rich({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/)
  const inline = (s: string) => s.split(/(\*\*[^*]+\*\*)/g).map((p, i) => p.startsWith('**') ? <b key={i}>{p.slice(2, -2)}</b> : p)
  return <>{blocks.map((b, i) => {
    const lines = b.split('\n')
    if (lines.length >= 2 && lines.every(l => l.trim().startsWith('|'))) {
      const rows = lines.filter(l => !/^\s*\|[\s:|-]+\|\s*$/.test(l)).map(l => l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim()))
      return <div key={i} className="my-2 overflow-x-auto"><table className="text-sm"><thead><tr>{rows[0].map((c, j) => <th key={j} className="border-b border-line px-2 py-1 text-left font-semibold">{inline(c)}</th>)}</tr></thead>
        <tbody>{rows.slice(1).map((r, k) => <tr key={k}>{r.map((c, j) => <td key={j} className="border-b border-line px-2 py-1">{inline(c)}</td>)}</tr>)}</tbody></table></div>
    }
    if (lines.every(l => /^\s*([-*•]|\d+\.)\s/.test(l))) return <ul key={i} className="my-1.5 list-disc space-y-0.5 pl-5">{lines.map((l, j) => <li key={j}>{inline(l.replace(/^\s*([-*•]|\d+\.)\s/, ''))}</li>)}</ul>
    return <p key={i} className="my-1.5 whitespace-pre-line">{inline(b.replace(/^#+\s*/gm, ''))}</p>
  })}</>
}

export default function AssistantPage() {
  const { profile } = useAuth()
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [setup, setSetup] = useState(false)
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs, busy])

  async function ask(text: string) {
    const q = text.trim()
    if (!q || busy) return
    const next = [...msgs, { role: 'user' as const, content: q }]
    setMsgs(next); setDraft(''); setBusy(true); setErr(null)
    const { data, error } = await supabase.functions.invoke('assistant', { body: { messages: next } })
    setBusy(false)
    let message = (data as { error?: string } | null)?.error
    if (error) {
      const ctx = (error as { context?: Response }).context
      const status = ctx?.status
      try { message = (await ctx?.json())?.error ?? message } catch { /* not json */ }
      if (status === 404 || message === 'not_configured' || /Failed to send a request/i.test(error.message)) { setSetup(true); setMsgs(msgs); return }
      setErr(message ?? error.message); return
    }
    if (message) { setErr(message); return }
    setMsgs([...next, { role: 'assistant', content: (data as { answer: string }).answer }])
  }
  const submit = (e: FormEvent) => { e.preventDefault(); ask(draft) }

  return (
    <div className="flex h-[calc(100vh-9rem)] min-h-[520px] flex-col">
      <PageHeader eyebrow="Operations" title="AI assistant" description="Ask about players, camps, squads, matches, tests, finance or the staff log, in any language. It reads the same data you can see, nothing more, and never changes anything."
        actions={msgs.length ? <Button variant="ghost" onClick={() => { setMsgs([]); setErr(null) }}><Trash2 size={15} /> New conversation</Button> : undefined} />
      {setup && (
        <div className="mb-4"><Alert tone="info">
          <b>The assistant is not switched on yet.</b>{isAdmin(profile) ? <> It needs a key from Anthropic. In Supabase open <i>Edge Functions → Secrets</i>, add <code>ANTHROPIC_API_KEY</code> with the key from console.anthropic.com, and make sure the function <code>assistant</code> is deployed. Then ask again.</> : ' Please ask an admin to switch it on.'}
        </Alert></div>
      )}
      <Card data-tour="chat" className="flex min-h-0 flex-1 flex-col">
        <div className="scroll-thin flex-1 space-y-4 overflow-y-auto p-5">
          {!msgs.length ? (
            <div className="mx-auto max-w-2xl py-6 text-center">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-lime text-ink"><Sparkles size={22} /></span>
              <div className="mt-3 font-display text-2xl font-bold uppercase">What do you want to know?</div>
              <div data-tour="suggestions" className="mt-5 grid gap-2 sm:grid-cols-2">
                {SUGGEST.map(s => <button key={s} onClick={() => ask(s)} className="rounded-lg border border-line bg-paper/60 px-3 py-2.5 text-left text-sm hover:border-ink/30 hover:bg-paper">{s}</button>)}
              </div>
            </div>
          ) : msgs.map((m, i) => (
            <div key={i} className={cx('flex gap-3', m.role === 'user' && 'justify-end')}>
              {m.role === 'assistant' && <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-lime"><Bot size={15} /></span>}
              <div className={cx('max-w-[80%] rounded-2xl px-4 py-2.5 text-sm', m.role === 'user' ? 'bg-ink text-white' : 'bg-paper')}>{m.role === 'user' ? <span className="whitespace-pre-line">{m.content}</span> : <Rich text={m.content} />}</div>
            </div>
          ))}
          {busy && <div className="flex gap-3"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-ink text-lime"><Bot size={15} /></span><div className="rounded-2xl bg-paper px-4 py-3 text-sm text-muted"><span className="animate-pulse">Looking into the data…</span></div></div>}
          {err && <Alert>{err}</Alert>}
          <div ref={end} />
        </div>
        <form data-tour="ask" onSubmit={submit} className="flex gap-2 border-t border-line p-3">
          <textarea rows={1} value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(draft) } }}
            placeholder="Ask a question…" className="min-h-10 flex-1 resize-none rounded-lg border border-line bg-card px-3 py-2 text-sm outline-none focus:border-ink" />
          <Button variant="primary" type="submit" disabled={!draft.trim() || busy} aria-label="Send"><Send size={16} /></Button>
        </form>
      </Card>
    </div>
  )
}
