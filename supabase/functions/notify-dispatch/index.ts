// Tony Next · push dispatcher.
// pg_cron calls it every minute while the outbox has queued push notifications (public.notify_tick).
// It takes a batch with outbox_take(), sends a Web Push to every subscription of the user, and reports with outbox_done().
import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

interface Sub { id: string; endpoint: string; p256dh: string; auth: string }
interface Item { outbox_id: number; notification_id: string; user_id: string; title: string; body: string | null; link: string | null; type: string | null; subs: Sub[] | null }

Deno.serve(async req => {
  const url = Deno.env.get('SUPABASE_URL')!, service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const db = createClient(url, service, { auth: { persistSession: false } })
  const cronToken = req.headers.get('x-cron-token')
  const bearer = (req.headers.get('authorization') ?? '').replace(/^Bearer /i, '')
  let allowed = bearer === service
  if (!allowed && cronToken) {
    const { data } = await db.from('sync_state').select('project_id').eq('cron_token', cronToken).maybeSingle()
    allowed = !!data
  }
  if (!allowed) return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { 'content-type': 'application/json' } })

  const pub = Deno.env.get('VAPID_PUBLIC_KEY'), priv = Deno.env.get('VAPID_PRIVATE_KEY'), subject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:lou.korek@gmail.com'
  if (!pub || !priv) return new Response(JSON.stringify({ error: 'VAPID keys are not set' }), { status: 500, headers: { 'content-type': 'application/json' } })
  webpush.setVapidDetails(subject, pub, priv)

  const { data, error } = await db.rpc('outbox_take', { p_limit: 50 })
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'content-type': 'application/json' } })
  const items = (data as Item[]) ?? []
  let sent = 0, failed = 0
  for (const it of items) {
    const subs = it.subs ?? []
    if (!subs.length) { await db.rpc('outbox_done', { p_outbox_id: it.outbox_id, p_ok: true, p_error: 'no subscriptions', p_dead_subs: [] }); continue }
    const payload = JSON.stringify({ id: it.notification_id, title: it.title, body: it.body ?? '', link: it.link ?? '/', type: it.type })
    const dead: string[] = []
    let ok = 0, lastErr: string | null = null
    for (const s of subs) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 60 * 60 * 24, urgency: 'normal' })
        ok++
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode
        lastErr = `${status ?? ''} ${(e as Error).message ?? e}`.trim()
        if (status === 404 || status === 410) dead.push(s.id)
      }
    }
    const success = ok > 0 || dead.length === subs.length   // every subscription gone: nothing left to retry
    if (success) sent++; else failed++
    await db.rpc('outbox_done', { p_outbox_id: it.outbox_id, p_ok: success, p_error: lastErr, p_dead_subs: dead })
  }
  return new Response(JSON.stringify({ taken: items.length, sent, failed }), { headers: { 'content-type': 'application/json' } })
})
