import { describe, it, expect } from 'vitest'
import { buildScanResultRow, hashScanDomain, type ScanResultInput } from './log-scan-result'
import type { CrawlabilitySignals } from '../crawlability'

const robots = {
  GPTBot: true, 'OAI-SearchBot': true, 'ChatGPT-User': true, ClaudeBot: false,
  'Claude-SearchBot': true, 'Claude-User': true, PerplexityBot: false, 'Google-Extended': true,
} as CrawlabilitySignals['robots']

const signals: CrawlabilitySignals = {
  status: 200,
  responseMs: 140,
  https: true,
  hasJsonLd: true,
  validJsonLd: true,
  schemaTypes: ['Organization', 'Offer'],
  hasTitle: true,
  hasMetaDescription: false,
  hasH1: true,
  hasBusinessIdentity: true,
  hasOfferSchema: false,
  hasStructuredPrice: false,
  hasVisiblePrice: true,
  hasActionPath: true,
  hasStructuredAction: false,
  hasStructuredAvailability: false,
  hasVisibleAvailability: true,
  hasOfferDetails: false,
  hasContact: true,
  hasPolicies: true,
  hasFreshnessSignal: false,
  agentJsonOk: false,
  wellKnownAgentJsonOk: false,
  wellKnownAgentCardOk: false,
  mcpJsonOk: false,
  openApiJsonOk: false,
  llmsTxtOk: false,
  robots,
}

const input: ScanResultInput = {
  origin: 'https://Acme.example',
  elapsedMs: 900,
  signals,
  report: {
    version: 2,
    score: 47,
    dimensions: {
      discovery: { label: 'Discovery', score: 60 },
      understanding: { label: 'Understanding', score: 50 },
      transactability: { label: 'Transactability', score: 30 },
      trust: { label: 'Trust', score: 80 },
    },
    checks: [],
  },
}

describe('buildScanResultRow', () => {
  it('produces a privacy-safe row with hashed + lowercased domain and derived aggregates', () => {
    const row = buildScanResultRow(input)!
    expect(row).toBeTruthy()
    expect(row.domain).toBe('acme.example')
    expect(row.domain_hash).toBe(hashScanDomain('acme.example'))
    expect(row.domain_hash).toMatch(/^[0-9a-f]{64}$/)
    // The hash must not be derivable-by-eye from the hostname.
    expect(String(row.domain_hash)).not.toContain('acme')
    expect(row.source).toBe('organic')
    expect(row.study_cohort).toBeNull()
    expect(row.scanner_version).toBe(2)
    expect(row.score).toBe(47)
    expect(row.dimension_scores).toEqual({ discovery: 60, understanding: 50, transactability: 30, trust: 80 })
    expect(row.blocked_bot_count).toBe(2)
    expect(row.robots).toEqual(robots)
    expect(row.has_meta_description).toBe(false)
    expect(row.llms_txt_ok).toBe(false)
    // No request-derived identifiers may ever creep into this row.
    expect(Object.keys(row).some((key) => /ip|user_agent|referrer|owner/i.test(key))).toBe(false)
  })

  it('is stable for dedupe: same host hashes identically regardless of case', () => {
    expect(hashScanDomain('ACME.example')).toBe(hashScanDomain('acme.example'))
  })

  it('carries study cohort metadata when provided', () => {
    const row = buildScanResultRow({ ...input, source: 'study', studyCohort: 'readiness-2026-08', vertical: 'restaurants' })!
    expect(row.source).toBe('study')
    expect(row.study_cohort).toBe('readiness-2026-08')
    expect(row.vertical).toBe('restaurants')
  })

  it('returns null for an unparseable origin', () => {
    expect(buildScanResultRow({ ...input, origin: 'not a url' })).toBeNull()
  })
})
