import type { CrawlCheck } from './crawlability'

/**
 * Turn a crawlability report into the short list of lines that go in the emailed
 * scan result.
 *
 * Failures first, because they are the only reason the email is worth opening,
 * then warnings, then passes. Order within a band is the scanner's own order, so
 * the list reads top-of-funnel to bottom (can it be found, can it be understood,
 * can it be transacted with) rather than alphabetically.
 *
 * A site that passes everything still gets rows, so the email is never an empty
 * table under a heading promising findings.
 */
export const SCAN_FINDING_LIMIT = 6

const STATUS_WORD: Record<CrawlCheck['status'], string> = {
  pass: 'Found',
  warn: 'Partial',
  fail: 'Missing',
}

const STATUS_RANK: Record<CrawlCheck['status'], number> = { fail: 0, warn: 1, pass: 2 }

/**
 * The status rides along with the words. It is the scanner's own verdict, so the
 * email can colour a failure without matching on prose, and it survives the trip
 * through the scan_leads.findings JSON column.
 *
 * The third element is optional because rows written before this existed are
 * still in that column. Readers infer those from STATUS_WORD, which is a closed
 * map, and fall back to no status rather than guessing.
 */
export type ScanFindingStatus = CrawlCheck['status']
export type ScanFinding = [label: string, outcome: string, status?: ScanFindingStatus]

const WORD_STATUS: Record<string, ScanFindingStatus> = Object.fromEntries(
  Object.entries(STATUS_WORD).map(([status, word]) => [word, status as ScanFindingStatus]),
)

/** Recover the verdict for a row persisted before it was carried explicitly. */
export function inferFindingStatus(outcome: string): ScanFindingStatus | undefined {
  return WORD_STATUS[outcome]
}

export function selectScanFindings(
  checks: readonly CrawlCheck[],
  limit: number = SCAN_FINDING_LIMIT,
): ScanFinding[] {
  return checks
    .map((check, index) => ({ check, index }))
    .sort((a, b) =>
      STATUS_RANK[a.check.status] - STATUS_RANK[b.check.status] || a.index - b.index)
    .slice(0, Math.max(0, limit))
    .map(({ check }): ScanFinding => [check.label, STATUS_WORD[check.status], check.status])
}
