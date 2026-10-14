import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Clock, Lock, ShieldCheck, UserCheck } from 'lucide-react'
import { supabase, usernameToEmail, USERNAME_RE, errMsg, ROLE_LABEL, type Role } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { Alert, Button, Field, Input, Select } from '../components/ui'
import { APP_NAME, Bolts, Logo } from '../lib/brand'

function AuthFrame({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <div className="grid min-h-full lg:grid-cols-[1.05fr_1fr]">
      <div className="relative hidden overflow-hidden bg-ink p-12 text-white lg:flex lg:flex-col">
        <Bolts className="absolute inset-0 h-full w-full" width={1000} height={1100} stroke="rgba(255,255,255,.13)" />
        <div className="relative"><Logo variant="wordmark" color="white" className="h-7" /></div>
        <div className="relative mt-auto max-w-md">
          <div className="label-caps text-neon">{APP_NAME}</div>
          <h2 className="mt-3 font-display text-6xl font-medium leading-[.92] tracking-tight">The global stars of tomorrow.</h2>
          <p className="mt-5 text-[16px] leading-relaxed text-white/65">The talent system of Tony. Scouting, academies, camps and players in one place, in every Tony project.</p>
          <div className="mt-8 flex gap-6 label-caps text-[11px] text-white/45"><span>Equality</span><span>Authenticity</span><span>Innovation</span></div>
        </div>
      </div>
      <div className="flex items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-[400px]">
          <div className="mb-8 flex items-center gap-3 rounded-xl bg-ink px-4 py-3 lg:hidden">
            <Logo variant="wordmark" color="neon" className="h-[18px]" />
            <span className="ml-auto font-display uppercase text-[11px] font-semibold tracking-[.2em] text-white/50">{APP_NAME}</span>
          </div>
          <h1 className="font-display text-4xl font-semibold leading-none tracking-tight">{title}</h1>
          {subtitle && <p className="mt-2 text-[15px] text-muted">{subtitle}</p>}
          <div className="mt-7">{children}</div>
        </div>
      </div>
    </div>
  )
}

export function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [needsSetup, setNeedsSetup] = useState(false)
  const nav = useNavigate()

  useEffect(() => { supabase.rpc('owner_exists').then(({ data }) => setNeedsSetup(data === false)) }, [])

  async function submit(e: FormEvent) {
    e.preventDefault(); setErr(null); setBusy(true)
    const { error } = await supabase.auth.signInWithPassword({ email: usernameToEmail(username), password })
    setBusy(false)
    if (error) setErr(error.message === 'Invalid login credentials' ? 'Username or password is incorrect.' : error.message)
    else nav('/')
  }

  return (
    <AuthFrame title="Sign in" subtitle="Use the username and password you were given.">
      {needsSetup && (
        <div className="mb-6 rounded-xl border border-ink bg-neon p-4 text-ink">
          <div className="flex items-center gap-2 font-semibold"><ShieldCheck size={17} /> First-time setup</div>
          <p className="mt-1 text-sm">The owner account has not been claimed yet.</p>
          <Link to="/setup" className="mt-3 inline-flex h-9 items-center rounded-lg bg-ink px-3 text-sm font-semibold text-white">Set up the owner account</Link>
        </div>
      )}
      <form onSubmit={submit} className="space-y-4">
        <Field label="Username"><Input autoFocus autoComplete="username" autoCapitalize="none" value={username} onChange={e => setUsername(e.target.value)} required /></Field>
        <Field label="Password"><Input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required /></Field>
        {err && <Alert>{err}</Alert>}
        <Button variant="primary" className="w-full" loading={busy} type="submit">Sign in</Button>
      </form>
      <div className="mt-8 rounded-xl border border-line bg-card p-4 text-sm">
        <div className="font-semibold">Academy coach?</div>
        <p className="mt-0.5 text-muted">Create your account, and a Tony admin will approve it.</p>
        <Link to="/signup" className="mt-2 inline-block font-semibold text-royal hover:underline">Create a coach account →</Link>
      </div>
    </AuthFrame>
  )
}

export function OwnerSetupPage() {
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [available, setAvailable] = useState<boolean | null>(null)
  const nav = useNavigate()

  useEffect(() => { supabase.rpc('owner_exists').then(({ data }) => setAvailable(data === false)) }, [])

  async function submit(e: FormEvent) {
    e.preventDefault(); setErr(null)
    if (password.length < 8) return setErr('Use at least 8 characters.')
    if (password !== confirm) return setErr('The two passwords do not match.')
    setBusy(true)
    const { error } = await supabase.auth.signUp({ email: usernameToEmail('loukorek'), password, options: { data: { username: 'loukorek', full_name: fullName } } })
    setBusy(false)
    if (error) return setErr(errMsg(error))
    nav('/')
  }

  if (available === false) return (
    <AuthFrame title="Already set up" subtitle="The owner account exists. Sign in instead.">
      <Link to="/login"><Button variant="primary" className="w-full">Go to sign in</Button></Link>
    </AuthFrame>
  )

  return (
    <AuthFrame title="Owner setup" subtitle="One time only. This screen closes for good once the owner account is created.">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Username" hint="Fixed for the owner account."><Input value="loukorek" disabled /></Field>
        <Field label="Full name"><Input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Lou Korek" /></Field>
        <Field label="Password" required><Input type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} /></Field>
        <Field label="Repeat password" required><Input type="password" autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} /></Field>
        {err && <Alert>{err}</Alert>}
        <Button variant="primary" className="w-full" loading={busy} type="submit"><Lock size={15} /> Create owner account</Button>
      </form>
    </AuthFrame>
  )
}

interface Opt { academy_id: string; academy: string; district: string | null; region: string | null }

interface JoinInfo { id: string; name: string; country: string | null; tagline: string | null; academies: Opt[] }

export function SignupPage() {
  const { slug } = useParams()
  const [opts, setOpts] = useState<Opt[]>([])
  const [proj, setProj] = useState<JoinInfo | null | undefined>(undefined)
  const [f, setF] = useState({ full_name: '', username: '', phone: '', academy_id: '', requested_academy: '', password: '', confirm: '' })
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const nav = useNavigate()
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })

  useEffect(() => {
    if (slug) supabase.rpc('project_join_info', { p_slug: slug }).then(({ data }) => { const j = data as JoinInfo | null; setProj(j); setOpts(j?.academies ?? []) })
    else supabase.rpc('signup_options').then(({ data }) => { setProj(null); setOpts((data as Opt[]) ?? []) })
  }, [slug])

  const grouped = opts.reduce<Record<string, Opt[]>>((acc, o) => { const k = [o.region, o.district].filter(Boolean).join(' · ') || 'Other'; (acc[k] ||= []).push(o); return acc }, {})

  async function submit(e: FormEvent) {
    e.preventDefault(); setErr(null)
    const u = f.username.trim().toLowerCase()
    if (!f.full_name.trim()) return setErr('Enter your full name.')
    if (!USERNAME_RE.test(u)) return setErr('Username: 3–32 characters, letters, digits, dots, dashes or underscores.')
    if (!f.phone.trim()) return setErr('Enter a phone number so Tony can reach you.')
    if (!f.academy_id && !f.requested_academy.trim()) return setErr('Choose your academy, or type its name if it is not listed.')
    if (f.password.length < 8) return setErr('Password: at least 8 characters.')
    if (f.password !== f.confirm) return setErr('The two passwords do not match.')
    setBusy(true)
    const { data: free } = await supabase.rpc('username_available', { p_username: u })
    if (free === false) { setBusy(false); return setErr('That username is taken. Try another.') }
    const { error } = await supabase.auth.signUp({
      email: usernameToEmail(u), password: f.password,
      options: { data: { username: u, full_name: f.full_name.trim(), phone: f.phone.trim(), academy_id: f.academy_id || '', requested_academy: f.academy_id ? '' : f.requested_academy.trim(), project_id: proj?.id ?? '' } },
    })
    setBusy(false)
    if (error) return setErr(errMsg(error))
    nav('/')
  }

  if (slug && proj === null) return (
    <AuthFrame title="Link not found" subtitle="This join link does not belong to an active Tony project.">
      <Link to="/login" className="font-semibold text-royal hover:underline">Go to sign in</Link>
    </AuthFrame>
  )
  return (
    <AuthFrame title="Coach account" subtitle={`For academy coaches of ${proj?.name ?? 'Tony'}${proj?.country ? ` (${proj.country})` : ''}. An admin approves every new account before it can see any data.`}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Full name" required><Input value={f.full_name} onChange={set('full_name')} autoComplete="name" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Username" required><Input value={f.username} onChange={set('username')} autoCapitalize="none" autoComplete="username" /></Field>
          <Field label="Phone" required><Input value={f.phone} onChange={set('phone')} type="tel" placeholder="07…" autoComplete="tel" /></Field>
        </div>
        <Field label="Academy" required hint={opts.length ? undefined : 'The academy list is being prepared. Type your academy and district below.'}>
          <Select value={f.academy_id} onChange={set('academy_id')}>
            <option value="">{opts.length ? 'Choose your academy' : 'Not listed'}</option>
            {Object.entries(grouped).map(([g, list]) => (
              <optgroup key={g} label={g}>{list.map(o => <option key={o.academy_id} value={o.academy_id}>{o.academy}</option>)}</optgroup>
            ))}
          </Select>
        </Field>
        {!f.academy_id && (
          <Field label="Academy not listed? Name and district" hint="e.g. Musanze Youth FTC, Musanze">
            <Input value={f.requested_academy} onChange={set('requested_academy')} />
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Password" required><Input type="password" autoComplete="new-password" value={f.password} onChange={set('password')} /></Field>
          <Field label="Repeat" required><Input type="password" autoComplete="new-password" value={f.confirm} onChange={set('confirm')} /></Field>
        </div>
        {err && <Alert>{err}</Alert>}
        <Button variant="primary" className="w-full" loading={busy} type="submit">Create account</Button>
      </form>
      <p className="mt-6 text-sm text-muted">Already have an account? <Link to="/login" className="font-semibold text-royal hover:underline">Sign in</Link></p>
    </AuthFrame>
  )
}

export function PendingPage() {
  const { profile, signOut } = useAuth()
  const locked = profile?.status === 'locked'
  return (
    <AuthFrame
      title={locked ? 'Account locked' : 'Waiting for approval'}
      subtitle={locked ? 'An admin has locked this account. Contact Tony if you think this is a mistake.' : 'Your account was created. A Tony admin will check it and link it to your academy.'}
    >
      <div className="rounded-xl border border-line bg-card p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-warn-soft text-warn"><Clock size={18} /></div>
          <div>
            <div className="font-semibold">{profile?.full_name || profile?.username}</div>
            <div className="text-sm text-muted">@{profile?.username}{profile?.requested_academy ? ` · ${profile.requested_academy}` : ''}</div>
          </div>
        </div>
        <p className="mt-4 text-sm text-muted">Once approved, sign in again and you will see your academy portal.</p>
      </div>
      <Button className="mt-5 w-full" onClick={signOut}>Sign out</Button>
    </AuthFrame>
  )
}


interface InviteInfo { full_name: string | null; username: string; role: string; status: string; project: string; tagline: string | null; academy: string | null; expired: boolean; expires_at: string }

/** The page an invited user opens: it shows who they are and lets them choose a password, then signs them in. */
export function WelcomePage() {
  const { token } = useParams()
  const [info, setInfo] = useState<InviteInfo | null | undefined>(undefined)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const nav = useNavigate()

  useEffect(() => { supabase.rpc('invite_info', { p_token: token ?? '' }).then(({ data }) => setInfo((data as InviteInfo) ?? null)) }, [token])

  async function submit(e: FormEvent) {
    e.preventDefault(); setErr(null)
    if (password.length < 8) return setErr('Use at least 8 characters.')
    if (password !== confirm) return setErr('The two passwords do not match.')
    setBusy(true)
    const { data, error } = await supabase.rpc('accept_invite', { p_token: token ?? '', p_password: password })
    if (error) { setBusy(false); return setErr(errMsg(error)) }
    const u = (data as { username: string }).username
    const { error: e2 } = await supabase.auth.signInWithPassword({ email: usernameToEmail(u), password })
    setBusy(false)
    if (e2) return setErr(e2.message)
    nav('/')
  }

  if (info === undefined) return <AuthFrame title="One moment…"><span /></AuthFrame>
  if (info === null) return (
    <AuthFrame title="This link was already used" subtitle="Or it is not a valid invite link. If you already set your password, sign in. Otherwise ask your admin for a new link.">
      <Link to="/login" className="inline-flex h-10 items-center rounded-lg bg-ink px-4 text-sm font-semibold text-neon">Sign in</Link>
    </AuthFrame>
  )
  if (info.expired) return (
    <AuthFrame title="This link has expired" subtitle="Invite links work for 7 days. Ask your admin to send you a new one.">
      <Link to="/login" className="font-semibold text-royal hover:underline">Go to sign in</Link>
    </AuthFrame>
  )
  const first = (info.full_name || info.username).split(' ')[0]
  return (
    <AuthFrame title={`Welcome, ${first}`} subtitle={`You have been invited to ${APP_NAME}, ${info.project}${info.academy ? ` · ${info.academy}` : ''}. Choose a password and you are in.`}>
      <div className="mb-5 flex items-center gap-3 rounded-xl border border-line bg-card p-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-ink text-neon"><UserCheck size={18} /></div>
        <div className="min-w-0">
          <div className="font-semibold">{info.full_name || info.username}</div>
          <div className="text-sm text-muted">@{info.username} · {ROLE_LABEL[info.role as Role] ?? info.role}</div>
        </div>
      </div>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Your password" required hint="At least 8 characters. Only you know it."><Input type="password" autoComplete="new-password" autoFocus value={password} onChange={e => setPassword(e.target.value)} /></Field>
        <Field label="Repeat the password" required><Input type="password" autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} /></Field>
        {err && <Alert>{err}</Alert>}
        <Button variant="primary" className="w-full" loading={busy} type="submit">Set password and sign in</Button>
      </form>
      <p className="mt-6 text-xs text-muted">Your username is <b className="text-text">{info.username}</b>. You will use it with this password to sign in next time.</p>
    </AuthFrame>
  )
}
