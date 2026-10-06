import type { ReportData } from './reports'

// Brand colours (ARGB for Excel)
const INK = 'FF0E1311', LIME = 'FFE0FD02', RED = 'FFD7262E', PAPER = 'FFF5F4EF', LINE = 'FFE4E1D8', MUTED = 'FF646A66', GOOD = 'FF157A4A', ZEBRA = 'FFFAFAF7'
const FONT = 'Arial'

export const today = () => new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
export const safeName = (s: string) => s.replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 140)

type ExcelNS = typeof import('exceljs')
type Logos = { tony?: ArrayBuffer; benfica?: ArrayBuffer }

/** Builds the workbook. Pure, so it can be checked outside the browser. */
export function buildWorkbook(ExcelJS: ExcelNS, r: ReportData, logos: Logos = {}) {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Pluribus · TFEP'
  wb.title = r.fileName
  const n = r.columns.length
  const ws = wb.addWorksheet(r.title.replace(/[[\]*?/\\:]/g, '').slice(0, 31) || 'Report', {
    pageSetup: {
      paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, horizontalCentered: true,
      margins: { left: 0.35, right: 0.35, top: 0.45, bottom: 0.55, header: 0.25, footer: 0.25 },
    },
    headerFooter: { oddFooter: `&L&7&K646A66${r.fileName.replace(/&/g, '&&')}&R&7&K646A66Page &P of &N` },
    views: [{ showGridLines: false }],
  })
  ws.columns = r.columns.map(c => ({ key: c.key, width: c.width }))
  const all = (row: import('exceljs').Row, fn: (c: import('exceljs').Cell) => void) => { for (let i = 1; i <= n; i++) fn(row.getCell(i)) }

  // 1 · dark brand band with the logos
  const band = ws.addRow([])
  band.height = 34
  all(band, c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INK } } })
  band.getCell(n).value = 'PLURIBUS · TFEP RWANDA'
  band.getCell(n).font = { name: FONT, size: 8, bold: true, color: { argb: 'FF959A95' } }
  band.getCell(n).alignment = { horizontal: 'right', vertical: 'middle' }
  // Benfica crest first, then the Tony wordmark (306×60 → 82×16) a little to the right of it
  if (logos.benfica) ws.addImage(wb.addImage({ buffer: logos.benfica, extension: 'png' }), { tl: { col: 0.1, row: 0.12 }, ext: { width: 30, height: 30 }, editAs: 'absolute' })
  if (logos.tony) ws.addImage(wb.addImage({ buffer: logos.tony, extension: 'png' }), { tl: { col: logos.benfica ? 1.25 : 0.15, row: 0.33 }, ext: { width: 82, height: 16 }, editAs: 'absolute' })
  const accent = ws.addRow([])
  accent.height = 4
  all(accent, c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIME } } })

  // 2 · title, subtitle, summary
  ws.addRow([]).height = 8
  const title = ws.addRow([r.title.toUpperCase()])
  ws.mergeCells(title.number, 1, title.number, n)
  title.height = 28
  title.getCell(1).font = { name: FONT, size: 18, bold: true, color: { argb: INK } }
  title.getCell(1).alignment = { vertical: 'middle' }
  const sub = ws.addRow([`${r.subtitle}   ·   printed ${today()}`])
  ws.mergeCells(sub.number, 1, sub.number, n)
  sub.getCell(1).font = { name: FONT, size: 10, color: { argb: MUTED } }
  if (r.summary?.length) {
    const s = ws.addRow([r.summary.map(([k, v]) => `${v}  ${k}`).join('      ')])
    ws.mergeCells(s.number, 1, s.number, n)
    s.height = 20
    s.getCell(1).font = { name: FONT, size: 11, bold: true, color: { argb: RED } }
    s.getCell(1).alignment = { vertical: 'middle' }
  }
  ws.addRow([]).height = 8

  // 3 · column header, repeated on every printed page
  const head = ws.addRow(r.columns.map(c => c.label.toUpperCase()))
  head.height = 22
  all(head, c => {
    const col = r.columns[Number(c.col) - 1]
    c.font = { name: FONT, size: 9, bold: true, color: { argb: 'FFFFFFFF' } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INK } }
    c.alignment = { vertical: 'middle', horizontal: col?.align ?? 'left', indent: col?.align ? 0 : 1 }
    c.border = { bottom: { style: 'medium', color: { argb: LIME } } }
  })
  ws.pageSetup.printTitlesRow = `${head.number}:${head.number}`
  ws.views = [{ state: 'frozen', ySplit: head.number, showGridLines: false }]

  // 4 · sections and rows
  for (const sec of r.sections) {
    if (sec.title) {
      const t = ws.addRow([`${sec.title}`])
      ws.mergeCells(t.number, 1, t.number, n)
      t.height = 20
      t.getCell(1).font = { name: FONT, size: 10.5, bold: true, color: { argb: INK } }
      t.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PAPER } }
      t.getCell(1).border = { left: { style: 'thick', color: { argb: RED } }, top: { style: 'thin', color: { argb: LINE } } }
      t.getCell(1).alignment = { vertical: 'middle', indent: 1 }
    }
    sec.rows.forEach((row, i) => {
      const x = ws.addRow(r.columns.map(c => row[c.key] ?? ''))
      all(x, cell => {
        const c = r.columns[Number(cell.col) - 1]
        const strong = c.key === 'player' || (c.key === r.columns[0].key && c.key !== 'n')
        cell.font = { name: FONT, size: 10, bold: strong, color: { argb: INK } }
        cell.alignment = { vertical: 'top', horizontal: c.align ?? 'left', wrapText: true, indent: c.align ? 0 : 1 }
        cell.border = { bottom: { style: 'hair', color: { argb: 'FFD3CFC3' } } }
        if (i % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA } }
        if (['s10', 's20'].includes(c.key) && typeof cell.value === 'number') cell.numFmt = '0.00'
        if (c.key === 'cj' && typeof cell.value === 'number') cell.numFmt = '0'
        if (c.key === 'decision' && cell.value === 'Selected') cell.font = { name: FONT, size: 10, bold: true, color: { argb: GOOD } }
        if (c.key === 'decision' && cell.value === 'See again') cell.font = { name: FONT, size: 10, bold: true, color: { argb: 'FFA76A00' } }
        if (c.key === 'obs' && cell.value === 'A') cell.font = { name: FONT, size: 10, bold: true, color: { argb: INK } }
      })
    })
    if (!sec.rows.length) { const e = ws.addRow(['—']); e.getCell(1).font = { name: FONT, size: 10, italic: true, color: { argb: 'FF959A95' } } }
  }
  if (!r.sections.some(s => s.rows.length)) {
    const e = ws.addRow(['Nothing to report yet.'])
    ws.mergeCells(e.number, 1, e.number, n)
    e.getCell(1).font = { name: FONT, size: 10, italic: true, color: { argb: MUTED } }
  }
  return wb
}

async function fetchBuf(url: string) { try { const r = await fetch(url); return r.ok ? await r.arrayBuffer() : undefined } catch { return undefined } }

/** Excel file laid out for printing: A4 landscape, fitted to the page width, header row repeated on every page. */
export async function downloadExcel(r: ReportData) {
  const ExcelJS = (await import('exceljs')).default as unknown as ExcelNS
  const [tony, benfica] = await Promise.all([fetchBuf('/brand/tony.png'), fetchBuf('/brand/benfica.png')])
  const wb = buildWorkbook(ExcelJS, r, { tony, benfica })
  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = safeName(r.fileName) + '.xlsx'
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 4000)
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

/** The print-ready page (the browser saves it as PDF under the report's file name). Pure, so it can be checked outside the browser. */
export function printHtml(r: ReportData, origin: string, autoPrint = true) {
  const total = r.columns.reduce((s, c) => s + c.width, 0)
  const cols = r.columns.map(c => `<col style="width:${((c.width / total) * 100).toFixed(2)}%">`).join('')
  const head = `<tr>${r.columns.map(c => `<th class="${c.align ?? ''}">${esc(c.label)}</th>`).join('')}</tr>`
  const cls = (key: string, v: unknown, align?: string) => [align ?? '', key === 'player' ? 'b' : '', key === 'decision' && v === 'Selected' ? 'sel' : '', key === 'decision' && v === 'See again' ? 'again' : '', ['s10', 's20', 'cj', 'n'].includes(key) ? 'num' : ''].join(' ')
  const fmt = (key: string, v: unknown) => (['s10', 's20'].includes(key) && typeof v === 'number' ? v.toFixed(2) : v)
  const body = r.sections.map(s => `
    ${s.title ? `<tr class="sec"><td colspan="${r.columns.length}">${esc(s.title)}</td></tr>` : ''}
    ${s.rows.map((row, i) => `<tr class="${i % 2 ? 'z' : ''}">${r.columns.map(c => `<td class="${cls(c.key, row[c.key], c.align)}">${esc(fmt(c.key, row[c.key]))}</td>`).join('')}</tr>`).join('')}
  `).join('')
  const empty = !r.sections.some(s => s.rows.length)
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(safeName(r.fileName))}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700&family=Barlow+Condensed:wght@600;700&display=swap" rel="stylesheet">
<style>
  @page { size: A4 landscape; margin: 10mm 10mm 12mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; background: #fff; }
  body { font-family: Barlow, Arial, sans-serif; color: #151917; font-size: 10px; }
  .band { background: #0e1311; color: #fff; display: flex; align-items: center; justify-content: space-between; padding: 9px 14px; border-bottom: 3px solid #e0fd02; }
  .brand { display: flex; align-items: center; gap: 12px; } .brand .t { height: 13px; } .brand .b { height: 28px; } .brand span { width: 1px; height: 22px; background: rgba(255,255,255,.2); }
  .band .r { text-align: right; font-size: 9px; letter-spacing: .14em; text-transform: uppercase; color: #959a95; font-weight: 600; line-height: 1.5; }
  .head { padding: 14px 2px 0; }
  h1 { font-family: 'Barlow Condensed', Arial, sans-serif; text-transform: uppercase; font-size: 28px; margin: 0; line-height: 1; letter-spacing: .01em; }
  .sub { color: #646a66; font-size: 12px; margin-top: 4px; }
  .sum { display: flex; flex-wrap: wrap; gap: 6px; margin: 11px 0 12px; }
  .sum div { border: 1px solid #e4e1d8; border-radius: 7px; padding: 5px 11px 4px; min-width: 76px; }
  .sum b { font-family: 'Barlow Condensed', Arial; font-size: 20px; display: block; line-height: 1; }
  .sum span { color: #646a66; font-size: 8.5px; text-transform: uppercase; letter-spacing: .08em; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  thead { display: table-header-group; } tr { page-break-inside: avoid; break-inside: avoid; }
  th { background: #0e1311; color: #fff; text-align: left; font-weight: 600; padding: 6px 6px; border-bottom: 2px solid #e0fd02; font-size: 8.5px; text-transform: uppercase; letter-spacing: .06em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  td { padding: 4.5px 6px; border-bottom: 1px solid #ece9e1; vertical-align: top; overflow-wrap: anywhere; line-height: 1.3; }
  tr.z td { background: #fafaf7; }
  tr.sec td { background: #f5f4ef; font-weight: 700; font-size: 11px; border-left: 3px solid #d7262e; padding: 7px 8px; border-top: 1px solid #e4e1d8; }
  .right, .num { text-align: right; font-variant-numeric: tabular-nums; } .center { text-align: center; } .b { font-weight: 600; }
  .sel { color: #157a4a; font-weight: 700; } .again { color: #a76a00; font-weight: 700; }
  .empty { padding: 30px; text-align: center; color: #646a66; border: 1px dashed #d3cfc3; border-radius: 8px; margin-top: 10px; }
  .foot { margin-top: 10px; color: #959a95; font-size: 8.5px; display: flex; justify-content: space-between; border-top: 1px solid #e4e1d8; padding-top: 6px; }
  .tools { position: fixed; top: 12px; right: 12px; display: flex; gap: 8px; }
  .tools button { font: 600 13px Barlow, Arial; background: #d7262e; color: #fff; border: 0; border-radius: 8px; padding: 9px 15px; cursor: pointer; box-shadow: 0 4px 14px rgba(0,0,0,.18); }
  @media screen { body { max-width: 1120px; margin: 24px auto; padding: 0 16px 40px; } }
  @media print { .tools { display: none; } }
</style></head><body>
<div class="tools"><button onclick="print()">Save as PDF / print</button></div>
<div class="band"><div class="brand"><img class="t" src="${origin}/brand/tony.png" alt="Tony"><span></span><img class="b" src="${origin}/brand/benfica.png" alt="SL Benfica"></div>
<div class="r">Tony Football Excellence Programme<br>Rwanda · Pluribus</div></div>
<div class="head"><h1>${esc(r.title)}</h1><div class="sub">${esc(r.subtitle)} · printed ${today()}</div></div>
${r.summary?.length ? `<div class="sum">${r.summary.map(([k, v]) => `<div><b>${esc(v)}</b><span>${esc(k)}</span></div>`).join('')}</div>` : '<div style="height:12px"></div>'}
${empty ? '<div class="empty">Nothing to report yet.</div>' : `<table><colgroup>${cols}</colgroup><thead>${head}</thead><tbody>${body}</tbody></table>`}
<div class="foot"><span>${esc(safeName(r.fileName))}</span><span>TFEP × SL Benfica</span></div>
${autoPrint ? "<script>window.addEventListener('load', () => setTimeout(() => print(), 500))</script>" : ''}
</body></html>`
}

export function openPrint(r: ReportData) {
  const w = window.open('', '_blank')
  if (!w) return false
  w.document.write(printHtml(r, location.origin))
  w.document.close()
  return true
}
