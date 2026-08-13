import {
  getCheckoutOffers,
  getReadinessScore,
  getTrustScore,
  type AgentPage,
  type CheckoutOffer,
} from './agent-page'

export const MARKETPLACE_CURATION_STATUSES = ['unreviewed', 'candidate', 'certified', 'excluded'] as const
export type MarketplaceCurationStatus = (typeof MARKETPLACE_CURATION_STATUSES)[number]

export type MarketplaceQualitySeverity = 'blocker' | 'warning'

export type MarketplaceQualityFlag = {
  id:
    | 'internal_fixture'
    | 'placeholder_identity'
    | 'duplicate_name'
    | 'missing_description'
    | 'missing_offers'
    | 'missing_pricing'
    | 'missing_action_path'
    | 'missing_location'
    | 'missing_industry'
    | 'low_readiness'
    | 'mcp_disabled'
    | 'stale_listing'
  label: string
  detail: string
  severity: MarketplaceQualitySeverity
}

export type MarketplaceQualitySnapshot = {
  version: 1
  assessedAt: string
  readiness: number
  trust: number
  offerCount: number
  pricedOfferCount: number
  actionableOfferCount: number
  blockerCount: number
  warningCount: number
  suggestedStatus: Exclude<MarketplaceCurationStatus, 'certified'>
  flags: MarketplaceQualityFlag[]
}

export type MarketplaceCurationDecision = {
  pageId: string
  status: MarketplaceCurationStatus
  decisionReason: string | null
  notes: string | null
  reviewedBy: string | null
  reviewedAt: string | null
  certifiedAt: string | null
  updatedAt: string | null
}

export type MarketplaceCurationQueueItem = {
  page: AgentPage
  decision: MarketplaceCurationDecision
  assessment: MarketplaceQualitySnapshot
  duplicateNameCount: number
}

export type MarketplaceCurationSummary = Record<MarketplaceCurationStatus, number> & {
  total: number
  blockers: number
  warnings: number
}

export type MarketplaceCurationQueue = {
  generatedAt: string
  available: boolean
  items: MarketplaceCurationQueueItem[]
  summary: MarketplaceCurationSummary
}

/** Minimal structural shape for the identity guards, so non-page callers (the
 *  ARD catalog builder, storefront handles) can reuse them without
 *  constructing a full AgentPage. AgentPage still satisfies it. */
export type MarketplaceIdentityProbe = {
  name?: string | null
  slug?: string | null
  description?: string | null
}

const INTERNAL_SLUG_PATTERNS = [
  /^qa\d{1,4}[-_]\d{1,4}$/i,
  /^(qa|test|seed|gauntlet|red[-_]?team|adversarial)([-_]|$)/i,
  /^(simulation|simulated|synthetic)([-_]|$)/i,
  /^nexez-agent-negotiation-lab$/i,
  /^shopify-review-catalog$/i,
]

const PLACEHOLDER_PATTERNS = [
  /\b(copy|demo|example|sample|simulation|simulated|synthetic|placeholder|untitled)\b/i,
  /^abc(?:\s|$)/i,
  /lorem ipsum/i,
]

const STALE_AFTER_DAYS = 120

function clean(value: string | null | undefined) {
  return value?.trim() || ''
}

export function normalizeMarketplaceName(value: string | null | undefined) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

export function isInternalMarketplaceFixture(page: MarketplaceIdentityProbe) {
  const slug = clean(page.slug)
  return Boolean(slug && INTERNAL_SLUG_PATTERNS.some((pattern) => pattern.test(slug)))
}

export function isPlaceholderIdentity(page: MarketplaceIdentityProbe) {
  const identity = `${clean(page.name)} ${clean(page.slug)} ${clean(page.description)}`
  return clean(page.slug).length < 2 || PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(identity))
}

function hasPrice(offer: CheckoutOffer) {
  return Boolean(clean(offer.price) || offer.tiers?.some((tier) => clean(tier.price)))
}

function hasActionPath(page: Partial<AgentPage>, offer: CheckoutOffer) {
  return Boolean(
    clean(offer.url)
      || clean(page.cta_url)
      || clean(page.website_url)
      || clean(page.contact_email)
      || offer.offerType === 'negotiable'
      || hasPrice(offer),
  )
}

function addFlag(
  flags: MarketplaceQualityFlag[],
  flag: MarketplaceQualityFlag,
) {
  if (!flags.some((existing) => existing.id === flag.id)) flags.push(flag)
}

export function assessMarketplacePage(
  page: AgentPage,
  options: { duplicateNameCount?: number; now?: Date } = {},
): MarketplaceQualitySnapshot {
  const now = options.now ?? new Date()
  const duplicateNameCount = Math.max(1, options.duplicateNameCount ?? 1)
  const offers = getCheckoutOffers(page)
  const readiness = getReadinessScore(page)
  const trust = getTrustScore(page)
  const pricedOfferCount = offers.filter(hasPrice).length
  const actionableOfferCount = offers.filter((offer) => hasActionPath(page, offer)).length
  const flags: MarketplaceQualityFlag[] = []

  if (isInternalMarketplaceFixture(page)) {
    addFlag(flags, {
      id: 'internal_fixture',
      label: 'Internal fixture',
      detail: 'This slug identifies a QA, certification, or adversarial test listing.',
      severity: 'blocker',
    })
  }
  if (isPlaceholderIdentity(page)) {
    addFlag(flags, {
      id: 'placeholder_identity',
      label: 'Placeholder identity',
      detail: 'The name, slug, or description contains copy, demo, or placeholder signals.',
      severity: 'blocker',
    })
  }
  if (duplicateNameCount > 1) {
    addFlag(flags, {
      id: 'duplicate_name',
      label: 'Duplicate name',
      detail: `${duplicateNameCount} published listings normalize to the same business name.`,
      severity: 'blocker',
    })
  }
  if (!clean(page.description)) {
    addFlag(flags, {
      id: 'missing_description',
      label: 'Description missing',
      detail: 'Agents need a concise description to understand and match this listing.',
      severity: 'blocker',
    })
  }
  if (offers.length === 0) {
    addFlag(flags, {
      id: 'missing_offers',
      label: 'No offers',
      detail: 'The listing has no product or service an agent can evaluate.',
      severity: 'blocker',
    })
  } else {
    if (pricedOfferCount === 0) {
      addFlag(flags, {
        id: 'missing_pricing',
        label: 'Pricing missing',
        detail: 'Every offer is missing a price or priced tier.',
        severity: 'blocker',
      })
    }
    if (actionableOfferCount === 0) {
      addFlag(flags, {
        id: 'missing_action_path',
        label: 'No action path',
        detail: 'No offer has a checkout, negotiation, contact, or provider destination.',
        severity: 'blocker',
      })
    }
  }
  if (!clean(page.location)) {
    addFlag(flags, {
      id: 'missing_location',
      label: 'Location missing',
      detail: 'Add a service area or Remote / worldwide so location filters remain reliable.',
      severity: 'blocker',
    })
  }
  if (!clean(page.industry)) {
    addFlag(flags, {
      id: 'missing_industry',
      label: 'Industry missing',
      detail: 'An industry is required for accurate marketplace matching and filters.',
      severity: 'blocker',
    })
  }
  if (readiness < 90) {
    addFlag(flags, {
      id: 'low_readiness',
      label: 'Readiness below 90',
      detail: `Current agent-readiness score is ${readiness}%.`,
      severity: 'blocker',
    })
  }
  if (page.mcp_enabled === false) {
    addFlag(flags, {
      id: 'mcp_disabled',
      label: 'MCP disabled',
      detail: 'The listing can publish, but its MCP discovery surface is switched off.',
      severity: 'warning',
    })
  }

  const updatedAt = page.updated_at ? new Date(page.updated_at) : null
  if (updatedAt && Number.isFinite(updatedAt.getTime())) {
    const ageDays = Math.floor((now.getTime() - updatedAt.getTime()) / 86_400_000)
    if (ageDays > STALE_AFTER_DAYS) {
      addFlag(flags, {
        id: 'stale_listing',
        label: 'Listing may be stale',
        detail: `No listing update has been recorded for ${ageDays} days.`,
        severity: 'warning',
      })
    }
  }

  const blockerCount = flags.filter((flag) => flag.severity === 'blocker').length
  const warningCount = flags.length - blockerCount
  const suggestedStatus: MarketplaceQualitySnapshot['suggestedStatus'] = isInternalMarketplaceFixture(page)
    ? 'excluded'
    : blockerCount === 0
      ? 'candidate'
      : 'unreviewed'

  return {
    version: 1,
    assessedAt: now.toISOString(),
    readiness,
    trust,
    offerCount: offers.length,
    pricedOfferCount,
    actionableOfferCount,
    blockerCount,
    warningCount,
    suggestedStatus,
    flags,
  }
}

export function summarizeMarketplaceCuration(items: MarketplaceCurationQueueItem[]): MarketplaceCurationSummary {
  return items.reduce<MarketplaceCurationSummary>((summary, item) => {
    summary.total += 1
    summary[item.decision.status] += 1
    if (item.decision.status !== 'excluded') {
      summary.blockers += item.assessment.blockerCount
      summary.warnings += item.assessment.warningCount
    }
    return summary
  }, {
    total: 0,
    unreviewed: 0,
    candidate: 0,
    certified: 0,
    excluded: 0,
    blockers: 0,
    warnings: 0,
  })
}

export function canCertifyMarketplacePage(snapshot: MarketplaceQualitySnapshot) {
  return snapshot.readiness >= 90
    && snapshot.blockerCount === 0
    && snapshot.offerCount > 0
    && snapshot.actionableOfferCount > 0
}
