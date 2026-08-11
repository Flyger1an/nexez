import { appUrl, agentRuntimeUrl } from './site'
import type { CreateTemplateId } from './create-page-templates'

export type MarketingCta = {
  label: string
  href: string
}

export type MarketingStat = {
  value: string
  label: string
}

export type MarketingCard = {
  title: string
  copy: string
}

export type MarketingSection = {
  eyebrow?: string
  title: string
  copy: string
  cards?: MarketingCard[]
}

export type MarketingPageContent = {
  slug: string
  eyebrow: string
  title: string
  accent: string
  description: string
  primaryCta: MarketingCta
  secondaryCta?: MarketingCta
  stats?: MarketingStat[]
  visualTitle: string
  visualItems: string[]
  sections: MarketingSection[]
  faq?: MarketingCard[]
  finalCtaTitle: string
  finalCtaCopy: string
}

export const marketingPages: Record<string, MarketingPageContent> = {
  'how-it-works': {
    slug: 'how-it-works',
    eyebrow: 'How it works',
    title: 'Your website is for people.',
    accent: 'Your Nexez listing is for agents.',
    description:
      'Nexez turns the useful parts of your business website into a separate, lightweight listing AI agents can read, compare, and act on. Your main site stays human-first. Your listing becomes the clean source of truth.',
    primaryCta: { label: 'Create your first listing', href: appUrl('/create') },
    secondaryCta: { label: 'Test the simulator', href: '/simulator' },
    stats: [
      { value: '01', label: 'Import or enter offers' },
      { value: '02', label: 'Optimize for agents' },
      { value: '03', label: 'Publish and measure' },
    ],
    visualTitle: 'From website noise to agent clarity',
    visualItems: [
      'Pull services, products, prices, FAQs, and availability into one editable profile.',
      'Generate structured outputs agents already understand: schema, llms.txt, agent.json, and MCP.',
      'Track agent visits, buyer queries, handoffs, bookings, and readiness over time.',
    ],
    sections: [
      {
        eyebrow: 'Step 1',
        title: 'Start from what already exists.',
        copy:
          'Import from your website, CSV, Calendly, Stripe, Shopify, Square, or enter offers by hand. Nexez helps clean the raw material into short, purchasable services and products.',
        cards: [
          { title: 'Website importer', copy: 'Extracts offers and descriptions without asking users to start from a blank screen.' },
          { title: 'Guided builder', copy: 'Keeps the listing structured while still giving non-technical users plain language controls.' },
          { title: 'Manual control', copy: 'Every imported field can be reviewed, rewritten, reordered, or removed before publish.' },
        ],
      },
      {
        eyebrow: 'Step 2',
        title: 'Shape the listing for agent decisions.',
        copy:
          'Listings avoid the usual marketing-site mess: heavy scripts, vague CTAs, scattered pricing, and copy that hides the next step. Nexez makes the offer model explicit enough for a buying assistant to recommend.',
        cards: [
          { title: 'Clear offers', copy: 'Services, products, packages, retainers, and bookings are separated into predictable blocks.' },
          { title: 'Direct actions', copy: 'Each offer can point to booking, checkout, contact, negotiation, or external handoff.' },
          { title: 'Readiness scoring', copy: 'A practical score tells users what is missing before agents start judging the listing.' },
        ],
      },
      {
        eyebrow: 'Step 3',
        title: 'Publish a fast public listing agents can crawl.',
        copy:
          'The published listing lives on a Nexez link, a custom domain, or the public agent runtime. It stays clean, crawlable, and linked back to the main website.',
        cards: [
          { title: 'Human preview', copy: 'The listing is still readable by people who need to inspect the offer quickly.' },
          { title: 'Agent artifacts', copy: 'Nexez emits structured files and manifests alongside the visual listing.' },
          { title: 'Analytics loop', copy: 'Visits, agent type, search intent, and conversion handoffs feed back into the dashboard.' },
        ],
      },
    ],
    faq: [
      { title: 'Does this replace my website?', copy: 'No. Nexez complements your website with a focused agent-facing listing that links back to your main brand.' },
      { title: 'Do I need technical setup?', copy: 'No. You can launch with a Nexez link first, then add custom domains, API keys, and integrations when ready.' },
      { title: 'Why not just add schema to my existing site?', copy: 'Schema helps, but it does not remove bloat, unclear actions, or scattered buying context. Nexez gives agents a clean target.' },
    ],
    finalCtaTitle: 'Give agents the listing your website was never designed to be.',
    finalCtaCopy: 'Start simple: one listing, a few offers, clean structure, and a measurable agent discovery loop.',
  },
  examples: {
    slug: 'examples',
    eyebrow: 'Examples and templates',
    title: 'Start with the listing shape',
    accent: 'agents already want.',
    description:
      'Use these templates as starting points for services, retainers, bookings, local work, SaaS implementation, and productized offers. Each one is built around a buyer intent, not a decorative landing page section.',
    primaryCta: { label: 'Use a template', href: appUrl('/create?template=consulting') },
    secondaryCta: { label: 'Browse live listings', href: '/discovery' },
    stats: [
      { value: '9', label: 'Launch-ready patterns' },
      { value: '5', label: 'Offer models covered' },
      { value: '1', label: 'Source of truth' },
    ],
    visualTitle: 'Template logic',
    visualItems: [
      'Position the buyer problem in one plain-language paragraph.',
      'List offers with scope, price signal, duration, and next action.',
      'Add FAQs that remove friction before the agent recommends or buys.',
    ],
    sections: [
      {
        eyebrow: 'Professional services',
        title: 'For people selling expertise.',
        copy:
          'Consultants, coaches, agencies, accountants, attorneys, and advisors need offers agents can compare quickly. The best template states who it is for, what is included, and how to start.',
        cards: [
          { title: 'Strategy session', copy: 'One-time advisory call with duration, expected outcome, calendar link, and price.' },
          { title: 'Monthly retainer', copy: 'Recurring support with scope, response time, reporting cadence, and starting price.' },
          { title: 'Fixed audit', copy: 'Defined diagnostic package with deliverables, timeline, and checkout or proposal request.' },
        ],
      },
      {
        eyebrow: 'Local services',
        title: 'For businesses agents may book on behalf of a person.',
        copy:
          'Local service listings should make eligibility, availability, service area, pricing, and booking steps obvious. Agents should not have to infer whether the business can help.',
        cards: [
          { title: 'Home services', copy: 'Service area, emergency availability, common jobs, estimate rules, and phone fallback.' },
          { title: 'Wellness bookings', copy: 'Session types, location rules, prep notes, cancellation policy, and calendar action.' },
          { title: 'Events and rentals', copy: 'Package options, capacity, add-ons, deposit terms, and quote request path.' },
        ],
      },
      {
        eyebrow: 'Products and tools',
        title: 'For offers that need direct purchase context.',
        copy:
          'Productized listings work best when they include plain descriptions, price ranges, compatibility notes, inventory or availability signals, and a direct buy action.',
        cards: [
          { title: 'Digital product', copy: 'What it solves, format, access method, refund policy, and purchase button.' },
          { title: 'Implementation package', copy: 'Software setup, onboarding scope, estimated timeline, and handoff requirements.' },
          { title: 'Bulk order', copy: 'Minimums, lead time, contact path, and structured details agents can pass to procurement.' },
        ],
      },
    ],
    faq: [
      { title: 'Can templates import my real site?', copy: 'Yes. Start with importer output, then apply a template structure to tighten the offers.' },
      { title: 'Can I create multiple listings?', copy: 'Yes. Listings can target different industries, regions, offer lines, or buyer intents.' },
      { title: 'Do examples affect live ranking?', copy: 'No. They are starting points. Real readiness depends on your published structure and completeness.' },
    ],
    finalCtaTitle: 'Make your offer obvious before an agent has to guess.',
    finalCtaCopy: 'Pick a template, import your services, and publish a clean listing agents can act on.',
  },
  security: {
    slug: 'security',
    eyebrow: 'Security and trust',
    title: 'Built for public discovery',
    accent: 'without losing control.',
    description:
      'Listings are intentionally public, but the platform behind them needs strong boundaries. Nexez separates marketing, authenticated app, and public agent runtime surfaces so each part has the right security posture.',
    primaryCta: { label: 'Review storefront settings', href: appUrl('/dashboard/settings') },
    secondaryCta: { label: 'Read platform docs', href: '/developers' },
    stats: [
      { value: '3', label: 'Separated domains' },
      { value: 'RLS', label: 'Database access model' },
      { value: 'SSL', label: 'Custom domain checks' },
    ],
    visualTitle: 'Trust model',
    visualItems: [
      'nexez.ai handles public education and discovery.',
      'app.nexez.ai handles authenticated creation, billing, and settings.',
      'nexez.app handles crawlable listings, manifests, checkout, and agent APIs.',
    ],
    sections: [
      {
        eyebrow: 'Platform boundaries',
        title: 'The public listing is not the private dashboard.',
        copy:
          'Public listings expose only the business information users choose to publish. Authenticated settings, billing, API keys, drafts, imports, and analytics stay inside the product surface.',
        cards: [
          { title: 'Auth-gated controls', copy: 'Sensitive dashboard routes require a signed-in user and server-side checks.' },
          { title: 'Publish intent', copy: 'Only published listings and public artifacts are served to crawlers.' },
          { title: 'Host-aware routing', copy: 'Marketing, app, and agent runtime routes resolve to their intended domains.' },
        ],
      },
      {
        eyebrow: 'Payments and integrations',
        title: 'External systems stay scoped.',
        copy:
          'Stripe, Calendly, Shopify, Square, and API access are treated as integration surfaces with explicit tokens, webhook paths, and user-controlled connection states.',
        cards: [
          { title: 'Stripe readiness', copy: 'Billing and platform fees are separated from public listing browsing.' },
          { title: 'Webhook hygiene', copy: 'Webhook secrets live in environment variables, not in public client code.' },
          { title: 'Connection visibility', copy: 'Users can see integration state and imported data before publishing.' },
        ],
      },
      {
        eyebrow: 'Crawlability controls',
        title: 'Open where it matters, controlled where it counts.',
        copy:
          'Agent-facing listings are designed to be found. App routes are designed to stay out of search. Robots, sitemaps, and public manifests follow that split.',
        cards: [
          { title: 'Agent-friendly robots', copy: 'Public runtime welcomes major AI crawlers and standard search bots.' },
          { title: 'No-index app host', copy: 'Authenticated product surfaces are kept out of search indexes.' },
          { title: 'Structured artifacts', copy: 'llms.txt, agent.json, OpenAPI, and MCP artifacts make machine access explicit.' },
        ],
      },
    ],
    faq: [
      { title: 'Will unpublished listings be crawled?', copy: 'No. The public runtime is built around published records and explicit public artifacts.' },
      { title: 'Can users verify custom domains?', copy: 'Yes. Custom domains use verification checks before they are marked live.' },
      { title: 'Where do my API keys and secrets live?', copy: 'Server-side only. Secrets never appear in public listings, client code, or crawlable artifacts.' },
    ],
    finalCtaTitle: 'Public to agents. Private where it should be.',
    finalCtaCopy: 'Nexez gives businesses a discoverable public surface without turning the dashboard into a public target.',
  },
  integrations: {
    slug: 'integrations',
    eyebrow: 'Integrations',
    title: 'Connect the tools that already',
    accent: 'hold your buying context.',
    description:
      'Nexez works best when it can pull real offers, availability, payments, and product data from the systems your business already uses. Start manual, then connect the sources that reduce upkeep.',
    primaryCta: { label: 'Open integrations', href: appUrl('/dashboard/integrations') },
    secondaryCta: { label: 'Create a listing', href: appUrl('/create') },
    stats: [
      { value: '6+', label: 'Core import paths' },
      { value: 'CSV', label: 'No-code fallback' },
      { value: 'API', label: 'Developer-ready' },
    ],
    visualTitle: 'Integration sources',
    visualItems: [
      'Calendly and Google Calendar help describe availability and booking windows.',
      'Stripe and Square help shape products, pricing, quotes, and payment paths.',
      'Shopify, CSV, and website importers help turn catalogs into agent-readable offers.',
    ],
    sections: [
      {
        eyebrow: 'Scheduling',
        title: 'Make bookable services obvious.',
        copy:
          'Agents need to know whether a buyer can book, when the service is available, how long it takes, and what happens after the booking. Scheduling integrations reduce stale offer listings.',
        cards: [
          { title: 'Calendly', copy: 'Import service names, booking links, durations, and meeting context.' },
          { title: 'Google Calendar', copy: 'Surface availability windows without exposing private calendar details.' },
          { title: 'Manual fallback', copy: 'Add booking links and availability notes even before OAuth is connected.' },
        ],
      },
      {
        eyebrow: 'Payments',
        title: 'Give agents a clean path to purchase.',
        copy:
          'When offers have a price and payment path, agents can move from recommendation to action. Nexez keeps the public listing clean while routing checkout through the proper payment flow.',
        cards: [
          { title: 'Stripe', copy: 'Support subscription billing, plan upgrades, checkout, and platform fee tracking.' },
          { title: 'Square', copy: 'Bring in local-service and point-of-sale context where relevant.' },
          { title: 'Quotes and review', copy: 'For high-value work, route agents to request human review before payment.' },
        ],
      },
      {
        eyebrow: 'Catalogs',
        title: 'Turn product and service lists into structured offers.',
        copy:
          'Product catalogs and service menus are often clear to humans but messy to agents. Importers convert them into fields agents can compare.',
        cards: [
          { title: 'Shopify', copy: 'Import product titles, price signals, descriptions, and product URLs.' },
          { title: 'CSV upload', copy: 'Move from spreadsheet to a listing without engineering work.' },
          { title: 'Website importer', copy: 'Use an existing services page as a starting point, then refine the result.' },
        ],
      },
    ],
    faq: [
      { title: 'Do I need integrations to launch?', copy: 'No. Manual listings are enough for launch. Integrations make listings easier to keep fresh.' },
      { title: 'Can I review imported data?', copy: 'Yes. Imports create a draft you review, edit, and approve. Nothing publishes without you.' },
      { title: 'Will more integrations be added?', copy: 'Yes. The roadmap favors integrations that reduce listing maintenance and improve buyer action quality.' },
    ],
    finalCtaTitle: 'Set it once, then keep the listing fresh.',
    finalCtaCopy: 'Connect the systems that already know your offers, prices, and availability.',
  },
  'agent-readiness': {
    slug: 'agent-readiness',
    eyebrow: 'Agent readiness',
    title: 'Make your business recommendable',
    accent: 'by AI agents.',
    description:
      'AI agents do not browse like humans. They parse, compare, verify, and act. Agent readiness is the practical discipline of making your offers clear enough for those systems to recommend without guessing.',
    primaryCta: { label: 'Run the simulator', href: '/simulator' },
    secondaryCta: { label: 'See live examples', href: '/discovery' },
    stats: [
      { value: '92%', label: 'Target readiness score' },
      { value: '5', label: 'Agent-readable outputs' },
      { value: '0', label: 'Hidden buying steps' },
    ],
    visualTitle: 'Readiness checklist',
    visualItems: [
      'Offers have names, descriptions, price signals, and next actions.',
      'The listing exposes schema, llms.txt, agent.json, and clear semantic HTML.',
      'The business includes trust signals, contact path, location, and policies.',
    ],
    sections: [
      {
        eyebrow: 'Parse',
        title: 'Agents need the shape of the offer.',
        copy:
          'A beautiful website can still be ambiguous. Agent readiness starts with turning services and products into explicit records with scope, price, buyer fit, and action.',
        cards: [
          { title: 'Offer clarity', copy: 'Each service or product should answer what it is, who it is for, and how to start.' },
          { title: 'Price signal', copy: 'Exact price, starting price, range, quote-needed, or package tier beats silence.' },
          { title: 'Policy context', copy: 'Cancellation, deposits, service area, lead time, and human review rules reduce bad handoffs.' },
        ],
      },
      {
        eyebrow: 'Verify',
        title: 'Agents need confidence before recommending.',
        copy:
          'Trust is not just branding. Agents look for signals that a listing is current, reachable, and aligned with the user request.',
        cards: [
          { title: 'Freshness', copy: 'Updated listings, connected integrations, and active links improve confidence.' },
          { title: 'Identity', copy: 'Website link, contact details, custom domain, and verified artifacts reduce ambiguity.' },
          { title: 'Consistency', copy: 'Human listing, JSON, schema, and checkout actions should tell the same story.' },
        ],
      },
      {
        eyebrow: 'Act',
        title: 'Agents need the next step to be safe.',
        copy:
          'The winning listing does not just describe the business. It gives a clear path for booking, buying, requesting a quote, or escalating to a human.',
        cards: [
          { title: 'Direct CTAs', copy: 'Book, buy, contact, negotiate, or request review should be attached to specific offers.' },
          { title: 'Checkout readiness', copy: 'Payment paths need clear totals, confirmation states, and agent-readable receipts.' },
          { title: 'Simulator checks', copy: 'Preview how different agents interpret the listing before relying on it.' },
        ],
      },
    ],
    faq: [
      { title: 'Is this the same as SEO?', copy: 'No. SEO helps search engines rank pages. Agent readiness helps AI systems understand and act on your offer.' },
      { title: 'Do agents really need separate listings?', copy: 'Often, yes. Main sites are optimized for persuasion, visuals, and tracking. Agents need concise structure and direct actions.' },
      { title: 'Can a readiness score guarantee traffic?', copy: 'No score can guarantee demand. It can reduce avoidable parsing and trust failures before agents reach your listing.' },
    ],
    finalCtaTitle: 'Build the listing agents wish every business had.',
    finalCtaCopy: 'Make the offer clear, the data structured, and the next action impossible to miss.',
  },
  developers: {
    slug: 'developers',
    eyebrow: 'Developers',
    title: 'APIs and artifacts for',
    accent: 'agent-native commerce.',
    description:
      'Nexez publishes machine-readable artifacts for discovery, search, verification, and action. Developers can inspect public listings, call APIs, and build agents that understand real business offers.',
    primaryCta: { label: 'View OpenAPI', href: agentRuntimeUrl('/openapi.json') },
    secondaryCta: { label: 'Browse agent index', href: agentRuntimeUrl('/agent-pages.json') },
    stats: [
      { value: 'REST', label: 'Public APIs' },
      { value: 'MCP', label: 'Per-listing manifests' },
      { value: 'JSON', label: 'Agent-readable offers' },
    ],
    visualTitle: 'Developer surface',
    visualItems: [
      'Global index: /agent-pages.json for published listings.',
      'Search: /api/agent-search?q={intent} for buyer-intent discovery.',
      'Per-listing artifacts: /{slug}/agent.json, /{slug}/llms.txt, /{slug}/mcp.json.',
    ],
    sections: [
      {
        eyebrow: 'Discovery',
        title: 'Find listings and offers by intent.',
        copy:
          'Agents and tools can search the public runtime for structured offers instead of scraping arbitrary websites. The response is designed for ranking, comparison, and handoff.',
        cards: [
          { title: 'Agent search', copy: 'Query by buyer intent, service type, product phrase, or category.' },
          { title: 'Directory API', copy: 'Pull public listings with filters such as category and readiness threshold.' },
          { title: 'Global index', copy: 'Use the public index for broad crawling and periodic sync.' },
        ],
      },
      {
        eyebrow: 'Listing artifacts',
        title: 'Every listing exposes structured context.',
        copy:
          'A public page is only one representation. Nexez publishes multiple machine-readable formats so different agents can choose the surface they understand best.',
        cards: [
          { title: 'agent.json', copy: 'Canonical business, offer, action, trust, and readiness data for a listing.' },
          { title: 'llms.txt', copy: 'Plain-language context optimized for LLM ingestion and retrieval.' },
          { title: 'MCP manifest', copy: 'Optional per-listing manifest for tools and resources where enabled.' },
        ],
      },
      {
        eyebrow: 'Action',
        title: 'Move from recommendation to handoff.',
        copy:
          'Developers can validate checkout handoffs, link users to specific offers, or route high-value requests into negotiation and review flows.',
        cards: [
          { title: 'Checkout links', copy: 'Offer-specific checkout paths make the selected action explicit.' },
          { title: 'Dry-run validation', copy: 'Agents can verify a checkout path before starting a real purchase flow.' },
          { title: 'Buyer approval UX', copy: 'Render clear consent before checkout, booking, contact sharing, or negotiation submission.' },
        ],
      },
    ],
    faq: [
      { title: 'Are public APIs authenticated?', copy: 'Public discovery APIs are open by design. Account and management APIs require authentication.' },
      { title: 'Can I build an agent on top of Nexez?', copy: 'Yes. Nexez is designed to be a clean offer source for agents, search tools, and buying assistants.' },
      { title: 'How should agents ask for approval?', copy: 'Use the buyer approval pattern to show seller, offer, price, terms, risk notes, and the exact next action before side effects.' },
      { title: 'Where should crawlers start?', copy: 'Start with https://nexez.app/llms.txt, /agent-pages.json, and /openapi.json.' },
    ],
    finalCtaTitle: 'Stop scraping. Start with structured intent.',
    finalCtaCopy: 'Build against listings that were designed to be read by agents from day one.',
  },
  compare: {
    slug: 'compare',
    eyebrow: 'Compare',
    title: 'Nexez is not another',
    accent: 'landing page builder.',
    description:
      'Traditional websites persuade humans. Directories list businesses. SEO pages chase rankings. Nexez creates a structured buying layer for AI agents that need to understand, compare, and act.',
    primaryCta: { label: 'Create a listing', href: appUrl('/create') },
    secondaryCta: { label: 'See the directory', href: '/discovery' },
    stats: [
      { value: 'Human', label: 'Website remains intact' },
      { value: 'Agent', label: 'Nexez listing is structured' },
      { value: 'Data', label: 'Analytics prove activity' },
    ],
    visualTitle: 'Positioning',
    visualItems: [
      'Website builders optimize visual presentation and content control.',
      'Directories optimize discovery, but not your owned agent-readable data.',
      'Nexez optimizes the buying context agents need after discovery.',
    ],
    sections: [
      {
        eyebrow: 'Versus your main website',
        title: 'Keep the brand site. Add the agent surface.',
        copy:
          'Your main site can stay rich, visual, tracked, and human-focused. Nexez gives agents a separate, cleaner target that points back to the brand experience when needed.',
        cards: [
          { title: 'Less page noise', copy: 'No bloated navigation, buried service pages, vague pricing, or hidden CTAs.' },
          { title: 'More structure', copy: 'Offers, FAQs, policies, actions, schema, and manifests are generated from one source.' },
          { title: 'Better measurement', copy: 'Track agent visits and handoffs separately from normal web traffic.' },
        ],
      },
      {
        eyebrow: 'Versus directories',
        title: 'Own the listing agents recommend.',
        copy:
          'Directories can help discovery, but they often own the buyer relationship. Nexez gives each business a dedicated listing, custom domain path, and structured data they control.',
        cards: [
          { title: 'Portable link', copy: 'Share the same listing anywhere: directory, website, profile, or custom domain.' },
          { title: 'Richer context', copy: 'Listings can include offer details, policies, checkout paths, and manifests.' },
          { title: 'Network effect', copy: 'The public directory adds discovery while each business keeps its own listing.' },
        ],
      },
      {
        eyebrow: 'Versus SEO tools',
        title: 'Rankings are only part of the future.',
        copy:
          'AI agents are not just search results pages. They synthesize options and may complete tasks. Nexez prepares the offer layer for that behavior.',
        cards: [
          { title: 'Action-ready', copy: 'The listing is built around bookings, purchases, quotes, and negotiation.' },
          { title: 'Agent simulation', copy: 'Preview how major agents interpret the listing before launch.' },
          { title: 'Readiness over vanity', copy: 'Measure whether the listing is usable by agents, not just whether it exists.' },
        ],
      },
    ],
    faq: [
      { title: 'Can I use Nexez with Webflow, Squarespace, or Wix?', copy: 'Yes. Nexez sits beside your main website and can link to or import from it.' },
      { title: 'Is this only for AI traffic?', copy: 'No. Humans can use the listings too, but the structure is intentionally optimized for agents.' },
      { title: 'Can agencies manage listings for clients?', copy: 'Yes. Multi-listing workflows are part of the core direction.' },
    ],
    finalCtaTitle: 'Do not rebuild your website for agents. Add the missing layer.',
    finalCtaCopy: 'Give every service, product, and package a listing agents can understand and act on.',
  },
  enterprise: {
    slug: 'enterprise',
    eyebrow: 'Enterprise',
    title: 'Agent-ready infrastructure',
    accent: 'for teams with many offers.',
    description:
      'For agencies, marketplaces, franchises, and platforms, Nexez becomes the structured offer layer across every business, location, and client account you manage.',
    primaryCta: { label: 'Contact sales', href: '/support' },
    secondaryCta: { label: 'Review API surface', href: '/developers' },
    stats: [
      { value: 'Bulk', label: 'Listing creation' },
      { value: 'API', label: 'Managed workflows' },
      { value: 'Custom', label: 'Domains and terms' },
    ],
    visualTitle: 'Enterprise fit',
    visualItems: [
      'Agencies managing listings for service clients.',
      'Marketplaces exposing structured merchant or provider listings.',
      'Multi-location businesses needing consistent crawlable offer listings.',
    ],
    sections: [
      {
        eyebrow: 'Scale',
        title: 'Create and maintain many listings without losing consistency.',
        copy:
          'Enterprise buyers need repeatable listing structure, governance, import workflows, and reporting across teams. Nexez is designed to standardize the agent-readable layer.',
        cards: [
          { title: 'Bulk listing workflows', copy: 'Create listing groups by client, location, vertical, or service line.' },
          { title: 'Reusable patterns', copy: 'Apply offer templates and readiness requirements across many listings.' },
          { title: 'Central reporting', copy: 'Compare agent discovery, readiness, and conversion across the portfolio.' },
        ],
      },
      {
        eyebrow: 'Control',
        title: 'Give teams the right level of access.',
        copy:
          'Large deployments need clear ownership, draft review, publish workflows, domain controls, and integration hygiene.',
        cards: [
          { title: 'Roles and review', copy: 'Separate listing authorship, approval, billing, and integration management.' },
          { title: 'Domain strategy', copy: 'Use Nexez runtime, branded subdomains, or owned custom domains where appropriate.' },
          { title: 'Integration governance', copy: 'Keep tokens, webhooks, imports, and billing surfaces under control.' },
        ],
      },
      {
        eyebrow: 'Data',
        title: 'Measure agent demand across a portfolio.',
        copy:
          'The value of listings compounds when teams can see which offers agents search for, which listings convert, and where structure fails.',
        cards: [
          { title: 'Agent mix', copy: 'Break down activity by ChatGPT, Claude, Perplexity, Grok, and other detected agents.' },
          { title: 'Offer-level performance', copy: 'Track which services, products, and packages generate handoffs.' },
          { title: 'Readiness governance', copy: 'Monitor stale listings, missing actions, weak descriptions, and incomplete pricing.' },
        ],
      },
    ],
    faq: [
      { title: 'Who is Enterprise for?', copy: 'Teams managing many listings, locations, clients, merchants, or high-value workflows.' },
      { title: 'Can pricing be customized?', copy: 'Yes. Enterprise plans can include custom transaction terms, limits, onboarding, and support.' },
      { title: 'Can Nexez support private directories?', copy: 'Yes. Private directories for agencies, marketplaces, and partner networks are on the enterprise roadmap.' },
    ],
    finalCtaTitle: 'Turn many businesses into one structured agent-ready network.',
    finalCtaCopy: 'Enterprise Nexez helps teams publish, govern, and measure listings at scale.',
  },
}

/** /pricing "Common questions" — single source for BOTH the rendered Q&A (PricingClient)
 *  and the page's FAQPage JSON-LD, so the schema can never drift from what's visible. */
export const pricingFaqs = [
  { question: 'Do I pay if no one books?', answer: 'No. Only transaction fees on successful agent bookings/payments.' },
  { question: 'Can I change plans later?', answer: 'Yes, upgrade or downgrade from your Billing page. Prorated billing.' },
  { question: 'How does complimentary Launch access work?', answer: 'Start on Free, then verify and publish your business. Eligible businesses receive six months of Launch access with no card and no automatic charge. Afterward, the account returns to Free unless upgraded.' },
  { question: 'What if I need custom pricing?', answer: 'Enterprise plans are fully customizable. Reach out via support.' },
] as const

export type UseCasePage = {
  slug: string
  label: string
  templateId: CreateTemplateId
  title: string
  description: string
  pain: string
  buyerIntent: string
  offers: MarketingCard[]
  pageMustProve: MarketingCard[]
  faq: MarketingCard[]
  cta: string
}

export const useCases: UseCasePage[] = [
  {
    slug: 'consultants',
    label: 'Consultants',
    templateId: 'consulting',
    title: 'Consulting listings agents can compare in seconds.',
    description:
      'Package strategy calls, audits, and retainers into clear offers with scope, price signal, buyer fit, and booking path.',
    pain:
      'Your expertise lives in paragraphs, case studies, and a contact form. When a buyer asks an AI assistant for a consultant who can start next week and explain pricing up front, none of that is legible. The agent needs scope, a price signal, and a booking link it can verify, and most consulting sites offer a phone number.',
    buyerIntent: 'Find a B2B consultant who can help next week and explain pricing before booking.',
    offers: [
      { title: 'Strategy session', copy: 'A one-time call with a set duration, a clear outcome, a price, and a calendar link. The easiest yes an agent can recommend.' },
      { title: 'Fractional advisory retainer', copy: 'Ongoing support with scope, response time, and a monthly price, so an agent can match you to a budget without a discovery call.' },
      { title: 'Fixed-scope audit', copy: 'A defined diagnostic with deliverables, a timeline, and a checkout or proposal request. High trust, low ambiguity.' },
    ],
    pageMustProve: [
      { title: 'Expertise and niche', copy: 'Who you help and what you do best, in one sentence an agent can repeat to its buyer.' },
      { title: 'Outcome and deliverables', copy: 'What the client walks away with. Agents do not recommend vague.' },
      { title: 'Availability and price signal', copy: 'Even a starting price beats silence. An agent cannot compare a number that is not there.' },
    ],
    faq: [
      { title: 'Do I have to publish exact prices?', copy: 'No. A starting price, a range, or a paid scoping call all work. Agents just need something to compare, and silence reads as a dead end.' },
      { title: 'What if my work is too custom to package?', copy: 'Package the first step instead. A paid scoping call or a fixed audit gives agents a concrete offer, and the custom engagement follows from there.' },
      { title: 'Will this compete with my main website?', copy: 'No. The listing links back to your site and does one job: giving agents a clean, current version of your offers.' },
    ],
    cta: 'Create a consulting listing',
  },
  {
    slug: 'agencies',
    label: 'Agencies',
    templateId: 'consulting',
    title: 'Agency offers that do not get buried in a bloated site.',
    description:
      'Turn service menus, packages, audits, retainers, and implementation work into structured listings agents can recommend.',
    pain:
      'Agency sites are built to impress people: showreels, case studies, and a services page with nine capabilities and zero prices. An agent shortlisting agencies for a client cannot rank a vibe. It ranks scope, price signal, and a clear way to start, and the agency that publishes those wins the shortlist.',
    buyerIntent: 'Shortlist an agency for launch support, compare packages, and request a proposal.',
    offers: [
      { title: 'Growth audit', copy: 'A fixed-price diagnostic that shows how you think. Easy to compare, easy to buy, and a natural door into bigger work.' },
      { title: 'Launch sprint', copy: 'A defined engagement with a timeline and a deliverable list, so agents can match you to a deadline.' },
      { title: 'Monthly execution retainer', copy: 'Recurring scope with response times and reporting cadence spelled out. This is what retainer buyers actually compare.' },
    ],
    pageMustProve: [
      { title: 'Target client', copy: 'The company size, stage, and industry you do your best work for. Fit is the first filter agents apply.' },
      { title: 'Scope boundaries', copy: 'What is included and what is not. Clear edges prevent bad-fit inquiries that waste both sides.' },
      { title: 'Proposal or checkout path', copy: 'A way to start that an agent can act on: book a call, request a proposal, or check out directly.' },
    ],
    faq: [
      { title: 'We sell custom engagements. How does that fit?', copy: 'List entry points, not your whole capability deck. An audit, a sprint, and a retainer cover most of the ways a client can start with you.' },
      { title: 'Can we manage listings for our clients too?', copy: 'Yes. Agencies run listings for clients as part of the service, and multi-listing workflows are built for exactly that.' },
      { title: 'Will agents really shortlist agencies?', copy: 'Buying assistants already compare providers when asked. The question is whether your offers are legible when it happens.' },
    ],
    cta: 'Create an agency listing',
  },
  {
    slug: 'coaches',
    label: 'Coaches',
    templateId: 'consulting',
    title: 'Coaching listings with clear programs and next steps.',
    description:
      'Help agents understand session types, program length, fit, pricing, booking rules, and what a buyer should expect.',
    pain:
      'Coaching sites lean on story and testimonials, which is what human buyers need. But when someone asks an assistant for a coach with a specific specialty, budget, and format, the agent looks for session types, prices, and booking rules. If those live in a PDF or a discovery call, you are invisible to that search.',
    buyerIntent: 'Book a coach with a specific specialty, budget, and meeting format.',
    offers: [
      { title: 'Intro session', copy: 'A low-commitment first call with a price and a calendar link. The offer agents recommend to a hesitant buyer.' },
      { title: 'Program package', copy: 'A defined arc: length, cadence, format, outcome, and price. Comparable at a glance.' },
      { title: 'Monthly coaching membership', copy: 'Recurring support with clear terms, so budget-matched buyers can start without a back-and-forth.' },
    ],
    pageMustProve: [
      { title: 'Specialty and fit', copy: 'The specific problem you coach and who it is for. Career transitions for engineers beats life coaching every time.' },
      { title: 'Session format', copy: 'Video, in person, group size, and session length. Format is a hard filter for most buyers.' },
      { title: 'Booking and cancellation rules', copy: 'Reschedule windows, refunds, and how to book. Agents check policies before recommending a stranger.' },
    ],
    faq: [
      { title: 'My coaching is personal. Can a listing capture that?', copy: 'It does not have to. The listing gets you found and booked for the intro session. The connection happens on the call.' },
      { title: 'Do I need a website first?', copy: 'No. Your listing can be your entire public offer, on a Nexez link or your own domain.' },
      { title: 'What if my prices vary by client?', copy: 'Publish the intro session at a fixed price and mark programs with a starting price. That is enough for an agent to compare.' },
    ],
    cta: 'Create a coaching listing',
  },
  {
    slug: 'local-services',
    label: 'Local services',
    templateId: 'local-service',
    title: 'Local service listings agents can safely book.',
    description:
      'Make service area, availability, job types, estimates, emergency rules, and contact paths explicit for buyer assistants.',
    pain:
      'A homeowner tells an assistant to find a plumber who can come Thursday. The agent needs your service area, availability, job types, and whether Thursday is even possible. Most local sites answer with a photo gallery and a contact form. The business that publishes the facts gets the booking.',
    buyerIntent: 'Find a local provider available for a specific job, location, and timeline.',
    offers: [
      { title: 'Emergency visit', copy: 'After-hours availability, response time, and the call-out fee stated up front. The highest-intent search there is.' },
      { title: 'Standard service call', copy: 'Common jobs with typical pricing and a booking or callback path.' },
      { title: 'Quote request', copy: 'For bigger jobs: what you need from the customer, how fast you respond, and what happens next.' },
    ],
    pageMustProve: [
      { title: 'Service area', copy: 'ZIP codes, radius, or neighborhoods. The first question every local request starts with.' },
      { title: 'Availability window', copy: 'Days, hours, emergency rules, and current lead time. Stale availability kills trust instantly.' },
      { title: 'Estimate or payment rules', copy: 'Free or paid estimates, deposits, and accepted payment. No surprises at the door.' },
    ],
    faq: [
      { title: 'I get my work from referrals. Why bother?', copy: 'Referrals are moving to assistants too: find me someone like the electrician my neighbor used. A listing makes you findable when that ask happens.' },
      { title: 'My availability changes daily.', copy: 'Connect your calendar and the listing updates itself. That is the point: agents see current availability, not last month.' },
      { title: 'Can an agent actually book me?', copy: 'Yes, through your booking link or calendar integration. For jobs that need a human first, it hands off to a call or quote request.' },
    ],
    cta: 'Create a local service listing',
  },
  {
    slug: 'saas',
    label: 'SaaS',
    templateId: 'productized-package',
    title: 'SaaS implementation and service offers built for agent-led evaluation.',
    description:
      'Clarify plans, implementation packages, integrations, support tiers, and sales handoffs for agents comparing software options.',
    pain:
      'Software evaluation is going agent-first: compare these three tools for a 20-person team and tell me the real cost. Pricing pages built for humans, with toggles, asterisks, and contact-us tiers, do not survive that comparison. The tool that states plans, limits, and implementation cost in structured form gets shortlisted.',
    buyerIntent: 'Compare tools, understand implementation cost, and choose the right plan or sales path.',
    offers: [
      { title: 'Starter plan', copy: 'Entry price, seat and usage limits, and what is not included. The tier agents check first for fit.' },
      { title: 'Implementation package', copy: 'Setup scope, timeline, and cost. The number every real evaluation needs and few sites publish.' },
      { title: 'Enterprise onboarding', copy: 'What the sales path involves, so agents can route bigger buyers to a human with context attached.' },
    ],
    pageMustProve: [
      { title: 'Use case fit', copy: 'The team size, stage, and problem you are built for. Agents filter on fit before they compare features.' },
      { title: 'Plan limits', copy: 'Seats, usage, and feature boundaries in plain terms. Limits buried today surface as churn later.' },
      { title: 'Integration and support path', copy: 'What it connects to and what support each plan includes. Standard evaluation questions, answered up front.' },
    ],
    faq: [
      { title: 'Our pricing is usage-based and complicated.', copy: 'Publish a worked example: a team of 20 typically pays about this much. Agents and buyers both reason better from examples than from formulas.' },
      { title: 'Will this expose our pricing to competitors?', copy: 'Your competitors already know your pricing. The buyer agent that cannot read it is the one you are losing.' },
      { title: 'We sell through demos. Does this bypass sales?', copy: 'No, it feeds sales. The listing qualifies fit and cost up front, so demo requests arrive warmer.' },
    ],
    cta: 'Create a SaaS listing',
  },
  {
    slug: 'marketplaces',
    label: 'Marketplaces',
    templateId: 'productized-package',
    title: 'Marketplace listings that agents can understand as structured inventory.',
    description:
      'Expose providers, merchants, packages, availability, and trust signals in a format agents can search, compare, and route.',
    pain:
      'Your providers are your inventory, but to an agent your marketplace is one opaque page. When an assistant is asked to find a provider for a specific request, it cannot browse your filters. Structured listings per provider turn the whole catalog into something agents can search, compare, and route buyers into.',
    buyerIntent: 'Find the right provider or merchant for a request without manually browsing every listing.',
    offers: [
      { title: 'Provider profile', copy: 'Each provider as a structured record: services, area, pricing signal, and trust markers.' },
      { title: 'Featured package', copy: 'Your best-converting offers as standalone, directly bookable listings.' },
      { title: 'Quote or booking handoff', copy: 'A clear route from an agent match into your marketplace flow, keeping the transaction in your system.' },
    ],
    pageMustProve: [
      { title: 'Provider eligibility', copy: 'Who is allowed on the platform and what vetting they pass. Agents read gatekeeping as trust.' },
      { title: 'Trust and verification', copy: 'Reviews, verification badges, and completion signals in machine-readable form.' },
      { title: 'Clear handoff path', copy: 'Where the agent sends the buyer and what happens next. Ambiguous handoffs lose the transaction.' },
    ],
    faq: [
      { title: 'Does this disintermediate us?', copy: 'The opposite. Handoffs route through your marketplace flow, so you keep the relationship and the transaction while gaining agent-side discovery.' },
      { title: 'We have hundreds of providers.', copy: 'That is the enterprise fit: bulk listing workflows, shared templates, and portfolio-level reporting.' },
      { title: 'Which providers should go first?', copy: 'Your most complete profiles: clear services, prices, availability, and reviews. They perform best and set the pattern for the rest.' },
    ],
    cta: 'Create marketplace-ready listings',
  },
]

export function getUseCase(slug: string): UseCasePage | undefined {
  return useCases.find((useCase) => useCase.slug === slug)
}
