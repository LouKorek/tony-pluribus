import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Clock, Lock, ShieldCheck } from 'lucide-react'
import { supabase, usernameToEmail, USERNAME_RE, errMsg } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { Alert, Button, Field, Input, Select } from '../components/ui'

function AuthFrame({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <div className="grid min-h-full lg:grid-cols-[1.05fr_1fr]">
      <div className="relative hidden overflow-hidden bg-ink p-12 text-white lg:flex lg:flex-col">
        <div className="flex items-center gap-4">
          <img src="/brand/tony.png" alt="Tony" className="h-7" />
          <span className="h-8 w-px bg-white/20" />
          <img src="/brand/benfica.png" alt="SL Benfica" className="h-11 w-11" />
        </div>
        <div className="mt-auto max-w-md">
          <div className="label-caps text-lime">Pluribus</div>
          <h2 className="mt-3 font-display text-6xl font-bold uppercase leading-[.92] tracking-tight">From every district, one pathway.</h2>
          <p className="mt-5 text-[15px] leading-relaxed text-white/60">The talent platform of Tony and SL Benfica. Scouting, academies, camps and players in one place, in step with the shared Talent folder.</p>
        </div>
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full border-[56px] border-lime/[.07]" />
        <div className="pointer-events-none absolute -bottom-40 right-10 h-[28rem] w-[28rem] rounded-full border-[70px] border-red/[.12]" />
      </div>
      <div className="flex items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-[400px]">
          <div className="mb-8 flex items-center gap-3 rounded-xl bg-ink px-4 py-3 lg:hidden">
            <img src="/brand/tony.png" alt="Tony" className="h-4" />
            <span className="h-5 w-px bg-white/20" />
            <img src="/brand/benfica.png" alt="SL Benfica" className="h-7 w-7" />
            <span className="ml-auto font-display text-[11px] font-semibold uppercase tracking-[.2em] text-white/50">Pluribus</span>
          </div>
          <h1 className="font-display text-4xl font-bold uppercase leading-none tracking-tight">{title}</h1>
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
        <div className="mb-6 rounded-xl border border-ink bg-lime p-4 text-ink">
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
        <p className="mt-0.5 text-muted">Create your account, and a TFEP admin will approve it.</p>
        <Link to="/signup" className="mt-2 inline-block font-semibold text-red hover:underline">Create a coach account →</Link>
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

export function SignupPage() {
  const [opts, setOpts] = useState<Opt[]>([])
  const [f, setF] = useState({ full_name: '', username: '', phone: '', academy_id: '', requested_academy: '', password: '', confirm: '' })
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const nav = useNavigate()
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })

  useEffect(() => { supabase.rpc('signup_options').then(({ data }) => setOpts((data as Opt[]) ?? [])) }, [])

  const grouped = opts.reduce<Record<string, Opt[]>>((acc, o) => { const k = [o.region, o.district].filter(Boolean).join(' · ') || 'Other'; (acc[k] ||= []).push(o); return acc }, {})

  async function submit(e: FormEvent) {
    e.preventDefault(); setErr(null)
    const u = f.username.trim().toLowerCase()
    if (!f.full_name.trim()) return setErr('Enter your full name.')
    if (!USERNAME_RE.test(u)) return setErr('Username: 3–32 characters, letters, digits, dots, dashes or underscores.')
    if (!f.phone.trim()) return setErr('Enter a phone number so TFEP can reach you.')
    if (!f.academy_id && !f.requested_academy.trim()) return setErr('Choose your academy, or type its name if it is not listed.')
    if (f.password.length < 8) return setErr('Password: at least 8 characters.')
    if (f.password !== f.confirm) return setErr('The two passwords do not match.')
    setBusy(true)
    const { data: free } = await supabase.rpc('username_available', { p_username: u })
    if (free === false) { setBusy(false); return setErr('That username is taken. Try another.') }
    const { error } = await supabase.auth.signUp({
      email: usernameToEmail(u), password: f.password,
      options: { data: { username: u, full_name: f.full_name.trim(), phone: f.phone.trim(), academy_id: f.academy_id || '', requested_academy: f.academy_id ? '' : f.requested_academy.trim() } },
    })
    setBusy(false)
    if (error) return setErr(errMsg(error))
    nav('/')
  }

  return (
    <AuthFrame title="Coach account" subtitle="For academy coaches in Rwanda. An admin approves every new account before it can see any data.">
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
      <p className="mt-6 text-sm text-muted">Already have an account? <Link to="/login" className="font-semibold text-red hover:underline">Sign in</Link></p>
    </AuthFrame>
  )
}

export function PendingPage() {
  const { profile, signOut } = useAuth()
  const locked = profile?.status === 'locked'
  return (
    <AuthFrame
      title={locked ? 'Account locked' : 'Waiting for approval'}
      subtitle={locked ? 'An admin has locked this account. Contact TFEP if you think this is a mistake.' : 'Your account was created. A TFEP admin will check it and link it to your academy.'}
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
