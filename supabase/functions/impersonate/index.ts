// Pluribus · "View as" for the owner.
// The owner asks to see the system as another user. The function checks that the caller is the active owner,
// writes the request to the audit log and returns a one-time sign-in token for the target user.
// No password is involved and nothing is e-mailed.
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    const { data: { user }, error } = await admin.auth.getUser(jwt)
    if (error || !user) return json({ error: 'Please sign in again' }, 401)

    const { data: me } = await admin.from('profiles').select('role, status').eq('id', user.id).maybeSingle()
    if (!me || me.role !== 'owner' || me.status !== 'active') return json({ error: 'Only the owner can view the system as another user' }, 403)

    const { user_id } = await req.json().catch(() => ({ user_id: null }))
    if (!user_id || user_id === user.id) return json({ error: 'Choose another user' }, 400)

    const { data: target } = await admin.auth.admin.getUserById(user_id)
    const email = target?.user?.email
    if (!email) return json({ error: 'User not found' }, 404)

    const { data: link, error: le } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
    if (le || !link?.properties?.hashed_token) return json({ error: le?.message ?? 'Could not start the session' }, 500)

    await admin.from('audit_log').insert({ user_id: user.id, table_name: 'auth.impersonation', row_id: user_id, action: 'VIEW_AS', new_data: { target: user_id } })
    return json({ token_hash: link.properties.hashed_token })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})
