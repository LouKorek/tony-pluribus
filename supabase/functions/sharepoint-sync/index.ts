// Pluribus · SharePoint sync (stage 6).
// Reads the changes in the shared Talent folder through Microsoft Graph (delta query) and keeps the
// talent_files index up to date: new, changed, renamed, moved and deleted files and folders.
// Who may run it: an active owner/admin from the Sync Center, or the scheduled job with the service key.
// Secrets: MS_CLIENT_SECRET (set by the owner in Supabase). The tenant and app ids below are not secret.
import { createClient } from 'npm:@supabase/supabase-js@2'

const TENANT = Deno.env.get('MS_TENANT_ID') ?? 'c2ab5425-6dfd-4dd6-9d7d-cfa8e69b01da'
const CLIENT = Deno.env.get('MS_CLIENT_ID') ?? '4fa18b48-035a-4371-8243-628d55e5436e'
const SITE = 'tonyrw212.sharepoint.com:/sites/TonyRW'
const FOLDER = 'Talent'
const GRAPH = 'https://graph.microsoft.com/v1.0'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const url = Deno.env.get('SUPABASE_URL')!, service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const db = createClient(url, service, { auth: { persistSession: false } })

  // who is asking
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  let userId: string | null = null
  if (jwt !== service) {
    const { data: { user } } = await db.auth.getUser(jwt)
    if (!user) return json({ error: 'Please sign in again' }, 401)
    const { data: me } = await db.from('profiles').select('role, status').eq('id', user.id).maybeSingle()
    if (!me || !['owner', 'admin'].includes(me.role) || me.status !== 'active') return json({ error: 'Only admins can run the sync' }, 403)
    userId = user.id
  }
  const secret = Deno.env.get('MS_CLIENT_SECRET')
  if (!secret) return json({ error: 'not_configured', message: 'The Microsoft secret is not set yet.' }, 503)

  const body = await req.json().catch(() => ({}))
  const { data: project } = await db.from('projects').select('id').not('sharepoint_root', 'is', null).order('created_at').limit(1).maybeSingle()
  const projectId = project?.id
  if (!projectId) return json({ error: 'No project is linked to SharePoint' }, 500)

  const { data: state } = await db.from('sync_state').select('*').eq('project_id', projectId).maybeSingle()
  const full = body.full === true || !state?.delta_link
  const { data: run } = await db.from('sync_runs').insert({ project_id: projectId, full_scan: full, triggered_by: userId }).select('id, started_at').single()
  const finish = async (patch: Record<string, unknown>) => {
    await db.from('sync_runs').update({ ...patch, finished_at: new Date().toISOString() }).eq('id', run!.id)
  }

  try {
    // 1. app token
    const tr = await fetch(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`, {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: CLIENT, client_secret: secret, scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials' }),
    })
    const tok = await tr.json()
    if (!tr.ok) {
      const d = String(tok.error_description ?? tok.error ?? tr.status)
      throw new Error(/AADSTS7000229|AADSTS65001|AADSTS700016/.test(d) ? 'Waiting for the TonyRW admin to approve the Pluribus Sync app (the approval link has not been accepted yet).'
        : /AADSTS7000215|AADSTS7000222/.test(d) ? 'The Microsoft secret saved in Supabase is wrong or expired. Create a new client secret and paste it as MS_CLIENT_SECRET.'
        : `Microsoft sign-in failed: ${d.split('\r')[0]}`)
    }
    const g = async (u: string) => {
      const r = await fetch(u.startsWith('http') ? u : GRAPH + u, { headers: { authorization: `Bearer ${tok.access_token}` } })
      const j = await r.json().catch(() => ({}))
      if (r.status === 410) return { resync: true }
      if (!r.ok) throw new Error(r.status === 403 || r.status === 401 ? 'Microsoft refused access to the TonyRW site: the TonyRW admin has not approved the Pluribus Sync app yet.' : `Graph ${r.status}: ${j.error?.message ?? ''}`)
      return j
    }

    // 2. where is the Talent folder
    let driveId = state?.drive_id, rootId = state?.root_item_id
    if (!driveId || !rootId) {
      const site = await g(`/sites/${SITE}`)
      const drive = await g(`/sites/${site.id}/drive`)
      const folder = await g(`/drives/${drive.id}/root:/${encodeURIComponent(FOLDER)}`)
      driveId = drive.id; rootId = folder.id
    }

    // 3. read the changes page by page
    const select = 'id,name,parentReference,file,folder,size,lastModifiedDateTime,deleted,sharepointIds,root'
    let next: string | null = full ? `/drives/${driveId}/items/${rootId}/delta?$select=${select}` : state!.delta_link
    let deltaLink: string | null = null, changed = 0, deleted = 0, skipped = 0
    const prefix = new RegExp(`^/drives/[^/]+/root:/${FOLDER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/?`, 'i')
    while (next) {
      const page = await g(next)
      if ((page as { resync?: boolean }).resync) { // the saved position expired: start over with a full scan
        await db.from('sync_state').upsert({ project_id: projectId, delta_link: null })
        next = `/drives/${driveId}/items/${rootId}/delta?$select=${select}`; continue
      }
      const items = [], gone: string[] = []
      for (const it of page.value ?? []) {
        if (it.id === rootId || it.root) continue
        if (it.deleted) { gone.push(it.id); continue }
        const parentPath = decodeURIComponent(String(it.parentReference?.path ?? ''))
        if (!prefix.test(parentPath + '/')) continue // outside the Talent folder
        const parent = (parentPath + '/').replace(prefix, '').replace(/\/$/, '')
        // the SharePoint UniqueId is the key the rest of Pluribus links to; never invent one
        const uid = it.sharepointIds?.listItemUniqueId
        if (!uid) { skipped++; continue }
        const isFolder = !!it.folder
        const ext = !isFolder && it.name.includes('.') ? it.name.split('.').pop().toLowerCase() : null
        items.push({ id: uid, item_id: it.id, path: parent ? `${parent}/${it.name}` : it.name, parent, name: it.name, is_folder: isFolder, ext, size: isFolder ? null : it.size ?? null, modified_at: it.lastModifiedDateTime ?? null })
      }
      for (let i = 0; i < Math.max(items.length, 1); i += 400) {
        const { data: n, error } = await db.rpc('talent_sync_apply', { p_project: projectId, p_items: items.slice(i, i + 400), p_deleted: i === 0 ? gone : [] })
        if (error) throw new Error(error.message)
        changed += Number(n ?? 0)
      }
      deleted += gone.length
      next = page['@odata.nextLink'] ?? null
      deltaLink = page['@odata.deltaLink'] ?? deltaLink
    }
    if (full && !skipped) { const { data: n } = await db.rpc('talent_sync_prune', { p_project: projectId, p_before: run!.started_at }); deleted += Number(n ?? 0) }

    const now = new Date().toISOString()
    await db.from('sync_state').upsert({ project_id: projectId, drive_id: driveId, root_item_id: rootId, delta_link: deltaLink, last_run_at: now, last_ok_at: now, last_status: 'ok', last_error: null })
    await finish({ status: 'ok', changed, deleted, error: skipped ? `${skipped} items came without a SharePoint id and were left as they were` : null })
    return json({ ok: true, full, changed, deleted, skipped })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await db.from('sync_state').upsert({ project_id: projectId, last_run_at: new Date().toISOString(), last_status: 'error', last_error: msg })
    await finish({ status: 'error', error: msg })
    return json({ error: msg }, 502)
  }
})

