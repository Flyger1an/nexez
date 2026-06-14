import { appUrl, agentRuntimeUrl } from './site'

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
    title: 'Turn a busy website into an',
    accent: 'agent-ready buying surface.',
    description:
      'Nexez gives your business a separate, lightweight page built for AI agents to read, compare, and act on. Your main site stays human-first. Your agent page becomes the clean source of truth.',
    primaryCta: { label: 'Create your first page', href: appUrl('/create') },
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
          { title: 'Guided builder', copy: 'Keeps the page structured while still giving non-technical users plain language controls.' },
          { title: 'Manual control', copy: 'Every imported field can be reviewed, rewritten, reordered, or removed before publish.' },
        ],
      },
      {
        eyebrow: 'Step 2',
        title: 'Shape the page for machine understanding.',
        copy:
          'Agent pages avoid the usual marketing-site mess: heavy scripts, vague CTAs, scattered pricing, and copy that hides the next step. Nexez makes the offer model explicit.',
        cards: [
          { title: 'Clear offers', copy: 'Services, products, packages, retainers, and bookings are separated into predictable blocks.' },
          { title: 'Direct actions', copy: 'Each offer can point to booking, checkout, contact, negotiation, or external handoff.' },
          { title: 'Readiness scoring', copy: 'A practical score tells users what is missing before agents start judging the page.' },
        ],
      },
      {
        eyebrow: 'Step 3',
        title: 'Publish a fast public page agents can crawl.',
        copy:
          'The published page lives on a Nexez link, a custom domain, or the public agent runtime. It stays clean, crawlable, and linked back to the main website.',
        cards: [
          { title: 'Human preview', copy: 'The page is still readable by people who need to inspect the offer quickly.' },
          { title: 'Agent artifacts', copy: 'Nexez emits structured files and manifests alongside the visual page.' },
          { title: 'Analytics loop', copy: 'Visits, agent type, search intent, and conversion handoffs feed back into the dashboard.' },
        ],
      },
    ],
    faq: [
      { title: 'Does this replace my website?', copy: 'No. Nexez complements your website with a focused agent-facing page that links back to your main brand.' },
      { title: 'Do I need technical setup?', copy: 'No. You can launch with a Nexez link first, then add custom domains, API keys, and integrations when ready.' },
      { title: 'Why not just add schema to my existing site?', copy: 'Schema helps, but it does not remove bloat, unclear actions, or scattered buying context. Nexez gives agents a clean target.' },
    ],
    finalCtaTitle: 'Give agents the page your website was never designed to be.',
    finalCtaCopy: 'Start simple: one page, a few offers, clean structure, and a measurable agent discovery loop.',
  },
  examples: {
    slug: 'examples',
    eyebrow: 'Examples and templates',
    title: 'Show buyers and agents',
    accent: 'exactly what you sell.',
    description:
      'Use these templates as starting points for services, retainers, bookings, local work, SaaS implementation, and productized offers. Each example is written to be short, scannable, and machine-readable.',
    primaryCta: { label: 'Use a template', href: appUrl('/create') },
    secondaryCta: { label: 'Browse live pages', href: '/discovery' },
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
          'Local service pages should make eligibility, availability, service area, pricing, and booking steps obvious. Agents should not have to infer whether the business can help.',
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
          'Productized pages work best when they include plain descriptions, price ranges, compatibility notes, inventory or availability signals, and a direct buy action.',
        cards: [
          { title: 'Digital product', copy: 'What it solves, format, access method, refund policy, and purchase button.' },
          { title: 'Implementation package', copy: 'Software setup, onboarding scope, estimated timeline, and handoff requirements.' },
          { title: 'Bulk order', copy: 'Minimums, lead time, contact path, and structured details agents can pass to procurement.' },
        ],
      },
    ],
    faq: [
      { title: 'Can templates import my real site?', copy: 'Yes. Start with importer output, then apply a template structure to tighten the offers.' },
      { title: 'Can I create multiple pages?', copy: 'Yes. Pages can target different industries, regions, offer lines, or buyer intents.' },
      { title: 'Do examples affect live ranking?', copy: 'No. They are starting points. Real readiness depends on your published structure and completeness.' },
    ],
    finalCtaTitle: 'Make your offer obvious before an agent has to guess.',
    finalCtaCopy: 'Pick a template, import your services, and publish a clean page agents can act on.',
  },
  security: {
    slug: 'security',
    eyebrow: 'Security and trust',
    title: 'Built for public discovery',
    accent: 'without losing control.',
    description:
      'Agent pages are intentionally public, but the platform behind them needs strong boundaries. Nexez separates marketing, authenticated app, and public agent runtime surfaces so each part has the right security posture.',
    primaryCta: { label: 'Review page settings', href: appUrl('/dashboard/settings') },
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
      'nexez.app handles crawlable agent pages, manifests, checkout, and agent APIs.',
    ],
    sections: [
      {
        eyebrow: 'Platform boundaries',
        title: 'The public page is not the private dashboard.',
        copy:
          'Public agent pages expose only the business information users choose to publish. Authenticated settings, billing, API keys, drafts, imports, and analytics stay inside the product surface.',
        cards: [
          { title: 'Auth-gated controls', copy: 'Sensitive dashboard routes require a signed-in user and server-side checks.' },
          { title: 'Publish intent', copy: 'Only published pages and public artifacts are served to crawlers.' },
          { title: 'Host-aware routing', copy: 'Marketing, app, and agent runtime routes resolve to their intended domains.' },
        ],
      },
      {
        eyebrow: 'Payments and integrations',
        title: 'External systems stay scoped.',
        copy:
          'Stripe, Calendly, Shopify, Square, and API access are treated as integration surfaces with explicit tokens, webhook paths, and user-controlled connection states.',
        cards: [
          { title: 'Stripe readiness', copy: 'Billing and platform fees are separated from public page browsing.' },
          { title: 'Webhook hygiene', copy: 'Webhook secrets live in environment variables, not in public client code.' },
          { title: 'Connection visibility', copy: 'Users can see integration state and imported data before publishing.' },
        ],
      },
      {
        eyebrow: 'Crawlability controls',
        title: 'Open where it matters, controlled where it counts.',
        copy:
          'Agent-facing pages are designed to be found. App routes are designed to stay out of search. Robots, sitemaps, and public manifests follow that split.',
        cards: [
          { title: 'Agent-friendly robots', copy: 'Public runtime welcomes major AI crawlers and standard search bots.' },
          { title: 'No-index app host', copy: 'Authenticated product surfaces are kept out of search indexes.' },
          { title: 'Structured artifacts', copy: 'llms.txt, agent.json, OpenAPI, and MCP artifacts make machine access explicit.' },
        ],
      },
    ],
    faq: [
      { title: 'Will unpublished pages be crawled?', copy: 'No. The public runtime is built around published records and explicit public artifacts.' },
      { title: 'Can users verify custom domains?', copy: 'Yes. Custom domains use verification checks before they are marked live.' },
      { title: 'Should secret keys appear in settings text?', copy: 'No. User-facing settings should explain outcomes, not expose operational secret names.' },
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
    secondaryCta: { label: 'Create a page', href: appUrl('/create') },
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
          'Agents need to know whether a buyer can book, when the service is available, how long it takes, and what happens after the booking. Scheduling integrations reduce stale offer pages.',
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
          'When offers have a price and payment path, agents can move from recommendation to action. Nexez keeps the public page clean while routing checkout through the proper payment flow.',
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
          { title: 'CSV upload', copy: 'Move from spreadsheet to agent page without engineering work.' },
          { title: 'Website importer', copy: 'Use an existing services page as a starting point, then refine the result.' },
        ],
      },
    ],
    faq: [
      { title: 'Do I need integrations to launch?', copy: 'No. Manual pages are enough for launch. Integrations make pages easier to keep fresh.' },
      { title: 'Can I review imported data?', copy: 'Yes. Importers should help draft the page, not silently publish it.' },
      { title: 'Will more integrations be added?', copy: 'Yes. The roadmap favors integrations that reduce page maintenance and improve buyer action quality.' },
    ],
    finalCtaTitle: 'Set it once, then keep the page fresh.',
    finalCtaCopy: 'Connect the systems that already know your offers, prices, and availability.',
  },
  'agent-readiness': {
    slug: 'agent-readiness',
    eyebrow: 'Agent readiness',
    title: 'Make your business legible',
    accent: 'to the next search interface.',
    description:
      'AI agents do not browse like humans. They parse, compare, verify, and act. Agent readiness is the practical discipline of making your offers understandable enough for those systems to recommend.',
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
      'The page exposes schema, llms.txt, agent.json, and clear semantic HTML.',
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
          'Trust is not just branding. Agents look for signals that a page is current, reachable, and aligned with the user request.',
        cards: [
          { title: 'Freshness', copy: 'Updated pages, connected integrations, and active links improve confidence.' },
          { title: 'Identity', copy: 'Website link, contact details, custom domain, and verified artifacts reduce ambiguity.' },
          { title: 'Consistency', copy: 'Human page, JSON, schema, and checkout actions should tell the same story.' },
        ],
      },
      {
        eyebrow: 'Act',
        title: 'Agents need the next step to be safe.',
        copy:
          'The winning page does not just describe the business. It gives a clear path for booking, buying, requesting a quote, or escalating to a human.',
        cards: [
          { title: 'Direct CTAs', copy: 'Book, buy, contact, negotiate, or request review should be attached to specific offers.' },
          { title: 'Checkout readiness', copy: 'Payment paths need clear totals, confirmation states, and agent-readable receipts.' },
          { title: 'Simulator checks', copy: 'Preview how different agents interpret the page before relying on it.' },
        ],
      },
    ],
    faq: [
      { title: 'Is this the same as SEO?', copy: 'No. SEO helps search engines rank pages. Agent readiness helps AI systems understand and act on your offer.' },
      { title: 'Do agents really need separate pages?', copy: 'Often, yes. Main sites are optimized for persuasion, visuals, and tracking. Agents need concise structure and direct actions.' },
      { title: 'Can a readiness score guarantee traffic?', copy: 'No score can guarantee demand. It can reduce avoidable parsing and trust failures before agents reach your page.' },
    ],
    finalCtaTitle: 'Build the page agents wish every business had.',
    finalCtaCopy: 'Make the offer clear, the data structured, and the next action impossible to miss.',
  },
  developers: {
    slug: 'developers',
    eyebrow: 'Developers',
    title: 'APIs and artifacts for',
    accent: 'agent-native commerce.',
    description:
      'Nexez publishes machine-readable artifacts for discovery, search, verification, and action. Developers can inspect public pages, call APIs, and build agents that understand real business offers.',
    primaryCta: { label: 'View OpenAPI', href: agentRuntimeUrl('/openapi.json') },
    secondaryCta: { label: 'Browse agent index', href: agentRuntimeUrl('/agent-pages.json') },
    stats: [
      { value: 'REST', label: 'Public APIs' },
      { value: 'MCP', label: 'Per-page manifests' },
      { value: 'JSON', label: 'Agent-readable offers' },
    ],
    visualTitle: 'Developer surface',
    visualItems: [
      'Global index: /agent-pages.json for published agent pages.',
      'Search: /api/agent-search?q={intent} for buyer-intent discovery.',
      'Per-page artifacts: /{slug}/agent.json, /{slug}/llms.txt, /{slug}/mcp.json.',
    ],
    sections: [
      {
        eyebrow: 'Discovery',
        title: 'Find pages and offers by intent.',
        copy:
          'Agents and tools can search the public runtime for structured offers instead of scraping arbitrary websites. The response is designed for ranking, comparison, and handoff.',
        cards: [
          { title: 'Agent search', copy: 'Query by buyer intent, service type, product phrase, or category.' },
          { title: 'Directory API', copy: 'Pull public listings with filters such as category and readiness threshold.' },
          { title: 'Global index', copy: 'Use the public index for broad crawling and periodic sync.' },
        ],
      },
      {
        eyebrow: 'Page artifacts',
        title: 'Every page exposes structured context.',
        copy:
          'A public page is only one representation. Nexez publishes multiple machine-readable formats so different agents can choose the surface they understand best.',
        cards: [
          { title: 'agent.json', copy: 'Canonical business, offer, action, trust, and readiness data for a page.' },
          { title: 'llms.txt', copy: 'Plain-language context optimized for LLM ingestion and retrieval.' },
          { title: 'MCP manifest', copy: 'Optional per-page manifest for tools and resources where enabled.' },
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
          { title: 'Programmatic API', copy: 'Authenticated endpoints support deeper platform workflows for account owners.' },
        ],
      },
    ],
    faq: [
      { title: 'Are public APIs authenticated?', copy: 'Public discovery APIs are open by design. Account and management APIs require authentication.' },
      { title: 'Can I build an agent on top of Nexez?', copy: 'Yes. Nexez is designed to be a clean offer source for agents, search tools, and buying assistants.' },
      { title: 'Where should crawlers start?', copy: 'Start with https://nexez.app/llms.txt, /agent-pages.json, and /openapi.json.' },
    ],
    finalCtaTitle: 'Stop scraping. Start with structured intent.',
    finalCtaCopy: 'Build against pages that were designed to be read by agents from day one.',
  },
  compare: {
    slug: 'compare',
    eyebrow: 'Compare',
    title: 'Nexez is not another',
    accent: 'landing page builder.',
    description:
      'Traditional websites persuade humans. Directories list businesses. SEO pages chase rankings. Nexez creates a structured buying layer for AI agents that need to understand, compare, and act.',
    primaryCta: { label: 'Create an agent page', href: appUrl('/create') },
    secondaryCta: { label: 'See the directory', href: '/discovery' },
    stats: [
      { value: 'Human', label: 'Website remains intact' },
      { value: 'Agent', label: 'Nexez page is structured' },
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
        title: 'Own the page agents recommend.',
        copy:
          'Directories can help discovery, but they often own the buyer relationship. Nexez gives each business a dedicated page, custom domain path, and structured data they control.',
        cards: [
          { title: 'Portable link', copy: 'Share the same agent page anywhere: directory, website, profile, or custom domain.' },
          { title: 'Richer context', copy: 'Agent pages can include offer details, policies, checkout paths, and manifests.' },
          { title: 'Network effect', copy: 'The public directory adds discovery while each business keeps its own page.' },
        ],
      },
      {
        eyebrow: 'Versus SEO tools',
        title: 'Rankings are only part of the future.',
        copy:
          'AI agents are not just search results pages. They synthesize options and may complete tasks. Nexez prepares the offer layer for that behavior.',
        cards: [
          { title: 'Action-ready', copy: 'The page is built around bookings, purchases, quotes, and negotiation.' },
          { title: 'Agent simulation', copy: 'Preview how major agents interpret the page before launch.' },
          { title: 'Readiness over vanity', copy: 'Measure whether the page is usable by agents, not just whether it exists.' },
        ],
      },
    ],
    faq: [
      { title: 'Can I use Nexez with Webflow, Squarespace, or Wix?', copy: 'Yes. Nexez sits beside your main website and can link to or import from it.' },
      { title: 'Is this only for AI traffic?', copy: 'No. Humans can use the pages too, but the structure is intentionally optimized for agents.' },
      { title: 'Can agencies manage pages for clients?', copy: 'Yes. Multi-page workflows are part of the core direction.' },
    ],
    finalCtaTitle: 'Do not rebuild your website for agents. Add the missing layer.',
    finalCtaCopy: 'Give every service, product, and package a page agents can understand and act on.',
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
      { value: 'Bulk', label: 'Page creation' },
      { value: 'API', label: 'Managed workflows' },
      { value: 'Custom', label: 'Domains and terms' },
    ],
    visualTitle: 'Enterprise fit',
    visualItems: [
      'Agencies managing agent pages for service clients.',
      'Marketplaces exposing structured merchant or provider pages.',
      'Multi-location businesses needing consistent crawlable offer pages.',
    ],
    sections: [
      {
        eyebrow: 'Scale',
        title: 'Create and maintain many pages without losing consistency.',
        copy:
          'Enterprise buyers need repeatable page structure, governance, import workflows, and reporting across teams. Nexez is designed to standardize the agent-readable layer.',
        cards: [
          { title: 'Bulk page workflows', copy: 'Create page groups by client, location, vertical, or service line.' },
          { title: 'Reusable patterns', copy: 'Apply offer templates and readiness requirements across many pages.' },
          { title: 'Central reporting', copy: 'Compare agent discovery, readiness, and conversion across the portfolio.' },
        ],
      },
      {
        eyebrow: 'Control',
        title: 'Give teams the right level of access.',
        copy:
          'Large deployments need clear ownership, draft review, publish workflows, domain controls, and integration hygiene.',
        cards: [
          { title: 'Roles and review', copy: 'Separate page authorship, approval, billing, and integration management.' },
          { title: 'Domain strategy', copy: 'Use Nexez runtime, branded subdomains, or owned custom domains where appropriate.' },
          { title: 'Integration governance', copy: 'Keep tokens, webhooks, imports, and billing surfaces under control.' },
        ],
      },
      {
        eyebrow: 'Data',
        title: 'Measure agent demand across a portfolio.',
        copy:
          'The value of agent pages compounds when teams can see which offers agents search for, which pages convert, and where structure fails.',
        cards: [
          { title: 'Agent mix', copy: 'Break down activity by ChatGPT, Claude, Perplexity, Grok, and other detected agents.' },
          { title: 'Offer-level performance', copy: 'Track which services, products, and packages generate handoffs.' },
          { title: 'Readiness governance', copy: 'Monitor stale pages, missing actions, weak descriptions, and incomplete pricing.' },
        ],
      },
    ],
    faq: [
      { title: 'Who is Enterprise for?', copy: 'Teams managing many pages, locations, clients, merchants, or high-value workflows.' },
      { title: 'Can pricing be customized?', copy: 'Yes. Enterprise plans can include custom transaction terms, limits, onboarding, and support.' },
      { title: 'Can Nexez support private directories?', copy: 'That is a natural enterprise direction for agencies, marketplaces, and partner networks.' },
    ],
    finalCtaTitle: 'Turn many businesses into one structured agent-ready network.',
    finalCtaCopy: 'Enterprise Nexez helps teams publish, govern, and measure agent pages at scale.',
  },
}

export type UseCasePage = {
  slug: string
  label: string
  title: string
  description: string
  buyerIntent: string
  offers: string[]
  pageMustProve: string[]
  cta: string
}

export const useCases: UseCasePage[] = [
  {
    slug: 'consultants',
    label: 'Consultants',
    title: 'Consulting pages agents can compare in seconds.',
    description:
      'Package strategy calls, audits, and retainers into clear offers with scope, price signal, buyer fit, and booking path.',
    buyerIntent: 'Find a B2B consultant who can help next week and explain pricing before booking.',
    offers: ['Strategy session', 'Fractional advisory retainer', 'Fixed-scope audit'],
    pageMustProve: ['Expertise and niche', 'Outcome and deliverables', 'Availability and price signal'],
    cta: 'Create a consulting agent page',
  },
  {
    slug: 'agencies',
    label: 'Agencies',
    title: 'Agency offers that do not get buried in a bloated site.',
    description:
      'Turn service menus, packages, audits, retainers, and implementation work into structured pages agents can recommend.',
    buyerIntent: 'Shortlist an agency for launch support, compare packages, and request a proposal.',
    offers: ['Growth audit', 'Launch sprint', 'Monthly execution retainer'],
    pageMustProve: ['Target client', 'Scope boundaries', 'Proposal or checkout path'],
    cta: 'Create an agency page',
  },
  {
    slug: 'coaches',
    label: 'Coaches',
    title: 'Coaching pages with clear programs and next steps.',
    description:
      'Help agents understand session types, program length, fit, pricing, booking rules, and what a buyer should expect.',
    buyerIntent: 'Book a coach with a specific specialty, budget, and meeting format.',
    offers: ['Intro session', 'Program package', 'Monthly coaching membership'],
    pageMustProve: ['Specialty and fit', 'Session format', 'Booking and cancellation rules'],
    cta: 'Create a coaching page',
  },
  {
    slug: 'local-services',
    label: 'Local services',
    title: 'Local service pages agents can safely book.',
    description:
      'Make service area, availability, job types, estimates, emergency rules, and contact paths explicit for buyer assistants.',
    buyerIntent: 'Find a local provider available for a specific job, location, and timeline.',
    offers: ['Emergency visit', 'Standard service call', 'Quote request'],
    pageMustProve: ['Service area', 'Availability window', 'Estimate or payment rules'],
    cta: 'Create a local service page',
  },
  {
    slug: 'saas',
    label: 'SaaS',
    title: 'SaaS implementation and service offers built for agent-led evaluation.',
    description:
      'Clarify plans, implementation packages, integrations, support tiers, and sales handoffs for agents comparing software options.',
    buyerIntent: 'Compare tools, understand implementation cost, and choose the right plan or sales path.',
    offers: ['Starter plan', 'Implementation package', 'Enterprise onboarding'],
    pageMustProve: ['Use case fit', 'Plan limits', 'Integration and support path'],
    cta: 'Create a SaaS agent page',
  },
  {
    slug: 'marketplaces',
    label: 'Marketplaces',
    title: 'Marketplace listings that agents can understand as structured inventory.',
    description:
      'Expose providers, merchants, packages, availability, and trust signals in a format agents can search, compare, and route.',
    buyerIntent: 'Find the right provider or merchant for a request without manually browsing every listing.',
    offers: ['Provider profile', 'Featured package', 'Quote or booking handoff'],
    pageMustProve: ['Provider eligibility', 'Trust and verification', 'Clear handoff path'],
    cta: 'Create marketplace-ready pages',
  },
]

export function getUseCase(slug: string): UseCasePage | undefined {
  return useCases.find((useCase) => useCase.slug === slug)
}
