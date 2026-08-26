import 'server-only'

import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import {
  buildCommerceTemplateReviewEvidence,
  groupCommerceTemplateReviewEvents,
  isCommerceTemplateReviewDecision,
  isCommerceTemplateReviewReason,
  type CommerceTemplateReviewDecision,
  type CommerceTemplateReviewEvent,
  type CommerceTemplateReviewEvidence,
  type CommerceTemplateReviewReason,
  type CommerceTemplateReviewReport,
} from '../commerce-template-reviews'
import { commerceTemplates } from '../commerce-templates/registry'
import { createAdminClient, hasSupabaseAdminEnv } from '../../utils/supabase/admin'
import { getCommerceTemplateOpportunitySnapshot } from './commerce-template-opportunities'

type CommerceTemplateReviewRow = {
  id: string
  review_id: string
  idempotency_key: string
  template_id: string
  template_version: number
  review_reason: CommerceTemplateReviewReason
  event_type: 'opened' | 'decided'
  decision: CommerceTemplateReviewDecision | null
  rationale: string
  operator_id: string
  snapshot_generated_at: string
  evidence_snapshot: CommerceTemplateReviewEvidence
  created_at: string
}

const REVIEW_SELECT = [
  'id',
  'review_id',
  'idempotency_key',
  'template_id',
  'template_version',
  'review_reason',
  'event_type',
  'decision',
  'rationale',
  'operator_id',
  'snapshot_generated_at',
  'evidence_snapshot',
  'created_at',
].join(',')

const REVIEW_EVENT_LIMIT = 200
const nullableMetricSchema = z.number().nullable()
const reviewEvidenceSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.string().datetime({ offset: true }),
  template: z.object({
    id: z.string().min(3).max(160),
    version: z.number().int().positive(),
    title: z.string().min(1),
  }).strict(),
  recommendation: z.object({
    action: z.enum([
      'refresh-evidence',
      'recruit-exact-supply',
      'start-template-use',
      'help-merchants-publish',
      'review-template',
      'gather-more-evidence',
      'keep-and-monitor',
    ]),
    label: z.string().min(1),
    reason: z.string().min(1),
    performanceReviewReady: z.boolean(),
  }).strict(),
  sources: z.object({
    demand: z.boolean(),
    demandTruncated: z.boolean(),
    supply: z.boolean(),
    listings: z.boolean(),
    benchmark: z.boolean(),
    checkout: z.boolean(),
    negotiated: z.boolean(),
  }).strict(),
  demand: z.object({
    available: z.boolean(),
    truncated: z.boolean(),
    observed: nullableMetricSchema,
    unresolved: nullableMetricSchema,
  }).strict(),
  supply: z.object({
    available: z.boolean(),
    certifiedListings: nullableMetricSchema,
  }).strict(),
  adoption: z.object({
    available: z.boolean(),
    listings: nullableMetricSchema,
    publishedListings: nullableMetricSchema,
    publishedRate: nullableMetricSchema,
    averageReadiness: nullableMetricSchema,
    readinessVsNoTemplate: nullableMetricSchema,
  }).strict(),
  checkout: z.object({
    available: z.boolean(),
    orders: nullableMetricSchema,
    listings: nullableMetricSchema,
    rails: z.record(z.string(), z.number()).nullable(),
  }).strict(),
  negotiated: z.object({
    available: z.boolean(),
    deals: nullableMetricSchema,
    listings: nullableMetricSchema,
  }).strict(),
}).strict()

export async function getCommerceTemplateReviewReport(): Promise<CommerceTemplateReviewReport> {
  if (!hasSupabaseAdminEnv()) return unavailableReport()

  const { data, error } = await createAdminClient()
    .from('commerce_template_review_events')
    .select(REVIEW_SELECT)
    .order('created_at', { ascending: false })
    .limit(REVIEW_EVENT_LIMIT + 1)
    .returns<CommerceTemplateReviewRow[]>()

  if (error) {
    console.warn('[commerce-template-reviews] history unavailable:', error.message)
    return unavailableReport()
  }

  const rows = data ?? []
  try {
    const events = rows.slice(0, REVIEW_EVENT_LIMIT).map(mapReviewRow)
    return {
      available: true,
      truncated: rows.length > REVIEW_EVENT_LIMIT,
      cases: groupCommerceTemplateReviewEvents(events),
    }
  } catch (error) {
    console.warn(
      '[commerce-template-reviews] invalid stored event:',
      error instanceof Error ? error.message : 'unknown error',
    )
    return unavailableReport()
  }
}

export async function openCommerceTemplateReview(input: {
  templateId: string
  templateVersion: number
  reviewReason: CommerceTemplateReviewReason
  rationale: string
  idempotencyKey: string
  operatorId: string
}): Promise<{ event: CommerceTemplateReviewEvent; replayed: boolean }> {
  if (!hasSupabaseAdminEnv()) throw new Error('Template review storage is unavailable.')
  requireActiveTemplate(input.templateId, input.templateVersion)

  const snapshot = await getCommerceTemplateOpportunitySnapshot()
  const evidence = currentEvidence(snapshot, input.templateId, input.templateVersion)
  if (input.reviewReason === 'performance' && !evidence.recommendation.performanceReviewReady) {
    throw new Error('This guide has not reached the evidence floor for a results review.')
  }

  const reviewId = randomUUID()
  const payload = {
    schema_version: 1,
    review_id: reviewId,
    idempotency_key: input.idempotencyKey,
    template_id: input.templateId,
    template_version: input.templateVersion,
    review_reason: input.reviewReason,
    event_type: 'opened' as const,
    decision: null,
    rationale: input.rationale,
    operator_id: input.operatorId,
    snapshot_generated_at: evidence.generatedAt,
    evidence_snapshot: evidence,
  }

  return insertReviewEvent(payload, {
    idempotencyKey: input.idempotencyKey,
    operatorId: input.operatorId,
    eventType: 'opened',
    templateId: input.templateId,
    templateVersion: input.templateVersion,
    reviewReason: input.reviewReason,
    rationale: input.rationale,
    decision: null,
  })
}

export async function decideCommerceTemplateReview(input: {
  reviewId: string
  decision: CommerceTemplateReviewDecision
  rationale: string
  idempotencyKey: string
  operatorId: string
}): Promise<{ event: CommerceTemplateReviewEvent; replayed: boolean }> {
  if (!hasSupabaseAdminEnv()) throw new Error('Template review storage is unavailable.')
  const admin = createAdminClient()
  const { data: opened, error } = await admin
    .from('commerce_template_review_events')
    .select(REVIEW_SELECT)
    .eq('review_id', input.reviewId)
    .eq('event_type', 'opened')
    .single<CommerceTemplateReviewRow>()

  if (error || !opened) throw new Error('The open template review could not be found.')
  const openEvent = mapReviewRow(opened)
  requireActiveTemplate(openEvent.templateId, openEvent.templateVersion)

  const snapshot = await getCommerceTemplateOpportunitySnapshot()
  const evidence = currentEvidence(snapshot, openEvent.templateId, openEvent.templateVersion)
  const payload = {
    schema_version: 1,
    review_id: openEvent.reviewId,
    idempotency_key: input.idempotencyKey,
    template_id: openEvent.templateId,
    template_version: openEvent.templateVersion,
    review_reason: openEvent.reviewReason,
    event_type: 'decided' as const,
    decision: input.decision,
    rationale: input.rationale,
    operator_id: input.operatorId,
    snapshot_generated_at: evidence.generatedAt,
    evidence_snapshot: evidence,
  }

  return insertReviewEvent(payload, {
    idempotencyKey: input.idempotencyKey,
    operatorId: input.operatorId,
    eventType: 'decided',
    templateId: openEvent.templateId,
    templateVersion: openEvent.templateVersion,
    reviewReason: openEvent.reviewReason,
    rationale: input.rationale,
    decision: input.decision,
  })
}

async function insertReviewEvent(
  payload: Record<string, unknown>,
  replayIdentity: {
    idempotencyKey: string
    operatorId: string
    eventType: 'opened' | 'decided'
    templateId: string
    templateVersion: number
    reviewReason: CommerceTemplateReviewReason
    rationale: string
    decision: CommerceTemplateReviewDecision | null
  },
): Promise<{ event: CommerceTemplateReviewEvent; replayed: boolean }> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('commerce_template_review_events')
    .insert(payload)
    .select(REVIEW_SELECT)
    .single<CommerceTemplateReviewRow>()

  if (!error && data) return { event: mapReviewRow(data), replayed: false }

  if (error?.code === '23505') {
    const { data: replay, error: replayError } = await admin
      .from('commerce_template_review_events')
      .select(REVIEW_SELECT)
      .eq('idempotency_key', replayIdentity.idempotencyKey)
      .single<CommerceTemplateReviewRow>()

    if (replayError || !replay) {
      throw new Error(replayIdentity.eventType === 'opened'
        ? 'An open review already exists for this guide version.'
        : 'This review already has a decision.')
    }
    if (!matchesReplay(replay, replayIdentity)) {
      throw new Error('Refresh the review desk before recording another change.')
    }
    return { event: mapReviewRow(replay), replayed: true }
  }

  throw new Error(error?.message || 'The template review event could not be recorded.')
}

function currentEvidence(
  snapshot: Awaited<ReturnType<typeof getCommerceTemplateOpportunitySnapshot>>,
  templateId: string,
  templateVersion: number,
): CommerceTemplateReviewEvidence {
  const row = snapshot.rows.find((candidate) => (
    candidate.templateId === templateId && candidate.templateVersion === templateVersion
  ))
  if (!row) throw new Error('The active Commerce Template guide could not be found.')

  return buildCommerceTemplateReviewEvidence({
    generatedAt: snapshot.generatedAt,
    sources: {
      demand: snapshot.sources.demand,
      demandTruncated: snapshot.sources.demandTruncated,
      supply: snapshot.sources.supply,
      listings: snapshot.sources.listings,
      benchmark: snapshot.sources.benchmark,
      checkout: snapshot.sources.checkout,
      negotiated: snapshot.sources.negotiated,
    },
    row,
  })
}

function requireActiveTemplate(templateId: string, templateVersion: number): void {
  const exists = commerceTemplates.some((template) => (
    template.status === 'active'
    && template.id === templateId
    && template.version === templateVersion
  ))
  if (!exists) throw new Error('Choose an active Commerce Template guide version.')
}

function matchesReplay(
  row: CommerceTemplateReviewRow,
  identity: {
    operatorId: string
    eventType: 'opened' | 'decided'
    templateId: string
    templateVersion: number
    reviewReason: CommerceTemplateReviewReason
    rationale: string
    decision: CommerceTemplateReviewDecision | null
  },
): boolean {
  return row.operator_id === identity.operatorId
    && row.event_type === identity.eventType
    && row.template_id === identity.templateId
    && Number(row.template_version) === identity.templateVersion
    && row.review_reason === identity.reviewReason
    && row.rationale === identity.rationale
    && row.decision === identity.decision
}

function mapReviewRow(row: CommerceTemplateReviewRow): CommerceTemplateReviewEvent {
  if (!isCommerceTemplateReviewReason(row.review_reason)) throw new Error('invalid review reason')
  if (row.event_type !== 'opened' && row.event_type !== 'decided') throw new Error('invalid review event type')
  if (row.decision !== null && !isCommerceTemplateReviewDecision(row.decision)) {
    throw new Error('invalid review decision')
  }
  if (
    (row.event_type === 'opened' && row.decision !== null)
    || (row.event_type === 'decided' && row.decision === null)
  ) {
    throw new Error('review decision does not match the event type')
  }
  const evidence = reviewEvidenceSchema.parse(row.evidence_snapshot) as CommerceTemplateReviewEvidence
  if (
    evidence.generatedAt !== row.snapshot_generated_at
    || evidence.template.id !== row.template_id
    || Number(evidence.template.version) !== Number(row.template_version)
  ) {
    throw new Error('review evidence does not match the stored event')
  }

  return {
    id: row.id,
    reviewId: row.review_id,
    templateId: row.template_id,
    templateVersion: Number(row.template_version),
    reviewReason: row.review_reason,
    eventType: row.event_type,
    decision: row.decision,
    rationale: row.rationale,
    snapshotGeneratedAt: row.snapshot_generated_at,
    evidence,
    createdAt: row.created_at,
  }
}

function unavailableReport(): CommerceTemplateReviewReport {
  return { available: false, truncated: false, cases: [] }
}
