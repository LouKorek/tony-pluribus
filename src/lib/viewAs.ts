import { supabase } from './supabase'

// The owner can open the system as another user to see and test exactly what that user sees.
// The owner's own session is kept aside on this device and restored with "Back to my account".
const KEY = 'pluribus.viewAs'
// Name under which the owner deployed supabase/functions/impersonate in Supabase.
const FUNCTION = 'clever-responder'

interface Saved { access_token: string; refresh_token: string; target: string }

export function viewingAs(): string | null {
  try { const s = localStorage.getItem(KEY); return s ? (JSON.parse(s) as Saved).target : null } catch { return null }
}

export async function startViewAs(userId: string, label: string): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return 'Please sign in again'
  const { data, error } = await supabase.functions.invoke(FUNCTION, { body: { user_id: userId } })
  if (error) {
    let msg = error.message
    try { const body = await (error as { context?: Response }).context?.json(); if (body?.error) msg = body.error } catch { /* keep message */ }
    if (/Failed to send a request|Requested function was not found/i.test(msg)) msg = '"View as" is not switched on yet: the impersonate function is not deployed in Supabase.'
    return msg
  }
  if (!data?.token_hash) return data?.error ?? 'Could not start'
  try {
    localStorage.setItem(KEY, JSON.stringify({ access_token: session.access_token, refresh_token: session.refresh_token, target: label } satisfies Saved))
  } catch { return 'This browser blocks local storage, so the owner session could not be kept aside' }
  const { error: ve } = await supabase.auth.verifyOtp({ token_hash: data.token_hash, type: 'magiclink' })
  if (ve) { try { localStorage.removeItem(KEY) } catch { /* ignore */ } return ve.message }
  window.location.assign('/')
  return null
}

export async function stopViewAs() {
  let saved: Saved | null = null
  try { const s = localStorage.getItem(KEY); saved = s ? JSON.parse(s) : null; localStorage.removeItem(KEY) } catch { /* ignore */ }
  if (saved) {
    const { error } = await supabase.auth.setSession({ access_token: saved.access_token, refresh_token: saved.refresh_token })
    if (!error) { window.location.assign('/users'); return }
  }
  await supabase.auth.signOut()
  window.location.assign('/login')
}
