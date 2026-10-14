import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { cx } from '../components/ui'

// Day and night. The choice lives on this device; before a choice is made, the device's own setting decides.
export type Theme = 'light' | 'dark'
const KEY = 'tonynext.theme'
const media = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null)

export function readTheme(): Theme {
  try { const v = localStorage.getItem(KEY); if (v === 'light' || v === 'dark') return v } catch { /* storage blocked */ }
  return media()?.matches ? 'dark' : 'light'
}
export function applyTheme(t: Theme) {
  document.documentElement.dataset.theme = t
  document.documentElement.style.colorScheme = t
  const m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute('content', '#000000')
}
const listeners = new Set<(t: Theme) => void>()
export function setTheme(t: Theme) {
  try { localStorage.setItem(KEY, t) } catch { /* storage blocked */ }
  applyTheme(t); listeners.forEach(f => f(t))
}
if (typeof window !== 'undefined') {
  applyTheme(readTheme())
  media()?.addEventListener('change', () => { try { if (localStorage.getItem(KEY)) return } catch { /* ignore */ } const t = readTheme(); applyTheme(t); listeners.forEach(f => f(t)) })
}
export function useTheme() {
  const [theme, set] = useState<Theme>(readTheme)
  useEffect(() => { listeners.add(set); return () => { listeners.delete(set) } }, [])
  return { theme, toggle: () => setTheme(theme === 'dark' ? 'light' : 'dark') }
}

/** Sun / moon button for dark headers and the sidebar. */
export function ThemeButton({ className, labels = ['Night mode', 'Day mode'] }: { className?: string; labels?: [string, string] }) {
  const { theme, toggle } = useTheme()
  const label = theme === 'dark' ? labels[1] : labels[0]
  return (
    <button onClick={toggle} title={label} aria-label={label} data-tour="theme" className={cx('rounded-md p-2 text-white/60 hover:bg-white/10 hover:text-white', className)}>
      {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  )
}
