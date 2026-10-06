// Pluribus · AI assistant.
// Answers questions about the programme by reading the database AS THE SIGNED-IN USER:
// every query runs with the user's own token, so the same access rules apply as on the screens.
// Read only. The Anthropic key lives in the function secrets (ANTHROPIC_API_KEY), never in the browser.
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const TABLES: Record<string, string> = {
  seasons: 'id, label, starts_on, ends_on, is_current_scouting, is_current_operational',
  regions: 'id, name (the 5 provinces)',
  districts: 'id, region_id, name',
  age_groups: 'season_id, code, birth_year_from, birth_year_to',
  academies: 'id, district_id, name, contact_name, contact_phone, notes, is_active',
  academy_seasons: 'academy_id, season_id, visit_date, scouted, selected, rating, status, obs',
  players: 'id, first_name, last_name, birth_year, birth_date, age_status, preferred_foot, positions, academy_id, district_id, pool_status, staff_notes, merged_into (ignore rows where merged_into is not null)',
  camps: 'id, season_id, stage (district|province|national), name, region_id, district_id, age_groups, starts_on, venue, status',
  camp_participants: 'camp_id, player_id, age_group, status, sprint_10m, sprint_20m, cj_cm, decision, position, comment',
  teams: 'id, season_id, name (e.g. U15), age_group, competitions',
  team_players: 'team_id, player_id, position, shirt, status, joined_on, left_on',
  team_days: 'id, team_id, day, kind (training|match|...), minutes',
  attendance: 'day_id, player_id, minutes, code',
  measurements: 'player_id, team_id, taken_on, metric (sprint_10m, sprint_20m, weight_kg, height_cm, ...), value',
  training_sessions: 'team_id, number, day, month, microcycle, objective',
  matches: 'id, team_id, played_on, competition, opponent, venue, goals_for, goals_against',
  match_players: 'match_id, player_id, minutes, started, goals, assists, yellow, red',
  evaluations: 'player_id, season_id, grade (A|B|C|D), potential, performance, summary',
  player_documents: 'player_id, kind, status, expires_on',
  staff_activities: 'day, time_text, location, contact, activity, status, feedback, staff',
  finance_accounts: 'id, name, kind, currency',
  finance_tx: 'account_id, day, amount_out, amount_in, description, type, subtype, payee (amounts in RWF)',
  partners: 'id, name, kind, country, city, status, notes',
  partner_contacts: 'partner_id, name, role, phone, email',
  partner_notes: 'partner_id, day, note',
  player_moves: 'player_id, partner_id, club, kind, status, starts_on, ends_on, amount, currency, notes',
  talent_files: 'path, name, is_folder, ext, modified_at (the SharePoint Talent folder index)',
}
const OPS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'ilike', 'in', 'is'] as const

const tools = [{
  name: 'query',
  description: 'Read rows from one table of the Pluribus database. PostgREST select syntax is allowed in "select", including embedded relations such as "name, team:teams(name)". Returns at most 200 rows. Use count=true to get only the number of matching rows.',
  input_schema: {
    type: 'object',
    properties: {
      table: { type: 'string', enum: Object.keys(TABLES) },
      select: { type: 'string', description: 'Columns, default *' },
      filters: { type: 'array', items: { type: 'object', properties: { column: { type: 'string' }, op: { type: 'string', enum: OPS }, value: {} }, required: ['column', 'op', 'value'] } },
      order: { type: 'object', properties: { column: { type: 'string' }, ascending: { type: 'boolean' } } },
      limit: { type: 'integer', minimum: 1, maximum: 200 },
      count: { type: 'boolean' },
    },
    required: ['table'],
  },
}]

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  try {
    const key = Deno.env.get('ANTHROPIC_API_KEY')
    if (!key) return json({ error: 'not_configured' }, 503)
    const auth = req.headers.get('Authorization') ?? ''
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } })
    const { data: { user } } = await db.auth.getUser(auth.replace(/^Bearer\s+/i, ''))
    if (!user) return json({ error: 'Please sign in again' }, 401)
    const { data: allowed } = await db.rpc('can', { p_area: 'assistant', p_level: 1 })
    if (!allowed) return json({ error: 'The assistant is not open for your account' }, 403)

    const body = await req.json().catch(() => ({}))
    const history = (Array.isArray(body.messages) ? body.messages : []).slice(-20)
      .filter((m: { role: string; content: string }) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
      .map((m: { role: string; content: string }) => ({ role: m.role, content: m.content.slice(0, 8000) }))
    if (!history.length || history[history.length - 1].role !== 'user') return json({ error: 'Ask a question' }, 400)

    const today = new Date().toISOString().slice(0, 10)
    const system = `You are the assistant of Pluribus, the management system of the Tony Football Excellence Programme in Rwanda, run with SL Benfica.
Today is ${today}. Answer the staff's questions using the query tool; never invent numbers, players or dates. If the data is not there or you are not allowed to read it, say so plainly.
Answer in the language of the question (English, Kinyarwanda, Portuguese, Hebrew...). Be short and concrete; use a small table or list when it helps. Write player names as First LAST.
Scouting: academies submit players to district camps, the best go to province finals and then the national final; pool_status tracks a player's place. Teams (U13, U15, U17, U20) are the Tony squads of an operational season.
Tables and main columns:
${Object.entries(TABLES).map(([t, c]) => `- ${t}: ${c}`).join('\n')}`

    const messages: unknown[] = [...history]
    const model = Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-sonnet-5-5'
    for (let turn = 0; turn < 8; turn++) {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model, max_tokens: 2000, system, tools, messages }),
      })
      if (!r.ok) return json({ error: `The AI service answered ${r.status}: ${(await r.text()).slice(0, 300)}` }, 502)
      const out = await r.json()
      messages.push({ role: 'assistant', content: out.content })
      if (out.stop_reason !== 'tool_use') {
        const text = (out.content as { type: string; text?: string }[]).filter(b => b.type === 'text').map(b => b.text).join('\n').trim()
        return json({ answer: text || 'I could not find an answer.' })
      }
      const results = []
      for (const b of out.content as { type: string; id: string; input: Record<string, unknown> }[]) {
        if (b.type !== 'tool_use') continue
        results.push({ type: 'tool_result', tool_use_id: b.id, content: await runQuery(db, b.input) })
      }
      messages.push({ role: 'user', content: results })
    }
    return json({ answer: 'The question needed too many steps. Please ask it in a narrower way.' })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

// deno-lint-ignore no-explicit-any
async function runQuery(db: any, input: Record<string, unknown>): Promise<string> {
  const table = String(input.table ?? '')
  if (!(table in TABLES)) return 'Unknown table.'
  const count = input.count === true
  let q = db.from(table).select(String(input.select || '*'), count ? { count: 'exact', head: true } : undefined)
  for (const f of (Array.isArray(input.filters) ? input.filters : []) as { column: string; op: string; value: unknown }[]) {
    if (!OPS.includes(f.op as typeof OPS[number])) return `Unknown operator ${f.op}.`
    q = f.op === 'in' ? q.in(f.column, Array.isArray(f.value) ? f.value : [f.value]) : f.op === 'is' ? q.is(f.column, f.value === 'null' ? null : f.value) : q[f.op](f.column, f.value)
  }
  const order = input.order as { column?: string; ascending?: boolean } | undefined
  if (order?.column) q = q.order(order.column, { ascending: order.ascending !== false })
  if (!count) q = q.limit(Math.min(Number(input.limit) || 50, 200))
  const { data, error, count: n } = await q
  if (error) return `Error: ${error.message}`
  if (count) return `count: ${n}`
  const s = JSON.stringify(data)
  return s.length > 40000 ? s.slice(0, 40000) + '… (cut, ask for fewer rows or columns)' : s
}
