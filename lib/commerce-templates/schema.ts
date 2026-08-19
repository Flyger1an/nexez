/**
 * Canonical, versioned knowledge model for Nexez service-commerce templates.
 *
 * IMPORTANT INVARIANT:
 * A template describes what Nexez should investigate and be capable of
 * representing. It is never authority for merchant-specific prices, policies,
 * availability, service area, or other business facts. Merchant truth must
 * still come from extraction, an integration, an existing listing, or explicit
 * merchant confirmation through the intake provenance pipeline.
 */

export type CommerceTemplateStatus = 'draft' | 'active' | 'deprecated'

export type CommerceDomain =
  | 'home-property'
  | 'automotive-mobile'
  | 'events-hospitality'
  | 'beauty-fitness-personal'
  | 'professional-creative-technical'
  | 'education-family-pet'
  | 'local-commercial-operations'

export type CommerceArchetype =
  | 'fixed-appointment'
  | 'configurable-appointment'
  | 'quote-required'
  | 'recurring-service'
  | 'package-program'
  | 'consultation-first'
  | 'mobile-service'
  | 'urgent-on-demand'
  | 'unit-priced-service'
  | 'inventory-rental'
  | 'delivery-service'
  | 'contracted-service'
  | 'complex-project'

export type CommerceCapability =
  | 'FIXED_PRICE'
  | 'NEGOTIABLE'
  | 'QUOTE_REQUIRED'
  | 'SCHEDULED'
  | 'RECURRING'
  | 'MOBILE'
  | 'SERVICE_AREA'
  | 'CONFIGURABLE'
  | 'ADD_ONS'
  | 'CAPACITY_LIMITED'
  | 'URGENT'
  | 'DEPOSIT'
  | 'MILESTONE'
  | 'CUSTOM_INTAKE'
  | 'CUSTOMER_ASSETS'
  | 'AVAILABILITY'
  | 'MULTI_PROVIDER'
  | 'UNIT_PRICING'
  | 'SUBSCRIPTION'
  | 'DELIVERY'
  | 'INVENTORY'
  | 'REMOTE'
  | 'PROJECT_SCOPE'
  | 'REVISION_LIMITS'
  | 'LICENSING'
  | 'TRAVEL_FEE'
  | 'MINIMUMS'
  | 'CONTRACT'
  | 'SLA'

export type PricingMode =
  | 'fixed'
  | 'starting-at'
  | 'tiered'
  | 'unit'
  | 'hourly'
  | 'quote'
  | 'retainer'
  | 'subscription'
  | 'negotiable'
  | 'diagnostic'
  | 'milestone'

export type FulfillmentMode =
  | 'customer-location'
  | 'provider-location'
  | 'remote'
  | 'hybrid'
  | 'pickup-delivery'
  | 'delivery'

export type SchedulingMode =
  | 'fixed-slot'
  | 'date-window'
  | 'recurring-cadence'
  | 'on-demand'
  | 'project-timeline'
  | 'asynchronous'

export type PaymentMode =
  | 'full-checkout'
  | 'deposit-balance'
  | 'invoice'
  | 'milestone'
  | 'recurring'
  | 'negotiated-settlement'
  | 'external'

export type CommerceFactImportance = 'required' | 'quality' | 'opportunity'
export type CommerceFactScope = 'page' | 'offer' | 'customer-request'
export type CommerceFactValueType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'enum'
  | 'money'
  | 'duration'
  | 'location'
  | 'date'
  | 'date-time'
  | 'quantity'
  | 'asset'
  | 'multi-select'

/**
 * A fact describes information that matters to this commerce pattern.
 * `ask` is guidance for the deterministic intake layer / conversational renderer;
 * it is not a default answer and must never be materialized without provenance.
 */
export type CommerceFact = {
  key: string
  label: string
  description: string
  importance: CommerceFactImportance
  scope: CommerceFactScope
  valueType: CommerceFactValueType
  ask: string
  why: string
}

export type CommerceMatchHints = {
  /** Canonical Nexez industry labels or common merchant-entered variants. */
  industries: string[]
  /** Business-description phrases that strongly indicate this template. */
  keywords: string[]
  /** Offer names / phrases that are useful matching evidence. */
  offerTerms?: string[]
}

export type CommerceCustomerIntent = {
  id: string
  text: string
  notes?: string
}

export type CommerceOfferBlueprint = {
  /** Stable local key within a template; not a merchant offer id. */
  key: string
  name: string
  kind: 'service' | 'product'
  description: string
  commonConfiguration?: string[]
}

export type CommerceTemplateRelation = {
  templateId: string
  relation:
    | 'complements'
    | 'precedes'
    | 'follows'
    | 'alternative-to'
    | 'often-purchased-with'
  why?: string
}

export type CommerceEvalDifficulty = 'direct' | 'constrained' | 'configurable' | 'complex' | 'adversarial'

export type CommerceEval = {
  id: string
  difficulty: CommerceEvalDifficulty
  request: string
  expected: {
    templateId: string
    /** Facts that should be resolved or explicitly asked before a valid transaction. */
    requiredFactKeys: string[]
    /** Capabilities the scenario intentionally exercises. */
    capabilityTags: CommerceCapability[]
    /** Optional behavior that must not occur. */
    mustNot?: string[]
  }
}

export type CommerceExampleOffer = {
  name: string
  description: string
  /** Demo-only display signal. Never inherited as merchant truth. */
  priceSignal?: string
}

export type CommerceExampleListing = {
  /** Must always be true so public adapters can enforce explicit demo labeling. */
  exampleOnly: true
  disclaimer: string
  title: string
  description: string
  offers: CommerceExampleOffer[]
  tryAsking: string[]
}

export type CommerceTemplate = {
  /** Stable semantic id, e.g. `automotive.mobile-auto-detailing`. */
  id: string
  /** Monotonic template definition version. */
  version: number
  status: CommerceTemplateStatus

  domain: CommerceDomain
  industry: string
  title: string
  description: string

  primaryArchetype: CommerceArchetype
  secondaryArchetypes?: CommerceArchetype[]
  matchHints: CommerceMatchHints

  customerJobs: string[]
  customerIntents: CommerceCustomerIntent[]
  offerBlueprints: CommerceOfferBlueprint[]

  requiredFacts: CommerceFact[]
  qualityFacts: CommerceFact[]
  opportunityFacts: CommerceFact[]

  pricingModes: PricingMode[]
  fulfillmentModes: FulfillmentMode[]
  schedulingModes: SchedulingMode[]
  paymentModes: PaymentMode[]

  capabilityTags: CommerceCapability[]
  relatedTemplates?: CommerceTemplateRelation[]
  evals: CommerceEval[]
  exampleListing?: CommerceExampleListing
}

export type CommerceTemplateRef = Pick<CommerceTemplate, 'id' | 'version'>

export function commerceTemplateRef(template: CommerceTemplate): CommerceTemplateRef {
  return { id: template.id, version: template.version }
}
