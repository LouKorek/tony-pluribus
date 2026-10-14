import { useMemo } from 'react'
import { cx } from '../components/ui'
import { useAuth } from './auth'

// Tony brand (Brandbook 2024, Oslop Studio): wordmark, emblem, the lightning pattern and the partner rule.
// The partner of a project (SL Benfica for Tony Rwanda) is a project setting and appears only where the
// partnership itself is the content: certificates, exports and shared pages. Never in the app chrome.

export const APP_NAME = 'Tony Next'
export const TAGLINE = 'The global stars of tomorrow'

type LogoVariant = 'wordmark' | 'emblem' | 'stacked' | 'letters'
type LogoColor = 'neon' | 'white' | 'black'
export function Logo({ variant = 'wordmark', color = 'white', className, alt = 'Tony' }: { variant?: LogoVariant; color?: LogoColor; className?: string; alt?: string }) {
  const file = `/brand/tony-${variant}${color === 'black' ? '' : '-' + color}.svg`
  return <img src={file} alt={alt} className={cx('block select-none', className)} draggable={false} />
}

/** The lightning pattern of the brand: diagonal bands with a horizontal step. Outlined by default, solid with `fill`. */
export function Bolts({ width = 1200, height = 630, stroke = 'rgba(255,255,255,.14)', fill, scale = 1, gap = 120, className }: {
  width?: number; height?: number; stroke?: string; fill?: string; scale?: number; gap?: number; className?: string
}) {
  const paths = useMemo(() => boltLattice(width, height, scale, gap), [width, height, scale, gap])
  return (
    <svg className={cx('pointer-events-none', className)} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid slice" aria-hidden>
      {paths.map((t, i) => <path key={i} d={BOLT(scale)} transform={t} fill={fill ?? 'none'} stroke={fill ? 'none' : stroke} strokeWidth={2} />)}
    </svg>
  )
}

const U = [0.875, -0.484] as const, N = [0.484, 0.875] as const
function BOLT(scale: number) {
  const len = 900 * scale, w = 26 * scale, chord = w / -U[1], j = chord * 0.8
  const mul = (a: readonly number[], k: number) => [a[0] * k, a[1] * k]
  const add = (a: number[], b: number[]) => [a[0] + b[0], a[1] + b[1]]
  const L1 = mul(U, len / 2), tU = len / 2 - N[1] * w / -U[1], Uc = add(mul(U, tU), mul(N, -w)), s = [-j, 0]
  const poly = [[0, 0], L1, add(L1, s), add(mul(U, len), s), add(add(mul(U, len), mul(N, -w)), s), add(Uc, s), Uc, mul(N, -w)]
  return poly.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ') + ' Z'
}
function boltLattice(W: number, H: number, scale: number, gap: number) {
  const len = 900 * scale, chord = 26 * scale / -U[1], j = chord * 0.8
  const A = [U[0] * (len + 80 * scale) - j, U[1] * (len + 80 * scale)]
  const B = [N[0] * gap * scale + A[0] * 0.37, N[1] * gap * scale + A[1] * 0.37]
  const out: string[] = []
  for (let i = -40; i < 40; i++) for (let k = -40; k < 40; k++) {
    const x = i * A[0] + k * B[0], y = i * A[1] + k * B[1] + H
    if (x < -len - 50 || x > W + 50 || y < -50 || y > H + len + 50) continue
    out.push(`translate(${x.toFixed(1)} ${y.toFixed(1)})`)
  }
  return out
}

export interface Partner { name: string; logo: string | null; show_in: ('certificates' | 'exports' | 'share')[] }
export interface ProjectSettings { tagline?: string; partner?: Partner | null; languages?: string[]; currency?: string; geo_labels?: { region: string; district: string }; points_name?: { one?: string; many?: string; short?: string } }

/** What this project calls its points ("Tonys"): singular, plural and the short form for tables. */
export function usePointsName(): { one: string; many: string; short: string; Many: string } {
  const { project } = useAuth()
  const n = (project?.settings as ProjectSettings | undefined)?.points_name
  const many = n?.many?.trim() || 'points'
  return { one: n?.one?.trim() || 'point', many, short: n?.short?.trim() || (n?.many?.trim() ? many : 'pts'), Many: many.charAt(0).toUpperCase() + many.slice(1) }
}

/** What this project calls its two geographic levels (Rwanda: Province and District). */
export function useGeo(): { region: string; district: string; regions: string; districts: string } {
  const { project } = useAuth()
  const g = (project?.settings as ProjectSettings | undefined)?.geo_labels
  const region = g?.region || 'Province', district = g?.district || 'District'
  const plural = (w: string) => (/[sxz]$|[^aeiou]y$/.test(w) ? (w.endsWith('y') ? w.slice(0, -1) + 'ies' : w + 'es') : w + 's')
  return { region, district, regions: plural(region), districts: plural(district) }
}
/** Currency code of the project (RWF for Rwanda). */
export function useCurrency(): string {
  const { project } = useAuth()
  return (project?.settings as ProjectSettings | undefined)?.currency || 'USD'
}
export const LANGUAGE_NAMES: Record<string, string> = { en: 'English', rw: 'Kinyarwanda', fr: 'Français', sw: 'Kiswahili', pt: 'Português', es: 'Español', ar: 'العربية', am: 'አማርኛ', he: 'עברית' }

/** The partner of the current project, if any, and where it is shown. */
export function usePartner(where: Partner['show_in'][number]): Partner | null {
  const { project } = useAuth()
  const p = (project?.settings as ProjectSettings | undefined)?.partner
  return p && p.name && p.show_in?.includes(where) ? p : null
}

/** "Tony Rwanda" project line: tagline from the project settings, or the brand tagline. */
export function useTagline(): string {
  const { project } = useAuth()
  return (project?.settings as ProjectSettings | undefined)?.tagline || TAGLINE
}
