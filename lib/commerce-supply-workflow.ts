import type { OfferItem } from './agent-page'
import {
  type CertifiedCommerceSupply,
  type CommerceSupplyBrief,
  type CommerceSupplyCampaign,
  type CommerceSupplyWorkflowStatus,
} from './commerce-supply-campaign'
import {
  buildCommerceLaunchCoveragePriorities,
  buildCommerceSupplyPriorities,
  type CommerceSupplyPriority,
} from './commerce-supply-priority'
import type { CommerceDemandSnapshot } from './commerce-demand'
import { commerceReferenceCandidates } from './commerce-templates/curation'
import { findCommerceSimulationMatch } from './commerce-templates/curation/simulation'
import { getLatestCommerceTemplate } from './commerce-templates/registry'
import type { MarketplaceCurationQueueItem } from './marketplace-curation'

export type CommerceSupplyWorkflowItem = CommerceSupplyPriority & {
  campaign: CommerceSupplyCampaign | null
  status: CommerceSupplyWorkflowStatus
  brief: CommerceSupplyBrief
  certifiedSupply: CertifiedCommerceSupply[]
}

export type CommerceSupplyWorkflowSnapshot = {
  generatedAt: string
  available: boolean
  demandAvailable: boolean
  verificationAvailable: boolean
  items: CommerceSupplyWorkflowItem[]
}

export function buildCommerceSupplyWorkflow(input: {
  demand: CommerceDemandSnapshot
  campaigns?: CommerceSupplyCampaign[]
  marketplaceItems?: MarketplaceCurationQueueItem[]
  available?: boolean
  verificationAvailable?: boolean
}): CommerceSupplyWorkflowSnapshot {
  const campaignByReference = new Map(
    (input.campaigns ?? []).map((campaign) => [campaign.referenceId, campaign]),
  )
  const certifiedByReference = certifiedSupplyByReference(input.marketplaceItems ?? [])
  const demandPriorities = buildCommerceSupplyPriorities(input.demand)
  const demandReferences = new Set(demandPriorities.map((priority) => priority.referenceId))
  const priorities = [
    ...demandPriorities,
    ...buildCommerceLaunchCoveragePriorities()
      .filter((priority) => !demandReferences.has(priority.referenceId)),
  ]

  return {
    generatedAt: input.demand.generatedAt,
    available: input.available ?? true,
    demandAvailable: input.demand.available,
    verificationAvailable: input.verificationAvailable ?? true,
    items: priorities.map((priority, index) => {
      const campaign = campaignByReference.get(priority.referenceId) ?? null
      const certifiedSupply = certifiedByReference.get(priority.referenceId) ?? []
      const certification = certifiedSupply.length
        ? {
            action: 'monitor-certified-supply' as const,
            actionLabel: 'Coverage established',
            rationale: 'Exact certified category supply is published. Continue monitoring coverage without treating category identity as proof of location, availability, price, or request-level fit.',
          }
        : null
      return {
        ...priority,
        rank: index + 1,
        ...certification,
        campaign,
        status: certifiedSupply.length ? 'live' : campaign?.status ?? 'new',
        brief: buildCommerceSupplyBrief(priority),
        certifiedSupply,
      }
    }),
  }
}

export function buildCommerceSupplyBrief(
  priority: Pick<CommerceSupplyPriority, 'referenceId' | 'title' | 'domain'>,
): CommerceSupplyBrief {
  const candidate = commerceReferenceCandidates.find((item) => item.id === priority.referenceId)
  const template = getLatestCommerceTemplate(priority.referenceId)
  const verificationQuestions = template?.requiredFacts.map((fact) => fact.ask)
    ?? candidate?.simulationHints?.buyerDetails.map((detail) => `How does the merchant handle ${detail}?`)
    ?? candidate?.gapSignals.map((signal) => `How does the merchant handle ${humanize(signal)}?`)
    ?? []

  return {
    objective: `Recruit a real ${priority.title} merchant whose published offer can be verified and certified.`,
    merchantProfile: candidate
      ? `Best fit: ${candidate.teaches}`
      : `Best fit: a merchant whose core offer is ${priority.title}, not an adjacent service.`,
    verificationQuestions: verificationQuestions.slice(0, 6),
    capabilityTags: [...(template?.capabilityTags ?? candidate?.capabilityTags ?? [])],
    successBoundary: `Success means at least one published, Nexez-certified listing uniquely identifies ${priority.title}. It does not prove location, availability, price, or fit for every request.`,
  }
}

export function withCommerceSupplyCampaign(
  item: CommerceSupplyWorkflowItem,
  campaign: CommerceSupplyCampaign,
): CommerceSupplyWorkflowItem {
  return {
    ...item,
    campaign,
    status: item.certifiedSupply.length ? 'live' : campaign.status,
  }
}

function certifiedSupplyByReference(
  items: MarketplaceCurationQueueItem[],
): Map<string, CertifiedCommerceSupply[]> {
  const matches = new Map<string, CertifiedCommerceSupply[]>()

  for (const item of items) {
    if (item.decision.status !== 'certified') continue
    const offers = [
      ...(item.page.services ?? []),
      ...(item.page.products ?? []),
    ]
    for (const offer of offers) {
      const match = classifyCertifiedOffer(offer)
      if (!match) continue
      const supply = matches.get(match.candidate.id) ?? []
      supply.push({
        pageId: item.page.id,
        pageName: item.page.name,
        pageSlug: item.page.slug,
        offerName: offer.name,
      })
      matches.set(match.candidate.id, supply)
    }
  }

  return matches
}

function classifyCertifiedOffer(offer: OfferItem) {
  // Category closure requires the published offer identity itself to resolve.
  // Descriptions and page industries routinely mention add-ons or adjacent
  // services, so treating them as buyer-request text creates false ambiguity.
  return findCommerceSimulationMatch(offer.name, commerceReferenceCandidates)
}

function humanize(value: string): string {
  return value.replaceAll('-', ' ')
}
