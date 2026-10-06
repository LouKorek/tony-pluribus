import type { ReportData } from './reports'

const INK = 'FF0E1311', LIME = 'FFE0FD02', RED = 'FFD7262E', PAPER = 'FFF5F4EF', LINE = 'FFD3CFC3'
const today = () => new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
export const fileName = (r: ReportData, ext: string) => `${r.title} - ${r.subtitle.split(' · ')[0]}`.replace(/[\\/:*?"<>|]+/g, '').slice(0, 120) + '.' + ext

/** Excel file laid out for printing: landscape A4, fitted to the page width, header row repeated on every page. */
export async function downloadExcel(r: ReportData) {
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Pluribus · TFEP'
  const ws = wb.addWorksheet(r.title.slice(0, 31).replace(/[[\]*?/\\:]/g, ''), {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.6, header: 0.3, footer: 0.3 } },
    headerFooter: { oddFooter: `&L&8Pluribus · Tony Football Excellence Programme × SL Benfica&R&8Page &P of &N` },
    views: [{ showGridLines: false }],
  })
  const n = r.columns.length
  ws.columns = r.columns.map(c => ({ key: c.key, width: c.width }))

  const title = ws.addRow([r.title.toUpperCase()])
  ws.mergeCells(title.number, 1, title.number, n)
  title.font = { name: 'Arial', size: 16, bold: true, color: { argb: INK } }
  title.height = 24
  const sub = ws.addRow([`${r.subtitle}  ·  printed ${today()}`])
  ws.mergeCells(sub.number, 1, sub.number, n)
  sub.font = { name: 'Arial', size: 10, color: { argb: 'FF646A66' } }
  if (r.summary?.length) {
    const s = ws.addRow([r.summary.map(([k, v]) => `${k}: ${v}`).join('     ')])
    ws.mergeCells(s.number, 1, s.number, n)
    s.font = { name: 'Arial', size: 10, bold: true, color: { argb: RED } }
  }
  ws.addRow([])

  const head = ws.addRow(r.columns.map(c => c.label))
  head.height = 20
  head.eachCell(cell => {
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INK } }
    cell.alignment = { vertical: 'middle', horizontal: 'left' }
    cell.border = { bottom: { style: 'medium', color: { argb: LIME } } }
  })
  r.columns.forEach((c, i) => { if (c.align) head.getCell(i + 1).alignment = { vertical: 'middle', horizontal: c.align } })
  ws.pageSetup.printTitlesRow = `${head.number}:${head.number}`
  ws.views = [{ state: 'frozen', ySplit: head.number, showGridLines: false }]

  for (const sec of r.sections) {
    if (sec.title) {
      const t = ws.addRow([`${sec.title}`])
      ws.mergeCells(t.number, 1, t.number, n)
      t.font = { name: 'Arial', size: 11, bold: true, color: { argb: INK } }
      t.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PAPER } }
      t.getCell(1).border = { left: { style: 'thick', color: { argb: RED } } }
      t.height = 18
    }
    if (!sec.rows.length) { const e = ws.addRow(['—']); e.font = { name: 'Arial', size: 10, italic: true, color: { argb: 'FF959A95' } } }
    sec.rows.forEach((row, i) => {
      const x = ws.addRow(r.columns.map(c => row[c.key] ?? ''))
      x.eachCell({ includeEmpty: true }, (cell, col) => {
        const c = r.columns[col - 1]
        cell.font = { name: 'Arial', size: 10, bold: c?.key === 'player' || c?.key === 'academy' && r.columns[0].key === 'academy' }
        cell.alignment = { vertical: 'top', horizontal: c?.align ?? 'left', wrapText: true }
        cell.border = { bottom: { style: 'thin', color: { argb: LINE } } }
        if (i % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFAFAF7' } }
        if (c?.key === 'decision' && cell.value === 'Selected') cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF157A4A' } }
      })
    })
  }

  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = fileName(r, 'xlsx')
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 4000)
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

/** A print-ready page in a new window. The browser's print dialog saves it as PDF. */
export function openPrint(r: ReportData) {
  const w = window.open('', '_blank')
  if (!w) return false
  const cols = r.columns.map(c => `<col style="width:${c.width}ch">`).join('')
  const head = `<tr>${r.columns.map(c => `<th class="${c.align ?? ''}">${esc(c.label)}</th>`).join('')}</tr>`
  const body = r.sections.map(s => `
    ${s.title ? `<tr class="sec"><td colspan="${r.columns.length}">${esc(s.title)}</td></tr>` : ''}
    ${s.rows.map(row => `<tr>${r.columns.map(c => `<td class="${c.align ?? ''} ${c.key === 'player' ? 'b' : ''} ${c.key === 'decision' && row[c.key] === 'Selected' ? 'sel' : ''}">${esc(row[c.key])}</td>`).join('')}</tr>`).join('')}
  `).join('')
  w.document.write(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(fileName(r, 'pdf').replace(/\.pdf$/, ''))}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;600;700&family=Barlow+Condensed:wght@600;700&display=swap" rel="stylesheet">
<style>
  @page { size: A4 landscape; margin: 11mm 10mm 13mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: Barlow, Arial, sans-serif; color: #151917; margin: 0; font-size: 10.5px; }
  .bar { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #0e1311; padding-bottom: 8px; }
  .brand { display: flex; align-items: center; gap: 10px; } .brand img.t { height: 14px; } .brand img.b { height: 30px; }
  .brand span { width: 1px; height: 22px; background: #d3cfc3; }
  .meta { text-align: right; color: #646a66; font-size: 10px; }
  h1 { font-family: 'Barlow Condensed', Arial, sans-serif; text-transform: uppercase; font-size: 26px; margin: 12px 0 0; line-height: 1; }
  .sub { color: #646a66; font-size: 12px; margin-top: 4px; }
  .sum { display: flex; gap: 8px; margin: 10px 0 12px; } .sum div { border: 1px solid #e4e1d8; border-radius: 6px; padding: 5px 10px; }
  .sum b { font-family: 'Barlow Condensed', Arial; font-size: 18px; display: block; line-height: 1.1; } .sum span { color: #646a66; font-size: 9px; text-transform: uppercase; letter-spacing: .06em; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  thead { display: table-header-group; } tr { page-break-inside: avoid; }
  th { background: #0e1311; color: #fff; text-align: left; font-weight: 600; padding: 5px 5px; border-bottom: 2px solid #e0fd02; font-size: 9.5px; }
  td { padding: 4px 5px; border-bottom: 1px solid #e4e1d8; vertical-align: top; overflow-wrap: anywhere; }
  tr.sec td { background: #f5f4ef; font-weight: 700; font-size: 11px; border-left: 3px solid #d7262e; padding: 6px; }
  .right { text-align: right; } .center { text-align: center; } .b { font-weight: 600; } .sel { color: #157a4a; font-weight: 700; }
  .foot { margin-top: 10px; color: #959a95; font-size: 9px; display: flex; justify-content: space-between; }
  .tools { position: fixed; top: 10px; right: 10px; } .tools button { font: 600 13px Barlow, Arial; background: #d7262e; color: #fff; border: 0; border-radius: 8px; padding: 8px 14px; cursor: pointer; }
  @media print { .tools { display: none; } }
</style></head><body>
<div class="tools"><button onclick="print()">Print or save as PDF</button></div>
<div class="bar"><div class="brand"><img class="t" src="${location.origin}/brand/tony.png" alt="Tony"><span></span><img class="b" src="${location.origin}/brand/benfica.png" alt="SL Benfica"></div>
<div class="meta">Tony Football Excellence Programme · Rwanda<br>Printed ${today()}</div></div>
<h1>${esc(r.title)}</h1><div class="sub">${esc(r.subtitle)}</div>
${r.summary?.length ? `<div class="sum">${r.summary.map(([k, v]) => `<div><b>${esc(v)}</b><span>${esc(k)}</span></div>`).join('')}</div>` : '<div style="height:10px"></div>'}
<table><colgroup>${cols}</colgroup><thead>${head}</thead><tbody>${body}</tbody></table>
<div class="foot"><span>Pluribus · TFEP × SL Benfica</span><span>${esc(r.subtitle)}</span></div>
<script>window.addEventListener('load', () => setTimeout(() => print(), 400))</script>
</body></html>`)
  w.document.close()
  return true
}
