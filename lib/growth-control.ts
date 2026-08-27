export const GROWTH_CONTROL_ACTIONS = [
  'pause',
  'resume',
  'end',
  'set_capacity',
  'set_signup_close',
  'set_enrollment_mode',
] as const

export const GROWTH_COHORT_ACTIONS = [
  'cohort_add',
  'cohort_resend',
  'cohort_revoke',
] as const

export type GrowthControlAction = (typeof GROWTH_CONTROL_ACTIONS)[number]
export type GrowthCohortAction = (typeof GROWTH_COHORT_ACTIONS)[number]
export type GrowthAdminAction = GrowthControlAction | GrowthCohortAction
export type GrowthCampaignStatus = 'draft' | 'active' | 'paused' | 'ended'
export type GrowthEnrollmentMode = 'open' | 'invite_only'
export type GrowthCohortStatus = 'pending' | 'claimed' | 'qualified' | 'expired' | 'revoked'

export type GrowthControlCampaign = {
  id: string
  key: string
  name: string
  status: GrowthCampaignStatus
  grantPlanId: string
  grantDurationDays: number
  inviteSlots: number
  inviteExpiresDays: number
  maxGrants: number
  startsAt: string
  signupClosesAt: string | null
  enrollmentMode: GrowthEnrollmentMode
  updatedAt: string
}

export type GrowthControlMetrics = {
  grantsTotal: number
  grantsActive: number
  grantsExpired: number
  grantsRevoked: number
  grantsSuperseded: number
  welcomeGrants: number
  referralGrants: number
  grantsWithFallback: number
  grantsIssued30d: number
  paidConversions: number
  invitesTotal: number
  invitesPending: number
  invitesClaimed: number
  invitesQualified: number
  invitesExpired: number
  invitesRevoked: number
  invitesDelivered: number
  invitesUndelivered: number
  invitesCreated30d: number
  cohortTotal: number
  cohortPending: number
  cohortClaimed: number
  cohortQualified: number
  cohortExpired: number
  cohortRevoked: number
  cohortDelivered: number
  cohortUndelivered: number
  fallbackApplied: number
  grantExpiredEvents: number
  noticesSent: number
  latestEventAt: string | null
}

export type GrowthControlEvent = {
  id: string
  type: string
  label: string
  detail: string
  createdAt: string
}

export type GrowthControlAdminEvent = {
  id: string
  action: GrowthAdminAction
  reason: string
  beforeStatus: GrowthCampaignStatus | null
  afterStatus: GrowthCampaignStatus | null
  createdAt: string
}

export type GrowthCohortMember = {
  id: string
  email: string
  label: string | null
  status: GrowthCohortStatus
  expiresAt: string
  acceptedAt: string | null
  qualifiedAt: string | null
  deliveryCount: number
  lastSentAt: string | null
  createdAt: string
}

export type GrowthScanFunnelMetrics = {
  captured: number
  delivered: number
  onboardingOpened: number
  accountsCreated: number
  published: number
  launchActivated: number
  pendingDelivery: number
  stalePending: number
  staleClaims: number
  abandoned: number
  abandoned24h: number
  suppressed: number
}

export type GrowthScanLead = {
  id: string
  email: string
  domain: string
  score: number | null
  stage: 'captured' | 'delivered' | 'onboarding' | 'account' | 'published' | 'launch'
  deliveryAttempts: number
  lastError: string | null
  createdAt: string
}

export type GrowthScanFunnel = {
  metrics: GrowthScanFunnelMetrics
  recentLeads: GrowthScanLead[]
}

export type GrowthControlSummary = {
  capacityRemaining: number
  capacityPercent: number
  inviteClaimRate: number
  inviteQualificationRate: number
  deliveryRate: number
  paidConversionRate: number
  cohortQualificationRate: number
  cohortDeliveryRate: number
}

export type GrowthControlSnapshot = {
  available: boolean
  generatedAt: string
  campaign: GrowthControlCampaign | null
  metrics: GrowthControlMetrics
  summary: GrowthControlSummary
  recentEvents: GrowthControlEvent[]
  adminEvents: GrowthControlAdminEvent[]
  cohortMembers: GrowthCohortMember[]
  scanFunnel: GrowthScanFunnel
  warnings: string[]
}

export const EMPTY_SCAN_FUNNEL_METRICS: GrowthScanFunnelMetrics = {
  captured: 0,
  delivered: 0,
  onboardingOpened: 0,
  accountsCreated: 0,
  published: 0,
  launchActivated: 0,
  pendingDelivery: 0,
  stalePending: 0,
  staleClaims: 0,
  abandoned: 0,
  abandoned24h: 0,
  suppressed: 0,
}

export const EMPTY_GROWTH_METRICS: GrowthControlMetrics = {
  grantsTotal: 0,
  grantsActive: 0,
  grantsExpired: 0,
  grantsRevoked: 0,
  grantsSuperseded: 0,
  welcomeGrants: 0,
  referralGrants: 0,
  grantsWithFallback: 0,
  grantsIssued30d: 0,
  paidConversions: 0,
  invitesTotal: 0,
  invitesPending: 0,
  invitesClaimed: 0,
  invitesQualified: 0,
  invitesExpired: 0,
  invitesRevoked: 0,
  invitesDelivered: 0,
  invitesUndelivered: 0,
  invitesCreated30d: 0,
  cohortTotal: 0,
  cohortPending: 0,
  cohortClaimed: 0,
  cohortQualified: 0,
  cohortExpired: 0,
  cohortRevoked: 0,
  cohortDelivered: 0,
  cohortUndelivered: 0,
  fallbackApplied: 0,
  grantExpiredEvents: 0,
  noticesSent: 0,
  latestEventAt: null,
}

function boundedRate(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((numerator / denominator) * 100)))
}

export function summarizeGrowthControl(
  campaign: Pick<GrowthControlCampaign, 'maxGrants'> | null,
  metrics: GrowthControlMetrics,
): GrowthControlSummary {
  const maxGrants = Math.max(0, campaign?.maxGrants ?? 0)
  return {
    capacityRemaining: Math.max(0, maxGrants - metrics.grantsTotal),
    capacityPercent: boundedRate(metrics.grantsTotal, maxGrants),
    inviteClaimRate: boundedRate(
      metrics.invitesClaimed + metrics.invitesQualified,
      metrics.invitesTotal,
    ),
    inviteQualificationRate: boundedRate(metrics.invitesQualified, metrics.invitesTotal),
    deliveryRate: boundedRate(metrics.invitesDelivered, metrics.invitesTotal),
    paidConversionRate: boundedRate(metrics.paidConversions, metrics.grantsTotal),
    cohortQualificationRate: boundedRate(metrics.cohortQualified, metrics.cohortTotal),
    cohortDeliveryRate: boundedRate(metrics.cohortDelivered, metrics.cohortTotal),
  }
}

export function emptyGrowthControlSnapshot(available = false): GrowthControlSnapshot {
  return {
    available,
    generatedAt: new Date().toISOString(),
    campaign: null,
    metrics: { ...EMPTY_GROWTH_METRICS },
    summary: summarizeGrowthControl(null, EMPTY_GROWTH_METRICS),
    recentEvents: [],
    adminEvents: [],
    cohortMembers: [],
    scanFunnel: { metrics: { ...EMPTY_SCAN_FUNNEL_METRICS }, recentLeads: [] },
    warnings: [],
  }
}
