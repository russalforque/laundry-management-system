/**
 * A small, dependency-free PDF writer for report tables: A4 portrait, Helvetica, a title, then each table with its
 * header row (repeated on every page it runs onto) and right-aligned number columns. Output is plain ASCII, so it can
 * be saved through the same text path as CSV (db/backup.ts saveFile).
 */

export interface PdfTable {
  /** Heading above the table; empty for a table that continues the one before (e.g. a second view of a report). */
  title: string
  /** First row is the header. */
  rows: (string | number)[][]
}

const PAGE_W = 595
const PAGE_H = 842
const MARGIN = 40
const BODY = 9
const ROW_H = 15
const CONTENT_W = PAGE_W - MARGIN * 2

/** Helvetica has no glyphs outside WinAnsi; keep the file ASCII and the text readable. */
const ascii = (s: string) =>
  s.replace(/₱/g, 'PHP ').replace(/[–—]/g, '-').replace(/·/g, '-').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/×/g, 'x')
    .replace(/[^\x20-\x7e]/g, '?')
const esc = (s: string) => ascii(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')

/** Average Helvetica glyph width, close enough to size columns and right-align numbers. */
const textW = (s: string, size: number) => {
  let w = 0
  for (const ch of ascii(s)) w += /[0-9]/.test(ch) ? 0.556 : /[il.,:;' |!]/.test(ch) ? 0.28 : /[A-Z]/.test(ch) ? 0.667 : /[mwMW]/.test(ch) ? 0.833 : 0.5
  return w * size
}
/** Numbers, amounts, percentages, and '-' for none. */
const isNumeric = (v: string | number) => typeof v === 'number' || /^(-?[\d,.]+%?|-)$/.test(String(v).trim())

/** Fits text to a width, ending in "..." when cut. */
function fit(s: string, width: number, size: number) {
  if (textW(s, size) <= width) return s
  let out = s
  while (out.length > 1 && textW(`${out}...`, size) > width) out = out.slice(0, -1)
  return `${out}...`
}

export function tablesPdf(title: string, subtitle: string, tables: PdfTable[]): string {
  const pages: string[][] = []
  let ops: string[] = []
  let y = 0
  const newPage = () => { ops = []; pages.push(ops); y = PAGE_H - MARGIN }
  const text = (x: number, size: number, bold: boolean, s: string) => ops.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x.toFixed(1)} ${y.toFixed(1)} Td (${esc(s)}) Tj ET`)
  const rule = (gray: number) => ops.push(`${gray} G 0.5 w ${MARGIN} ${(y - 4).toFixed(1)} m ${PAGE_W - MARGIN} ${(y - 4).toFixed(1)} l S`)

  newPage()
  text(MARGIN, 16, true, title)
  y -= 18
  text(MARGIN, 10, false, subtitle)
  y -= 26

  for (const t of tables) {
    const [head, ...body] = t.rows
    if (!head) continue
    const cols = head.length
    // Columns share the width in proportion to their longest cell; the first (labels) gets a little extra.
    const longest = head.map((_, j) => Math.max(...t.rows.map((r) => textW(String(r[j] ?? ''), BODY)), 30) + (j ? 0 : 20))
    const total = longest.reduce((a, b) => a + b, 0)
    const widths = longest.map((w) => (w / total) * CONTENT_W)
    const right = head.map((_, j) => j > 0 && body.length > 0 && body.every((r) => r[j] === undefined || r[j] === '' || isNumeric(r[j]!)))

    const row = (cells: (string | number)[], bold: boolean) => {
      let x = MARGIN
      for (let j = 0; j < cols; j++) {
        const w = widths[j]!
        const s = fit(String(cells[j] ?? ''), w - 8, BODY)
        // Helvetica-Bold runs about 6% wider than regular.
        text(right[j] ? x + w - 4 - textW(s, BODY) * (bold ? 1.06 : 1) : x, BODY, bold, s)
        x += w
      }
    }
    const header = () => { row(head, true); rule(0.6); y -= ROW_H }

    if (y < MARGIN + ROW_H * 4) newPage()
    if (t.title) {
      y -= 4
      text(MARGIN, 12, true, t.title)
      y -= 18
    }
    header()
    for (const r of body) {
      if (y < MARGIN + ROW_H) { newPage(); header() }
      row(r, false)
      rule(0.9)
      y -= ROW_H
    }
    y -= 14
  }

  // Page numbers
  pages.forEach((p, i) => p.push(`BT /F1 8 Tf ${PAGE_W - MARGIN - 40} 24 Td (Page ${i + 1} of ${pages.length}) Tj ET`))

  // Objects: 1 catalog, 2 pages, 3-4 fonts, then a page + content stream per page.
  const objs: string[] = []
  const kids = pages.map((_, i) => `${5 + i * 2} 0 R`).join(' ')
  objs.push('<< /Type /Catalog /Pages 2 0 R >>')
  objs.push(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`)
  objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>')
  objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>')
  pages.forEach((p, i) => {
    const stream = p.join('\n')
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${6 + i * 2} 0 R >>`)
    objs.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`)
  })

  let out = '%PDF-1.4\n'
  const offsets: number[] = []
  objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n` })
  const xref = out.length
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return out
}
