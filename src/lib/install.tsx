import { useEffect, useState } from 'react'
import { MonitorDown } from 'lucide-react'
import { cx } from '../components/ui'

// "Install Pluribus" — the browser offers it once the app meets the install rules
// (manifest, icons, service worker). The event can fire before React starts, so it is caught here at load.
interface PromptEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }
let deferred: PromptEvent | null = null
const listeners = new Set<() => void>()
const notify = () => listeners.forEach(f => f())
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e as PromptEvent; notify() })
  window.addEventListener('appinstalled', () => { deferred = null; notify() })
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}) })
  }
}
export const isInstalled = () => typeof window !== 'undefined' && (window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true)

export function useInstall() {
  const [, force] = useState(0)
  useEffect(() => { const f = () => force(x => x + 1); listeners.add(f); return () => { listeners.delete(f) } }, [])
  return {
    canInstall: !!deferred && !isInstalled(),
    install: async () => { if (!deferred) return; const d = deferred; await d.prompt(); const { outcome } = await d.userChoice; if (outcome === 'accepted') { deferred = null; notify() } },
  }
}

/** Sidebar row (staff) or icon (coach header) that installs Pluribus as a desktop / phone app. */
export function InstallButton({ variant = 'row', label = 'Install Pluribus app', className }: { variant?: 'row' | 'icon'; label?: string; className?: string }) {
  const { canInstall, install } = useInstall()
  if (!canInstall) return null
  return variant === 'icon'
    ? <button onClick={install} title={label} aria-label={label} className={cx('rounded-md p-2 text-white/70 hover:bg-white/10 hover:text-white', className)}><MonitorDown size={18} /></button>
    : <button onClick={install} className={cx('flex w-full items-center gap-2.5 rounded-lg border border-white/10 px-3 py-2 text-left text-sm text-white/80 hover:border-lime/50 hover:text-white', className)}>
        <MonitorDown size={16} className="text-lime" /><span className="flex-1">{label}</span>
      </button>
}
