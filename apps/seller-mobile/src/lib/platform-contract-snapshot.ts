export const MOBILE_PLATFORM_API_PATHS = {
  simulateLlm: '/api/simulate-llm',
  publicSimulate: '/api/public-simulate',
  sellerNotificationPreferences: '/api/seller/notification-preferences',
  publicIdentifierAvailability: '/api/public-identifiers/availability',
  orderRequestStatus: '/api/orders/request-status',
  negotiationTransition: '/api/negotiations/transition',
  negotiationEscrow: '/api/negotiations/escrow',
  orderRefund: '/api/orders/refund',
  intakeThreads: '/api/agents/intake/threads',
  intakeThread: '/api/agents/intake/threads/[id]',
  intakeMessages: '/api/agents/intake/threads/[id]/messages',
  intakeCommit: '/api/agents/intake/threads/[id]/commit',
} as const

export type MobilePlatformApiPath =
  (typeof MOBILE_PLATFORM_API_PATHS)[keyof typeof MOBILE_PLATFORM_API_PATHS]

export function mobilePlatformApiPath(
  template: MobilePlatformApiPath,
  params: { id: string },
): string {
  return template.replace('[id]', encodeURIComponent(params.id))
}

export const MOBILE_NOTIFICATION_PAYLOAD_TYPES = [
  'negotiation',
  'order',
  'listing',
  'page',
  'review',
  'request',
  'buyer_request',
  'refund_request',
  'problem_report',
  'finance',
  'refund',
  'dispute',
  'payout',
] as const

export const MOBILE_ENTITLEMENT_SCHEMA_VERSION = 1 as const

export const MOBILE_PLAN_RANK = {
  free: 0,
  launch: 1,
  pro: 2,
  scale: 3,
  enterprise: 4,
} as const

export const MOBILE_ENTITLEMENT_FEATURE_KEYS = [
  'customDomain',
  'aiFeatures',
  'removeBadge',
  'whiteLabel',
  'integrations',
  'outboundWebhooks',
  'apiAccess',
  'negotiation',
  'analyticsHistory',
  'teamCollaboration',
  'prioritySupport',
  'sso',
] as const

export const MOBILE_NEGOTIATION_STATUSES = [
  'negotiation',
  'agreement_proposed',
  'paused',
  'held',
  'complete',
  'declined',
  'expired',
  'refunded',
  'disputed',
] as const

export const MOBILE_OPEN_NEGOTIATION_STATUSES = [
  'negotiation',
  'agreement_proposed',
  'paused',
  'held',
] as const satisfies readonly (typeof MOBILE_NEGOTIATION_STATUSES)[number][]
