import type { TransactionChannel } from './money'

export const CONVERSION_STAGES = [
  'offer_viewed',
  'checkout_initiated',
  'payment_completed',
  'payment_retained',
] as const

export type ConversionStage = (typeof CONVERSION_STAGES)[number]

export const ANALYTICS_TRUST_LEVELS = [
  'verified_server',
  'unverified_client',
  'legacy_unverified',
] as const

export type AnalyticsTrustLevel = (typeof ANALYTICS_TRUST_LEVELS)[number]

export type AnalyticsAttribution = {
  journeyId?: string | null
  source?: string | null
  campaign?: string | null
  referrer?: string | null
  agentType?: string | null
  experimentId?: string | null
  experimentVariant?: string | null
  channel?: TransactionChannel | null
  verified: boolean
}
