import type { LearnArticle } from '../learn-content'

export const productFeedsForAiAgents: LearnArticle = {
  slug: 'product-feeds-for-ai-agents',
  metaTitle: 'Product Feeds for AI Agents: A 2026 Guide',
  metaDescription:
    'Your product feed is the front door to AI shopping. What agents read, the three places your catalog must agree, and the attributes that decide eligibility.',
  title: 'Product feeds for AI agents: what they read, and why yours has to agree with itself',
  dek: 'A product feed used to be a shopping-ads chore. In 2026 it is the input that decides whether AI agents can find, compare, and buy from you at all. The catch is that your catalog now exists in three places at once, and agents check them against each other.',
  category: 'Agentic commerce',
  publishedAt: '2026-08-26',
  updatedAt: '2026-08-26',
  readMinutes: 12,
  blocks: [
    {
      type: 'p',
      text: 'A product feed is your catalog expressed as structured data: one record per item, with typed fields for title, description, price, availability, images, shipping, and returns. It has existed for years as the thing that powers shopping ads. What changed in 2026 is its job. Google\u2019s own guidance to advertisers, presented at NRF 2026, is direct about it: the attributes you submit determine your eligibility for the new AI surfaces. The feed stopped being a channel-specific chore and became the front door.',
    },
    {
      type: 'p',
      text: 'The part almost nobody explains properly is that your catalog now exists in three places at once. There is the merchant feed you submit to a platform, the protocol feed that agentic checkout runs on, and the structured data on your own product pages. Agents read all three, and more importantly they read them against each other. A price that disagrees across those three is not a cosmetic problem; it is the most common reason a merchant quietly stops being recommended.',
    },
    {
      type: 'p',
      text: 'This guide covers what agents actually read, the three expressions of your catalog and how they differ, why consistency is a hard requirement rather than a nice-to-have, the attributes that decide eligibility, and what to do if you sell services and have no SKUs at all.',
    },
    { type: 'h2', text: 'Why the feed became the front door' },
    {
      type: 'p',
      text: 'When a shopper types four constraints into an assistant ("waterproof hiking boots, wide fit, under $180, in stock in a 10"), the assistant is not reading your marketing copy and forming an impression. It is filtering typed fields. Every constraint it can check against a structured attribute is a constraint you can win on. Every constraint your data does not express is one you are automatically excluded from.',
    },
    {
      type: 'p',
      text: 'The scale of the machinery underneath makes the point. Google\u2019s Shopping Graph refreshes on the order of two billion listings per hour, which is why feed freshness now matters more for AI surfaces than it ever did for traditional shopping ads. Stale data does not just underperform, it actively disqualifies, because an assistant that recommends a sold-out item has embarrassed itself in front of its user and will discount that source next time.',
    },
    {
      type: 'p',
      text: 'There is also a gating effect worth knowing. As Google rolled UCP access out in phases through 2026, priority went to merchants with clean, complete Merchant Center feeds in good standing. Feed quality was not merely how you performed once you were in; it was how you got in.',
    },
    { type: 'h2', text: 'The three expressions of your catalog' },
    {
      type: 'p',
      text: 'These are not three copies of the same file. They are three different jobs, and confusing them is why merchants under-invest in one and wonder why the others underperform.',
    },
    {
      type: 'table',
      headers: ['Expression', 'What it is', 'What it decides', 'Who reads it'],
      rows: [
        [
          'Merchant feed',
          'Your catalog submitted to a platform, typically Google Merchant Center',
          'Whether you appear in AI shopping results at all',
          'Google AI Mode, Gemini, YouTube Shopping',
        ],
        [
          'Protocol feed',
          'The catalog layer of an agentic commerce protocol (UCP, ACP)',
          'Whether an agent can transact, not just recommend',
          'Agents transacting through that protocol',
        ],
        [
          'On-site structured data',
          'JSON-LD on your own product pages',
          'Whether your claims verify independently',
          'Every crawler and assistant, including ones with no feed',
        ],
      ],
    },
    {
      type: 'p',
      text: 'The relationship between the first two is the one that trips people up. Merchant Center is the catalog data layer. UCP is the conversational and checkout layer that sits on top of it, adding cart, checkout, payment, and post-purchase order handling. A retailer with a clean Merchant Center feed gets discovered in AI Mode. A retailer with full UCP support also gets agentic checkout. The feed is necessary for both, and sufficient for neither the whole way. The [UCP merchant guide](/learn/what-is-google-ucp) covers the protocol layer in detail.',
    },
    {
      type: 'p',
      text: 'The third expression is the one merchants skip, and it is doing quiet, important work. Product, MerchantReturnPolicy, OfferShippingDetails, and AggregateRating markup on your own pages let an agent verify your product information independently of any feed you submit. That independence is the entire point. A feed is a claim you make about yourself; on-site structured data is the corroboration. The [JSON-LD guide](/learn/json-ld-for-ai-agents) has copy-paste templates.',
    },
    { type: 'h2', text: 'Consistency is a hard requirement' },
    {
      type: 'p',
      text: 'Google continuously compares what you submit in Merchant Center against what is actually on your website. When the two disagree, trust drops and visibility suffers. That mechanism predates agentic commerce, but its consequences got sharper, because the tolerance on the other side collapsed.',
    },
    {
      type: 'callout',
      tone: 'amber',
      title: 'A human overlooks a mismatch. An agent will not.',
      text: 'A shopper who sees $79 in a listing and $84 at checkout mostly shrugs and buys it. An agent asked to find something under $80 treats that as a failed transaction, and the assistant that surfaced you takes the reputational hit. Same for a missing return policy, a shipping estimate that does not match, or an item marked in stock that is not. Every one of those is survivable with humans and disqualifying with agents.',
    },
    {
      type: 'p',
      text: 'The practical implication is architectural rather than editorial. If your feed, your protocol catalog, and your page markup are maintained as three separate artifacts by three separate processes, they will drift, and drift is the failure mode. The durable answer is one canonical source of truth that generates all three, so a price change is one edit that propagates everywhere rather than three edits someone has to remember.',
    },
    { type: 'h2', text: 'The attributes that decide eligibility' },
    {
      type: 'p',
      text: 'Google\u2019s NRF 2026 guidance was specific about what a feed needs to carry to be useful to agents, and the shape of the advice is consistent across every surface: richer, more complete, more explicitly stated. In rough order of how often their absence costs a recommendation:',
    },
    {
      type: 'ul',
      items: [
        'Long, descriptive titles. Not brand-plus-SKU. The attributes a shopper would name (material, fit, size, capacity, color, use case) belong in the title where they can be matched.',
        'Rich descriptions that answer questions rather than sell. Agents extract facts from these, so a paragraph of adjectives contributes nothing while a paragraph of specifics contributes everything.',
        'Conversational attributes. Google added Merchant Center fields specifically for agentic surfaces, covering answers to common product questions, compatible accessories, and substitutes. These are the fields that let an agent handle "will this fit my..." without leaving the conversation.',
        'Multiple quality images. Multimodal assistants genuinely use them, and a single low-resolution shot limits how confidently you can be surfaced.',
        'Complete commercial terms. Shipping cost and timeframe, return window and conditions, promotional pricing. An agent comparing two similar items on total landed cost cannot include you if it cannot compute yours.',
        'Accurate, current availability. The single fastest way to lose standing, because it produces a visibly wrong recommendation.',
      ],
    },
    {
      type: 'p',
      text: 'The blunt version, and it is worth stating this way: every missing attribute is a lost recommendation opportunity, not a slightly weaker one. Filters exclude; they do not rank down.',
    },
    {
      type: 'cta',
      title: 'See what agents can actually verify about your catalog',
      text: 'The free Nexez scanner fetches your site the way an agent does and scores what it can confirm: structured product data, machine-readable prices and availability, and whether your claims verify independently. No signup, about a minute.',
      href: '/scan',
      label: 'Scan your site free',
    },
    { type: 'h2', text: 'Which feed do you actually need?' },
    {
      type: 'p',
      text: 'This depends less on strategy than on what you already run.',
    },
    {
      type: 'ol',
      items: [
        'On Shopify: much of it is handled. Agentic Storefronts activated UCP and native MCP servers by default in the Winter 2026 Edition, so your work is data quality rather than integration.',
        'With an existing Merchant Center feed: you are most of the way there. UCP layers onto the same catalog pipeline, and the simplified Merchant Center onboarding exists precisely for this case. Enrich what you already submit before building anything new.',
        'On another platform: check whether your provider has shipped UCP support before writing code. Several committed through 2026, and waiting a quarter often beats a custom integration you then maintain forever.',
        'Custom or headless: build the Merchant Center feed first for discovery, then the protocol layer for transaction. Discovery is the cheaper half and it is where the volume is.',
        'Selling through ChatGPT: feed data drives product discovery there, but note that in-chat checkout is gone. OpenAI [retired Instant Checkout in March 2026](/learn/chatgpt-instant-checkout-retired), so the feed earns you the recommendation and your own checkout closes it.',
      ],
    },
    { type: 'h2', text: 'What if you do not have products?' },
    {
      type: 'p',
      text: 'Feeds are SKU-shaped, and that is a real limitation rather than something to talk around. If you sell appointments, consults, or classes, today\u2019s feed specifications model shipping and returns and variants, none of which describe a Tuesday afternoon slot. Google has formed domain councils for verticals including lodging and food ordering, so this is moving, but it has not arrived.',
    },
    {
      type: 'p',
      text: 'In the meantime the equivalent work is the same work with a different output format: named, priced offers as structured data on their own pages, real availability exposed through a callable endpoint, and a booking action an agent can actually invoke. That path runs through [an MCP server](/learn/what-is-an-mcp-server) rather than a feed, and it is covered in [how AI agents book service businesses](/learn/ai-agents-book-service-businesses). The underlying discipline is identical: state what you sell in typed fields, keep it true, and make it verifiable.',
    },
    { type: 'h2', text: 'The checklist' },
    {
      type: 'p',
      text: 'If you do nothing else this quarter, do these in order:',
    },
    {
      type: 'ol',
      items: [
        'Audit for disagreement first. Pick twenty products and compare price, availability, shipping, and returns across your feed, your protocol catalog if you have one, and your live page markup. Fix every mismatch before enriching anything, because enrichment on top of drift just propagates the drift.',
        'Enrich titles and descriptions. This is the highest-return editing work and it does not require engineering.',
        'Fill in commercial terms completely. Shipping, returns, and promotional pricing are frequently blank and frequently decisive.',
        'Add or complete on-site structured data so your claims verify independently of the feed.',
        'Fix your refresh cadence. Availability and price should propagate in minutes, not overnight, and certainly not weekly.',
        'Generate rather than maintain. If three artifacts are edited by hand, budget for the day they disagree. One source of truth removes the whole class of failure.',
      ],
    },
    {
      type: 'p',
      text: 'The through-line across every agentic surface is unglamorous and consistent. Agents do not reward persuasion, they reward verifiability. A catalog that says exactly what it is, everywhere, in the same way, is the entire competitive advantage available here, and it is available to a small merchant on equal terms with a large one.',
    },
    {
      type: 'cta',
      title: 'One catalog, every feed, generated not maintained',
      text: 'Nexez publishes your business as agent-legible, agent-transactable listings from a single source of truth: JSON-LD, agent.json, llms.txt, OpenAPI, a per-merchant MCP server, and ACP plus UCP feeds, with real Stripe checkout and Calendly-backed scheduling behind them. Change a price once and every surface agrees. Start on Free with no card; paid plans include a 7-day trial.',
      href: '/how-it-works',
      label: 'See how it works',
    },
  ],
  faqs: [
    {
      question: 'What is a product feed for AI agents?',
      answer:
        'It is your catalog expressed as structured data, one record per item with typed fields for title, description, price, availability, images, shipping, and returns. It is the same artifact that has powered shopping ads for years, but its role changed: the attributes you submit now determine whether AI shopping surfaces can find, filter, and recommend your products at all.',
    },
    {
      question: 'Do I need a separate feed for every AI platform?',
      answer:
        'Not separate catalogs, but different expressions of one. A Merchant Center feed drives discovery on Google\u2019s AI surfaces, a protocol catalog (UCP or ACP) enables agents to transact, and on-site JSON-LD lets agents verify your claims independently. They serve different jobs and should be generated from one source of truth rather than maintained separately, because separate maintenance means eventual disagreement.',
    },
    {
      question: 'Why does my feed have to match my website exactly?',
      answer:
        'Because both are checked, and against each other. Google continuously compares Merchant Center data with your live site, and mismatches reduce trust and visibility. Agents are far less forgiving than shoppers: a price that changes between listing and checkout breaks a constraint the agent was asked to satisfy, and the assistant that recommended you takes the reputational damage, so it discounts you next time.',
    },
    {
      question: 'Which feed attributes matter most for AI visibility?',
      answer:
        'Long descriptive titles carrying the attributes shoppers actually name, rich fact-dense descriptions, Google\u2019s conversational attributes (common product questions, compatible accessories, substitutes), multiple quality images, complete commercial terms covering shipping and returns and promotions, and accurate current availability. Missing attributes exclude you from filtered results rather than merely ranking you lower.',
    },
    {
      question: 'How fresh does my feed need to be?',
      answer:
        'Fresher than traditional shopping required. Google\u2019s Shopping Graph refreshes on the order of two billion listings per hour, and AI surfaces weight currency heavily because recommending an unavailable item is a visible failure. Price and availability changes should propagate in minutes. Overnight batch updates are increasingly a liability for fast-moving inventory.',
    },
    {
      question: 'Can service businesses use product feeds?',
      answer:
        'Poorly, today. Feed specifications are SKU-shaped, modeling variants, shipping, and returns rather than appointments. Google has formed domain councils for verticals including lodging and food ordering, so expansion is underway, but the current path for services is structured offer data on your own pages plus callable availability and booking through an MCP server, covered in [how AI agents book service businesses](/learn/ai-agents-book-service-businesses).',
    },
  ],
}
