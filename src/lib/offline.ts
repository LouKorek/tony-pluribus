// Tony Next works without network: reads come back from a local copy, writes wait in an outbox and go out
// as soon as the phone is online again. This sits under the Supabase client as its fetch, so every screen gets it.
import Dexie, { type Table } from 'dexie'

interface CacheRow { key: string; url: string; status: number; headers: Record<string, string>; body: string; at: number }
export interface OutboxRow {
  id: string; at: number; kind: 'request' | 'upload'; label: string
  method: string; url: string; headers: Record<string, string>; body: string | Blob | null
  tries: number; error: string | null
}

class TonyDb extends Dexie {
  cache!: Table<CacheRow, string>
  outbox!: Table<OutboxRow, string>
  constructor() {
    super('tonynext')
    this.version(1).stores({ cache: 'key, url, at', outbox: 'id, at' })
  }
}
const db = new TonyDb()

/* ───────────── state the UI watches ───────────── */

export interface SyncState { online: boolean; pending: number; failed: number; syncing: boolean; lastSync: number | null; fromCache: boolean }
const state: SyncState = { online: typeof navigator === 'undefined' ? true : navigator.onLine, pending: 0, failed: 0, syncing: false, lastSync: null, fromCache: false }
const listeners = new Set<(s: SyncState) => void>()
const emit = () => listeners.forEach(f => f({ ...state }))
export function subscribeSync(f: (s: SyncState) => void) { listeners.add(f); f({ ...state }); return () => { listeners.delete(f) } }
export const syncState = () => ({ ...state })

async function recount() {
  const rows = await db.outbox.toArray()
  state.pending = rows.filter(r => !r.error && r.label).length
  state.failed = rows.filter(r => !!r.error && r.label).length
  emit()
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { state.online = true; emit(); flush() })
  window.addEventListener('offline', () => { state.online = false; emit() })
  recount()
  // trim the read cache now and then
  window.setTimeout(() => db.cache.where('at').below(Date.now() - 30 * 86400000).delete().catch(() => {}), 15000)
}

/* ───────────── which requests are what ───────────── */

const WRITE_RPC = /^(coach_(save|remove|log|delete|submit|rsvp|withdraw|answer)_?|tour_seen$|track$|touch_last_seen$|admin_|staff_|set_|mark_|reset_|accept_|merge_|notify)/
const isRpc = (path: string) => path.includes('/rest/v1/rpc/')
const rpcName = (path: string) => path.split('/rest/v1/rpc/')[1]?.split('?')[0] ?? ''
const isRead = (method: string, path: string) =>
  method === 'GET' || method === 'HEAD' || (method === 'POST' && isRpc(path) && !WRITE_RPC.test(rpcName(path)))
const isWrite = (method: string, path: string) =>
  path.includes('/rest/v1/') && (['PATCH', 'DELETE', 'PUT'].includes(method) || (method === 'POST' && (!isRpc(path) || WRITE_RPC.test(rpcName(path)))))

const headersOf = (h: HeadersInit | undefined): Record<string, string> => {
  const out: Record<string, string> = {}
  if (!h) return out
  if (h instanceof Headers) h.forEach((v, k) => { out[k.toLowerCase()] = v })
  else if (Array.isArray(h)) h.forEach(([k, v]) => { out[k.toLowerCase()] = v })
  else Object.entries(h).forEach(([k, v]) => { out[k.toLowerCase()] = String(v) })
  return out
}
const isNetworkError = (e: unknown) => e instanceof TypeError || (e as Error)?.name === 'AbortError' && !state.online
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16) }))

/** A code for the outbox list: "kind|argument". The panel turns it into text in the user's language (see outboxText). */
function labelFor(method: string, path: string, body: string | null): string {
  if (isRpc(path)) {
    const n = rpcName(path)
    const a = (() => { try { return body ? JSON.parse(body) : {} } catch { return {} } })()
    switch (n) {
      case 'coach_save_player': return `player|${`${a?.p?.first_name ?? ''} ${a?.p?.last_name ?? ''}`.trim()}`
      case 'coach_save_session': return `session|${a?.p?.held_on ?? ''}`
      case 'coach_save_match': return `match|${a?.p?.played_on ?? ''}`
      case 'coach_save_academy': return 'academy'
      case 'coach_save_staff': return 'staff'
      case 'coach_delete_staff': return 'staffRemoved'
      case 'coach_save_equipment': return 'equipment'
      case 'coach_log_player': return 'note'
      case 'coach_delete_log': return 'noteRemoved'
      case 'coach_submit': return 'submit'
      case 'coach_rsvp': return 'rsvp'
      case 'coach_answer_booking': return 'booking'
      case 'coach_remove_player': return 'playerRemoved'
      case 'coach_withdraw': return 'withdraw'
      case 'coach_delete_session': return 'sessionRemoved'
      case 'coach_delete_match': return 'matchRemoved'
      case 'tour_seen': case 'track': case 'touch_last_seen': case 'set_lang': return ''
      default: return `rpc|${n.replace(/_/g, ' ')}`
    }
  }
  const table = path.split('/rest/v1/')[1]?.split('?')[0] ?? ''
  const verb = method === 'POST' ? 'added' : method === 'DELETE' ? 'removed' : 'changed'
  return `${verb}|${table.replace(/_/g, ' ')}`
}

export const OUTBOX_EN: Record<string, string> = {
  player: 'Player: {a}', session: 'Training session {a}', match: 'Match {a}', academy: 'Academy profile', staff: 'Staff member', staffRemoved: 'Staff member removed',
  equipment: 'Equipment count', note: 'Player note', noteRemoved: 'Player note removed', submit: 'Players submitted to a camp', rsvp: 'Invitation answer', booking: 'Camp day answer',
  playerRemoved: 'Player removed', withdraw: 'Player withdrawn from a camp', sessionRemoved: 'Training session removed', matchRemoved: 'Match removed', rpc: '{a}', added: 'Added: {a}', removed: 'Removed: {a}', changed: 'Changed: {a}',
  'upload.player': 'Player photo', 'upload.academy': 'Academy photo',
}
/** The text of an outbox row from its code, with the given dictionary (falls back to English). */
export function outboxText(label: string, dict: Record<string, string> = OUTBOX_EN): string {
  const [k, a = ''] = label.split('|')
  const tpl = dict[k] ?? OUTBOX_EN[k] ?? label
  return tpl.replace('{a}', a).trim()
}

/* ───────────── the fetch ───────────── */

export async function offlineFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  const method = (init.method ?? (typeof input !== 'string' && !(input instanceof URL) ? input.method : 'GET')).toUpperCase()
  const path = url.replace(/^https?:\/\/[^/]+/, '')
  const headers = headersOf(init.headers)
  const bodyStr = typeof init.body === 'string' ? init.body : null

  if (isWrite(method, path)) {
    // Every write carries an id: a replay of a request whose answer got lost is applied once.
    const mid = headers['x-mutation-id'] ?? uuid()
    const h = new Headers(init.headers); h.set('x-mutation-id', mid)
    const queue = async () => {
      const label = labelFor(method, path, bodyStr)
      await db.outbox.put({ id: mid, at: Date.now(), kind: 'request', label, method, url, headers: { ...headers, 'x-mutation-id': mid }, body: bodyStr, tries: 0, error: null })
      if (label) await patchCache(method, path, bodyStr, mid)
      await recount()
      // the caller sees success; the data it reads next comes from the patched cache
      const synthetic = isRpc(path) && rpcName(path) === 'coach_save_player' ? JSON.stringify(idFromBody(bodyStr) ?? null) : 'null'
      return new Response(synthetic, { status: 200, headers: { 'content-type': 'application/json', 'x-tony-queued': '1' } })
    }
    if (!state.online) return queue()
    try {
      const res = await fetch(input, { ...init, headers: h })
      if (res.status === 409 && (await res.clone().text()).includes('already applied')) return new Response('null', { status: 200, headers: { 'content-type': 'application/json' } })
      return res
    } catch (e) {
      if (!isNetworkError(e)) throw e
      state.online = false; emit()
      return queue()
    }
  }

  if (isRead(method, path)) {
    const key = `${method} ${path} ${headers['accept'] ?? ''} ${headers['prefer'] ?? ''} ${headers['range'] ?? ''} ${bodyStr ?? ''}`
    const serve = async () => {
      const row = await db.cache.get(key)
      if (!row) return null
      state.fromCache = true; emit()
      return new Response(row.body, { status: row.status, headers: { ...row.headers, 'x-tony-cache': String(row.at) } })
    }
    if (!state.online) { const c = await serve(); if (c) return c }
    try {
      const res = await fetch(input, init)
      if (res.ok) {
        const copy = res.clone()
        copy.text().then(body => db.cache.put({ key, url, status: res.status, headers: { 'content-type': res.headers.get('content-type') ?? 'application/json', 'content-range': res.headers.get('content-range') ?? '' }, body, at: Date.now() })).catch(() => {})
        if (!state.online) { state.online = true; emit() }
        if (state.fromCache) { state.fromCache = false; emit() }
      }
      return res
    } catch (e) {
      if (!isNetworkError(e)) throw e
      state.online = false; emit()
      const c = await serve()
      if (c) return c
      throw e
    }
  }

  return fetch(input, init)
}

const idFromBody = (body: string | null): string | null => { try { return body ? JSON.parse(body)?.p_id ?? null : null } catch { return null } }

/* ───────────── keeping the local copy honest after a queued write ───────────── */

type Json = null | boolean | number | string | Json[] | { [k: string]: Json }
const isObj = (v: Json): v is { [k: string]: Json } => !!v && typeof v === 'object' && !Array.isArray(v)

function walk(v: Json, f: (o: { [k: string]: Json }, parent: Json[] | null, i: number) => void, parent: Json[] | null = null, i = -1): void {
  if (Array.isArray(v)) { for (let k = v.length - 1; k >= 0; k--) walk(v[k], f, v, k) }
  else if (isObj(v)) { f(v, parent, i); for (const k of Object.keys(v)) walk(v[k], f) }
}

async function rewrite(match: (row: CacheRow) => boolean, fn: (j: Json) => Json | undefined) {
  const rows = await db.cache.filter(match).toArray()
  for (const r of rows) {
    try { const j = JSON.parse(r.body) as Json; const out = fn(j); if (out !== undefined) await db.cache.put({ ...r, body: JSON.stringify(out) }) } catch { /* not json */ }
  }
}

async function patchCache(method: string, path: string, body: string | null, mid: string) {
  const args = (() => { try { return body ? JSON.parse(body) : {} } catch { return {} } })()
  const idEq = /[?&]id=eq\.([0-9a-f-]{36})/i.exec(path)?.[1]
  if (!isRpc(path) && idEq && method === 'PATCH' && isObj(args)) {
    await rewrite(() => true, j => { walk(j, o => { if (o.id === idEq) Object.assign(o, args) }); return j })
  } else if (!isRpc(path) && idEq && method === 'DELETE') {
    await rewrite(() => true, j => { walk(j, (o, parent, i) => { if (o.id === idEq && parent) parent.splice(i, 1) }); return j })
  } else if (isRpc(path)) {
    const n = rpcName(path)
    const now = new Date().toISOString()
    if (n === 'coach_save_player') {
      const p = args.p ?? {}, id = args.p_id
      await rewrite(r => r.url.includes('/rpc/coach_squad'), j => {
        if (!Array.isArray(j)) return
        const cur = j.find(o => isObj(o) && o.id === id)
        if (cur && isObj(cur)) Object.assign(cur, p, { pending: true })
        else j.unshift({ id, journey: [], log: [], sessions: 0, pool_status: 'academy_squad', squad_status: 'active', created_at: now, guardian_consent: false, ...p, birth_year: Number(p.birth_year) || null, pending: true })
        return j
      })
    } else if (n === 'coach_remove_player') {
      await rewrite(r => r.url.includes('/rpc/coach_squad'), j => Array.isArray(j) ? j.filter(o => !(isObj(o) && o.id === args.p_id)) : undefined)
    } else if (n === 'coach_log_player') {
      await rewrite(r => r.url.includes('/rpc/coach_squad'), j => { walk(j, o => { if (o.id === args.p_player && Array.isArray(o.log)) o.log.unshift({ id: mid, at: now, kind: args.p_kind, text: args.p_text ?? null, pending: true }) }); return j })
    } else if (n === 'coach_save_session') {
      const p = args.p ?? {}, id = args.p_id
      await rewrite(r => r.url.includes('/rpc/coach_sessions'), j => {
        if (!Array.isArray(j)) return
        const players = Array.isArray(p.players) ? p.players : []
        const cur = j.find(o => isObj(o) && o.id === id)
        if (cur && isObj(cur)) Object.assign(cur, p, { present: players.length, players, pending: true })
        else { j.push({ id, ...p, present: players.length, players, pending: true }); j.sort((a, b) => String(isObj(b) ? b.held_on : '').localeCompare(String(isObj(a) ? a.held_on : ''))) }
        return j
      })
    } else if (n === 'coach_save_match') {
      const p = args.p ?? {}, id = args.p_id
      await rewrite(r => r.url.includes('/rpc/coach_matches'), j => {
        if (!Array.isArray(j)) return
        const row = { id, ...p, goals_for: p.goals_for === '' ? null : Number(p.goals_for), goals_against: p.goals_against === '' ? null : Number(p.goals_against), players: Array.isArray(p.players) ? p.players : [], pending: true }
        const cur = j.find(o => isObj(o) && o.id === id)
        if (cur && isObj(cur)) Object.assign(cur, row)
        else { j.push(row); j.sort((a, b) => String(isObj(b) ? b.played_on : '').localeCompare(String(isObj(a) ? a.played_on : ''))) }
        return j
      })
    } else if (n === 'coach_delete_match') {
      await rewrite(r => r.url.includes('/rpc/coach_matches'), j => Array.isArray(j) ? j.filter(o => !(isObj(o) && o.id === args.p_id)) : undefined)
    } else if (n === 'coach_save_staff') {
      const p = args.p ?? {}, id = args.p_id
      await rewrite(r => r.url.includes('/rpc/coach_academy'), j => {
        if (!isObj(j) || !Array.isArray(j.staff)) return
        const cur = j.staff.find(o => isObj(o) && o.id === id)
        if (cur && isObj(cur)) Object.assign(cur, p, { pending: true }); else j.staff.push({ id, active: true, ...p, since_year: p.since_year ? Number(p.since_year) : null, pending: true })
        return j
      })
    } else if (n === 'coach_delete_staff') {
      await rewrite(r => r.url.includes('/rpc/coach_academy'), j => { if (isObj(j) && Array.isArray(j.staff)) j.staff = j.staff.filter(o => !(isObj(o) && o.id === args.p_id)); return j })
    } else if (n === 'coach_save_equipment') {
      await rewrite(r => r.url.includes('/rpc/coach_academy'), j => (isObj(j) ? { ...j, equipment: Array.isArray(args.p) ? args.p.filter((e: Json) => isObj(e) && !e.remove).map((e: Json) => (isObj(e) ? { ...e, quantity: Number(e.good ?? 0) + Number(e.worn ?? 0), updated_at: now } : e)) : j.equipment, equipment_updated_at: now, pending: true } : undefined))
    } else if (n === 'coach_delete_session') {
      await rewrite(r => r.url.includes('/rpc/coach_sessions'), j => Array.isArray(j) ? j.filter(o => !(isObj(o) && o.id === args.p_id)) : undefined)
    } else if (n === 'coach_save_academy') {
      await rewrite(r => r.url.includes('/rpc/coach_academy'), j => (isObj(j) ? { ...j, ...(args.p ?? {}), pending: true } : undefined))
    } else if (n === 'coach_answer_booking') {
      const st = args.p_action === 'confirm' ? 'confirmed' : args.p_action === 'decline' ? 'declined' : 'change_requested'
      await rewrite(r => r.url.includes('/rpc/coach_schedule'), j => { walk(j, o => { if (o.id === args.p_booking && 'status' in o) Object.assign(o, { status: st, coach_note: args.p_note ?? o.coach_note, pending: true }) }); return j })
    } else if (n === 'coach_rsvp') {
      await rewrite(r => r.url.includes('/rpc/coach_squad'), j => { walk(j, o => { if (o.id === args.p_participant && 'status' in o) Object.assign(o, { status: args.p_attend ? 'confirmed' : 'declined', absence_reason: args.p_reason ?? null, pending: true }) }); return j })
    }
  }
}

/* ───────────── photos taken offline ───────────── */

export async function queueUpload(url: string, blob: Blob, contentType: string, label: string, headers: Record<string, string>) {
  const id = uuid()
  await db.outbox.put({ id, at: Date.now(), kind: 'upload', label, method: 'POST', url, headers: { ...headers, 'content-type': contentType, 'x-upsert': 'true' }, body: blob, tries: 0, error: null })
  await recount()
  return id
}

/* ───────────── sending the outbox ───────────── */

let token: () => Promise<string | null> = async () => null
export function setTokenSource(f: () => Promise<string | null>) { token = f }
let onFlushed: () => void = () => {}
export function setFlushListener(f: () => void) { onFlushed = f }

let flushing: Promise<void> | null = null
export function flush(): Promise<void> {
  if (flushing) return flushing
  flushing = (async () => {
    const rows = (await db.outbox.orderBy('at').toArray()).filter(r => !r.error)
    if (!rows.length || !state.online) return
    state.syncing = true; emit()
    let sent = 0
    for (const r of rows) {
      const t = await token()
      const h = new Headers(r.headers)
      if (t) h.set('authorization', `Bearer ${t}`)
      try {
        const res = await fetch(r.url, { method: r.method, headers: h, body: r.body })
        if (res.ok || (res.status === 409 && (await res.clone().text()).includes('already applied'))) { await db.outbox.delete(r.id); sent++ }
        else {
          let msg = `${res.status}`
          try { const j = await res.json(); msg = j.message || j.error || msg } catch { /* no body */ }
          if (!r.label) await db.outbox.delete(r.id); else await db.outbox.update(r.id, { tries: r.tries + 1, error: msg })
        }
      } catch (e) {
        if (isNetworkError(e)) { state.online = false; break }
        await db.outbox.update(r.id, { tries: r.tries + 1, error: (e as Error).message })
      }
    }
    state.syncing = false; state.lastSync = Date.now()
    await recount()
    if (sent) { await db.cache.clear(); onFlushed() }
  })().finally(() => { flushing = null })
  return flushing
}

export const outboxList = () => db.outbox.orderBy('at').toArray()
export async function discardOutbox(id: string) { await db.outbox.delete(id); await recount() }
export async function retryOutbox(id: string) { await db.outbox.update(id, { error: null }); await recount(); return flush() }
export const clearCache = () => db.cache.clear()
export const clearOutbox = async () => { await db.outbox.clear(); await recount() }
