import { getReadinessScore, type AgentPage } from './agent-page'

export const COMMERCE_TEMPLATE_OUTCOME_ROW_LIMIT = 5_000

export type CommerceTemplateOutcomeListing = Partial<AgentPage> & {
  id: string
  is_published: boolean
  commerce_template_id?: string | null
  commerce_template_version?: number | null
  commerce_template_adopted_at?: string | null
  commerce_template_source?: 'owner_selected_intake' | null
}

export type CommerceTemplateCheckoutOutcome = {
  id: string
  page_id: string | null
  status: string
  channel: string | null
  amount_cents: number
  stripe_livemode: boolean | null
  service_agreement_id: string | null
  staged_settlement_agreement_id: string | null
  resource_hold_id: string | null
}

export type CommerceTemplateNegotiatedOutcome = {
  id: string
  page_id: string | null
  status: string
  amount_cents: number | null
  stripe_livemode: boolean | null
}

export type CommerceTemplateOutcomeRail =
  | 'hosted_checkout'
  | 'protocol_checkout'
  | 'recurring_service'
  | 'staged_settlement'
  | 'resource_reservation'

export type CommerceTemplateRailCounts = Record<CommerceTemplateOutcomeRail, number>

export type CommerceTemplateOutcomeRow = {
  templateId: string
  templateVersion: number
  title: string
  listings: number
  publishedListings: number
  publishedRate: number | null
  averageReadiness: number | null
  readinessVsNoTemplate: number | null
  checkout: {
    orders: number
    listings: number
    rails: CommerceTemplateRailCounts
  }
  negotiated: {
    deals: number
    listings: number
  }
}

export type CommerceTemplateOutcomeReport = {
  summary: {
    templateVersions: number
    listings: number
    publishedListings: number
    publishedRate: number | null
    averageReadiness: number | null
    checkoutOrders: number
    checkoutListings: number
    negotiatedDeals: number
    negotiatedListings: number
  }
  noTemplateBenchmark: {
    listings: number
    publishedListings: number
    publishedRate: number | null
    averageReadiness: number | null
  }
  templates: CommerceTemplateOutcomeRow[]
}

type BuildCommerceTemplateOutcomeReportInput = {
  templateListings: CommerceTemplateOutcomeListing[]
  unattributedListings: CommerceTemplateOutcomeListing[]
  checkoutOrders: CommerceTemplateCheckoutOutcome[]
  negotiatedDeals: CommerceTemplateNegotiatedOutcome[]
  templateTitles?: ReadonlyMap<string, string>
}

const SUCCESSFUL_CHECKOUT_STATUSES = new Set(['paid', 'dispute_won'])

function versionedTemplateKey(templateId: string, templateVersion: number): string {
  return `${templateId}@${templateVersion}`
}

function percentage(numerator: number, denominator: number): number | null {
  return denominator > 0 ? Math.round((numerator / denominator) * 1_000) / 10 : null
}

function averageReadiness(listings: CommerceTemplateOutcomeListing[]): number | null {
  if (!listings.length) return null
  const total = listings.reduce((sum, listing) => sum + getReadinessScore(listing), 0)
  return Math.round((total / listings.length) * 10) / 10
}

function emptyRailCounts(): CommerceTemplateRailCounts {
  return {
    hosted_checkout: 0,
    protocol_checkout: 0,
    recurring_service: 0,
    staged_settlement: 0,
    resource_reservation: 0,
  }
}

export function classifyCommerceTemplateCheckoutRail(
  order: CommerceTemplateCheckoutOutcome,
): CommerceTemplateOutcomeRail | null {
  if (order.channel === 'negotiation') return null
  if (order.staged_settlement_agreement_id) return 'staged_settlement'
  if (order.resource_hold_id) return 'resource_reservation'
  if (order.service_agreement_id || order.channel === 'recurring_service') return 'recurring_service'
  if (order.channel === 'acp' || order.channel === 'ucp') return 'protocol_checkout'
  return 'hosted_checkout'
}

export function isSuccessfulCommerceTemplateCheckout(
  order: CommerceTemplateCheckoutOutcome,
): boolean {
  return order.stripe_livemode === true
    && Number.isFinite(order.amount_cents)
    && order.amount_cents > 0
    && SUCCESSFUL_CHECKOUT_STATUSES.has(order.status)
    && classifyCommerceTemplateCheckoutRail(order) !== null
}

export function isSuccessfulCommerceTemplateNegotiation(
  deal: CommerceTemplateNegotiatedOutcome,
): boolean {
  return deal.stripe_livemode === true
    && deal.status === 'complete'
    && deal.amount_cents != null
    && Number.isFinite(deal.amount_cents)
    && deal.amount_cents > 0
}

function validTemplateRef(listing: CommerceTemplateOutcomeListing) {
  const templateId = listing.commerce_template_id
  const templateVersion = listing.commerce_template_version
  if (
    !templateId
    || !Number.isInteger(templateVersion)
    || (templateVersion ?? 0) < 1
    || listing.commerce_template_source !== 'owner_selected_intake'
  ) return null
  return { templateId, templateVersion: templateVersion as number }
}

/**
 * Observational template reporting only. It compares the current state of
 * recorded template listings with listings that have no recorded template in the same reporting
 * window. The report does not claim causation and never rewrites a template or
 * merchant listing.
 */
export function buildCommerceTemplateOutcomeReport({
  templateListings,
  unattributedListings,
  checkoutOrders,
  negotiatedDeals,
  templateTitles = new Map(),
}: BuildCommerceTemplateOutcomeReportInput): CommerceTemplateOutcomeReport {
  const groups = new Map<string, {
    templateId: string
    templateVersion: number
    listings: CommerceTemplateOutcomeListing[]
  }>()
  const listingGroupKeys = new Map<string, string>()

  for (const listing of templateListings) {
    const ref = validTemplateRef(listing)
    if (!ref) continue
    const key = versionedTemplateKey(ref.templateId, ref.templateVersion)
    const group = groups.get(key) ?? { ...ref, listings: [] }
    group.listings.push(listing)
    groups.set(key, group)
    listingGroupKeys.set(listing.id, key)
  }

  const checkoutByGroup = new Map<string, CommerceTemplateCheckoutOutcome[]>()
  const negotiatedByGroup = new Map<string, CommerceTemplateNegotiatedOutcome[]>()

  for (const order of checkoutOrders) {
    if (!order.page_id || !isSuccessfulCommerceTemplateCheckout(order)) continue
    const key = listingGroupKeys.get(order.page_id)
    if (!key) continue
    const rows = checkoutByGroup.get(key) ?? []
    rows.push(order)
    checkoutByGroup.set(key, rows)
  }

  for (const deal of negotiatedDeals) {
    if (!deal.page_id || !isSuccessfulCommerceTemplateNegotiation(deal)) continue
    const key = listingGroupKeys.get(deal.page_id)
    if (!key) continue
    const rows = negotiatedByGroup.get(key) ?? []
    rows.push(deal)
    negotiatedByGroup.set(key, rows)
  }

  const benchmarkReadiness = averageReadiness(unattributedListings)
  const templates = [...groups.entries()].map(([key, group]) => {
    const publishedListings = group.listings.filter((listing) => listing.is_published).length
    const currentReadiness = averageReadiness(group.listings)
    const orders = checkoutByGroup.get(key) ?? []
    const deals = negotiatedByGroup.get(key) ?? []
    const rails = emptyRailCounts()
    for (const order of orders) {
      const rail = classifyCommerceTemplateCheckoutRail(order)
      if (rail) rails[rail] += 1
    }

    return {
      templateId: group.templateId,
      templateVersion: group.templateVersion,
      title: templateTitles.get(key) ?? group.templateId,
      listings: group.listings.length,
      publishedListings,
      publishedRate: percentage(publishedListings, group.listings.length),
      averageReadiness: currentReadiness,
      readinessVsNoTemplate: currentReadiness != null && benchmarkReadiness != null
        ? Math.round((currentReadiness - benchmarkReadiness) * 10) / 10
        : null,
      checkout: {
        orders: orders.length,
        listings: new Set(orders.map((order) => order.page_id)).size,
        rails,
      },
      negotiated: {
        deals: deals.length,
        listings: new Set(deals.map((deal) => deal.page_id)).size,
      },
    }
  }).sort((left, right) => (
    right.listings - left.listings
    || right.publishedListings - left.publishedListings
    || left.title.localeCompare(right.title)
  ))

  const includedTemplateListings = [...groups.values()].flatMap((group) => group.listings)
  const publishedTemplateListings = includedTemplateListings.filter((listing) => listing.is_published).length
  const publishedUnattributedListings = unattributedListings.filter((listing) => listing.is_published).length
  const successfulOrders = [...checkoutByGroup.values()].flat()
  const successfulDeals = [...negotiatedByGroup.values()].flat()

  return {
    summary: {
      templateVersions: templates.length,
      listings: includedTemplateListings.length,
      publishedListings: publishedTemplateListings,
      publishedRate: percentage(publishedTemplateListings, includedTemplateListings.length),
      averageReadiness: averageReadiness(includedTemplateListings),
      checkoutOrders: successfulOrders.length,
      checkoutListings: new Set(successfulOrders.map((order) => order.page_id)).size,
      negotiatedDeals: successfulDeals.length,
      negotiatedListings: new Set(successfulDeals.map((deal) => deal.page_id)).size,
    },
    noTemplateBenchmark: {
      listings: unattributedListings.length,
      publishedListings: publishedUnattributedListings,
      publishedRate: percentage(publishedUnattributedListings, unattributedListings.length),
      averageReadiness: benchmarkReadiness,
    },
    templates,
  }
}
