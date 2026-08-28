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

export const PLATFORM_DOCS_REVIEWED_AT = '2026-08-25'
export const PLATFORM_DOCS_VERSION = '1.1'

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
    definition: 'A bounded buyer step: search, validate, contact, book, checkout, negotiate, approve, settle, review, or request support.',
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
        summary: 'Pro owners can invite collaborators to edit listing content and listing-scoped configuration under the owner plan without transferring ownership or exposing unrelated workspace data; retained access stays visible for revocation after a downgrade.',
        details: ['Pro email-based invitations, acceptance, and role changes', 'Owner-only account and storefront administration, transaction decisions, money movement, negotiation lifecycle, and final approvals', 'Plan and seat enforcement with downgrade cleanup preserved'],
        surfaces: ['Platform Settings', 'Team invitations', 'Listing collaboration'],
      },
      {
        name: 'Storefronts and multi-listing portfolios',
        availability: 'Core',
        summary: 'Every plan includes core storefront grouping and listing assignment; plan quotas control additional storefronts, while custom branding and Nexez badge removal begin on Launch.',
        details: ['Core listing grouping, assignment, and public storefront views', 'Plan-based storefront capacity, starting with one on Free and Launch', 'Launch shared branding and badge removal with listing-level control'],
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
        summary: 'Manual authoring, templates, reviewed catalog files, and deterministic website import are core; deeper AI-assisted scanning starts on Launch, while premium catalog and scheduling imports start on Pro.',
        details: ['Core manual, template, CSV, TSV, TXT, JSON, XLS, XLSX, and deterministic website-import paths', 'Launch AI refinement and deeper authenticated scanning', 'Pro premium imports, with the installed Shopify App Store connector available on every plan'],
        surfaces: ['Create Listing', 'Scan', 'Tools'],
      },
      {
        name: 'Structured visual offer builder',
        availability: 'Core',
        summary: 'Services and products are core editable records with fixed pricing, actions, booking, scope, and fulfillment rules; negotiable posture and paid pricing automation start on Pro.',
        details: ['Core fixed, starting, ranged, tiered, and quote pricing', 'Core booking, checkout, contact, scope, availability, blackout, capacity, and lead-time controls', 'Pro negotiation posture and paid pricing or auto-decision rules'],
        surfaces: ['Edit Listing', 'Offer builder', 'Listing Settings'],
      },
      {
        name: 'AI-assisted refinement and controlled drafts',
        availability: 'Plan-controlled',
        summary: 'Drafts, version history, duplication, and staged publishing remain core; Launch adds AI assistance for descriptions, pricing structure, FAQs, voice, trust context, and competitor positioning.',
        details: ['Core draft, version-history, duplication, and staged-publishing controls', 'Launch per-listing opt-in for model assistance', 'Before-and-after review rather than blind replacement'],
        surfaces: ['AI Co-Pilot', 'Re-analysis preview', 'Versions & History'],
      },
      {
        name: 'Advanced offer contracts',
        availability: 'Core',
        summary: 'Every plan can encode recurring services, conditional fulfillment, reservable resources, and staged settlement obligations when a simple checkout is not enough.',
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
        summary: 'Core readiness and trust context cover completeness, website verification, private credential storage, freshness, and runtime evidence; Launch adds automated credential review.',
        details: ['Core readiness and trust scores with actionable gaps', 'Core website ownership, crawlability checks, credential upload, and explicit public-display choice', 'Launch automated credential review, which remains descriptive rather than a trust guarantee'],
        surfaces: ['Listing Settings', 'Agent Lab', 'Public listing'],
      },
      {
        name: 'Public listing and custom-domain delivery',
        availability: 'Core',
        summary: 'Published Nexez listings, storefront delivery, and the installed Shopify app proxy are core; verified custom-domain routing and custom presentation begin on Launch.',
        details: ['Drafts remain private until explicit publication', 'Core Nexez runtime, storefront, and installed Shopify proxy delivery', 'Launch domain verification, custom routing, and presentation controls'],
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
        summary: 'Core simulation lets every plan test owner drafts, inspect structured responses, and retain attributable history; Launch adds model-enhanced responses.',
        details: ['Core owner-only draft testing and deterministic agent lenses', 'Core structured response views and durable run evidence without executing a transaction', 'Launch model-enhanced natural-language simulation'],
        surfaces: ['Agent Lab', 'Per-listing simulator', 'Saved runs'],
      },
      {
        name: 'URL and competitor research',
        availability: 'Plan-controlled',
        summary: 'Launch unlocks private merchant URL research, competitor benchmarks, saved reports, and trends; the public buyer simulator and marketplace matching remain a core platform-funded discovery exception.',
        details: ['Core public buyer simulation and public-marketplace matching', 'Launch private public-web analysis, owned-listing comparison, and recommendations', 'Launch saved reports, history, and trend deltas'],
        surfaces: ['Agent Lab research', 'Competitor comparison', 'Platform Settings operations'],
      },
    ],
  },
  {
    id: 'commerce',
    number: '05',
    title: 'Commerce, negotiation, and fulfillment',
    promise: 'The platform supports the full range from a direct handoff to negotiated, resource-bound, recurring, or staged transactions, with approval before side effects.',
    capabilities: [
      {
        name: 'Direct checkout and agentic checkout protocols',
        availability: 'Core',
        summary: 'Every plan supports offer-specific checkout for Stripe-connected sellers and protocol-compatible agent sessions while keeping immutable price and fee evidence.',
        details: ['Dry-run validation before session creation', 'ACP and UCP checkout-session contracts', 'Orders, receipts, buyer references, refunds, disputes, and reviews'],
        surfaces: ['Checkout', 'ACP/UCP APIs', 'Orders'],
      },
      {
        name: 'Negotiation and seller decisioning',
        availability: 'Plan-controlled',
        summary: 'Pro unlocks new proposals, counteroffers, clarification, resumption, and smart-pricing rules; after a downgrade, sellers can still close, settle, cancel, or refund retained deals.',
        details: ['Pro offer-specific negotiation posture, pricing rules, and commercial expansion', 'Retained buyer and seller history plus status inspection on every plan', 'Post-downgrade accept, reject, pause, settlement, cancellation, refund, and cleanup paths'],
        surfaces: ['Negotiation Inbox', 'Negotiation API', 'Agreement receipt'],
      },
      {
        name: 'Escrow, staged settlement, and agreements',
        availability: 'Core',
        summary: 'Every plan can fund holds, define obligations, wait for readiness, capture settlement, or reverse funds with durable provenance.',
        details: ['Escrow lifecycle and reconciliation', 'Staged settlement agreements and obligations', 'Recurring service agreement checkout and access'],
        surfaces: ['Finance', 'Negotiations', 'Service agreements', 'Settlement runtime'],
      },
      {
        name: 'Resource-aware booking and fulfillment',
        availability: 'Core',
        summary: 'Every plan can model finite inventory, staff, rooms, equipment, or time windows as reservable resources with controlled holds and allocation.',
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
        summary: 'Every plan receives a current 30-day analytics view of human traffic, agents, discovery, intent, handoffs, checkout attempts, bookings, and trusted server events; Pro unlocks longer history.',
        details: ['Core 30-day listing, action, traffic, query, and date analysis', 'Pro extended history with daily trends, agent mix, funnel, and offer performance', 'CSV export and event provenance coverage'],
        surfaces: ['Analytics', 'Dashboard overview', 'Exports'],
      },
      {
        name: 'Negotiation operations reporting',
        availability: 'Plan-controlled',
        summary: 'Pro expands negotiation decisioning and reporting, while retained queue visibility and the controls required to finish or unwind in-flight deals remain available after a downgrade.',
        details: ['Retained needs-action, waiting, and closed queues', 'Pro decision expansion, latency, and worker-health reporting', 'Retained status and settlement evidence with Pro offer, outcome, and currency analysis'],
        surfaces: ['Negotiation Inbox', 'Negotiation metrics'],
      },
      {
        name: 'Finance and immutable economics',
        availability: 'Core',
        summary: 'Every plan receives current-period finance for settled orders, refunds, disputes, fees, seller net, payouts, settlement channels, and escrow; Pro unlocks extended history.',
        details: ['Core current-period currency-safe revenue and net totals', 'Core captured versus held or reversed value, with Pro extended history', 'Plan, fee rate, commission source, and transaction economics preserved at purchase time'],
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
        summary: 'Reviewed catalog files and the installed Shopify App Store connector are core; Pro adds Stripe, Square, WooCommerce, and ServiceM8 imports into editable offers.',
        details: ['Core CSV, TSV, TXT, JSON, XLS, and XLSX import with preview and column mapping, plus installed Shopify OAuth, listing link, catalog sync, and storefront proxy', 'Pro Stripe catalog plus Square OAuth catalog and booking-profile reads', 'Pro read-only WooCommerce product and order access, plus ServiceM8 job-template and job reads'],
        surfaces: ['Integrations', 'Tools', 'Per-listing Settings'],
      },
      {
        name: 'Scheduling and availability connections',
        availability: 'Plan-controlled',
        summary: 'Pro unlocks Calendly and Acuity service imports plus Google Calendar OAuth and live free/busy-derived availability; retained connections can still be disconnected after downgrade.',
        details: ['Pro Calendly event types, booking links, webhook receiver, and resync', 'Pro Google Calendar OAuth with narrow free/busy access, encrypted credentials, refresh, and live sync', 'Pro Acuity appointment-type catalog import through OAuth or encrypted legacy per-listing credentials, with cleanup preserved'],
        surfaces: ['Integrations', 'Availability', 'Booking operations'],
      },
      {
        name: 'Webhooks and freshness automation',
        availability: 'Plan-controlled',
        summary: 'Core signed provider callbacks and reconciliation keep commerce safe; Pro adds encrypted owner-configured webhooks compatible with Zapier Catch Hook, Make, n8n, and custom HTTPS receivers.',
        details: ['Core Stripe and installed-Shopify callback verification', 'Pro listing and account outbound endpoints, one-time or encrypted signing secrets, saved-endpoint tests, and durable retries', 'Core safety reconciliation for escrow, billing, settlement, and holds'],
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
        summary: 'Core public runtime APIs cover discovery and commerce; Pro API keys unlock private owner-management operations, while negotiation endpoints require the negotiation entitlement.',
        details: ['Core OpenAPI-described public discovery and commerce endpoints', 'Pro owner API keys and versioned listing-management APIs', 'Pro negotiation plus dry-run and status-token patterns for safe agent use'],
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
        details: ['Host-aware routing and no-index app behavior', 'Owner and collaborator row-level policies', 'Published listings use a restricted public projection rather than the private base table'],
        surfaces: ['nexez.ai', 'app.nexez.ai', 'nexez.app'],
      },
      {
        name: 'Credential and token protection',
        availability: 'Core',
        summary: 'Integration credentials and recoverable bearer tokens use server-only access and AES-256-GCM encrypted storage where recovery is required.',
        details: ['Encrypted Calendly, Shopify, Square, and Acuity credentials', 'Encrypted checkout access and negotiation status tokens', 'Webhook signature verification and narrow service-role access'],
        surfaces: ['Listing secrets', 'Checkout runtime', 'Webhook handlers'],
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
