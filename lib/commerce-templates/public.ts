import { commerceTemplates, getLatestCommerceTemplate } from './registry'
import type { CommerceCapability, CommerceDomain } from './schema'

export type PublicCommerceExampleOffer = {
  name: string
  description: string
  priceSignal?: string
}

export type PublicCommerceExample = {
  id: string
  version: number
  domain: CommerceDomain
  industry: string
  title: string
  description: string
  archetype: string
  disclaimer: string
  customerJobs: string[]
  offers: PublicCommerceExampleOffer[]
  tryAsking: string[]
  clarifications: Array<{ key: string; label: string; question: string; why: string }>
  capabilityTags: CommerceCapability[]
}

/**
 * Public, non-transactional projection of a canonical Commerce Template.
 *
 * This intentionally excludes merchant identity, availability, service-area
 * claims, settlement destinations, private rules, and every other field that
 * could make a reference template look like live supply. The only offer data
 * exposed here comes from `exampleListing`, which the template validator
 * requires to be explicitly example-only and carry a disclaimer.
 */
function toPublicCommerceExample(template: (typeof commerceTemplates)[number]): PublicCommerceExample | null {
  const example = template.exampleListing
  if (template.status !== 'active' || !example || example.exampleOnly !== true) return null

  return {
    id: template.id,
    version: template.version,
    domain: template.domain,
    industry: template.industry,
    title: example.title,
    description: example.description,
    archetype: template.primaryArchetype,
    disclaimer: example.disclaimer,
    customerJobs: [...template.customerJobs],
    offers: example.offers.map((offer) => ({ ...offer })),
    tryAsking: [...example.tryAsking],
    clarifications: template.requiredFacts.map((fact) => ({
      key: fact.key,
      label: fact.label,
      question: fact.ask,
      why: fact.why,
    })),
    capabilityTags: [...template.capabilityTags],
  }
}

export function getPublicCommerceExamples(): PublicCommerceExample[] {
  return commerceTemplates
    .map(toPublicCommerceExample)
    .filter((example): example is PublicCommerceExample => Boolean(example))
}

export function getPublicCommerceExample(id: string): PublicCommerceExample | null {
  const template = getLatestCommerceTemplate(id)
  if (!template) return null
  return toPublicCommerceExample(template)
}

export function commerceExamplePath(id: string): string {
  return `/examples/${encodeURIComponent(id)}`
}
