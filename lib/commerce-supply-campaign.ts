import type { CommerceDomain } from './commerce-templates/schema'

export const COMMERCE_SUPPLY_CAMPAIGN_STATUSES = [
  'new',
  'sourcing',
  'contacted',
  'onboarding',
  'dismissed',
] as const

export type CommerceSupplyCampaignStatus = (typeof COMMERCE_SUPPLY_CAMPAIGN_STATUSES)[number]
export type CommerceSupplyWorkflowStatus = CommerceSupplyCampaignStatus | 'live'

export const COMMERCE_SUPPLY_STATUS_LABELS: Record<CommerceSupplyWorkflowStatus, string> = {
  new: 'New priority',
  sourcing: 'Sourcing',
  contacted: 'Contacted',
  onboarding: 'Onboarding',
  dismissed: 'Dismissed',
  live: 'Certified supply live',
}

const ALLOWED_TRANSITIONS: Record<CommerceSupplyCampaignStatus, CommerceSupplyCampaignStatus[]> = {
  new: ['sourcing', 'dismissed'],
  sourcing: ['new', 'contacted', 'dismissed'],
  contacted: ['sourcing', 'onboarding', 'dismissed'],
  onboarding: ['contacted', 'dismissed'],
  dismissed: ['new', 'sourcing'],
}

export type CommerceSupplyCampaign = {
  referenceId: string
  referenceDomain: CommerceDomain
  status: CommerceSupplyCampaignStatus
  decisionReason: string
  createdBy: string | null
  updatedBy: string | null
  createdAt: string
  updatedAt: string
}

export type CommerceSupplyEvidence = {
  observed: number
  live: number
  related: number
  reference: number
  unresolved: number
}

export type CommerceSupplyBrief = {
  objective: string
  merchantProfile: string
  verificationQuestions: string[]
  capabilityTags: string[]
  successBoundary: string
}

export type CertifiedCommerceSupply = {
  pageId: string
  pageName: string
  pageSlug: string
  offerName: string
}

export function allowedCommerceSupplyTransitions(
  status: CommerceSupplyCampaignStatus,
): CommerceSupplyCampaignStatus[] {
  return ALLOWED_TRANSITIONS[status]
}

export function canTransitionCommerceSupplyCampaign(
  from: CommerceSupplyCampaignStatus,
  to: CommerceSupplyCampaignStatus,
): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to)
}

export function commerceSupplyCampaignStatusFor(
  campaign: CommerceSupplyCampaign | null,
): CommerceSupplyCampaignStatus {
  return campaign?.status ?? 'new'
}
