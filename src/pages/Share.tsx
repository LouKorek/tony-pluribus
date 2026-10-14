import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { POS_LABEL } from '../lib/teams'
import { APP_NAME, Bolts, Logo, TAGLINE } from '../lib/brand'

interface SharedPlayer { name: string; birth_year: number | null; foot: string | null; positions: string | null; team: string | null; note: string | null; stats: { matches: number; goals: number; assists: number } | null; tests: Record<string, number> | null }
interface Shared { title: string; intro: string | null; audience: string | null; players: SharedPlayer[]; project?: { name: string; tagline: string | null; partner: { name: string; logo: string | null } | null } }

/** The public page a club opens from a shared link. No sign-in. */
export default function SharePage() {
  const { token } = useParams()
  const [data, setData] = useState<Shared | null | undefined>(undefined)
  useEffect(() => {
    document.title = `${APP_NAME} · Players`
    supabase.rpc('showcase_view', { p_token: token ?? '' }).then(({ data }) => setData((data as Shared) ?? null))
  }, [token])

  return (
    <div className="min-h-screen bg-paper">
      <header className="relative overflow-hidden bg-ink text-white">
        <Bolts className="absolute inset-0 h-full w-full" width={1200} height={400} stroke="rgba(255,255,255,.1)" />
        <div className="relative mx-auto flex max-w-5xl items-center gap-3 px-4 py-4">
          <Logo variant="wordmark" color="neon" className="h-5" />
          {data?.project?.partner?.logo && <><span className="text-white/40">×</span><img src={data.project.partner.logo} alt={data.project.partner.name} className="h-9 w-9" /></>}
          <span className="ml-auto text-xs uppercase tracking-widest text-white/60">{data?.project?.name ?? 'Tony'}{data?.project?.partner ? ` · with ${data.project.partner.name}` : ''}</span>
        </div>
        {data && (
          <div className="relative mx-auto max-w-5xl px-4 pb-8 pt-4">
            <h1 className="font-display text-4xl font-semibold leading-none tracking-tight sm:text-5xl">{data.title}</h1>
            {data.audience && <div className="mt-2 text-sm text-neon">Prepared for {data.audience}</div>}
            {data.intro && <p className="mt-3 max-w-2xl whitespace-pre-line text-white/80">{data.intro}</p>}
          </div>
        )}
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">
        {data === undefined ? <p className="text-center text-muted">Loading…</p> : data === null ? (
          <div className="mx-auto max-w-md rounded-xl border border-line bg-card p-8 text-center">
            <div className="font-display text-2xl font-semibold ">This link is not available</div>
            <p className="mt-2 text-sm text-muted">It may have expired or been switched off. Please ask the Tony staff for a new link.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {data.players.map((p, i) => (
              <article key={i} className="overflow-hidden rounded-xl border border-line bg-card shadow-sm">
                <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
                  <div className="min-w-0">
                    <h2 className="font-display text-2xl font-semibold leading-tight">{p.name}</h2>
                    <div className="mt-0.5 text-sm text-muted">{[p.birth_year && `Born ${p.birth_year}`, p.positions && (POS_LABEL[p.positions] ?? p.positions), p.foot && `${p.foot[0].toUpperCase()}${p.foot.slice(1)} foot`].filter(Boolean).join(' · ')}</div>
                    {p.team && <div className="mt-0.5 text-xs text-faint">{p.team}</div>}
                  </div>
                  <span className="rounded-md bg-neon px-2 py-1 font-display text-lg font-semibold leading-none text-ink">{String(i + 1).padStart(2, '0')}</span>
                </div>
                {(p.stats || (p.tests && Object.keys(p.tests).length > 0)) && (
                  <div className="flex flex-wrap gap-px border-b border-line bg-line text-center">
                    {p.stats && ([['Matches', p.stats.matches], ['Goals', p.stats.goals], ['Assists', p.stats.assists]] as const).map(([l, v]) => (
                      <div key={l} className="min-w-[30%] flex-1 bg-card px-2 py-3"><div className="font-display text-2xl font-semibold leading-none">{v}</div><div className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-muted">{l}</div></div>
                    ))}
                    {p.tests && ([['sprint_10m', '10 m', 's'], ['sprint_20m', '20 m', 's'], ['height_cm', 'Height', 'cm'], ['weight_kg', 'Weight', 'kg']] as const).filter(([k]) => p.tests![k] != null).map(([k, l, u]) => (
                      <div key={k} className="min-w-[22%] flex-1 bg-card px-2 py-3"><div className="font-display text-2xl font-semibold leading-none">{Number(p.tests![k])}<span className="ml-0.5 text-xs font-normal text-muted">{u}</span></div><div className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-muted">{l}</div></div>
                    ))}
                  </div>
                )}
                {p.note && <p className="px-5 py-3 text-sm">{p.note}</p>}
              </article>
            ))}
          </div>
        )}
        <p className="mt-10 text-center text-xs text-faint">Shared by {data?.project?.name ?? 'Tony'} · {data?.project?.tagline ?? TAGLINE} · Information for the recipient only.</p>
      </main>
    </div>
  )
}
