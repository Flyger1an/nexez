import type { CheckoutOffer } from './agent-page'
import type { AnalyticsTrustLevel } from './contracts/analytics'

export type CheckoutEventType =
  | 'checkout_view'
  | 'checkout_attempt'
  | 'provider_redirect'
  | 'stripe_session_created'
  | 'stripe_missing_config'
  | 'stripe_error'
  | 'stripe_price_sync'
  | 'directory_click'
  | 'agent_page_view'
  | 'ab_impression'

export type CheckoutEvent = {
  id: string
  page_id: string
  owner_id: string | null
  slug: string
  offer_key: string
  offer_name: string
  offer_kind: CheckoutOffer['kind']
  event_type: CheckoutEventType
  agent_user_agent: string | null
  referrer: string | null
  query: string | null
  checkout_url: string | null
  provider_url: string | null
  stripe_session_id: string | null
  metadata: Record<string, unknown>
  ingestion_key?: string | null
  ingestion_source?: string
  trust_level?: AnalyticsTrustLevel
  created_at: string
}

export function getEventActionLabel(eventType: CheckoutEventType) {
  switch (eventType) {
    case 'checkout_view':
      return 'Viewed checkout'
    case 'checkout_attempt':
      return 'Started checkout'
    case 'provider_redirect':
      return 'Opened provider URL'
    case 'stripe_session_created':
      return 'Created Stripe session'
    case 'stripe_missing_config':
      return 'Needs Stripe config'
    case 'stripe_error':
      return 'Stripe error'
    case 'stripe_price_sync':
      return 'Stripe price sync'
    case 'directory_click':
      return 'Directory discovery click'
    case 'agent_page_view':
      return 'AI agent page visit'
    case 'ab_impression':
      return 'A/B variant shown'
  }
}
