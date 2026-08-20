import type { LearnArticle } from '../learn-content'

export const ucpVsAcpVsMcp: LearnArticle = {
  slug: 'ucp-vs-acp-vs-mcp',
  metaTitle: 'UCP vs ACP vs MCP: Agentic Commerce Compared',
  metaDescription:
    'ACP, UCP, and MCP explained for merchants: who runs each protocol, which AI surface it unlocks, what you must provide, and which to support first.',
  title: 'UCP vs ACP vs MCP: which agentic-commerce rails matter for your business?',
  dek: 'Three protocols now decide whether AI agents can find your business and pay you. Here is what each one actually does, who runs it, what it costs you to support, and the honest order to adopt them in.',
  category: 'Agentic commerce',
  publishedAt: '2026-07-13',
  updatedAt: '2026-08-20',
  readMinutes: 9,
  blocks: [
    {
      type: 'p',
      text: 'If you sell anything online, three acronyms started crowding your feeds over the past year: ACP, UCP, and MCP. They sound interchangeable. They are not, and the differences decide which AI surfaces can discover your business, which can book or buy from you, and how much engineering each one demands.',
    },
    {
      type: 'p',
      text: 'The stakes stopped being theoretical a while ago. Salesforce reported that AI influenced $262 billion of online sales during the 2025 holiday season, and every major assistant now ships some form of shopping. This guide defines each protocol in plain English, compares them side by side, and ends with an honest decision guide.',
    },
    {
      type: 'callout',
      tone: 'amber',
      title: 'Updated August 20, 2026',
      text: 'An earlier version of this guide described ChatGPT Instant Checkout as live but gated. OpenAI retired it on March 4, 2026. The ACP sections below have been corrected; the protocol survived, the ChatGPT checkout surface did not. Full context in [what happened to ChatGPT Instant Checkout](/learn/chatgpt-instant-checkout-retired).',
    },
    { type: 'h2', text: 'Three protocols, three different jobs' },
    {
      type: 'p',
      text: 'Here is the shortest accurate version. ACP is the open checkout specification OpenAI and Stripe published, now maintained as a standard with adopters including PayPal and Stripe, though the ChatGPT surface it launched with is gone. UCP is Google’s commerce protocol: it connects your catalog and checkout to Gemini and Google’s AI shopping surfaces, onboarded through Merchant Center, and it is where live agentic checkout actually happens in 2026. MCP is the general-purpose tool protocol: it is how agents call any external capability at all, and commerce actions like searching listings or starting a booking are just one use of it.',
    },
    {
      type: 'p',
      text: 'A useful mental model: UCP is a sales channel with a spec attached. ACP is a specification looking for surfaces after losing its original one. MCP is plumbing. Confusing them is easy because all three landed within about fourteen months of each other, but they solve different problems and you evaluate them differently.',
    },
    { type: 'h2', text: 'ACP: the open checkout spec that outlived its launch surface' },
    {
      type: 'p',
      text: 'OpenAI and Stripe published the Agentic Commerce Protocol as an open spec in September 2025 under Apache 2.0, and it powered Instant Checkout in ChatGPT. Etsy sellers were the launch cohort, with a small group of Shopify merchants following. Then OpenAI retired in-chat checkout on March 4, 2026, roughly five months later, after Walmart and others found that checkout inside the assistant converted far worse than sending buyers to their own sites.',
    },
    {
      type: 'p',
      text: 'The protocol did not go with it. ACP has two halves: a product feed that lets agents discover and compare your items, and a checkout API (checkout sessions) that you or your platform host, with payment handled through a delegated token so raw card details never touch your servers. The feed half transfers cleanly to other surfaces because structured product data is the shared input everywhere. The checkout half now pays off only where something you use actually speaks ACP, which today means PayPal, Stripe’s Agentic Commerce Suite, or a platform that implements it.',
    },
    {
      type: 'p',
      text: 'Status as of August 2026: the specification is active, with a stable revision dated April 17, 2026 covering checkout, payment delegation, cart, feed, orders, authentication, and integration with MCP. That convergence with MCP is the strongest signal about where it is heading. The practical detail is in our [ACP guide](/learn/acp-enrollment-guide).',
    },
    {
      type: 'callout',
      tone: 'ready',
      title: 'Discovery and checkout were always separate switches',
      text: 'Getting into an assistant’s product discovery requires a feed and legible data. Taking payment through an agent requires transactional integration on top of that. The retirement of ChatGPT checkout proved how separable they are: discovery kept growing while the checkout surface closed. Discovery remains the cheaper, ungated half on every rail. If you sell without a Shopify store, [you do not need one for this](/learn/sell-on-chatgpt-without-shopify).',
    },
    { type: 'h2', text: 'UCP: Google’s commerce protocol for Gemini and Search' },
    {
      type: 'p',
      text: 'Google introduced the Universal Commerce Protocol at NRF in January 2026 as the standard way its AI surfaces talk to merchants, co-developed with Shopify, Etsy, Wayfair, Target, and Walmart. The front door is [Google Merchant Center](https://support.google.com/merchants): your catalog data flows in the way Shopping feeds always have, and UCP layers agent-facing capabilities on top so Gemini, AI Mode in Search, and YouTube Shopping can move from recommending a product to transacting for it.',
    },
    {
      type: 'p',
      text: 'The design choice worth noticing is that UCP is transport-flexible. The same commerce capabilities can be served over a plain REST API, over MCP, or over A2A, Google’s agent-to-agent protocol. Payments compose with AP2, the Agent Payments Protocol Google published in September 2025 with a long roster of payments partners; AP2 handles the "did a human actually authorize this purchase" mandate so an agent cannot spend without provable consent.',
    },
    {
      type: 'p',
      text: 'Status as of August 2026: this is the live agentic checkout rail with real distribution behind it. Shopify enabled Agentic Storefronts by default in its Winter 2026 Edition, activating UCP for its merchants without per-merchant integration work. If you already maintain a Merchant Center feed for Shopping ads, you are much closer to UCP-ready than you probably think. The merchant-side detail is in [what is Google UCP](/learn/what-is-google-ucp).',
    },
    { type: 'h2', text: 'MCP: the protocol agents use to actually do things' },
    {
      type: 'p',
      text: 'The Model Context Protocol is the odd one out because it was never a commerce spec. Anthropic released it as an open standard in November 2024 to give AI models one uniform way to call external tools. OpenAI adopted it in March 2025, Google followed, and it is now the closest thing agents have to a USB port. The spec and ecosystem live at [modelcontextprotocol.io](https://modelcontextprotocol.io).',
    },
    {
      type: 'p',
      text: 'For a merchant, MCP means exposing your business as callable tools: search my offers, check availability, book an appointment, start a checkout. Any MCP-capable agent can then act against your business directly instead of scraping your website and guessing. That includes Claude, ChatGPT’s developer mode, and the long tail of custom agents companies are building internally, which is a market no feed reaches.',
    },
    {
      type: 'p',
      text: 'There is also a distribution angle people miss. MCP servers are listed in the official MCP registry and mirrored across directories like Smithery and mcp.so, so a listed server is discoverable by agent builders in a way a private API never was. And because both UCP and the current ACP spec accept or integrate MCP, a well-built commerce MCP server is not a dead end; it is a component the bigger rails reuse.',
    },
    {
      type: 'cta',
      title: 'How agent-readable is your site right now?',
      text: 'Before picking protocols, see what agents can already extract from your website. The free scanner grades your site’s agent legibility and shows exactly which checks fail.',
      href: '/scan',
      label: 'Scan your site free',
    },
    { type: 'h2', text: 'Side by side: who runs what, and what it takes' },
    {
      type: 'table',
      headers: ['', 'ACP', 'UCP', 'MCP'],
      rows: [
        [
          'Who runs it',
          'OpenAI and Stripe (open spec, Apache 2.0)',
          'Google, with launch partners',
          'Open standard started by Anthropic',
        ],
        [
          'What it is',
          'Checkout and feed specification, now surface-independent',
          'Catalog + checkout protocol for Google’s AI surfaces',
          'General tool-calling protocol; commerce is one use',
        ],
        [
          'Surface it unlocks',
          'Wherever adopters implement it (PayPal, Stripe, some platforms)',
          'Gemini, AI Mode in Search, YouTube Shopping',
          'Claude, ChatGPT developer mode, any MCP client',
        ],
        [
          'What you provide',
          'Product feed + checkout-sessions API + delegated payment support',
          'Merchant Center feed + UCP endpoint (REST, MCP, or A2A)',
          'A hosted MCP server exposing search / booking / checkout tools',
        ],
        [
          'Payments',
          'You stay merchant of record; tokenized, card data never hits you',
          'Composes with Google’s AP2 authorization mandates',
          'Whatever your tools implement (Stripe checkout is typical)',
        ],
        [
          'Status Aug 2026',
          'Spec active (April 2026 revision, MCP integration); ChatGPT checkout retired March 2026',
          'Live agentic checkout rail; default-on for Shopify merchants',
          'Mature, widely adopted, official registry live',
        ],
        [
          'Best first fit',
          'Merchants whose platform or PSP already speaks it',
          'Product merchants, especially those on Merchant Center or Shopify',
          'Service businesses and anyone wanting the widest agent reach',
        ],
      ],
    },
    {
      type: 'p',
      text: 'One caveat, and March 2026 is the proof of it: "status" in this space has a shelf life measured in months. Treat the August 2026 column as a snapshot, not a prediction.',
    },
    { type: 'h2', text: 'Where they overlap, and where they compose' },
    {
      type: 'p',
      text: 'These are not three competitors fighting for one socket. UCP explicitly supports MCP as a transport, so the "Google protocol" can literally run over the "Anthropic protocol," and the current ACP spec integrates MCP too. ACP’s product feed is a close cousin of the Merchant Center feed, close enough that one well-structured catalog generates both. And AP2 is a payments layer, not a rival channel; it can sit underneath more than one of these rails.',
    },
    {
      type: 'p',
      text: 'The deeper overlap is the substrate. All three assume your business data exists in structured, machine-readable form, and an agent that discovers you through any protocol still cross-checks your actual website before recommending you. Schema.org JSON-LD, clean crawlable HTML, and conventions like llms.txt remain the common denominator underneath every rail; we cover that layer in [what llms.txt actually does](/learn/what-is-llms-txt).',
    },
    {
      type: 'p',
      text: 'In practice the protocols compose per buyer, not per merchant. One customer’s agent finds you through Gemini, another arrives from a ChatGPT recommendation and buys on your own site, a third books through a custom concierge agent hitting your MCP server. Same catalog, three doors. The winners stopped asking which door and started keeping one catalog behind all of them.',
    },
    { type: 'h2', text: 'Which should you support first? The honest answer' },
    {
      type: 'p',
      text: 'None of them, at first. The bulk of agent traffic in 2026 is still a model reading your web pages, so structured data and crawlability pay off before any protocol does, and every protocol either consumes that same catalog data or verifies against it. Be honest about the fads too: Ahrefs found no ranking correlation for llms.txt and Google’s guidance says it is not required, so treat that file as a cheap courtesy, not a strategy. The JSON-LD and clean markup underneath it are the part that compounds.',
    },
    {
      type: 'ol',
      items: [
        'Fix the substrate. Every offer or service gets schema.org JSON-LD, a crawlable HTML page, and accurate prices and availability. Verify with a [free agent-legibility scan](/scan) rather than assuming.',
        'Win discovery everywhere before transacting anywhere. Being findable and accurately described is the ungated half on every rail, and with ChatGPT checkout gone it is the entire opportunity on that surface.',
        'Follow your buyers for the transactional layer. If you sell products, UCP is where live agentic checkout is in 2026, and Merchant Center is the shortest path in. If your buyers are businesses or agent builders, an MCP server reaches them all. Add ACP checkout when a platform or payment provider you use requires it.',
        'Watch your referrers and let data pick your next move. Agent traffic shows up in server logs and analytics in odd shapes; two months of real evidence beats any punditry, including this article. The [measurement guide](/learn/measure-ai-agent-traffic) covers how.',
      ],
    },
    {
      type: 'p',
      text: 'If you run a service business, one more honest note: ACP and UCP grew up around physical products. Their feeds model SKUs, shipping, and returns, and bookable services fit awkwardly today. If you sell appointments, consults, or classes, an MCP server wired to real availability plus a normal Stripe checkout will beat waiting for the feed specs to catch up; we wrote up how that flow works end to end in [how AI agents book service businesses](/learn/ai-agents-book-service-businesses).',
    },
    {
      type: 'callout',
      tone: 'amber',
      title: 'Do not bet a quarter on one vendor’s surface',
      text: 'These specs are young and moving, and March 2026 showed what happens to merchants who built specifically for one company’s checkout product. The cheap move is keeping one canonical catalog and generating every protocol surface from it, so a spec revision or a shutdown is a regeneration rather than a rebuild.',
    },
    { type: 'h2', text: 'The compounding move: one catalog, every rail' },
    {
      type: 'p',
      text: 'If maintaining a product feed, a checkout API, an MCP server, and structured markup sounds like a lot, that is the actual argument for a hosted layer. Nexez publishes each listing simultaneously as a human web page, JSON-LD, agent.json, llms.txt, an OpenAPI spec, and a per-merchant MCP server listed in the official registry, plus ACP and UCP feeds generated from the same core. Buyers pay through hosted Stripe checkout with you as merchant of record, including Calendly-backed scheduling for bookable services.',
    },
    {
      type: 'p',
      text: 'You keep your own website and your own Stripe account as merchant of record. The protocols become output formats of one catalog instead of four separate projects, which is exactly the shape this market rewards while the specs keep moving.',
    },
    {
      type: 'cta',
      title: 'Be on every rail without rebuilding for each',
      text: 'One listing becomes HTML, JSON-LD, MCP tools, and ACP + UCP feeds automatically. See the full pipeline from your catalog to every agent surface.',
      href: '/how-it-works',
      label: 'See how it works',
    },
  ],
  faqs: [
    {
      question: 'What is the difference between UCP and ACP?',
      answer:
        'Different owners, different status. ACP is the open specification OpenAI and Stripe published, built around a product feed plus a checkout-sessions API. It launched with ChatGPT Instant Checkout, which OpenAI retired in March 2026, so ACP now lives through other adopters such as PayPal and Stripe rather than a flagship assistant surface. UCP is Google’s protocol, onboarded through Merchant Center, and it is where live agentic checkout runs today across Gemini, AI Mode, and YouTube Shopping.',
    },
    {
      question: 'Is MCP only for developers?',
      answer:
        'MCP is a developer protocol, but that does not mean you have to build one. Hosted platforms can run a per-merchant MCP server for you, the same way you did not write your own email server to send email. What matters commercially is that one exists for your business and is listed where agent builders look, like the official MCP registry.',
    },
    {
      question: 'Does supporting these protocols improve my Google rankings?',
      answer:
        'There is no evidence any of them are a ranking factor, and Ahrefs found no ranking correlation even for llms.txt. Think of protocol support as distribution on new surfaces, not SEO. The one adjacent benefit is that the schema.org JSON-LD you need for agents also powers rich results in classic search, so the substrate work pays twice.',
    },
    {
      question: 'Can a service business use ACP or UCP, or are they only for products?',
      answer:
        'Both feeds are product-shaped today: SKUs, shipping, returns. Bookable services fit awkwardly, so service businesses get more value right now from agent-legible pages plus an MCP server that exposes real availability and booking. Keep an eye on category expansion though, because both platforms have obvious incentives to add services, and Google has already signalled movement into bookings.',
    },
    {
      question: 'What is AP2 and do I need it as well?',
      answer:
        'AP2 is the Agent Payments Protocol Google published in September 2025. It is not a sales channel; it is the authorization layer that proves a human approved an agent’s purchase, and it composes with UCP checkout. You will almost never implement AP2 standalone as a merchant; it arrives bundled with whichever UCP path or platform you adopt.',
    },
  ],
}
