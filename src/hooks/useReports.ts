import { useEffect, useState } from 'react'
import { customerReport, dailySales, orderReport, reportSummary, serviceReport } from '../db/reports'
import {
  addDays, dayCount, exportCsv, exportPdf, presetRange, REPORT_RANGES, type ReportData, type ReportRange, type ReportView,
} from '../lib/reportData'

/**
 * Reports: the period (presets or custom dates), the figures for it and the previous period of the same
 * length, which report is open, and CSV / PDF export. Shared by pages/mobile/MobileReports.tsx and
 * pages/desktop-tablet/Reports.tsx.
 */
export function useReports() {
  const [range, setRange] = useState<ReportRange>('7d')
  const [custom, setCustom] = useState(() => presetRange('7d'))
  const [view, setView] = useState<ReportView | null>(null)
  const [data, setData] = useState<ReportData | null>(null)
  const [error, setError] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [attempt, setAttempt] = useState(0)

  const [from, to] = range === 'custom' ? custom : presetRange(range)
  const valid = !!from && !!to && from <= to
  const vs = REPORT_RANGES.find((r) => r[0] === range)![2]

  useEffect(() => {
    if (!valid) return
    let live = true
    const len = dayCount(from, to)
    const prevTo = addDays(from, -1)
    Promise.all([
      reportSummary(from, to), reportSummary(addDays(prevTo, 1 - len), prevTo),
      dailySales(from, to), orderReport(from, to), serviceReport(from, to), customerReport(from, to),
    ])
      .then(([now, prev, daily, orders, services, customers]) => { if (live) { setData({ now, prev, daily, orders, services, customers }); setError(false) } })
      .catch((e) => { console.error('Reports load failed', e); if (live) setError(true) })
    return () => { live = false }
  }, [from, to, valid, attempt])

  // <main> is the shared scroll container; open each report at the top.
  useEffect(() => { document.querySelector('main')?.scrollTo(0, 0) }, [view])

  const pickRange = (r: ReportRange) => {
    if (r === 'custom' && range !== 'custom') setCustom([from, to])
    setRange(r)
  }

  async function exportView() {
    if (!data) return
    setExporting(true)
    try { await exportCsv(data, from, to, view ?? undefined) } catch (e) { console.error('Export failed', e) } finally { setExporting(false) }
  }

  /** The open report (or all of them) as a PDF; tablets and desktops offer it beside CSV. */
  async function exportViewPdf() {
    if (!data) return
    setExporting(true)
    try { await exportPdf(data, from, to, view ?? undefined) } catch (e) { console.error('Export failed', e) } finally { setExporting(false) }
  }

  return {
    range, pickRange, from, to, valid, vs,
    setFrom: (v: string) => setCustom([v, to]),
    setTo: (v: string) => setCustom([from, v]),
    view, setView, data,
    /** Load failed and there is nothing to show yet. */
    failed: error && !data,
    retry: () => setAttempt((n) => n + 1),
    exporting, exportView, exportViewPdf,
  }
}
