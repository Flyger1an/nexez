export const GROWTH_CONTROL_ACTIONS = [
  'pause',
  'resume',
  'end',
  'set_capacity',
  'set_signup_close',
] as const

export type GrowthControlAction = (typeof GROWTH_CONTROL_ACTIONS)[number]
export type GrowthCampaignStatus = 'draft' | 'active' | 'paused' | 'ended'

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
  action: GrowthControlAction
  reason: string
  beforeStatus: GrowthCampaignStatus | null
  afterStatus: GrowthCampaignStatus | null
  createdAt: string
}

export type GrowthControlSummary = {
  capacityRemaining: number
  capacityPercent: number
  inviteClaimRate: number
  inviteQualificationRate: number
  deliveryRate: number
  paidConversionRate: number
}

export type GrowthControlSnapshot = {
  available: boolean
  generatedAt: string
  campaign: GrowthControlCampaign | null
  metrics: GrowthControlMetrics
  summary: GrowthControlSummary
  recentEvents: GrowthControlEvent[]
  adminEvents: GrowthControlAdminEvent[]
  warnings: string[]
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
    warnings: [],
  }
}
