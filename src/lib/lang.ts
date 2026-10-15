import { useSyncExternalStore } from 'react'

// The language the person chose on this device ('en', 'rw'): shared by the sign-in pages and the coach portal.
const KEY = 'tonynext.lang'
const listeners = new Set<() => void>()
export const readLang = (): string => { try { return localStorage.getItem(KEY) || 'en' } catch { return 'en' } }
export function writeLang(l: string) {
  try { localStorage.setItem(KEY, l) } catch { /* private mode */ }
  listeners.forEach(f => f())
}
export function useDeviceLang(): string {
  return useSyncExternalStore(cb => { listeners.add(cb); return () => { listeners.delete(cb) } }, readLang, () => 'en')
}
