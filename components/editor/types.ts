import { AgentPage, OfferItem } from '../../lib/agent-page'

/** Checkout/event rows the editor surfaces (loosely typed, as in the original). */
export type EditorEvent = any

/** Initial editor data fetched server-side and handed to the client island. */
export type EditorInitial = {
  page: AgentPage
  recentCalendlyBookings: EditorEvent[]
  recentOutboundFires: EditorEvent[]
  trustEvents: EditorEvent[]
  /** Server-resolved page-owner entitlement. False is the fail-closed default. */
  aiFeaturesEnabled: boolean
  /** Premium catalog/scheduling integrations; installed Shopify OAuth is an explicit core exception. */
  integrationsEnabled: boolean
  /** Server-resolved owner entitlement for outbound delivery execution. */
  outboundWebhooksEnabled: boolean
  /** Server-resolved owner entitlement for requesting/advancing team approvals. */
  teamCollaborationEnabled: boolean
  /** Server-resolved owner entitlement for negotiable offer authoring/execution. */
  negotiationEnabled: boolean
  /** Page-scoped Shopify connection resolved from service-only storage. */
  shopifyConnection: {
    kind: Exclude<ShopifyConnectionKind, 'other'>
    lastSyncedAt: string | null
  } | null
}

export type ShopifyConnectionKind = 'oauth' | 'token' | 'other'

export function resolveShopifyIntegrationStatus(
  connection: EditorInitial['shopifyConnection'],
  browserMarker: { present: boolean; lastImport: string | null },
): IntegrationStatus['shopify'] | undefined {
  if (connection) {
    return {
      kind: connection.kind,
      lastImport: connection.lastSyncedAt ?? browserMarker.lastImport,
    }
  }
  return browserMarker.present
    ? { kind: 'other', lastImport: browserMarker.lastImport }
    : undefined
}

export function shopifyConnectionCanSync(kind: ShopifyConnectionKind | undefined, premiumActive: boolean): boolean {
  return kind === 'oauth' || (kind === 'token' && premiumActive)
}

/** Live integration status. Shopify's kind is server-authoritative; `other`
 * represents a legacy/public one-off import marker, never a live connection. */
export type IntegrationStatus = {
  calendly?: { lastSync: string; maskedToken: string }
  stripe?: { lastImport: string }
  shopify?: { lastImport: string | null; kind: ShopifyConnectionKind }
  square?: { lastImport: string }
  acuity?: { lastImport: string }
}

/** Integrations that support an in-editor re-sync. */
export type ResyncProvider = 'calendly' | 'stripe' | 'shopify' | 'square' | 'acuity'

/** A staged re-analysis awaiting the user's Apply / Add-new / Cancel decision. */
export type PendingReanalysis = {
  incomingServices: OfferItem[]
  incomingProducts: OfferItem[]
  summary: string
}
