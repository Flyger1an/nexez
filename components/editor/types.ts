import { AgentPage, OfferItem } from '../../lib/agent-page'

/** Checkout/event rows the editor surfaces (loosely typed, as in the original). */
export type EditorEvent = any

/** Initial editor data fetched server-side and handed to the client island. */
export type EditorInitial = {
  page: AgentPage
  recentCalendlyBookings: EditorEvent[]
  recentOutboundFires: EditorEvent[]
  trustEvents: EditorEvent[]
}

/** Live integration connection status (read from the same localStorage as Tools). */
export type IntegrationStatus = {
  calendly?: { lastSync: string; maskedToken: string }
  stripe?: { lastImport: string }
  shopify?: { lastImport: string }
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
