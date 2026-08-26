import 'server-only'

import {
  buildCommerceTemplateOutcomeReport,
  COMMERCE_TEMPLATE_OUTCOME_ROW_LIMIT,
  type CommerceTemplateCheckoutOutcome,
  type CommerceTemplateNegotiatedOutcome,
  type CommerceTemplateOutcomeListing,
  type CommerceTemplateOutcomeReport,
} from '../commerce-template-outcomes'
import type { CommerceTemplateActivationListing } from '../commerce-template-activation'
import { commerceTemplates } from '../commerce-templates/registry'
import { getReadinessScore } from '../agent-page'
import { captureError } from '../observability'
import { createAdminClient, hasSupabaseAdminEnv } from '../../utils/supabase/admin'

const LISTING_SELECT = [
  'id',
  'name',
  'slug',
  'description',
  'website_url',
  'cta_url',
  'audience',
  'location',
  'contact_email',
  'industry',
  'products',
  'services',
  'faqs',
  'is_published',
  'created_at',
  'commerce_template_id',
  'commerce_template_version',
  'commerce_template_adopted_at',
  'commerce_template_source',
].join(',')

const CHECKOUT_SELECT = [
  'id',
  'page_id',
  'status',
  'channel',
  'amount_cents',
  'stripe_livemode',
  'service_agreement_id',
  'staged_settlement_agreement_id',
  'resource_hold_id',
].join(',')

const NEGOTIATION_SELECT = [
  'id',
  'page_id',
  'status',
  'amount_cents',
  'stripe_livemode',
].join(',')

const PAGE_ID_CHUNK_SIZE = 200

export type CommerceTemplateOutcomeSource = {
  available: boolean
  truncated: boolean
}

export type CommerceTemplateOutcomeSnapshot = CommerceTemplateOutcomeReport & {
  available: boolean
  generatedAt: string
  cohortStartedAt: string | null
  lineageListings: CommerceTemplateActivationListing[]
  sources: {
    listings: CommerceTemplateOutcomeSource
    benchmark: CommerceTemplateOutcomeSource
    checkout: CommerceTemplateOutcomeSource
    negotiated: CommerceTemplateOutcomeSource
  }
  warnings: string[]
}

function emptySnapshot(generatedAt: string): CommerceTemplateOutcomeSnapshot {
  return {
    ...buildCommerceTemplateOutcomeReport({
      templateListings: [],
      unattributedListings: [],
      checkoutOrders: [],
      negotiatedDeals: [],
    }),
    available: false,
    generatedAt,
    cohortStartedAt: null,
    lineageListings: [],
    sources: {
      listings: { available: false, truncated: false },
      benchmark: { available: false, truncated: false },
      checkout: { available: false, truncated: false },
      negotiated: { available: false, truncated: false },
    },
    warnings: ['Template outcome data is unavailable.'],
  }
}

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = []
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size))
  }
  return result
}

async function loadCheckoutOutcomes(pageIds: string[]) {
  if (!pageIds.length) return { rows: [] as CommerceTemplateCheckoutOutcome[], available: true, truncated: false }
  const admin = createAdminClient()
  const results = await Promise.all(chunks(pageIds, PAGE_ID_CHUNK_SIZE).map(async (pageIdChunk) => {
    return admin
      .from('checkout_orders')
      .select(CHECKOUT_SELECT)
      .in('page_id', pageIdChunk)
      .eq('stripe_livemode', true)
      .in('status', ['paid', 'dispute_won'])
      .limit(COMMERCE_TEMPLATE_OUTCOME_ROW_LIMIT + 1)
      .returns<CommerceTemplateCheckoutOutcome[]>()
  }))

  if (results.some((result) => result.error)) {
    const error = results.find((result) => result.error)?.error
    captureError(error instanceof Error ? error : new Error('Template checkout outcomes failed'), {
      scope: 'commerce-template-outcomes:checkout',
    })
    return { rows: [] as CommerceTemplateCheckoutOutcome[], available: false, truncated: false }
  }

  const truncated = results.some((result) => (result.data?.length ?? 0) > COMMERCE_TEMPLATE_OUTCOME_ROW_LIMIT)
  return {
    rows: results.flatMap((result) => (result.data ?? []).slice(0, COMMERCE_TEMPLATE_OUTCOME_ROW_LIMIT)),
    available: true,
    truncated,
  }
}

async function loadNegotiatedOutcomes(pageIds: string[]) {
  if (!pageIds.length) return { rows: [] as CommerceTemplateNegotiatedOutcome[], available: true, truncated: false }
  const admin = createAdminClient()
  const results = await Promise.all(chunks(pageIds, PAGE_ID_CHUNK_SIZE).map(async (pageIdChunk) => {
    return admin
      .from('agent_negotiations')
      .select(NEGOTIATION_SELECT)
      .in('page_id', pageIdChunk)
      .eq('stripe_livemode', true)
      .eq('status', 'complete')
      .limit(COMMERCE_TEMPLATE_OUTCOME_ROW_LIMIT + 1)
      .returns<CommerceTemplateNegotiatedOutcome[]>()
  }))

  if (results.some((result) => result.error)) {
    const error = results.find((result) => result.error)?.error
    captureError(error instanceof Error ? error : new Error('Template negotiated outcomes failed'), {
      scope: 'commerce-template-outcomes:negotiated',
    })
    return { rows: [] as CommerceTemplateNegotiatedOutcome[], available: false, truncated: false }
  }

  const truncated = results.some((result) => (result.data?.length ?? 0) > COMMERCE_TEMPLATE_OUTCOME_ROW_LIMIT)
  return {
    rows: results.flatMap((result) => (result.data ?? []).slice(0, COMMERCE_TEMPLATE_OUTCOME_ROW_LIMIT)),
    available: true,
    truncated,
  }
}

export async function getCommerceTemplateOutcomeSnapshot(): Promise<CommerceTemplateOutcomeSnapshot> {
  const generatedAt = new Date().toISOString()
  if (!hasSupabaseAdminEnv()) return emptySnapshot(generatedAt)

  const admin = createAdminClient()
  const templateResult = await admin
    .from('pages')
    .select(LISTING_SELECT)
    .eq('commerce_template_source', 'owner_selected_intake')
    .order('commerce_template_adopted_at', { ascending: true })
    .limit(COMMERCE_TEMPLATE_OUTCOME_ROW_LIMIT + 1)
    .returns<CommerceTemplateOutcomeListing[]>()

  if (templateResult.error) {
    captureError(templateResult.error, { scope: 'commerce-template-outcomes:listings' })
    return emptySnapshot(generatedAt)
  }

  const templateTruncated = (templateResult.data?.length ?? 0) > COMMERCE_TEMPLATE_OUTCOME_ROW_LIMIT
  const templateListings = (templateResult.data ?? []).slice(0, COMMERCE_TEMPLATE_OUTCOME_ROW_LIMIT)
  const cohortStartedAt = templateListings[0]?.commerce_template_adopted_at ?? null

  let unattributedListings: CommerceTemplateOutcomeListing[] = []
  let unattributedTruncated = false
  let benchmarkAvailable = true
  if (cohortStartedAt) {
    const benchmarkResult = await admin
      .from('pages')
      .select(LISTING_SELECT)
      .is('commerce_template_id', null)
      .gte('created_at', cohortStartedAt)
      .order('created_at', { ascending: true })
      .limit(COMMERCE_TEMPLATE_OUTCOME_ROW_LIMIT + 1)
      .returns<CommerceTemplateOutcomeListing[]>()
    if (benchmarkResult.error) {
      captureError(benchmarkResult.error, { scope: 'commerce-template-outcomes:no-template-benchmark' })
      benchmarkAvailable = false
    } else {
      unattributedTruncated = (benchmarkResult.data?.length ?? 0) > COMMERCE_TEMPLATE_OUTCOME_ROW_LIMIT
      unattributedListings = (benchmarkResult.data ?? []).slice(0, COMMERCE_TEMPLATE_OUTCOME_ROW_LIMIT)
    }
  }

  const pageIds = templateListings.map((listing) => listing.id)
  const [checkout, negotiated] = await Promise.all([
    loadCheckoutOutcomes(pageIds),
    loadNegotiatedOutcomes(pageIds),
  ])
  const templateTitles = new Map(commerceTemplates.map((template) => [
    `${template.id}@${template.version}`,
    template.title,
  ]))
  const report = buildCommerceTemplateOutcomeReport({
    templateListings,
    unattributedListings,
    checkoutOrders: checkout.rows,
    negotiatedDeals: negotiated.rows,
    templateTitles,
  })
  const warnings: string[] = []
  if (templateTruncated || unattributedTruncated) warnings.push('Listing cohorts reached the reporting limit. Displayed rates may be incomplete.')
  if (!benchmarkAvailable) warnings.push('Listings without a recorded template are unavailable. Comparison values are not shown as zero.')
  if (!checkout.available) warnings.push('Live checkout outcomes are unavailable. Checkout values are not shown as zero.')
  else if (checkout.truncated) warnings.push('Live checkout outcomes reached the reporting limit.')
  if (!negotiated.available) warnings.push('Negotiated outcomes are unavailable. Deal values are not shown as zero.')
  else if (negotiated.truncated) warnings.push('Negotiated outcomes reached the reporting limit.')

  return {
    ...report,
    available: true,
    generatedAt,
    cohortStartedAt,
    lineageListings: templateListings.map((listing) => ({
      id: listing.id,
      name: listing.name?.trim() || 'Untitled listing',
      slug: listing.slug?.trim() || listing.id,
      isPublished: listing.is_published,
      readiness: getReadinessScore(listing),
      templateId: listing.commerce_template_id ?? null,
      templateVersion: listing.commerce_template_version ?? null,
      adoptedAt: listing.commerce_template_adopted_at ?? null,
      source: listing.commerce_template_source ?? null,
    })),
    sources: {
      listings: { available: true, truncated: templateTruncated },
      benchmark: { available: benchmarkAvailable, truncated: unattributedTruncated },
      checkout: { available: checkout.available, truncated: checkout.truncated },
      negotiated: { available: negotiated.available, truncated: negotiated.truncated },
    },
    warnings,
  }
}
