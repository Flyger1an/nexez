export type CapabilityAvailability = 'Core' | 'Plan-controlled' | 'Developer' | 'Admin-operated'

export type PlatformCapability = {
  name: string
  availability: CapabilityAvailability
  summary: string
  details: readonly string[]
  surfaces: readonly string[]
}

export type PlatformDocsChapter = {
  id: string
  number: string
  title: string
  promise: string
  capabilities: readonly PlatformCapability[]
}

export const PLATFORM_DOCS_REVIEWED_AT = '2026-08-22'
export const PLATFORM_DOCS_VERSION = '1.0'

export const platformPrimitives = [
  {
    name: 'Listing',
    definition: 'The public, owner-controlled business record that binds identity, offers, policies, trust context, and machine-readable artifacts.',
  },
  {
    name: 'Offer',
    definition: 'A service, product, package, recurring agreement, or reservable resource with explicit pricing, constraints, and a next action.',
  },
  {
    name: 'Action',
    definition: 'A bounded buyer step—search, validate, contact, book, checkout, negotiate, approve, settle, review, or request support.',
  },
  {
    name: 'Evidence',
    definition: 'The provenance, trust, readiness, analytics, and immutable economics that explain what happened and why the platform believes it.',
  },
] as const

export const platformLifecycle = [
  ['Understand intent', 'Natural-language buyer intent is classified without silently changing the requested category.'],
  ['Discover supply', 'Search, directory, agent artifacts, or Nexxi identify eligible listings and offer-level actions.'],
  ['Verify fit', 'Readiness, trust context, availability, policies, rules, and dry runs expose whether an action is safe and possible.'],
  ['Ask for approval', 'The buyer sees the seller, offer, price or terms, destination, shared data, and exact next side effect.'],
  ['Execute the action', 'The platform routes checkout, booking, contact, negotiation, resource holds, or agreements through the configured rail.'],
  ['Record and reconcile', 'Orders, fees, refunds, disputes, escrow, payouts, provenance, and analytics become durable operational records.'],
] as const

export const platformDocsChapters: readonly PlatformDocsChapter[] = [
  {
    id: 'workspace-foundation',
    number: '01',
    title: 'Workspace, identity, and portfolio foundation',
    promise: 'Nexez gives one owner or team a governed place to manage the business identity and every agent-facing surface attached to it.',
    capabilities: [
      {
        name: 'Workspace identity and account lifecycle',
        availability: 'Core',
        summary: 'Profile, company, industry, sign-in security, account export, and account deletion live behind the authenticated product boundary.',
        details: ['Owner-scoped profile and workspace settings', 'Passkey-ready account protection', 'Structured data export and deliberate account deletion'],
        surfaces: ['Platform Settings', 'Authentication', 'Data controls'],
      },
      {
        name: 'Teams and controlled collaboration',
        availability: 'Plan-controlled',
        summary: 'Owners can invite collaborators and grant listing access without transferring ownership or exposing unrelated workspace data.',
        details: ['Email-based invitations and acceptance', 'Owner and collaborator access boundaries', 'Seat and plan enforcement'],
        surfaces: ['Platform Settings', 'Team invitations', 'Listing collaboration'],
      },
      {
        name: 'Storefronts and multi-listing portfolios',
        availability: 'Core',
        summary: 'Storefronts group multiple listings under a shared public identity while each listing retains its own offers, domain, readiness, and commerce behavior.',
        details: ['Multiple storefront groups', 'Listing assignment and public storefront views', 'Shared branding with listing-level control'],
        surfaces: ['Platform Settings', 'Listings', 'Public storefronts'],
      },
    ],
  },
  {
    id: 'authoring',
    number: '02',
    title: 'Listing and offer authoring',
    promise: 'The editor turns scattered business context into explicit offers that both people and agents can understand without guessing.',
    capabilities: [
      {
        name: 'Guided creation, scanning, and import',
        availability: 'Core',
        summary: 'Start manually, scan a website, run a deeper authenticated scan, upload CSV data, or import from connected commerce and scheduling systems.',
        details: ['Website and deep scan flows', 'CSV and template starting points', 'Review-before-publish import behavior'],
        surfaces: ['Create Listing', 'Scan', 'Tools'],
      },
      {
        name: 'Structured visual offer builder',
        availability: 'Core',
        summary: 'Services and products are editable, reorderable records—not loose marketing copy—with offer-specific pricing, descriptions, actions, and fulfillment rules.',
        details: ['Fixed, starting, ranged, tiered, quote, and negotiable pricing', 'Offer-level booking, checkout, contact, and external handoffs', 'Service area, duration, availability, blackout, capacity, and lead-time controls'],
        surfaces: ['Edit Listing', 'Offer builder', 'Listing Settings'],
      },
      {
        name: 'AI-assisted refinement and controlled drafts',
        availability: 'Plan-controlled',
        summary: 'AI assistance can clarify descriptions, pricing structures, FAQs, schema, voice, memory, trust context, and competitor positioning without bypassing owner review.',
        details: ['Per-listing opt-in for model assistance', 'Before-and-after review rather than blind replacement', 'Draft, version history, duplication, and staged publishing'],
        surfaces: ['AI Co-Pilot', 'Re-analysis preview', 'Versions & History'],
      },
      {
        name: 'Advanced offer contracts',
        availability: 'Plan-controlled',
        summary: 'Offers can encode recurring services, conditional fulfillment, reservable resources, and staged settlement obligations when a simple checkout is not enough.',
        details: ['Recurring service terms and agreements', 'Conditional fulfillment branches and requirements', 'Resource pools, windows, holds, allocations, and reservations'],
        surfaces: ['Offer builder', 'Checkout runtime', 'Service agreements'],
      },
    ],
  },
  {
    id: 'readiness-publication',
    number: '03',
    title: 'Readiness, trust, and publication',
    promise: 'Publishing creates a synchronized human and machine surface, with explicit controls over what is public and evidence for whether it is actionable.',
    capabilities: [
      {
        name: 'Agent readiness and trust context',
        availability: 'Core',
        summary: 'Readiness measures completeness and actionability; trust context captures identity, freshness, website verification, credentials, and observed runtime evidence without presenting a guarantee.',
        details: ['Readiness and trust scores with actionable gaps', 'Website ownership and crawlability checks', 'Private credential review with explicit public-display choice'],
        surfaces: ['Listing Settings', 'Agent Lab', 'Public listing'],
      },
      {
        name: 'Public listing and custom-domain delivery',
        availability: 'Plan-controlled',
        summary: 'A published listing can live on the Nexez runtime, inside a storefront, through a verified custom domain, or through the Shopify app proxy.',
        details: ['Drafts remain private until explicit publication', 'Domain verification and live endpoint checks', 'Theme-aware public listing and storefront presentation'],
        surfaces: ['nexez.app listing', 'Storefront', 'Custom domain', 'Shopify proxy'],
      },
      {
        name: 'Machine-readable artifact set',
        availability: 'Core',
        summary: 'Each eligible listing is represented through synchronized formats so agents can choose the contract they understand best.',
        details: ['Semantic HTML and JSON-LD', 'agent.json, llms.txt, ai-catalog, OpenAPI, and MCP artifacts', 'Badge, embed, discovery, and capability manifests'],
        surfaces: ['Public runtime', 'Well-known endpoints', 'Per-listing artifacts'],
      },
    ],
  },
  {
    id: 'discovery-intelligence',
    number: '04',
    title: 'Discovery and Agent Lab intelligence',
    promise: 'Nexez connects buyer intent to eligible supply, then lets owners inspect how agents interpret that supply before relying on it.',
    capabilities: [
      {
        name: 'Intent-aware search and marketplace discovery',
        availability: 'Core',
        summary: 'Natural-language search preserves the requested category, evaluates listing and offer fit, and exposes public discovery through search, directory, and leaderboard surfaces.',
        details: ['Category-preserving search behavior', 'Location, readiness, and offer-aware filtering', 'Marketplace curation and discoverability controls'],
        surfaces: ['Agent search API', 'Discovery', 'Leaderboard'],
      },
      {
        name: 'Per-listing agent simulation',
        availability: 'Core',
        summary: 'Owners can test a listing against multiple agent perspectives, inspect natural-language and structured responses, and retain attributable run history.',
        details: ['Owner-only draft testing', 'Multiple agent lenses and response views', 'Durable simulation evidence without executing a transaction'],
        surfaces: ['Agent Lab', 'Per-listing simulator', 'Saved runs'],
      },
      {
        name: 'URL and competitor research',
        availability: 'Plan-controlled',
        summary: 'Agent Lab can inspect a public URL, benchmark a competitor, compare results with an owned listing, and preserve trend evidence over time.',
        details: ['Respectful public-web analysis', 'Score, strengths, weaknesses, and recommendations', 'Saved reports, history, and trend deltas'],
        surfaces: ['Agent Lab research', 'Competitor comparison', 'Platform Settings operations'],
      },
    ],
  },
  {
    id: 'commerce',
    number: '05',
    title: 'Commerce, negotiation, and fulfillment',
    promise: 'The platform supports the full range from a direct handoff to negotiated, resource-bound, recurring, or staged transactions—with approval before side effects.',
    capabilities: [
      {
        name: 'Direct checkout and agentic checkout protocols',
        availability: 'Plan-controlled',
        summary: 'Offer-specific checkout supports Stripe-connected sellers and protocol-compatible agent checkout sessions while keeping immutable price and fee evidence.',
        details: ['Dry-run validation before session creation', 'ACP and UCP checkout-session contracts', 'Orders, receipts, buyer references, refunds, disputes, and reviews'],
        surfaces: ['Checkout', 'ACP/UCP APIs', 'Orders'],
      },
      {
        name: 'Negotiation and seller decisioning',
        availability: 'Plan-controlled',
        summary: 'Agents can submit structured terms, budget, timeline, and contact context; seller rules and workers can accept, counter, reject, or escalate.',
        details: ['Offer-specific negotiation rules', 'Buyer and seller message history', 'Decision queue, latency metrics, status tokens, and payment handoff'],
        surfaces: ['Negotiation Inbox', 'Negotiation API', 'Agreement receipt'],
      },
      {
        name: 'Escrow, staged settlement, and agreements',
        availability: 'Plan-controlled',
        summary: 'Higher-complexity work can fund holds, define obligations, wait for readiness, capture settlement, or reverse funds with durable provenance.',
        details: ['Escrow lifecycle and reconciliation', 'Staged settlement agreements and obligations', 'Recurring service agreement checkout and access'],
        surfaces: ['Finance', 'Negotiations', 'Service agreements', 'Settlement runtime'],
      },
      {
        name: 'Resource-aware booking and fulfillment',
        availability: 'Plan-controlled',
        summary: 'Finite inventory, staff, rooms, equipment, or time windows can be modeled as reservable resources with controlled holds and allocation.',
        details: ['Resource pools and capacity windows', 'Pre-checkout holds and post-payment commitment', 'Expiration, reconciliation, and webhook provenance'],
        surfaces: ['Listing Settings', 'Resource checkout', 'Operations'],
      },
    ],
  },
  {
    id: 'analytics-finance',
    number: '06',
    title: 'Analytics, negotiations, and financial truth',
    promise: 'Owners can separate attention from action and estimated context from verified money, with exact RLS-scoped reporting for critical totals.',
    capabilities: [
      {
        name: 'Traffic, intent, and action analytics',
        availability: 'Core',
        summary: 'Analytics distinguish human traffic, detected agents, directory discovery, classified intent, handoffs, checkout attempts, bookings, and trusted server events.',
        details: ['Listing, action, traffic, query, and date filters', 'Daily trends, agent mix, funnel, and offer performance', 'CSV export and event provenance coverage'],
        surfaces: ['Analytics', 'Dashboard overview', 'Exports'],
      },
      {
        name: 'Negotiation operations reporting',
        availability: 'Plan-controlled',
        summary: 'Decision throughput, backlog, status lifecycle, latency, value, and currency reporting make negotiation work operational rather than anecdotal.',
        details: ['Needs-action and waiting queues', 'Decision latency and worker health', 'Offer, status, outcome, and currency breakdowns'],
        surfaces: ['Negotiation Inbox', 'Negotiation metrics'],
      },
      {
        name: 'Finance and immutable economics',
        availability: 'Plan-controlled',
        summary: 'Finance reports live-mode settled orders, refunds, disputes, platform fees, seller net, payouts, settlement channels, and escrow without mixing them with subscription billing.',
        details: ['Currency-safe revenue and net totals', 'Captured versus held or reversed value', 'Plan, fee rate, commission source, and transaction economics preserved at purchase time'],
        surfaces: ['Finance', 'Billing', 'Stripe reconciliation'],
      },
      {
        name: 'Demand and supply intelligence',
        availability: 'Admin-operated',
        summary: 'Aggregated demand signals, template coverage, marketplace gaps, and launch controls help Nexez improve supply without changing an individual buyer request.',
        details: ['Demand-signal classification', 'Commerce-template gap analysis', 'Marketplace curation and supply campaigns'],
        surfaces: ['Admin Control', 'Growth Control', 'Marketplace curation'],
      },
    ],
  },
  {
    id: 'integrations-automation',
    number: '07',
    title: 'Integrations and automation',
    promise: 'Connected systems reduce stale data while preserving a reviewable listing model and narrow credential boundaries.',
    capabilities: [
      {
        name: 'Commerce and catalog connections',
        availability: 'Plan-controlled',
        summary: 'Stripe, Shopify, Square, and CSV flows import products, services, prices, and source links into editable offers.',
        details: ['Stripe catalog import', 'Shopify install, listing link, catalog sync, and storefront proxy', 'Square and CSV offer import'],
        surfaces: ['Integrations', 'Tools', 'Per-listing Settings'],
      },
      {
        name: 'Scheduling and availability connections',
        availability: 'Plan-controlled',
        summary: 'Calendly, Google Calendar, and Acuity flows can import service context and availability without publishing private calendar details.',
        details: ['Calendly event types, booking links, webhook receiver, and resync', 'Google Calendar availability windows', 'Acuity service import and encrypted per-listing credentials'],
        surfaces: ['Integrations', 'Availability', 'Booking operations'],
      },
      {
        name: 'Webhooks and freshness automation',
        availability: 'Developer',
        summary: 'Signed inbound events and owner-configured outbound endpoints keep availability, booking, order, and integration state moving through explicit automation paths.',
        details: ['Stripe, Shopify, and Calendly webhook verification', 'Outbound owner webhooks and test delivery', 'Scheduled freshness, availability, negotiation, escrow, billing, and hold reconciliation'],
        surfaces: ['Developer tools', 'Cron operations', 'Integration status'],
      },
    ],
  },
  {
    id: 'buyer-agent',
    number: '08',
    title: 'Nexxi buyer agent and approval boundary',
    promise: 'Nexxi turns intent into a persistent buyer workflow while keeping approval between recommendation and any consequential action.',
    capabilities: [
      {
        name: 'Conversational intake and semantic discovery',
        availability: 'Core',
        summary: 'Buyer conversations can capture constraints, search internal and external sources, rank matches, and preserve the original request across a thread.',
        details: ['Threaded intake and structured constraint capture', 'Semantic search and external source adapters', 'Saved businesses, searches, and preferences'],
        surfaces: ['Nexxi', 'Agent intake', 'Search'],
      },
      {
        name: 'Tasks, alerts, and order continuity',
        availability: 'Core',
        summary: 'Standing tasks, saved-search alerts, notifications, and token-gated order views let buyer work continue beyond a single chat response.',
        details: ['Agent tasks and saved-search monitoring', 'Push and in-product notifications', 'Buyer order lookup, status requests, reviews, and recourse'],
        surfaces: ['Nexxi tasks', 'Notifications', 'Buyer order portal'],
      },
      {
        name: 'Explicit buyer approval',
        availability: 'Developer',
        summary: 'Checkout, negotiation, booking, contact sharing, and other side effects require a clear approval object or equivalent human confirmation.',
        details: ['Seller, offer, terms, price, destination, and data-to-share are visible', 'Dry runs are allowed before approval; real side effects are not', 'Approval recovery prevents an interrupted flow from silently executing later'],
        surfaces: ['Buyer approval UX', 'Agent SDKs', 'Nexxi action cards'],
      },
    ],
  },
  {
    id: 'developer-distribution',
    number: '09',
    title: 'Developer contracts and agent distribution',
    promise: 'Nexez is both a product and a protocol surface: builders can discover supply, validate actions, and integrate through published contracts instead of scraping UI.',
    capabilities: [
      {
        name: 'Public discovery and management APIs',
        availability: 'Developer',
        summary: 'Public runtime APIs cover search, directory, listings, checkout, negotiation, resources, ACP, UCP, and health; authenticated APIs cover owner management and operations.',
        details: ['OpenAPI-described public endpoints', 'Owner API keys and versioned page APIs', 'Dry-run and status-token patterns for safe agent use'],
        surfaces: ['REST APIs', 'OpenAPI', 'Developer tools'],
      },
      {
        name: 'SDKs, plugins, skills, and examples',
        availability: 'Developer',
        summary: 'Published TypeScript and Python SDKs, an OpenClaw plugin, a discovery skill, and mirrored examples accelerate correct integration behavior.',
        details: ['TypeScript and Python package parity checks', 'Native agent plugin and discovery skill', 'Examples for search, validation, approval, location, and negotiation'],
        surfaces: ['Agent Access', 'npm', 'PyPI', 'GitHub examples'],
      },
      {
        name: 'MCP, ARD, and capability discovery',
        availability: 'Developer',
        summary: 'Global and per-listing MCP surfaces, Agentic Resource Discovery catalogs, agent cards, and capability manifests make the platform indexable by agent registries.',
        details: ['Global MCP catalog and listing resources', 'Well-known ai-catalog and agent-card documents', 'Cross-origin artifact access designed for machine clients'],
        surfaces: ['MCP', 'ARD catalog', 'Well-known manifests'],
      },
    ],
  },
  {
    id: 'security-operations',
    number: '10',
    title: 'Security, reliability, and platform operations',
    promise: 'Public discovery is separated from private control, recoverable secrets are encrypted, and critical runtime behavior is verified by layered operational checks.',
    capabilities: [
      {
        name: 'Host, auth, and data boundaries',
        availability: 'Core',
        summary: 'Marketing, authenticated app, and public agent runtime routes have distinct canonical hosts; owner data is protected by authentication, RLS, and deliberate public projections.',
        details: ['Host-aware routing and no-index app behavior', 'Owner and collaborator row-level policies', 'Published pages use a restricted public projection rather than the private base table'],
        surfaces: ['nexez.ai', 'app.nexez.ai', 'nexez.app'],
      },
      {
        name: 'Credential and token protection',
        availability: 'Core',
        summary: 'Integration credentials and recoverable bearer tokens use server-only access and AES-256-GCM encrypted storage where recovery is required.',
        details: ['Encrypted Calendly, Shopify, Square, and Acuity credentials', 'Encrypted checkout access and negotiation status tokens', 'Webhook signature verification and narrow service-role access'],
        surfaces: ['Page secrets', 'Checkout runtime', 'Webhook handlers'],
      },
      {
        name: 'Release, reconciliation, and launch controls',
        availability: 'Admin-operated',
        summary: 'Automated tests, release certification, launch health, reconciliation jobs, and admin control surfaces catch drift before or after it reaches production.',
        details: ['Full CI, E2E, SDK, plugin, and deployment verification', 'Billing, escrow, resource, freshness, and settlement reconciliation', 'Admin audit, launch health, growth, and curation controls'],
        surfaces: ['CI/CD', 'Admin Control', 'Scheduled operations'],
      },
      {
        name: 'Support and user recourse',
        availability: 'Core',
        summary: 'AI-assisted support can resolve common issues or package workspace context into a ticket, while buyers retain order-status, review, and request paths.',
        details: ['Workspace-aware support assistance', 'Human support ticket escalation', 'Buyer order recourse and owner refund controls'],
        surfaces: ['Support', 'Buyer order portal', 'Orders'],
      },
    ],
  },
] as const

export const platformTrustDestinations = [
  { label: 'Agent readiness', href: '/agent-readiness', summary: 'How Nexez measures whether a listing can be understood, verified, and acted on.' },
  { label: 'Agent access', href: '/agents', summary: 'SDKs, plugins, skills, endpoints, artifacts, and the safe agent workflow.' },
  { label: 'Integrations', href: '/integrations', summary: 'Current catalog, scheduling, payment, import, and webhook connections.' },
  { label: 'Developers', href: '/developers', summary: 'The public contracts for discovery, validation, commerce, and management.' },
  { label: 'Buyer approval UX', href: '/developers/buyer-approval', summary: 'The consent boundary before money, contact, booking, or terms move.' },
  { label: 'Security', href: '/security', summary: 'The platform boundary, data model, credential handling, and operational controls.' },
  { label: 'Compare', href: '/compare', summary: 'Where Nexez fits beside websites, directories, integrations, and commerce tools.' },
  { label: 'Enterprise', href: '/enterprise', summary: 'How teams govern portfolios, collaboration, domains, data, and transaction terms.' },
] as const

export function platformCapabilityCount() {
  return platformDocsChapters.reduce((total, chapter) => total + chapter.capabilities.length, 0)
}
