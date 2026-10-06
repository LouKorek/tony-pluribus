import { useState } from 'react'
import { Eye, Undo2 } from 'lucide-react'
import { stopViewAs, viewingAs } from '../lib/viewAs'

/** Shown on every screen while the owner is looking at the system as another user. */
export default function ViewAsBanner() {
  const [target] = useState(viewingAs)
  const [busy, setBusy] = useState(false)
  if (!target) return null
  return (
    <div className="fixed bottom-20 left-1/2 z-[60] sm:bottom-4 flex max-w-[94vw] -translate-x-1/2 items-center gap-2 rounded-full border border-ink bg-lime py-1 pl-3 pr-1 text-sm text-ink shadow-lg">
      <Eye size={15} className="shrink-0" />
      <span className="truncate">Viewing as <b>{target}</b></span>
      <button disabled={busy} onClick={() => { setBusy(true); stopViewAs() }}
        className="flex shrink-0 items-center gap-1 rounded-full bg-ink px-3 py-1 text-xs font-semibold text-white hover:bg-ink-3 disabled:opacity-60">
        <Undo2 size={13} /> Back to my account
      </button>
    </div>
  )
}
