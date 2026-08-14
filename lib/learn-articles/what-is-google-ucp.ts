import type { LearnArticle } from '../learn-content'

export const whatIsGoogleUcp: LearnArticle = {
  slug: 'what-is-google-ucp',
  metaTitle: 'What Is Google UCP? A Merchant Guide',
  metaDescription:
    'Google UCP explained: the five capabilities, the 2026 timeline, how to onboard through Merchant Center, and what 11,414 verified stores reveal about it.',
  title: 'What is Google UCP? The Universal Commerce Protocol, explained for merchants',
  dek: 'UCP is the open standard Google and Shopify built so AI agents can search, cart, and buy from your store inside Gemini and AI Mode. Here is what it actually does, how to get on it, and what an independent census of every public UCP store says about where the ecosystem really stands.',
  category: 'Agentic commerce',
  publishedAt: '2026-08-14',
  updatedAt: '2026-08-14',
  readMinutes: 11,
  blocks: [
    {
      type: 'p',
      text: 'The Universal Commerce Protocol (UCP) is an open standard that lets AI agents complete the full shopping journey with your store: search your catalog, build a cart, check out, and handle the order afterward, without the shopper leaving the AI surface they started in. Google announced it on January 11, 2026 at NRF, co-developed with Shopify, Etsy, Wayfair, Target, and Walmart, and endorsed by more than twenty partners including Visa, Mastercard, Stripe, Adyen, American Express, Best Buy, and The Home Depot.',
    },
    {
      type: 'p',
      text: 'The critical thing to understand up front, and the thing most coverage buries: you remain the merchant of record on every UCP transaction. You keep the customer relationship, the customer data, the order confirmation emails, the loyalty accrual, and the support flow. Google does not insert itself as the seller. That design choice is why retailers who historically refused marketplace-style checkout have been willing to participate.',
    },
    {
      type: 'p',
      text: 'This guide covers the five capabilities, how UCP evolved across 2026, what onboarding actually looks like, and an honest look at the adoption data, including a July 2026 census of every public UCP store that should change how you prioritize. For how UCP compares against OpenAI\u2019s ACP and the general-purpose MCP, the [protocol comparison guide](/learn/ucp-vs-acp-vs-mcp) covers that side by side.',
    },
    { type: 'h2', text: 'The five capabilities' },
    {
      type: 'p',
      text: 'UCP is modular. Merchants declare which capabilities they support and which payment handlers they accept, and the protocol negotiates the rest, which is what removes the need for a separate integration meeting between every agent and every store. Three capabilities shipped at launch, and the March 19, 2026 update added two more.',
    },
    {
      type: 'table',
      headers: ['Capability', 'What an agent can do', 'Added'],
      rows: [
        ['Checkout', 'Initiate and complete a purchase on the shopper\u2019s behalf', 'January 2026'],
        ['Identity Linking', 'Apply the shopper\u2019s loyalty or member benefits, like member pricing or free shipping', 'January 2026'],
        ['Order Management', 'Retrieve order status, tracking, and post-purchase details', 'January 2026'],
        ['Cart', 'Add multiple items to a cart at once, the way a shopper normally would', 'March 2026'],
        ['Catalog', 'Pull real-time product details: variants, inventory, live pricing', 'March 2026'],
      ],
    },
    {
      type: 'p',
      text: 'The Catalog capability deserves particular attention because it changes what "accurate" means. A static feed refreshed daily is a snapshot; Catalog lets an agent query your live inventory and pricing at decision time. For merchants whose stock or prices move, that is the difference between an agent confidently recommending an item that is actually available and one that sold out this morning.',
    },
    { type: 'h2', text: 'How UCP evolved through 2026' },
    {
      type: 'p',
      text: 'The pace matters, because a protocol shipping this fast means anything you read from six months ago is likely stale:',
    },
    {
      type: 'ul',
      items: [
        'January 11: launch at NRF with Checkout, Identity Linking, and Order Management, initially single-item guest checkout for eligible US merchants.',
        'March 19: Cart and Catalog capabilities added, richer transaction flows, and a commitment to simplify onboarding.',
        'April: simplified Merchant Center onboarding begins rolling out, aimed explicitly at retailers of all sizes rather than just enterprise launch partners.',
        'May 20 (Google Marketing Live): Universal Cart expands to cross-retailer purchases, buy-now-pay-later arrives via Affirm and Klarna embedded in Google Pay, UCP-powered checkout comes to Shopping ads on YouTube, and geographic expansion begins beyond the US.',
        'Mid-2026 onward: expansion into new verticals, with Domain Technical Councils forming for areas including food ordering and lodging.',
      ],
    },
    {
      type: 'p',
      text: 'That last item is the one service businesses should watch. UCP launched as a retail protocol, and the honest position through the first half of 2026 was that bookable services fit awkwardly into product-shaped feeds. The formation of lodging and food-ordering domain councils signals that the protocol is deliberately growing past physical goods, which changes the medium-term calculus for anyone selling appointments, stays, or delivery.',
    },
    { type: 'h2', text: 'How you actually get on it' },
    {
      type: 'p',
      text: 'The path depends heavily on what you already run, and for a large share of merchants the answer is that most of the work is already done.',
    },
    {
      type: 'ol',
      items: [
        'On Shopify: largely automatic. Shopify co-developed UCP and activated Agentic Storefronts by default for merchants in its Winter 2026 Edition, which turns on UCP and native MCP servers without additional protocol configuration. Your job is data quality, not integration.',
        'With an existing Merchant Center feed: you are closer than you think. UCP layers agent capabilities on top of the same catalog pipeline Shopping ads have always used, and the simplified Merchant Center onboarding is designed exactly for this case.',
        'On another platform: check whether your provider has shipped support. Commerce Inc (BigCommerce and Feedonomics), Salesforce, and Stripe have all committed to implementing UCP on their platforms.',
        'On WooCommerce or custom: manual implementation, either through a community plugin that generates the manifest and agent endpoints, or by building against the spec directly. UCP is transport-agnostic, so you can serve it over REST, GraphQL, JSON-RPC, MCP, or A2A.',
        'Everyone: get your product data clean first. Every path above degrades to nothing if titles, variants, availability, and pricing are wrong, and Google added conversational Merchant Center attributes (answers to common product questions, compatible accessories, substitutes) that specifically feed agentic surfaces.',
      ],
    },
    {
      type: 'p',
      text: 'On payments: UCP checkout currently runs through Google Pay with methods stored in Google Wallet, with PayPal support announced as forthcoming. It composes with AP2, the Agent Payments Protocol, which supplies cryptographic proof that a human actually authorized the purchase, so an agent cannot spend without provable consent. You can take the native path, where the AI surface renders checkout, or the embedded path, where you keep your own checkout experience.',
    },
    {
      type: 'cta',
      title: 'Check whether agents can read your business at all',
      text: 'Protocol enrollment does not help if agents cannot parse your site. The free Nexez scanner fetches your pages the way an AI agent does and scores crawlability, structured data, and callable actions. No signup, about a minute.',
      href: '/scan',
      label: 'Scan your site free',
    },
    { type: 'h2', text: 'The number that should reorder your priorities' },
    {
      type: 'p',
      text: 'UCP Checker, an independent crawler that validates and grades every public UCP manifest it can find, published a state-of-the-ecosystem report covering 11,414 verified stores as a point-in-time census on July 7, 2026. Adoption growth was steep, up from 8,259 in June, and version discipline was remarkable: 99.7% of verified stores ran the same spec revision, 2026-04-08, which is rare for a six-month-old protocol. Then the capability histogram turned into a cliff. Checkout was declared nearly universally, but across all 11,414 verified stores, not one yet exposed a payment capability an agent could actually complete a purchase against.',
    },
    {
      type: 'p',
      text: 'UCP Checker reads that as encouraging rather than damning, and the reading is fair: eleven thousand stores have done the discovery, cart, and checkout integration work and standardized on one spec, so the fleet is staged at the payment line waiting for the payment rails and trust layer to settle. When that field flips, it flips against an installed base. But there is a second, equally true reading for a merchant deciding where to spend this quarter.',
    },
    {
      type: 'callout',
      tone: 'amber',
      title: 'Declaring a capability is not the same as shipping it',
      text: 'A UCP manifest is a set of claims about what your store supports. An agent that trusts the claim, attempts the transaction, and fails has wasted the shopper\u2019s time and will route around you next time. The gap between declared and functional capability is the single most common failure mode in agentic commerce right now, and it is not unique to UCP; the same pattern shows up in stale structured data and manifests that quote prices checkout no longer honors.',
    },
    {
      type: 'p',
      text: 'Two practical conclusions follow. First, the competitive bar is lower than the raw adoption count suggests: nobody has finished, so arriving now means arriving with the pack rather than behind it, and being genuinely transactable the moment the rails settle is still a differentiator. Second, verify your own implementation from the outside rather than trusting your dashboard. Independent validators exist precisely because self-reported conformance and actual agent experience diverge, and a manifest is a set of claims until something tests them.',
    },
    { type: 'h2', text: 'Should you prioritize UCP?' },
    {
      type: 'p',
      text: 'Honest answer, and it depends on one question: do you sell physical products through channels where Google already sends you traffic? If yes, UCP is high priority and probably cheap, because your Merchant Center feed is most of the work and Google\u2019s AI surfaces are where your buyers already are. If you are on Shopify, it may already be on.',
    },
    {
      type: 'p',
      text: 'If you sell services, appointments, or anything not shaped like a SKU, UCP is a watch item rather than a this-quarter project. The domain councils forming around lodging and food ordering say services are coming, but today your leverage is elsewhere: agent-legible pages, structured data, and callable endpoints like an [MCP server](/learn/what-is-an-mcp-server) that exposes real availability and booking. That path is covered in [how AI agents book service businesses](/learn/ai-agents-book-service-businesses).',
    },
    {
      type: 'p',
      text: 'And regardless of category, the substrate comes first. Every protocol either consumes your structured catalog data or cross-checks it against your live site before an agent commits to a recommendation. [JSON-LD structured data](/learn/json-ld-for-ai-agents) and clean, fetchable pages are what make you legible on every rail at once, including the ones that have not launched yet. Our [agent-readiness study](/learn/agent-readiness-study-2026) found that most small business sites fail at that substrate layer long before protocols become the bottleneck.',
    },
    {
      type: 'p',
      text: 'The pattern that keeps holding: maintain one canonical, accurate source of truth about what you sell and what it costs, and generate every protocol surface from it. UCP is transport-agnostic and modular by design precisely because the ecosystem expects the specifics to keep moving. Merchants who hand-rolled one deep integration in January have already had to revisit it twice; merchants who kept one clean catalog regenerated their surfaces and moved on.',
    },
    {
      type: 'cta',
      title: 'One catalog, every rail, always accurate',
      text: 'Nexez publishes your business as agent-legible, agent-transactable listings from a single source of truth: JSON-LD, agent.json, llms.txt, OpenAPI, a per-merchant MCP server, and ACP/UCP feeds with real Stripe checkout and Calendly-backed scheduling. Start on Free with no card; paid plans include a 7-day trial.',
      href: '/how-it-works',
      label: 'See how it works',
    },
  ],
  faqs: [
    {
      question: 'What does UCP stand for and who created it?',
      answer:
        'UCP is the Universal Commerce Protocol, an open-source standard announced by Google on January 11, 2026 at NRF. It was co-developed with Shopify, Etsy, Wayfair, Target, and Walmart, and endorsed by more than twenty ecosystem partners including Visa, Mastercard, Stripe, and Adyen. Although Google built the first reference implementation powering checkout in AI Mode and the Gemini app, the protocol is vendor-agnostic and designed to work across any AI platform or commerce system.',
    },
    {
      question: 'Does UCP mean Google becomes the seller of my products?',
      answer:
        'No. Retailers remain the merchant of record on every UCP transaction. You keep customer data and the customer relationship, orders process through your systems, confirmation emails come from you, loyalty points accrue in your program, and support flows through your existing channels. When a shopper buys items from three brands in one cart, each brand processes its own order independently.',
    },
    {
      question: 'What is the difference between UCP and ACP?',
      answer:
        'Different owners and different surfaces. UCP is the Google and Shopify standard covering the full shopping journey across Google\u2019s AI surfaces (AI Mode in Search, the Gemini app, YouTube Shopping), onboarded through Merchant Center. ACP is the OpenAI and Stripe protocol focused on checkout inside ChatGPT. They are compatible at the merchant infrastructure layer, and many retailers support both. The [full comparison](/learn/ucp-vs-acp-vs-mcp) breaks down what each requires.',
    },
    {
      question: 'How do I onboard to UCP?',
      answer:
        'It depends on your platform. Shopify merchants largely get it automatically through Agentic Storefronts, activated by default in the Winter 2026 Edition. Merchants with an existing Google Merchant Center feed use the simplified Merchant Center onboarding path that began rolling out in April 2026. Other platforms including BigCommerce, Salesforce, and Stripe have committed to implementing UCP, and WooCommerce or custom stores can implement manually against the open spec.',
    },
    {
      question: 'Can service businesses use UCP?',
      answer:
        'Not well yet, but that is changing. UCP launched product-shaped, so appointments and bookings fit awkwardly into its feed model today. However, Domain Technical Councils have formed for verticals including lodging and food ordering, signaling deliberate expansion beyond physical goods. In the meantime, service businesses get more immediate value from agent-legible pages plus a callable MCP server exposing real availability.',
    },
    {
      question: 'If thousands of stores already support UCP, am I too late?',
      answer:
        'No. An independent census of 11,414 verified UCP stores on July 7, 2026 found that while checkout was declared almost universally, not one store yet exposed a payment capability an agent could actually complete a purchase against. The ecosystem is staged at the payment line, waiting on payment rails and the trust layer, so declared capability and functional capability remain very different things. Arriving now means arriving with the pack rather than behind it.',
    },
  ],
}
