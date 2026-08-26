import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSupabaseMock, type QueryContext } from '../../test/supabase-mock'
import type { CommerceTemplateOpportunitySnapshot } from './commerce-template-opportunities'
import type {
  CommerceTemplateReviewEvidence,
  CommerceTemplateReviewReason,
} from '../commerce-template-reviews'

type StoredRow = {
  id: string
  review_id: string
  idempotency_key: string
  template_id: string
  template_version: number
  review_reason: CommerceTemplateReviewReason
  event_type: 'opened' | 'decided'
  decision: 'keep' | 'revise' | 'recommend_retirement' | null
  rationale: string
  operator_id: string
  snapshot_generated_at: string
  evidence_snapshot: CommerceTemplateReviewEvidence
  created_at: string
}

const refs = vi.hoisted(() => ({
  hasAdmin: true,
  operations: [] as QueryContext[],
  rows: [] as StoredRow[],
  insertError: null as { code: string; message: string } | null,
  readError: null as { code: string; message: string } | null,
  snapshot: null as CommerceTemplateOpportunitySnapshot | null,
}))

const getSnapshot = vi.hoisted(() => vi.fn(async () => refs.snapshot as CommerceTemplateOpportunitySnapshot))

vi.mock('../../utils/supabase/admin', () => ({
  hasSupabaseAdminEnv: () => refs.hasAdmin,
  createAdminClient: () => createSupabaseMock((context) => {
    refs.operations.push(context)
    if (context.table !== 'commerce_template_review_events') return { data: [], error: null }
    if (context.op === 'insert') {
      if (refs.insertError) return { data: null, error: refs.insertError }
      const row = storedRowFromPayload(context.payload as Record<string, unknown>)
      refs.rows.push(row)
      return { data: row, error: null }
    }
    if (refs.readError) return { data: null, error: refs.readError }
    const filtered = refs.rows.filter((row) => Object.entries(context.eqs).every(([key, value]) => (
      row[key as keyof StoredRow] === value
    )))
    const expectsOne = Object.keys(context.eqs).length > 0
    return { data: expectsOne ? filtered[0] ?? null : filtered, error: null }
  }),
}))
vi.mock('./commerce-template-opportunities', () => ({
  getCommerceTemplateOpportunitySnapshot: getSnapshot,
}))

import {
  decideCommerceTemplateReview,
  getCommerceTemplateReviewReport,
  openCommerceTemplateReview,
} from './commerce-template-reviews'

describe('server Commerce Template review desk', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    refs.hasAdmin = true
    refs.operations = []
    refs.rows = []
    refs.insertError = null
    refs.readError = null
    refs.snapshot = opportunitySnapshot()
  })

  it('fails closed instead of presenting a false empty history', async () => {
    refs.hasAdmin = false
    await expect(getCommerceTemplateReviewReport()).resolves.toEqual({
      available: false,
      truncated: false,
      cases: [],
    })
    expect(refs.operations).toEqual([])

    refs.hasAdmin = true
    refs.readError = { code: 'XX000', message: 'source unavailable' }
    await expect(getCommerceTemplateReviewReport()).resolves.toMatchObject({ available: false, cases: [] })
  })

  it('fails closed when a stored event has an impossible or malformed shape', async () => {
    refs.rows = [storedRow({ event_type: 'opened', decision: 'keep' })]

    await expect(getCommerceTemplateReviewReport()).resolves.toEqual({
      available: false,
      truncated: false,
      cases: [],
    })

    refs.rows = [storedRow({
      evidence_snapshot: { schemaVersion: 1 } as CommerceTemplateReviewEvidence,
      snapshot_generated_at: '2026-08-26T03:00:00.000Z',
    })]
    await expect(getCommerceTemplateReviewReport()).resolves.toMatchObject({
      available: false,
      cases: [],
    })
  })

  it('derives a performance review snapshot on the server and stores no merchant identity', async () => {
    await openCommerceTemplateReview({
      templateId: 'events.party-rentals',
      templateVersion: 1,
      reviewReason: 'performance',
      rationale: 'Readiness trails the comparison group on sufficient exact-version evidence.',
      idempotencyKey: '20000000-0000-4000-8000-000000000001',
      operatorId: '30000000-0000-4000-8000-000000000001',
    })

    const insert = refs.operations.find((operation) => operation.op === 'insert')
    expect(insert?.payload).toMatchObject({
      template_id: 'events.party-rentals',
      template_version: 1,
      review_reason: 'performance',
      event_type: 'opened',
      decision: null,
      operator_id: '30000000-0000-4000-8000-000000000001',
      snapshot_generated_at: '2026-08-26T03:00:00.000Z',
      evidence_snapshot: {
        recommendation: { performanceReviewReady: true },
        checkout: { orders: 3 },
        negotiated: { deals: 2 },
      },
    })
    expect(insert?.payload).not.toHaveProperty('owner_id')
    expect(insert?.payload).not.toHaveProperty('operator_email')
    expect(JSON.stringify(insert?.payload)).not.toContain('buyer')
  })

  it('blocks a performance review below its evidence floor before writing', async () => {
    refs.snapshot = opportunitySnapshot('gather-more-evidence')

    await expect(openCommerceTemplateReview({
      templateId: 'events.party-rentals',
      templateVersion: 1,
      reviewReason: 'performance',
      rationale: 'Attempted results review before the evidence floor was met.',
      idempotencyKey: '20000000-0000-4000-8000-000000000002',
      operatorId: '30000000-0000-4000-8000-000000000001',
    })).rejects.toThrow(/has not reached the evidence floor/)

    expect(refs.operations).toEqual([])
  })

  it('allows an explicit manual review while preserving unavailable evidence', async () => {
    refs.snapshot = opportunitySnapshot('refresh-evidence')
    refs.snapshot.sources.supply = false
    refs.snapshot.rows[0].supply = { available: false, certifiedListings: null }

    await openCommerceTemplateReview({
      templateId: 'events.party-rentals',
      templateVersion: 1,
      reviewReason: 'catalog_overlap',
      rationale: 'Review overlapping guide coverage before recruiting another merchant.',
      idempotencyKey: '20000000-0000-4000-8000-000000000003',
      operatorId: '30000000-0000-4000-8000-000000000001',
    })

    const insert = refs.operations.find((operation) => operation.op === 'insert')
    expect(insert?.payload).toMatchObject({
      review_reason: 'catalog_overlap',
      evidence_snapshot: {
        sources: { supply: false },
        supply: { available: false, certifiedListings: null },
        recommendation: { performanceReviewReady: false },
      },
    })
  })

  it('re-reads the open review and appends a matching decision with fresh evidence', async () => {
    const evidence = evidenceFromSnapshot(refs.snapshot as CommerceTemplateOpportunitySnapshot)
    refs.rows = [storedRow({
      evidence_snapshot: evidence,
      snapshot_generated_at: evidence.generatedAt,
    })]

    await decideCommerceTemplateReview({
      reviewId: '10000000-0000-4000-8000-000000000001',
      decision: 'revise',
      rationale: 'Revise the intake while keeping the current guide active until code review.',
      idempotencyKey: '20000000-0000-4000-8000-000000000004',
      operatorId: '30000000-0000-4000-8000-000000000002',
    })

    const insert = refs.operations.find((operation) => operation.op === 'insert')
    expect(insert?.payload).toMatchObject({
      review_id: '10000000-0000-4000-8000-000000000001',
      template_id: 'events.party-rentals',
      template_version: 1,
      review_reason: 'performance',
      event_type: 'decided',
      decision: 'revise',
      operator_id: '30000000-0000-4000-8000-000000000002',
    })
  })

  it('returns grouped review history without exposing the stored operator identifier', async () => {
    const evidence = evidenceFromSnapshot(refs.snapshot as CommerceTemplateOpportunitySnapshot)
    refs.rows = [storedRow({ evidence_snapshot: evidence, snapshot_generated_at: evidence.generatedAt })]

    const report = await getCommerceTemplateReviewReport()

    expect(report).toMatchObject({
      available: true,
      truncated: false,
      cases: [{ reviewId: '10000000-0000-4000-8000-000000000001', status: 'open' }],
    })
    expect(report.cases[0].opened).not.toHaveProperty('operatorId')
  })
})

function opportunitySnapshot(
  action: 'review-template' | 'gather-more-evidence' | 'refresh-evidence' = 'review-template',
): CommerceTemplateOpportunitySnapshot {
  return {
    generatedAt: '2026-08-26T03:00:00.000Z',
    demandSince: '2026-07-27T03:00:00.000Z',
    warnings: [],
    sources: {
      demand: true,
      demandTruncated: false,
      supply: true,
      listings: true,
      benchmark: true,
      checkout: true,
      negotiated: true,
    },
    summary: { templates: 1, needsAction: 1, recruit: 0, activate: 0, review: action === 'review-template' ? 1 : 0, monitoring: action === 'gather-more-evidence' ? 1 : 0 },
    rows: [{
      rank: 1,
      templateId: 'events.party-rentals',
      templateVersion: 1,
      title: 'Party Rentals',
      domain: 'events-hospitality',
      action,
      actionLabel: action === 'review-template' ? 'Review this guide' : 'Gather more evidence',
      reason: 'Evidence-based next move.',
      tone: 'watch',
      demand: { available: true, truncated: false, observed: 8, unresolved: 3 },
      supply: { available: true, certifiedListings: 2 },
      adoption: { available: true, listings: 6, publishedListings: 4, publishedRate: 66.7, averageReadiness: 72, readinessVsNoTemplate: -8 },
      checkout: {
        available: true,
        orders: 3,
        listings: 2,
        rails: { hosted_checkout: 2, protocol_checkout: 1, recurring_service: 0, staged_settlement: 0, resource_reservation: 0 },
      },
      negotiated: { available: true, deals: 2, listings: 1 },
    }],
    outcomes: {} as CommerceTemplateOpportunitySnapshot['outcomes'],
    activation: {} as CommerceTemplateOpportunitySnapshot['activation'],
  }
}

function evidenceFromSnapshot(snapshot: CommerceTemplateOpportunitySnapshot): CommerceTemplateReviewEvidence {
  const row = snapshot.rows[0]
  return {
    schemaVersion: 1,
    generatedAt: snapshot.generatedAt,
    template: { id: row.templateId, version: row.templateVersion, title: row.title },
    recommendation: {
      action: row.action,
      label: row.actionLabel,
      reason: row.reason,
      performanceReviewReady: row.action === 'review-template',
    },
    sources: { ...snapshot.sources },
    demand: row.demand,
    supply: row.supply,
    adoption: row.adoption,
    checkout: row.checkout,
    negotiated: row.negotiated,
  }
}

function storedRow(overrides: Partial<StoredRow> = {}): StoredRow {
  const evidence = overrides.evidence_snapshot ?? evidenceFromSnapshot(
    refs.snapshot as CommerceTemplateOpportunitySnapshot,
  )
  return {
    id: 'event-1',
    review_id: '10000000-0000-4000-8000-000000000001',
    idempotency_key: '20000000-0000-4000-8000-000000000010',
    template_id: 'events.party-rentals',
    template_version: 1,
    review_reason: 'performance',
    event_type: 'opened',
    decision: null,
    rationale: 'Review the guide against the preserved evidence.',
    operator_id: '30000000-0000-4000-8000-000000000001',
    snapshot_generated_at: evidence.generatedAt,
    evidence_snapshot: evidence,
    created_at: '2026-08-26T03:01:00.000Z',
    ...overrides,
  }
}

function storedRowFromPayload(payload: Record<string, unknown>): StoredRow {
  return storedRow({
    id: `event-${refs.rows.length + 1}`,
    review_id: String(payload.review_id),
    idempotency_key: String(payload.idempotency_key),
    template_id: String(payload.template_id),
    template_version: Number(payload.template_version),
    review_reason: payload.review_reason as CommerceTemplateReviewReason,
    event_type: payload.event_type as 'opened' | 'decided',
    decision: payload.decision as StoredRow['decision'],
    rationale: String(payload.rationale),
    operator_id: String(payload.operator_id),
    snapshot_generated_at: String(payload.snapshot_generated_at),
    evidence_snapshot: payload.evidence_snapshot as CommerceTemplateReviewEvidence,
  })
}
