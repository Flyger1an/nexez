import type { CommerceDemandSnapshot } from './commerce-demand'
import type { CommerceSupplyWorkflowSnapshot } from './commerce-supply-workflow'
import type {
  CommerceTemplateOutcomeReport,
  CommerceTemplateOutcomeRow,
  CommerceTemplateRailCounts,
} from './commerce-template-outcomes'
import type { CommerceTemplate } from './commerce-templates/schema'

export const COMMERCE_TEMPLATE_REVIEW_MIN_LISTINGS = 5
export const COMMERCE_TEMPLATE_REVIEW_MIN_PUBLISHED = 3
export const COMMERCE_TEMPLATE_REVIEW_READINESS_GAP = -5

export type CommerceTemplateOpportunityAction =
  | 'refresh-evidence'
  | 'recruit-exact-supply'
  | 'start-template-use'
  | 'help-merchants-publish'
  | 'review-template'
  | 'gather-more-evidence'
  | 'keep-and-monitor'

export type CommerceTemplateOpportunityTone = 'attention' | 'watch' | 'steady'

export type CommerceTemplateOpportunitySources = {
  listings: boolean
  benchmark: boolean
  checkout: boolean
  negotiated: boolean
}

export type CommerceTemplateOpportunityRow = {
  rank: number
  templateId: string
  templateVersion: number
  title: string
  domain: CommerceTemplate['domain']
  action: CommerceTemplateOpportunityAction
  actionLabel: string
  reason: string
  tone: CommerceTemplateOpportunityTone
  demand: {
    available: boolean
    truncated: boolean
    observed: number | null
    unresolved: number | null
  }
  supply: {
    available: boolean
    certifiedListings: number | null
  }
  adoption: {
    available: boolean
    listings: number | null
    publishedListings: number | null
    publishedRate: number | null
    averageReadiness: number | null
    readinessVsNoTemplate: number | null
  }
  checkout: {
    available: boolean
    orders: number | null
    listings: number | null
    rails: CommerceTemplateRailCounts | null
  }
  negotiated: {
    available: boolean
    deals: number | null
    listings: number | null
  }
}

export type CommerceTemplateOpportunityReport = {
  summary: {
    templates: number
    needsAction: number
    recruit: number
    activate: number
    review: number
    monitoring: number
  }
  rows: CommerceTemplateOpportunityRow[]
}

type BuildCommerceTemplateOpportunityReportInput = {
  templates: CommerceTemplate[]
  demand: CommerceDemandSnapshot
  supply: CommerceSupplyWorkflowSnapshot
  outcomes: CommerceTemplateOutcomeReport
  sources: CommerceTemplateOpportunitySources
}

type Decision = Pick<
  CommerceTemplateOpportunityRow,
  'action' | 'actionLabel' | 'reason' | 'tone'
>

const ACTION_ORDER: Record<CommerceTemplateOpportunityAction, number> = {
  'refresh-evidence': 0,
  'recruit-exact-supply': 1,
  'help-merchants-publish': 2,
  'review-template': 3,
  'start-template-use': 4,
  'gather-more-evidence': 5,
  'keep-and-monitor': 6,
}

/**
 * Join category demand, exact certified supply, and exact template-version
 * outcomes without collapsing their evidence boundaries. The returned action
 * is advisory only and never changes a template or merchant listing.
 */
export function buildCommerceTemplateOpportunityReport({
  templates,
  demand,
  supply,
  outcomes,
  sources,
}: BuildCommerceTemplateOpportunityReportInput): CommerceTemplateOpportunityReport {
  const demandByTemplate = new Map(demand.categories.map((category) => [category.referenceId, category]))
  const supplyByTemplate = new Map(supply.items.map((item) => [item.referenceId, item]))
  const outcomeByTemplate = new Map(outcomes.templates.map((outcome) => [versionedKey(outcome), outcome]))

  const rows = templates
    .filter((template) => template.status === 'active')
    .map((template) => {
      const categoryDemand = demandByTemplate.get(template.id)
      const categorySupply = supplyByTemplate.get(template.id)
      const versionOutcome = outcomeByTemplate.get(versionedKey(template))
      const supplyAvailable = supply.verificationAvailable
      const certifiedListings = supplyAvailable
        ? new Set(categorySupply?.certifiedSupply.map((listing) => listing.pageId) ?? []).size
        : null
      const decision = decideOpportunity({
        template,
        demand,
        categoryDemand,
        certifiedListings,
        versionOutcome,
        sources,
      })

      return {
        rank: 0,
        templateId: template.id,
        templateVersion: template.version,
        title: template.title,
        domain: template.domain,
        ...decision,
        demand: {
          available: demand.available,
          truncated: demand.truncated,
          observed: demand.available ? categoryDemand?.observed ?? 0 : null,
          unresolved: demand.available ? categoryDemand?.unresolved ?? 0 : null,
        },
        supply: {
          available: supplyAvailable,
          certifiedListings,
        },
        adoption: {
          available: sources.listings,
          listings: sources.listings ? versionOutcome?.listings ?? 0 : null,
          publishedListings: sources.listings ? versionOutcome?.publishedListings ?? 0 : null,
          publishedRate: sources.listings ? versionOutcome?.publishedRate ?? null : null,
          averageReadiness: sources.listings ? versionOutcome?.averageReadiness ?? null : null,
          readinessVsNoTemplate: sources.listings && sources.benchmark
            ? versionOutcome?.readinessVsNoTemplate ?? null
            : null,
        },
        checkout: {
          available: sources.checkout,
          orders: sources.checkout ? versionOutcome?.checkout.orders ?? 0 : null,
          listings: sources.checkout ? versionOutcome?.checkout.listings ?? 0 : null,
          rails: sources.checkout ? versionOutcome?.checkout.rails ?? emptyRailCounts() : null,
        },
        negotiated: {
          available: sources.negotiated,
          deals: sources.negotiated ? versionOutcome?.negotiated.deals ?? 0 : null,
          listings: sources.negotiated ? versionOutcome?.negotiated.listings ?? 0 : null,
        },
      } satisfies CommerceTemplateOpportunityRow
    })
    .sort(compareRows)
    .map((row, index) => ({ ...row, rank: index + 1 }))

  return {
    summary: {
      templates: rows.length,
      needsAction: rows.filter((row) => row.tone === 'attention').length,
      recruit: rows.filter((row) => row.action === 'recruit-exact-supply').length,
      activate: rows.filter((row) => (
        row.action === 'start-template-use' || row.action === 'help-merchants-publish'
      )).length,
      review: rows.filter((row) => row.action === 'review-template').length,
      monitoring: rows.filter((row) => (
        row.action === 'gather-more-evidence' || row.action === 'keep-and-monitor'
      )).length,
    },
    rows,
  }
}

function decideOpportunity(input: {
  template: CommerceTemplate
  demand: CommerceDemandSnapshot
  categoryDemand: CommerceDemandSnapshot['categories'][number] | undefined
  certifiedListings: number | null
  versionOutcome: CommerceTemplateOutcomeRow | undefined
  sources: CommerceTemplateOpportunitySources
}): Decision {
  const { template, demand, categoryDemand, certifiedListings, versionOutcome, sources } = input

  if (certifiedListings == null) {
    return {
      action: 'refresh-evidence',
      actionLabel: 'Refresh marketplace evidence',
      reason: 'Certified marketplace coverage could not be checked. Refresh before deciding whether this category needs recruitment.',
      tone: 'attention',
    }
  }

  if (certifiedListings === 0) {
    if (demand.available && (categoryDemand?.unresolved ?? 0) > 0) {
      const count = categoryDemand?.unresolved ?? 0
      return {
        action: 'recruit-exact-supply',
        actionLabel: 'Recruit an exact merchant',
        reason: `${count} recent ${pluralize(count, 'request')} reached related or reference-only results, and no exact certified merchant is published.`,
        tone: 'attention',
      }
    }
    return {
      action: 'recruit-exact-supply',
      actionLabel: 'Recruit an exact merchant',
      reason: `No exact certified merchant is published for ${template.title}. This remains a launch coverage priority; no buyer demand is inferred.`,
      tone: 'attention',
    }
  }

  if (!sources.listings) {
    return {
      action: 'refresh-evidence',
      actionLabel: 'Refresh template evidence',
      reason: 'Template adoption could not be checked. Refresh before deciding how merchants are using this setup guide.',
      tone: 'attention',
    }
  }

  if (!versionOutcome || versionOutcome.listings === 0) {
    return {
      action: 'start-template-use',
      actionLabel: 'Start using this guide',
      reason: `Exact certified supply is live, but no listing records adoption of ${template.title} version ${template.version}.`,
      tone: 'attention',
    }
  }

  if (versionOutcome.publishedListings === 0) {
    return {
      action: 'help-merchants-publish',
      actionLabel: 'Help merchants publish',
      reason: `${versionOutcome.listings} ${pluralize(versionOutcome.listings, 'listing')} started with this guide, but none are published.`,
      tone: 'attention',
    }
  }

  if (!sources.benchmark || versionOutcome.readinessVsNoTemplate == null) {
    return {
      action: 'gather-more-evidence',
      actionLabel: 'Gather more evidence',
      reason: 'Published listings exist, but there is no comparable readiness baseline yet. Keep the current version unchanged while evidence grows.',
      tone: 'watch',
    }
  }

  const enoughListings = versionOutcome.listings >= COMMERCE_TEMPLATE_REVIEW_MIN_LISTINGS
  const enoughPublished = versionOutcome.publishedListings >= COMMERCE_TEMPLATE_REVIEW_MIN_PUBLISHED
  if (!enoughListings || !enoughPublished) {
    return {
      action: 'gather-more-evidence',
      actionLabel: 'Gather more evidence',
      reason: `Wait for at least ${COMMERCE_TEMPLATE_REVIEW_MIN_LISTINGS} listings and ${COMMERCE_TEMPLATE_REVIEW_MIN_PUBLISHED} published listings before using readiness differences to review this guide.`,
      tone: 'watch',
    }
  }

  if (versionOutcome.readinessVsNoTemplate <= COMMERCE_TEMPLATE_REVIEW_READINESS_GAP) {
    return {
      action: 'review-template',
      actionLabel: 'Review this guide',
      reason: `Current readiness trails comparable listings without a recorded template by ${Math.abs(versionOutcome.readinessVsNoTemplate)} points. Review the guide before creating a new version.`,
      tone: 'attention',
    }
  }

  if (!sources.checkout || !sources.negotiated) {
    return {
      action: 'refresh-evidence',
      actionLabel: 'Refresh commerce evidence',
      reason: 'Readiness evidence is sufficient, but one or more live commerce sources are unavailable. Refresh before calling the template healthy.',
      tone: 'attention',
    }
  }

  return {
    action: 'keep-and-monitor',
    actionLabel: 'Keep and monitor',
    reason: 'The evidence threshold is met and current readiness does not materially trail comparable listings. Keep this version unchanged while live outcomes grow.',
    tone: 'steady',
  }
}

function compareRows(left: CommerceTemplateOpportunityRow, right: CommerceTemplateOpportunityRow): number {
  const actionDifference = ACTION_ORDER[left.action] - ACTION_ORDER[right.action]
  if (actionDifference !== 0) return actionDifference
  const leftUnresolved = left.demand.unresolved ?? -1
  const rightUnresolved = right.demand.unresolved ?? -1
  if (leftUnresolved !== rightUnresolved) return rightUnresolved - leftUnresolved
  return left.title.localeCompare(right.title) || left.templateId.localeCompare(right.templateId)
}

function versionedKey(template: Pick<CommerceTemplate, 'id' | 'version'> | Pick<CommerceTemplateOutcomeRow, 'templateId' | 'templateVersion'>): string {
  return 'id' in template
    ? `${template.id}@${template.version}`
    : `${template.templateId}@${template.templateVersion}`
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

function pluralize(count: number, noun: string): string {
  return count === 1 ? noun : `${noun}s`
}
