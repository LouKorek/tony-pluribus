import { supabase, type Academy, type AgeGroup, type District, type Region } from '../../lib/supabase'
import {
  DECISION_LABEL, POOL_LABEL, POOL_ORDER, PSTATUS_LABEL, STAGE_LABEL, ageGroupFor, fmtDate, fmtRange, fullName,
  type Camp, type CampStats, type Decision, type Participant, type Player, type PoolStatus, type Stage,
} from '../../lib/scouting'

export type Cell = string | number | null
export interface Column { key: string; label: string; width: number; align?: 'left' | 'right' | 'center' }
export interface Section { title?: string; rows: Record<string, Cell>[] }
export interface ReportData { title: string; subtitle: string; /** download name without extension */ fileName: string; columns: Column[]; sections: Section[]; summary?: [string, Cell][] }

export interface Ref {
  regions: Region[]; districts: District[]; academies: Academy[]; groups: AgeGroup[]
  district: (id: string | null | undefined) => District | undefined
  regionOf: (id: string | null | undefined) => Region | undefined
  academy: (id: string | null | undefined) => Academy | undefined
}
export interface Params { season: string; seasonLabel: string; camp?: string; stage?: Stage; region?: string; academy?: string; group?: string }
export type ParamKey = 'camp' | 'stage' | 'region' | 'academy' | 'group'

export interface ReportDef {
  id: string; title: string; description: string; params: ParamKey[]; required?: ParamKey[]
  load: (p: Params, ref: Ref) => Promise<ReportData>
}

type PRow = Participant & { player: Player }
const ss = (label: string) => label.replace(/^(\d{4})-\d{2}(\d{2})$/, '$1-$2')   // 2026-2027 -> 2026-27
const yes = (b: boolean) => (b ? '✓' : '')
const num = (n: number | null) => (n === null || n === undefined ? null : Number(n))
const decision = (d: Decision | null) => (d ? DECISION_LABEL[d] : '')
const groupOrder = (ref: Ref, g: string | null) => { const i = ref.groups.findIndex(x => x.code === g); return i < 0 ? 99 : i }

async function must<T>(q: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return data as T
}

async function participants(campIds: string[]): Promise<PRow[]> {
  if (!campIds.length) return []
  const out: PRow[] = []
  for (let from = 0; ; from += 1000) {
    const page = await must<PRow[]>(supabase.from('camp_participants').select('*, player:players(*)').in('camp_id', campIds).neq('status', 'removed').range(from, from + 999))
    out.push(...page)
    if (page.length < 1000) break
  }
  return out
}

export const REPORTS: ReportDef[] = [
  {
    id: 'camp-sheet', title: 'Camp sheet',
    description: 'Everything entered at one camp: attendance, tests, OBS, decisions and comments, by age group.',
    params: ['camp'], required: ['camp'],
    async load(p, ref) {
      const camp = await must<Camp>(supabase.from('camps').select('*').eq('id', p.camp!).single())
      const rows = await participants([camp.id])
      const where = camp.district_id ? ref.district(camp.district_id)?.name : ref.regions.find(r => r.id === camp.region_id)?.name ?? 'Rwanda'
      const final = camp.stage !== 'district'
      const groups = [...new Set(rows.map(r => r.age_group ?? 'Other'))].sort((a, b) => groupOrder(ref, a) - groupOrder(ref, b))
      const att = rows.filter(r => r.status === 'attended').length
      return {
        fileName: `TFEP Camp sheet - ${camp.name} - ${camp.starts_on ?? ss(p.seasonLabel)}`,
        title: camp.name,
        subtitle: `${STAGE_LABEL[camp.stage]} · ${fmtRange(camp.starts_on, camp.ends_on)} · ${where ?? ''}${camp.venue ? ` · ${camp.venue}` : ''}`,
        summary: [['Players', rows.length], ['Attended', att], ['Selected', rows.filter(r => r.decision === 'selected').length], ['See again', rows.filter(r => r.decision === 'see_again').length]],
        columns: [
          { key: 'n', label: '#', width: 5, align: 'right' }, { key: 'player', label: 'Player', width: 26 }, { key: 'year', label: 'Born', width: 7, align: 'center' },
          { key: 'academy', label: 'Academy', width: 26 }, { key: 'status', label: 'Attendance', width: 14 },
          { key: 's10', label: '10m', width: 7, align: 'right' }, { key: 's20', label: '20m', width: 7, align: 'right' }, { key: 'cj', label: 'CJ', width: 7, align: 'right' },
          { key: 'obs', label: 'OBS', width: 6, align: 'center' }, { key: 'decision', label: 'Decision', width: 13 }, { key: 'gk', label: 'GK', width: 5, align: 'center' },
          { key: 'position', label: 'Position', width: 13 }, ...(final ? [{ key: 'team', label: 'Team', width: 8 }] : []), { key: 'comment', label: 'Comment', width: 36 },
        ],
        sections: groups.map(g => ({
          title: g,
          rows: rows.filter(r => (r.age_group ?? 'Other') === g)
            .sort((a, b) => a.player.last_name.localeCompare(b.player.last_name))
            .map((r, i) => ({
              n: i + 1, player: fullName(r.player), year: r.player.birth_year, academy: ref.academy(r.player.academy_id)?.name ?? '',
              status: PSTATUS_LABEL[r.status], s10: num(r.sprint_10m), s20: num(r.sprint_20m), cj: num(r.cj_cm), obs: r.obs ?? '',
              decision: decision(r.decision), gk: yes(r.is_goalkeeper), position: r.position ?? '', team: r.team ?? '',
              comment: r.status === 'absent' || r.status === 'declined' ? r.absence_reason ?? '' : r.comment ?? '',
            })),
        })),
      }
    },
  },
  {
    id: 'finals', title: 'Finals results',
    description: 'The lists from the province finals or the national final: selected, see again, not selected and absences.',
    params: ['stage', 'region'],
    async load(p, ref) {
      const stage = p.stage ?? 'national_final'
      let q = supabase.from('camps').select('*').eq('season_id', p.season).eq('stage', stage).neq('status', 'cancelled')
      if (p.region && stage === 'province_final') q = q.eq('region_id', p.region)
      const camps = await must<Camp[]>(q.order('starts_on'))
      const rows = await participants(camps.map(c => c.id))
      const order: [string, (r: PRow) => boolean][] = [
        ['Selected', r => r.decision === 'selected'], ['See again', r => r.decision === 'see_again'], ['Not selected', r => r.decision === 'not_selected'],
        ['Absences', r => !r.decision && (r.status === 'absent' || r.status === 'declined')], ['No decision yet', r => !r.decision && r.status !== 'absent' && r.status !== 'declined'],
      ]
      const sections: Section[] = []
      for (const c of camps) for (const [label, test] of order) {
        const list = rows.filter(r => r.camp_id === c.id && test(r))
          .sort((a, b) => groupOrder(ref, a.age_group) - groupOrder(ref, b.age_group) || a.player.last_name.localeCompare(b.player.last_name))
        if (list.length) sections.push({
          title: `${camps.length > 1 ? c.name + ' · ' : ''}${label} (${list.length})`,
          rows: list.map((r, i) => ({
            n: i + 1, player: fullName(r.player), year: r.player.birth_year, group: r.age_group ?? '', academy: ref.academy(r.player.academy_id)?.name ?? '',
            district: ref.district(ref.academy(r.player.academy_id)?.district_id)?.name ?? '', obs: r.obs ?? '', position: r.position ?? '', team: r.team ?? '',
            comment: label === 'Absences' ? r.absence_reason ?? '' : r.comment ?? '',
          })),
        })
      }
      return {
        fileName: `TFEP ${stage === 'national_final' ? 'National final' : 'Province finals'} results - ${ss(p.seasonLabel)}${p.region && stage === 'province_final' ? ' - ' + ref.regions.find(r => r.id === p.region)?.name : ''}`,
        title: `${STAGE_LABEL[stage]}${stage === 'province_final' ? 's' : ''} · results`,
        subtitle: `Scouting ${p.seasonLabel}${p.region && stage === 'province_final' ? ` · ${ref.regions.find(r => r.id === p.region)?.name}` : ''}`,
        summary: order.slice(0, 4).map(([l, t]) => [l, rows.filter(t).length] as [string, Cell]),
        columns: [
          { key: 'n', label: '#', width: 5, align: 'right' }, { key: 'player', label: 'Player', width: 26 }, { key: 'year', label: 'Born', width: 7, align: 'center' },
          { key: 'group', label: 'Group', width: 7, align: 'center' }, { key: 'academy', label: 'Academy', width: 26 }, { key: 'district', label: 'District', width: 14 },
          { key: 'obs', label: 'OBS', width: 6, align: 'center' }, { key: 'position', label: 'Position', width: 13 }, { key: 'team', label: 'Team', width: 8 },
          { key: 'comment', label: 'Comment / reason', width: 36 },
        ],
        sections,
      }
    },
  },
  {
    id: 'academy', title: 'Academy report',
    description: "One academy's season: every player it sent, every camp and every result. Ready to share with the academy.",
    params: ['academy'], required: ['academy'],
    async load(p, ref) {
      const a = ref.academy(p.academy)!
      const players = await must<Player[]>(supabase.from('players').select('*').eq('academy_id', a.id).is('merged_into', null))
      const camps = await must<Camp[]>(supabase.from('camps').select('*').eq('season_id', p.season))
      const cmap = new Map(camps.map(c => [c.id, c]))
      const rows = players.length ? (await must<Participant[]>(supabase.from('camp_participants').select('*').in('player_id', players.map(x => x.id)).neq('status', 'removed')))
        .filter(r => cmap.has(r.camp_id)) : []
      const pmap = new Map(players.map(x => [x.id, x]))
      const list = rows.map(r => ({ r, pl: pmap.get(r.player_id)!, c: cmap.get(r.camp_id)! }))
        .sort((x, y) => x.pl.last_name.localeCompare(y.pl.last_name) || (x.c.starts_on ?? '').localeCompare(y.c.starts_on ?? ''))
      return {
        fileName: `TFEP Academy report - ${a.name} - ${ss(p.seasonLabel)}`,
        title: a.name,
        subtitle: `Academy report · scouting ${p.seasonLabel} · ${ref.district(a.district_id)?.name ?? ''}, ${ref.regionOf(a.district_id)?.name ?? ''}`,
        summary: [['Players in squad', players.length], ['Sent to camps', new Set(rows.map(r => r.player_id)).size], ['Selected', new Set(rows.filter(r => r.decision === 'selected').map(r => r.player_id)).size], ['Province finals', new Set(list.filter(x => x.c.stage !== 'district').map(x => x.pl.id)).size]],
        columns: [
          { key: 'player', label: 'Player', width: 26 }, { key: 'year', label: 'Born', width: 7, align: 'center' }, { key: 'group', label: 'Group', width: 7, align: 'center' },
          { key: 'camp', label: 'Camp', width: 30 }, { key: 'date', label: 'Date', width: 13 }, { key: 'status', label: 'Attendance', width: 14 },
          { key: 'obs', label: 'OBS', width: 6, align: 'center' }, { key: 'decision', label: 'Decision', width: 13 }, { key: 'published', label: 'Told coach', width: 10, align: 'center' },
          { key: 'comment', label: 'Comment', width: 34 },
        ],
        sections: [{
          rows: list.map(({ r, pl, c }) => ({
            player: fullName(pl), year: pl.birth_year, group: r.age_group ?? '', camp: c.name, date: fmtDate(c.starts_on), status: PSTATUS_LABEL[r.status],
            obs: r.obs ?? '', decision: decision(r.decision), published: r.decision ? yes(r.decision_published) : '', comment: r.coach_message ?? r.comment ?? '',
          })),
        }],
      }
    },
  },
  {
    id: 'register', title: 'Academy register',
    description: 'All academies by province with contacts and the scouting visit of the season (players seen, selected, grade).',
    params: ['region'],
    async load(p, ref) {
      const visits = await must<{ academy_id: string; visit_date: string | null; scouted: number | null; selected: number | null; rating: string | null; status: string | null; obs: string | null }[]>(
        supabase.from('academy_seasons').select('*').eq('season_id', p.season))
      const vmap = new Map(visits.map(v => [v.academy_id, v]))
      const regions = ref.regions.filter(r => !p.region || r.id === p.region)
      return {
        fileName: `TFEP Academy register - ${ss(p.seasonLabel)}${p.region ? ' - ' + regions[0]?.name : ''}`,
        title: 'Academy register',
        subtitle: `Scouting ${p.seasonLabel}${p.region ? ` · ${regions[0]?.name}` : ' · all provinces'}`,
        summary: [['Academies', ref.academies.filter(a => a.is_active && regions.some(r => r.id === ref.regionOf(a.district_id)?.id)).length], ['Visited', visits.filter(v => v.visit_date && regions.some(r => r.id === ref.regionOf(ref.academy(v.academy_id)?.district_id)?.id)).length]],
        columns: [
          { key: 'academy', label: 'Academy', width: 30 }, { key: 'district', label: 'District', width: 14 }, { key: 'contact', label: 'Contact', width: 20 },
          { key: 'phone', label: 'Phone', width: 14 }, { key: 'visit', label: 'Visit', width: 13 }, { key: 'seen', label: 'Seen', width: 7, align: 'right' },
          { key: 'selected', label: 'Selected', width: 9, align: 'right' }, { key: 'obs', label: 'OBS', width: 8 }, { key: 'rating', label: 'Rating', width: 9 }, { key: 'status', label: 'Status', width: 14 },
        ],
        sections: regions.map(r => ({
          title: r.name,
          rows: ref.academies.filter(a => a.is_active && ref.regionOf(a.district_id)?.id === r.id)
            .sort((a, b) => (ref.district(a.district_id)?.name ?? '').localeCompare(ref.district(b.district_id)?.name ?? '') || a.name.localeCompare(b.name))
            .map(a => { const v = vmap.get(a.id); return {
              academy: a.name, district: ref.district(a.district_id)?.name ?? '', contact: a.contact_name ?? '', phone: a.contact_phone ?? '',
              visit: v?.visit_date ? fmtDate(v.visit_date) : '', seen: v?.scouted ?? null, selected: v?.selected ?? null, obs: v?.obs ?? '', rating: v?.rating ?? '', status: v?.status ?? '',
            } }),
        })),
      }
    },
  },
  {
    id: 'pool', title: 'Potential pool',
    description: 'Every player of the season grouped by how far he came, with academy and province.',
    params: ['group'],
    async load(p, ref) {
      const players = await must<Player[]>(supabase.rpc('season_players', { p_season: p.season }))
      const list = players.filter(x => !p.group || ageGroupFor(x.birth_year, ref.groups) === p.group)
      return {
        fileName: `TFEP Potential pool - ${ss(p.seasonLabel)}${p.group ? ' - ' + p.group : ''}`,
        title: 'Potential pool',
        subtitle: `Scouting ${p.seasonLabel}${p.group ? ` · ${p.group}` : ''}`,
        summary: [['Players', list.length], ['Selected', list.filter(x => x.pool_status === 'selected').length], ['See again', list.filter(x => x.pool_status === 'see_again').length]],
        columns: [
          { key: 'player', label: 'Player', width: 26 }, { key: 'year', label: 'Born', width: 7, align: 'center' }, { key: 'group', label: 'Group', width: 7, align: 'center' },
          { key: 'positions', label: 'Positions', width: 14 }, { key: 'academy', label: 'Academy', width: 28 }, { key: 'district', label: 'District', width: 14 }, { key: 'region', label: 'Province', width: 18 },
        ],
        sections: POOL_ORDER.map(s => ({
          title: POOL_LABEL[s as PoolStatus],
          rows: list.filter(x => x.pool_status === s).sort((a, b) => a.last_name.localeCompare(b.last_name)).map(x => ({
            player: fullName(x), year: x.birth_year, group: ageGroupFor(x.birth_year, ref.groups) ?? '', positions: x.positions ?? '',
            academy: ref.academy(x.academy_id)?.name ?? '', district: ref.district(x.district_id ?? ref.academy(x.academy_id)?.district_id)?.name ?? '',
            region: ref.regionOf(x.district_id ?? ref.academy(x.academy_id)?.district_id)?.name ?? '',
          })),
        })).filter(s => s.rows.length),
      }
    },
  },
  {
    id: 'camps', title: 'Camps of the season',
    description: 'The season calendar: every camp with its place, staff, numbers and status.',
    params: ['region'],
    async load(p, ref) {
      const camps = await must<Camp[]>(supabase.from('camps').select('*').eq('season_id', p.season).order('starts_on', { nullsFirst: false }))
      const stats = camps.length ? await must<CampStats[]>(supabase.from('v_camp_stats').select('*').in('camp_id', camps.map(c => c.id))) : []
      const smap = new Map(stats.map(s => [s.camp_id, s]))
      const regionOfCamp = (c: Camp) => c.region_id ?? ref.district(c.district_id)?.region_id ?? null
      const list = camps.filter(c => !p.region || regionOfCamp(c) === p.region)
      return {
        fileName: `TFEP Camps - ${ss(p.seasonLabel)}${p.region ? ' - ' + ref.regions.find(r => r.id === p.region)?.name : ''}`,
        title: 'Camps of the season',
        subtitle: `Scouting ${p.seasonLabel}${p.region ? ` · ${ref.regions.find(r => r.id === p.region)?.name}` : ''}`,
        summary: [['Camps', list.length], ['Players', list.reduce((s, c) => s + (smap.get(c.id)?.total ?? 0), 0)], ['Selected', list.reduce((s, c) => s + (smap.get(c.id)?.selected ?? 0), 0)]],
        columns: [
          { key: 'date', label: 'Date', width: 16 }, { key: 'camp', label: 'Camp', width: 30 }, { key: 'where', label: 'District / province', width: 18 },
          { key: 'venue', label: 'Venue', width: 20 }, { key: 'staff', label: 'Staff', width: 20 }, { key: 'players', label: 'Players', width: 8, align: 'right' },
          { key: 'attended', label: 'Attended', width: 9, align: 'right' }, { key: 'selected', label: 'Selected', width: 9, align: 'right' }, { key: 'status', label: 'Status', width: 11 },
        ],
        sections: (['district', 'province_final', 'national_final'] as Stage[]).map(st => ({
          title: STAGE_LABEL[st] + (st === 'national_final' ? '' : 's'),
          rows: list.filter(c => c.stage === st).map(c => ({
            date: c.starts_on ? fmtRange(c.starts_on, c.ends_on) : 'To be set', camp: c.name,
            where: ref.district(c.district_id)?.name ?? ref.regions.find(r => r.id === c.region_id)?.name ?? 'Rwanda', venue: c.venue ?? '', staff: c.staff ?? '',
            players: smap.get(c.id)?.total ?? 0, attended: smap.get(c.id)?.attended ?? 0, selected: smap.get(c.id)?.selected ?? 0,
            status: c.status[0].toUpperCase() + c.status.slice(1),
          })),
        })).filter(s => s.rows.length),
      }
    },
  },
]
