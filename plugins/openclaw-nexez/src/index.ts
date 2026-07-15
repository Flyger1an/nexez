import { Type } from 'typebox'
import { defineToolPlugin } from 'openclaw/plugin-sdk/tool-plugin'
import {
  browseDirectory,
  getAgentPage,
  getNegotiationStatus,
  searchAgentPages,
  startCheckout,
  submitNegotiation,
  validateCheckout,
  validateNegotiation,
  waitForNegotiationDecision,
  type JsonValue,
  type NexezPluginConfig,
} from './nexez-client.js'

const configSchema = Type.Object({
  baseUrl: Type.Optional(Type.String({ description: 'Optional Nexez API base URL. Defaults to https://nexez.app.' })),
  userAgent: Type.Optional(Type.String({ description: 'Optional User-Agent sent to Nexez public endpoints.' })),
}, { additionalProperties: false })

const querySchema = Type.Object({
  query: Type.Optional(Type.String({ description: 'Buyer request, such as "strategy consultant under $3k".' })),
  location: Type.Optional(Type.String({ description: 'City, region, country, or service area.' })),
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 50, description: 'Maximum number of results.' })),
  lat: Type.Optional(Type.Number({ description: 'Optional buyer latitude.' })),
  lng: Type.Optional(Type.Number({ description: 'Optional buyer longitude.' })),
  category: Type.Optional(Type.Union([
    Type.Literal('all'),
    Type.Literal('professional'),
    Type.Literal('consumer'),
  ], { description: 'Marketplace category.' })),
  industry: Type.Optional(Type.String({ description: 'Industry or niche filter.' })),
  minReadiness: Type.Optional(Type.Number({ minimum: 0, maximum: 100, description: 'Minimum agent-readiness score.' })),
  minTrust: Type.Optional(Type.Number({ minimum: 0, maximum: 100, description: 'Minimum trust score.' })),
  verified: Type.Optional(Type.Boolean({ description: 'Require or exclude seller verification signals.' })),
  supportsCheckout: Type.Optional(Type.Boolean({ description: 'Require or exclude checkout-ready offers.' })),
  supportsNegotiation: Type.Optional(Type.Boolean({ description: 'Require or exclude negotiable offers.' })),
  priceBand: Type.Optional(Type.Union([
    Type.Literal('free'),
    Type.Literal('under_100'),
    Type.Literal('100_500'),
    Type.Literal('500_2000'),
    Type.Literal('2000_plus'),
    Type.Literal('custom'),
  ], { description: 'Marketplace price band.' })),
}, { additionalProperties: false })

const checkoutSchema = Type.Object({
  slug: Type.String({ description: 'Nexez page slug.' }),
  offer: Type.String({ description: 'Offer key, such as services-0 or products-0.' }),
  query: Type.Optional(Type.String({ description: 'Buyer request or context.' })),
  buyerEmail: Type.Optional(Type.String({ description: 'Buyer email, only after user approval.' })),
  buyerName: Type.Optional(Type.String({ description: 'Buyer name or organization, only after user approval.' })),
  buyerReference: Type.Optional(Type.String({ description: 'Optional buyer-side order/reference id.' })),
  buyerAgent: Type.Optional(Type.String({ description: 'Agent identifier. Defaults to openclaw.' })),
}, { additionalProperties: false })

const approvedCheckoutSchema = Type.Object({
  slug: Type.String({ description: 'Nexez page slug.' }),
  offer: Type.String({ description: 'Offer key, such as services-0 or products-0.' }),
  query: Type.Optional(Type.String({ description: 'Buyer request or context.' })),
  buyerEmail: Type.Optional(Type.String({ description: 'Buyer email, only after user approval.' })),
  buyerName: Type.Optional(Type.String({ description: 'Buyer name or organization, only after user approval.' })),
  buyerReference: Type.Optional(Type.String({ description: 'Optional buyer-side order/reference id.' })),
  buyerAgent: Type.Optional(Type.String({ description: 'Agent identifier. Defaults to openclaw.' })),
  approvalToken: Type.Optional(Type.String({ description: 'Short-lived token returned by nexez_validate_checkout for this exact action.' })),
  idempotencyKey: Type.Optional(Type.String({ minLength: 16, maxLength: 255, description: 'Stable retry key for this exact checkout action.' })),
  userApproved: Type.Boolean({ description: 'Must be true only after explicit user approval of business, offer, price, and contact details.' }),
}, { additionalProperties: false })

const requestedTermsSchema = Type.Record(Type.String(), Type.Unsafe<JsonValue>({}))

const negotiationSchema = Type.Object({
  slug: Type.String({ description: 'Nexez page slug.' }),
  offer: Type.String({ description: 'Offer key, such as services-0 or products-0.' }),
  query: Type.Optional(Type.String({ description: 'Buyer request or context.' })),
  budget: Type.Optional(Type.String({ description: 'Buyer budget or price target.' })),
  timeline: Type.Optional(Type.String({ description: 'Desired start date, deadline, or delivery timeline.' })),
  contact: Type.Optional(Type.String({ description: 'Buyer contact info, only after user approval.' })),
  buyerAgent: Type.Optional(Type.String({ description: 'Agent identifier. Defaults to openclaw.' })),
  requestedTerms: Type.Optional(requestedTermsSchema),
  negotiationId: Type.Optional(Type.String({ description: 'Existing negotiation id when submitting a follow-up turn.' })),
  statusToken: Type.Optional(Type.String({ description: 'Private status token required for an existing negotiation.' })),
}, { additionalProperties: false })

const approvedNegotiationSchema = Type.Object({
  slug: Type.String({ description: 'Nexez page slug.' }),
  offer: Type.String({ description: 'Offer key, such as services-0 or products-0.' }),
  query: Type.Optional(Type.String({ description: 'Buyer request or context.' })),
  budget: Type.Optional(Type.String({ description: 'Buyer budget or price target.' })),
  timeline: Type.Optional(Type.String({ description: 'Desired start date, deadline, or delivery timeline.' })),
  contact: Type.Optional(Type.String({ description: 'Buyer contact info, only after user approval.' })),
  buyerAgent: Type.Optional(Type.String({ description: 'Agent identifier. Defaults to openclaw.' })),
  requestedTerms: Type.Optional(requestedTermsSchema),
  negotiationId: Type.Optional(Type.String({ description: 'Existing negotiation id when submitting a follow-up turn.' })),
  statusToken: Type.Optional(Type.String({ description: 'Private status token required for an existing negotiation.' })),
  approvalToken: Type.Optional(Type.String({ description: 'Short-lived token returned by nexez_validate_negotiation for this exact action.' })),
  idempotencyKey: Type.Optional(Type.String({ minLength: 16, maxLength: 255, description: 'Stable retry key for this exact negotiation turn.' })),
  userApproved: Type.Boolean({ description: 'Must be true only after explicit user approval of seller, offer, requested terms, budget, timeline, and contact details.' }),
}, { additionalProperties: false })

const negotiationStatusSchema = Type.Object({
  negotiationId: Type.String({ description: 'Negotiation id returned by nexez_submit_negotiation.' }),
  statusToken: Type.String({ description: 'Private bearer token returned once at negotiation creation. Never display or log it.' }),
}, { additionalProperties: false })

export default defineToolPlugin({
  id: 'nexez',
  name: 'Nexez',
  description: 'Discover AI-ready Nexez pages, inspect structured offers, and safely hand off checkout or negotiation intent.',
  configSchema,
  tools: (tool) => [
    tool({
      name: 'nexez_search',
      label: 'Search Nexez',
      description: 'Search published Nexez agent pages and offer-level actions by buyer intent and optional location.',
      parameters: querySchema,
      execute(params, config: NexezPluginConfig, context) {
        return searchAgentPages(params, config, context.signal)
      },
    }),
    tool({
      name: 'nexez_get_page',
      label: 'Get Nexez Page',
      description: 'Fetch the structured agent.json manifest for one Nexez page slug.',
      parameters: Type.Object({
        slug: Type.String({ description: 'Nexez page slug.' }),
      }, { additionalProperties: false }),
      execute(params, config: NexezPluginConfig, context) {
        return getAgentPage(params, config, context.signal)
      },
    }),
    tool({
      name: 'nexez_directory',
      label: 'Browse Nexez Directory',
      description: 'Browse Nexez directory results with category, readiness, query, and location filters.',
      parameters: Type.Object({
        query: Type.Optional(Type.String({ description: 'Optional text query.' })),
        location: Type.Optional(Type.String({ description: 'City, region, country, or service area.' })),
        category: Type.Optional(Type.Union([
          Type.Literal('all'),
          Type.Literal('professional'),
          Type.Literal('consumer'),
        ], { description: 'Directory category filter.' })),
        minReadiness: Type.Optional(Type.Number({ minimum: 0, maximum: 100, description: 'Minimum readiness score.' })),
        lat: Type.Optional(Type.Number({ description: 'Optional buyer latitude.' })),
        lng: Type.Optional(Type.Number({ description: 'Optional buyer longitude.' })),
      }, { additionalProperties: false }),
      execute(params, config: NexezPluginConfig, context) {
        return browseDirectory(params, config, context.signal)
      },
    }),
    tool({
      name: 'nexez_get_negotiation_status',
      label: 'Get Nexez Negotiation Status',
      description: 'Read the latest decision for a submitted negotiation using its private status credential.',
      parameters: negotiationStatusSchema,
      execute(params, config: NexezPluginConfig, context) {
        return getNegotiationStatus(params, config, context.signal)
      },
    }),
    tool({
      name: 'nexez_wait_for_negotiation_decision',
      label: 'Wait for Nexez Negotiation Decision',
      description: 'Poll a submitted negotiation until its asynchronous seller decision is ready or the bounded wait expires.',
      parameters: Type.Object({
        negotiationId: Type.String({ description: 'Negotiation id returned by nexez_submit_negotiation.' }),
        statusToken: Type.String({ description: 'Private bearer token returned once at negotiation creation. Never display or log it.' }),
        timeoutMs: Type.Optional(Type.Number({ minimum: 1, maximum: 300000, description: 'Overall wait deadline in milliseconds. Defaults to 30000.' })),
        intervalMs: Type.Optional(Type.Number({ minimum: 1000, maximum: 30000, description: 'Polling interval in milliseconds. Defaults to 1000.' })),
      }, { additionalProperties: false }),
      execute(params, config: NexezPluginConfig, context) {
        return waitForNegotiationDecision(params, config, context.signal)
      },
    }),
    tool({
      name: 'nexez_validate_checkout',
      label: 'Validate Nexez Checkout',
      description: 'Dry-run a Nexez checkout handoff without creating a real checkout session. Returns the checkout preview, or { ok: false, reason } when the offer cannot be validated.',
      parameters: checkoutSchema,
      optional: true,
      execute(params, config: NexezPluginConfig, context) {
        return validateCheckout(params, config, context.signal)
      },
    }),
    tool({
      name: 'nexez_validate_negotiation',
      label: 'Validate Nexez Negotiation',
      description: 'Dry-run a Nexez negotiation request without submitting a real seller-facing proposal. Returns negotiation guidance, or { ok: false, reason } when the offer is not negotiable (use checkout instead).',
      parameters: negotiationSchema,
      optional: true,
      execute(params, config: NexezPluginConfig, context) {
        return validateNegotiation(params, config, context.signal)
      },
    }),
    tool({
      name: 'nexez_start_checkout',
      label: 'Start Nexez Checkout',
      description: 'Create a real Nexez checkout handoff only after explicit user approval.',
      parameters: approvedCheckoutSchema,
      optional: true,
      execute(params, config: NexezPluginConfig, context) {
        return startCheckout(params, config, context.signal)
      },
    }),
    tool({
      name: 'nexez_submit_negotiation',
      label: 'Submit Nexez Negotiation',
      description: 'Submit a real seller-facing Nexez negotiation only after explicit user approval.',
      parameters: approvedNegotiationSchema,
      optional: true,
      execute(params, config: NexezPluginConfig, context) {
        return submitNegotiation(params, config, context.signal)
      },
    }),
  ],
})
