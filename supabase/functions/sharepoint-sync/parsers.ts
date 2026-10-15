// Tony Next · workbook parsers for the content sync (stage 19).
// Each parser turns one Excel workbook from the Talent folder into the payload the matching
// talent_apply_* function in Postgres expects. Layouts follow the files the academy keeps today;
// every parser is tolerant to extra rows, moved columns and blank cells, and reports what it could not read.
import * as XLSX from 'npm:xlsx@0.18.5'

type Cell = string | number | boolean | Date | null
type Row = Cell[]
export type Parsed = { payload: Record<string, unknown>; rows: number; notes: string[] }

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
const MONTH_RE = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i

export function monthIndex(s: string): number | null {
  const m = MONTH_RE.exec(s ?? '')
  if (!m) return null
  const k = m[1].toLowerCase().slice(0, 3)
  return MONTHS.findIndex(x => x.startsWith(k))
}

/** season "2026-2027" from a Talent path */
export function seasonOf(path: string): [number, number] | null {
  const m = /Season (\d{4})-(\d{4})/.exec(path)
  return m ? [Number(m[1]), Number(m[2])] : null
}
/** the calendar year of a month inside a season (Aug–Dec belong to the first year) */
export function yearFor(season: [number, number] | null, month: number, fallback?: number) {
  if (!season) return fallback ?? new Date().getFullYear()
  return month >= 7 ? season[0] : season[1]
}

const pad = (n: number) => String(n).padStart(2, '0')
export const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`
const str = (c: Cell) => (c == null ? '' : c instanceof Date ? c.toISOString() : String(c)).trim()
const num = (c: Cell): number | null => {
  if (c == null || c === '') return null
  if (typeof c === 'number') return Number.isFinite(c) ? c : null
  const s = String(c).replace(/[^\d,.\-]/g, '').replace(',', '.')
  if (!s || s === '-' || s === '.') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/** a date from a cell: Date object, Excel serial, dd/mm/yyyy, dd.mm.yy, yyyy-mm-dd, "12th September", "MONDAY 06/07" */
export function toDate(c: Cell, hint?: { year?: number; season?: [number, number] | null }): string | null {
  if (c == null || c === '') return null
  if (c instanceof Date) return isNaN(c.getTime()) ? null : iso(c.getUTCFullYear(), c.getUTCMonth(), c.getUTCDate())
  if (typeof c === 'number') {
    if (c > 20000 && c < 80000) { const d = XLSX.SSF.parse_date_code(c); return d ? iso(d.y, d.m - 1, d.d) : null }
    return null
  }
  const s = String(c).trim()
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s)
  if (m) return iso(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  m = /(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/.exec(s)
  if (m) { const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]); return iso(y, Number(m[2]) - 1, Number(m[1])) }
  m = /(\d{1,2})\s*(?:st|nd|rd|th)?\s+([A-Za-z]+)\.?\s*(\d{4})?/i.exec(s)
  if (m) {
    const mi = monthIndex(m[2])
    if (mi != null) { const y = m[3] ? Number(m[3]) : yearFor(hint?.season ?? null, mi, hint?.year); return iso(y, mi, Number(m[1])) }
  }
  m = /(\d{1,2})[./](\d{1,2})(?![./\d])/.exec(s) // "06/07" without a year
  if (m) { const mi = Number(m[2]) - 1; const y = hint?.year ?? yearFor(hint?.season ?? null, mi); return iso(y, mi, Number(m[1])) }
  return null
}

const sheetRows = (wb: XLSX.WorkBook, name: string): Row[] =>
  XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null }) as Row[]

const CODES = new Set(['A', 'I', 'JA', 'NT', 'M', 'NS', 'SM', 'SE', 'SC', 'S', 'SI', 'OUT', 'PT', 'PM', 'TM', 'X', 'P', 'L', 'E', 'R', 'T'])
/** does this cell hold a player's name ("SURNAME NAME (POS)")? */
export function isPlayerName(c: Cell) {
  if (typeof c !== 'string') return false
  const s = c.trim()
  if (s.length < 4 || /[=:]/.test(s) || /\d/.test(s.replace(/\(.*\)/, '')) ) return false
  if (/^(total|legend|nr\b|name|player|surname|squad|coach|staff|goalkeeper|defender|midfielder|forward|bench|date|position|number|session|training|match)/i.test(s)) return false
  if (CODES.has(s.toUpperCase())) return false
  const words = s.replace(/\(.*?\)/g, ' ').trim().split(/\s+/).filter(Boolean)
  return words.length >= 2 || s.includes('(')
}

// ───────── Presence Control ─────────
export function parsePresence(wb: XLSX.WorkBook, path: string): Parsed {
  const season = seasonOf(path)
  const months: Record<string, unknown>[] = []
  const notes: string[] = []
  let n = 0
  for (const name of wb.SheetNames) {
    if (/total/i.test(name)) continue
    const rows = sheetRows(wb, name)
    if (rows.length < 3) continue
    // which month: the title cell in the first rows, else the sheet name
    let mi = monthIndex(name)
    let year: number | null = null
    for (const r of rows.slice(0, 3)) for (const c of r) {
      if (typeof c === 'string' && mi == null) mi = monthIndex(c)
      if (typeof c === 'string') { const y = /\b(20\d{2})\b/.exec(c); if (y) year ??= Number(y[1]) }
    }
    if (mi == null) { notes.push(`${name}: no month found`); continue }
    const y = year ?? yearFor(season, mi)
    // the header row: the one with the most day numbers
    let hdr = -1, best = 0
    for (let i = 0; i < Math.min(rows.length, 6); i++) {
      const cnt = rows[i].filter(c => c != null && (typeof c === 'number' ? c >= 1 && c <= 31 : /^\d{1,2}\s*[A-Za-z]?\s*$/.test(String(c)) || c instanceof Date)).length
      if (cnt > best) { best = cnt; hdr = i }
    }
    if (hdr < 0 || best < 2) { notes.push(`${name}: no day header`); continue }
    const cols: { col: number; d: number }[] = []
    const days: { day: string; seq: number; kind: string }[] = []
    const seen = new Map<number, number>()
    // the day columns start where three day-like cells follow each other (the totals columns before them are not days)
    const dayLike = (c: Cell) => c != null && (c instanceof Date || (typeof c === 'number' ? c >= 1 && c <= 31 : /^\d{1,2}\s*[A-Za-z]?\s*$/.test(String(c))))
    let startCol = 1
    for (let c = 1; c < rows[hdr].length; c++) if (dayLike(rows[hdr][c]) && dayLike(rows[hdr][c + 1]) && dayLike(rows[hdr][c + 2])) { startCol = c; break }
    rows[hdr].forEach((c, col) => {
      if (col < startCol || c == null) return
      let d: number | null = null, kind = 'training'
      if (c instanceof Date) d = c.getUTCDate()
      else if (typeof c === 'number' && c >= 1 && c <= 31) d = c
      else { const m = /^(\d{1,2})\s*([A-Za-z]*)\s*$/.exec(String(c)); if (m) { d = Number(m[1]); if (/^m/i.test(m[2])) kind = 'match' } }
      if (d == null) return
      const seq = (seen.get(d) ?? 0) + 1; seen.set(d, seq)
      cols.push({ col, d: days.length }); days.push({ day: iso(y, mi, d), seq, kind })
    })
    const out: { name: string; cells: { d: number; v: string }[] }[] = []
    for (const r of rows.slice(hdr + 1)) {
      if (!isPlayerName(r[0])) continue
      const cells: { d: number; v: string }[] = []
      for (const { col, d } of cols) {
        const c = r[col]; if (c == null || c === '') continue
        const v = typeof c === 'number' ? String(Math.round(c)) : str(c).toUpperCase()
        if (v) cells.push({ d, v })
      }
      out.push({ name: str(r[0]), cells }); n += cells.length
    }
    if (out.length) months.push({ month: `${y}-${pad(mi + 1)}`, days, rows: out })
  }
  return { payload: { months }, rows: n, notes }
}

// ───────── Speed tests / Weight and height ─────────
function parseMeasures(wb: XLSX.WorkBook, path: string, set: 'speed' | 'weight'): Parsed {
  const season = seasonOf(path)
  const byName = new Map<string, { date: string; metric: string; value: number }[]>()
  const notes: string[] = []
  let n = 0
  for (const name of wb.SheetNames) {
    const rows = sheetRows(wb, name)
    if (rows.length < 2) continue
    // header row: the one holding "Date" (or the 10m/Weight labels)
    let hdr = rows.findIndex(r => r.some(c => typeof c === 'string' && /^date/i.test(c.trim())))
    if (hdr < 0) hdr = rows.findIndex(r => r.some(c => typeof c === 'string' && /10\s*m|weight|height/i.test(c)))
    if (hdr < 0) { notes.push(`${name}: no header`); continue }
    const h = rows[hdr]
    // groups: a date column followed by metric columns, repeating
    const groups: { dateCol: number; metrics: { col: number; metric: string }[] }[] = []
    h.forEach((c, col) => {
      const s = str(c).toLowerCase()
      const isDate = c instanceof Date || /^date/.test(s) || (typeof c === 'number' && c > 20000)
      if (isDate) { groups.push({ dateCol: col, metrics: [] }); return }
      const g = groups[groups.length - 1]; if (!g) return
      const metric = set === 'speed'
        ? (/10/.test(s) ? 'sprint_10m' : /20/.test(s) ? 'sprint_20m' : /30/.test(s) ? 'sprint_30m' : null)
        : (/weight|kg/.test(s) ? 'weight_kg' : /height|cm|\bm\b/.test(s) ? 'height_cm' : null)
      if (metric) g.metrics.push({ col, metric })
    })
    if (!groups.length) { notes.push(`${name}: no columns`); continue }
    // the date of each group: a real date in the header, else in the row under it, else the file's season
    const dates = groups.map(g => {
      const hd = toDate(h[g.dateCol], { season })
      if (hd) return hd
      for (const r of rows.slice(hdr + 1, hdr + 3)) { const d = toDate(r[g.dateCol], { season }); if (d) return d }
      return null
    })
    for (const r of rows.slice(hdr + 1)) {
      if (!isPlayerName(r[0])) continue
      const list = byName.get(str(r[0])) ?? []
      groups.forEach((g, gi) => {
        const date = toDate(r[g.dateCol], { season }) ?? dates[gi]
        if (!date) return
        for (const { col, metric } of g.metrics) {
          let v = num(r[col]); if (v == null) continue
          if (metric === 'height_cm' && v < 3) v = Math.round(v * 1000) / 10 // "1,41m" → 141 cm
          if (metric === 'height_cm' && v > 250) v = v / 10 // mm
          if (metric.startsWith('sprint') && (v <= 0 || v > 30)) continue
          list.push({ date, metric, value: v }); n++
        }
      })
      byName.set(str(r[0]), list)
    }
  }
  return { payload: { metric_set: set, rows: [...byName].map(([name, values]) => ({ name, values })) }, rows: n, notes }
}
export const parseSpeed = (wb: XLSX.WorkBook, path: string) => parseMeasures(wb, path, 'speed')
export const parseWeight = (wb: XLSX.WorkBook, path: string) => parseMeasures(wb, path, 'weight')

// ───────── Match Control - Stats ─────────
export function parseMatchStats(wb: XLSX.WorkBook, path: string): Parsed {
  const season = seasonOf(path)
  const comp = /\/Matches\/([^/]+)\//i.exec(path)?.[1]
  const competition = comp ? comp[0].toUpperCase() + comp.slice(1).toLowerCase() : 'Friendly'
  const matches: { number: number | null; opponent: string | null; date: string | null }[] = []
  const rowsOut: { name: string; stats: { m: number; goals: number; assists: number; yc: number; rc: number }[] }[] = []
  const notes: string[] = []
  let n = 0
  for (const name of wb.SheetNames) {
    const rows = sheetRows(wb, name)
    if (rows.length < 3) continue
    // header row: match titles; the row under it names Goals / Assists / YC / RC per match
    let hdr = -1
    for (let i = 0; i < Math.min(rows.length, 5); i++) if (rows[i + 1]?.filter(c => typeof c === 'string' && /goal|assist|yc|yellow|rc|red/i.test(c)).length >= 4) { hdr = i; break }
    if (hdr < 0) { notes.push(`${name}: no match header`); continue }
    const sub = rows[hdr + 1]
    const cols: { m: number; col: number; k: 'goals' | 'assists' | 'yc' | 'rc' }[] = []
    let current = -1
    rows[hdr].forEach((c, col) => {
      if (c != null && c !== '' && col > 0 && !/^total/i.test(str(c))) {
        const s = str(c)
        const numM = /^(\d+)\s*(?:st|nd|rd|th)?\s*(?:vs|v\.?|-)/i.exec(s)
        const opp = /(?:vs|v\.)\s*(.+?)\s*$/i.exec(s)?.[1] ?? null
        const date = c instanceof Date ? toDate(c) : toDate(s, { season })
        // a header is a match if it names an opponent or a date (totals columns have neither)
        if (numM || opp || date) { matches.push({ number: numM ? Number(numM[1]) : null, opponent: opp ? opp.replace(/\s+U\s*-?\d{2}\s*$/i, '').trim() : null, date }); current = matches.length - 1 }
        else current = -1
      }
      if (current < 0 || col === 0) return
      const s = str(sub[col]).toLowerCase()
      const k = /goal/.test(s) ? 'goals' : /assist/.test(s) ? 'assists' : /yellow|^yc/.test(s) ? 'yc' : /red|^rc/.test(s) ? 'rc' : null
      if (k) cols.push({ m: current, col, k })
    })
    for (const r of rows.slice(hdr + 2)) {
      if (!isPlayerName(r[0])) continue
      const by = new Map<number, { m: number; goals: number; assists: number; yc: number; rc: number }>()
      for (const { m, col, k } of cols) {
        const v = num(r[col]); if (v == null) continue
        const st = by.get(m) ?? { m, goals: 0, assists: 0, yc: 0, rc: 0 }; st[k] = Math.round(v); by.set(m, st)
      }
      const stats = [...by.values()]
      rowsOut.push({ name: str(r[0]), stats }); n += stats.length
    }
    break // one sheet carries the season
  }
  return { payload: { competition, matches, rows: rowsOut }, rows: n, notes }
}

// ───────── Squad board ─────────
export function parseSquad(wb: XLSX.WorkBook): Parsed {
  const out: { name: string; slot: number }[] = []
  let slot = 0
  for (const name of wb.SheetNames) {
    const rows = sheetRows(wb, name)
    for (const r of rows) for (const c of r) {
      if (!isPlayerName(c)) continue
      const s = str(c)
      if (/\b(U\s*-?\d{2}|squad|season|division)\b/i.test(s)) continue
      slot++; out.push({ name: s, slot })
    }
  }
  return { payload: { rows: out }, rows: out.length, notes: [] }
}

// ───────── Evaluations - Tony EFP ─────────
export function parseEvaluations(wb: XLSX.WorkBook, path: string): Parsed {
  const season = seasonOf(path)
  const label = season ? `${season[0]}-${season[1]}` : null
  const out: { name: string; dob: string | null; grade: string | null; note: string | null }[] = []
  const notes: string[] = []
  for (const name of wb.SheetNames) {
    const rows = sheetRows(wb, name)
    if (rows.length < 2) continue
    let hdr = rows.findIndex(r => r.some(c => typeof c === 'string' && /evaluation|birth/i.test(c)))
    if (hdr < 0) hdr = 0
    const h = rows[hdr].map(c => str(c).toLowerCase())
    const dobCol = h.findIndex(s => /birth|dob/.test(s)), gradeCol = h.findIndex(s => /evaluation|grade/.test(s))
    const noteCol = h.findIndex((s, i) => i > Math.max(dobCol, gradeCol) && /note|comment|remark|observation/.test(s))
    for (const r of rows.slice(hdr + 1)) {
      if (!isPlayerName(r[0])) continue
      const grade = str(r[gradeCol >= 0 ? gradeCol : 2]).toUpperCase().replace(/[^A-D]/g, '').slice(0, 1) || null
      const dob = toDate(r[dobCol >= 0 ? dobCol : 1]) ?? null
      const note = str(r[noteCol >= 0 ? noteCol : 3]) || null
      out.push({ name: str(r[0]), dob, grade, note })
    }
  }
  if (!label) notes.push('no season in the path')
  return { payload: { season: label, rows: out }, rows: out.length, notes }
}

// ───────── Finance ledgers (Finance Momo) ─────────
export function parseFinance(wb: XLSX.WorkBook, path: string): Parsed {
  const file = path.split('/').pop() ?? path
  const account = /andre/i.test(file) ? 'Andre' : /fabio/i.test(file) ? 'Fabio' : 'TRW MoMo'
  const sheets: { name: string; rows: Record<string, unknown>[] }[] = []
  const notes: string[] = []
  let n = 0
  for (const name of wb.SheetNames) {
    const rows = sheetRows(wb, name)
    const hdr = rows.findIndex(r => r.some(c => typeof c === 'string' && /^date\b/i.test(c.trim())) && r.some(c => typeof c === 'string' && /^(out|in|expense|income|debit|credit)\b/i.test(c.trim())))
    if (hdr < 0) continue // a summary sheet
    const h = rows[hdr].map(c => str(c).toLowerCase())
    const col = (re: RegExp) => h.findIndex(s => re.test(s))
    const cDate = col(/^date/), cOut = col(/^(out|expense|debit)/), cIn = col(/^(in|income|credit)\b/), cDesc = col(/desc/), cType = col(/^type/), cSub = col(/sub\s*-?\s*type/),
      cName = col(/^(name|payee|to|from|beneficiary)/), cInv = col(/invoice|receipt|ref/), cBal = col(/balance/)
    const yy = /\b(\d{2}|20\d{2})\b/.exec(name)?.[1]
    const year = yy ? (yy.length === 2 ? 2000 + Number(yy) : Number(yy)) : (/\b(20\d{2})\b/.exec(file)?.[1] ? Number(/\b(20\d{2})\b/.exec(file)![1]) : undefined)
    const out: Record<string, unknown>[] = []
    for (const r of rows.slice(hdr + 1)) {
      const date = toDate(r[cDate], { year })
      if (!date) continue
      const o = num(cOut >= 0 ? r[cOut] : null), i = num(cIn >= 0 ? r[cIn] : null)
      if (o == null && i == null) continue
      const inv = [cInv >= 0 ? r[cInv] : null, cInv >= 0 && /invoice|receipt|ref/.test(h[cInv + 1] ?? '') ? r[cInv + 1] : null].map(str).filter(Boolean).join(' ')
      out.push({ date, out: o ?? 0, in: i ?? 0, description: str(cDesc >= 0 ? r[cDesc] : null) || null, type: str(cType >= 0 ? r[cType] : null) || null,
        subtype: str(cSub >= 0 ? r[cSub] : null) || null, payee: str(cName >= 0 ? r[cName] : null) || null, invoice: inv || null, balance: num(cBal >= 0 ? r[cBal] : null) })
    }
    if (out.length) { sheets.push({ name, rows: out }); n += out.length }
  }
  if (!sheets.length) notes.push('no ledger sheet recognised')
  return { payload: { file, account, sheets }, rows: n, notes }
}

// ───────── Weekly coordinator reports ─────────
export function parseWeekReport(wb: XLSX.WorkBook, path: string): Parsed {
  const year = Number(/\/(\d{4})\//.exec(path)?.[1] ?? new Date().getFullYear())
  const out: Record<string, unknown>[] = []
  const notes: string[] = []
  for (const name of wb.SheetNames) {
    const rows = sheetRows(wb, name)
    const hdr = rows.findIndex(r => r.some(c => typeof c === 'string' && /activity/i.test(c)) && r.some(c => typeof c === 'string' && /date|time/i.test(c)))
    if (hdr < 0) continue
    const h = rows[hdr].map(c => str(c).toLowerCase())
    const col = (re: RegExp) => h.findIndex(s => re.test(s))
    const cDate = col(/^date/), cLoc = col(/location|place/), cContact = col(/contact/), cTime = col(/^time/), cAct = col(/activity/), cStatus = col(/status/), cFb = col(/feedback|remark/), cStaff = col(/staff|responsible/)
    let day: string | null = null
    for (const r of rows.slice(hdr + 1)) {
      const d = toDate(cDate >= 0 ? r[cDate] : null, { year })
      if (d) day = d
      const activity = str(cAct >= 0 ? r[cAct] : null)
      if (!day || !activity) continue
      out.push({ day, time: str(cTime >= 0 ? r[cTime] : null) || null, location: str(cLoc >= 0 ? r[cLoc] : null) || null, contact: str(cContact >= 0 ? r[cContact] : null) || null,
        activity, status: str(cStatus >= 0 ? r[cStatus] : null) || null, feedback: str(cFb >= 0 ? r[cFb] : null) || null, staff: str(cStaff >= 0 ? r[cStaff] : null) || null })
    }
  }
  if (!out.length) notes.push('no day sheets recognised')
  return { payload: { rows: out }, rows: out.length, notes }
}

export function parseWorkbook(kind: string, bytes: Uint8Array, path: string): Parsed {
  const wb = XLSX.read(bytes, { type: 'array', cellDates: true })
  switch (kind) {
    case 'presence': return parsePresence(wb, path)
    case 'speed': return parseSpeed(wb, path)
    case 'weight': return parseWeight(wb, path)
    case 'matchstats': return parseMatchStats(wb, path)
    case 'squad': return parseSquad(wb)
    case 'evaluations': return parseEvaluations(wb, path)
    case 'finance': return parseFinance(wb, path)
    case 'weekreport': return parseWeekReport(wb, path)
    default: throw new Error(`no parser for ${kind}`)
  }
}
