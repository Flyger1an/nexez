import { describe, expect, it } from 'vitest'
import type { CrawlCheck } from './crawlability'
import { SCAN_FINDING_LIMIT, selectScanFindings } from './scan-findings'

const check = (id: string, status: CrawlCheck['status'], label = id): CrawlCheck => ({
  id, label, status, dimension: 'discovery', detail: 'detail',
})

describe('selectScanFindings', () => {
  it('puts failures first, then warnings, then passes', () => {
    const rows = selectScanFindings([
      check('a', 'pass'),
      check('b', 'fail'),
      check('c', 'warn'),
      check('d', 'fail'),
    ])
    expect(rows.map(([label]) => label)).toEqual(['b', 'd', 'c', 'a'])
  })

  it('keeps the scanner ordering within a status band', () => {
    // Discovery before understanding before transactability is the order a buyer
    // experiences, and re-sorting inside a band would scramble that.
    const rows = selectScanFindings([
      check('first', 'fail'),
      check('second', 'fail'),
      check('third', 'fail'),
    ])
    expect(rows.map(([label]) => label)).toEqual(['first', 'second', 'third'])
  })

  it('translates status into words a merchant reads, not scanner vocabulary', () => {
    const rows = selectScanFindings([check('x', 'fail'), check('y', 'warn'), check('z', 'pass')])
    expect(rows).toEqual([['x', 'Missing'], ['y', 'Partial'], ['z', 'Found']])
  })

  it('caps the list so the email stays scannable', () => {
    const many = Array.from({ length: 20 }, (_, i) => check(`c${i}`, 'fail'))
    expect(selectScanFindings(many)).toHaveLength(SCAN_FINDING_LIMIT)
  })

  it('still returns rows for a site that passes everything', () => {
    // Otherwise the email renders a heading promising findings above an empty table.
    const rows = selectScanFindings([check('a', 'pass'), check('b', 'pass')])
    expect(rows).toEqual([['a', 'Found'], ['b', 'Found']])
  })

  it('returns nothing for no checks rather than throwing', () => {
    expect(selectScanFindings([])).toEqual([])
  })
})
