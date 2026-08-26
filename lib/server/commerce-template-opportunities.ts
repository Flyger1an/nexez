import 'server-only'

import {
  buildCommerceTemplateOpportunityReport,
  type CommerceTemplateOpportunityReport,
  type CommerceTemplateOpportunitySources,
} from '../commerce-template-opportunities'
import { commerceTemplates } from '../commerce-templates/registry'
import { getCommerceDemandSnapshot } from './commerce-demand'
import { getMarketplaceCurationQueue } from './marketplace-curation'
import { getCommerceSupplyWorkflowSnapshot } from './commerce-supply-workflow'
import { getCommerceTemplateOutcomeSnapshot } from './commerce-template-outcomes'

export type CommerceTemplateOpportunitySnapshot = CommerceTemplateOpportunityReport & {
  generatedAt: string
  demandSince: string
  outcomes: Awaited<ReturnType<typeof getCommerceTemplateOutcomeSnapshot>>
  sources: CommerceTemplateOpportunitySources & {
    demand: boolean
    demandTruncated: boolean
    supply: boolean
  }
  warnings: string[]
}

export async function getCommerceTemplateOpportunitySnapshot(): Promise<CommerceTemplateOpportunitySnapshot> {
  const [demand, marketplace, outcomes] = await Promise.all([
    getCommerceDemandSnapshot(),
    getMarketplaceCurationQueue(),
    getCommerceTemplateOutcomeSnapshot(),
  ])
  const supply = await getCommerceSupplyWorkflowSnapshot(demand, marketplace)
  const sources: CommerceTemplateOpportunitySources = {
    listings: outcomes.sources.listings.available,
    benchmark: outcomes.sources.benchmark.available,
    checkout: outcomes.sources.checkout.available,
    negotiated: outcomes.sources.negotiated.available,
  }
  const report = buildCommerceTemplateOpportunityReport({
    templates: commerceTemplates,
    demand,
    supply,
    outcomes,
    sources,
  })

  return {
    ...report,
    generatedAt: new Date().toISOString(),
    demandSince: demand.since,
    outcomes,
    sources: {
      ...sources,
      demand: demand.available,
      demandTruncated: demand.truncated,
      supply: supply.verificationAvailable,
    },
    warnings: opportunityWarnings({
      demandAvailable: demand.available,
      demandTruncated: demand.truncated,
      supplyAvailable: supply.verificationAvailable,
      outcomeWarnings: outcomes.warnings,
    }),
  }
}

function opportunityWarnings(input: {
  demandAvailable: boolean
  demandTruncated: boolean
  supplyAvailable: boolean
  outcomeWarnings: string[]
}): string[] {
  const warnings = [...input.outcomeWarnings]
  if (!input.demandAvailable) {
    warnings.push('Buyer request signals are unavailable. Demand values are not shown as zero.')
  } else if (input.demandTruncated) {
    warnings.push('Buyer request signals reached the reporting limit. Displayed demand is a lower bound.')
  }
  if (!input.supplyAvailable) {
    warnings.push('Certified marketplace coverage is unavailable. Supply values are not shown as zero.')
  }
  return [...new Set(warnings)]
}
