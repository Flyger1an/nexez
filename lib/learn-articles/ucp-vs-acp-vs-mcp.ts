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
  updatedAt: '2026-07-13',
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
    { type: 'h2', text: 'Three protocols, three different jobs' },
    {
      type: 'p',
      text: 'Here is the shortest accurate version. ACP is OpenAI’s checkout protocol: it lets ChatGPT complete a purchase from your business without the buyer leaving the chat. UCP is Google’s commerce protocol: it connects your catalog and checkout to Gemini and Google’s AI shopping surfaces, onboarded through Merchant Center. MCP is the general-purpose tool protocol: it is how agents call any external capability at all, and commerce actions like searching listings or starting a booking are just one use of it.',
    },
    {
      type: 'p',
      text: 'A useful mental model: ACP and UCP are sales channels with a spec attached. MCP is plumbing. The first two answer “can ChatGPT or Gemini sell my stuff?” The third answers “can any agent, anywhere, take a real action against my business?” Confusing them is easy because all three landed within about fourteen months of each other, but they solve different problems and you evaluate them differently.',
    },
    { type: 'h2', text: 'ACP: OpenAI’s checkout rail for ChatGPT' },
    {
      type: 'p',
      text: 'OpenAI and Stripe published the Agentic Commerce Protocol as an open spec in September 2025, and it is what powers Instant Checkout in ChatGPT. Etsy sellers were the launch cohort, with Shopify merchants following. The pitch to merchants is blunt and appealing: the buyer stays in ChatGPT, you stay the merchant of record, and the order lands in your existing systems.',
    },
    {
      type: 'p',
      text: 'Mechanically, ACP has two halves. Discovery runs on a product feed that OpenAI ingests so ChatGPT can surface your items in shopping answers. Checkout runs on a small REST API (checkout sessions) that you or your platform host, with payment handled through a delegated token so raw card details never touch your servers. The spec lives at [developers.openai.com/commerce](https://developers.openai.com/commerce) if you want the wire-level detail.',
    },
    {
      type: 'p',
      text: 'Status as of mid-2026: live, but gated. OpenAI revamped Instant Checkout in March 2026 toward a discovery-first flow, which quietly raised the value of simply being present in the feed even before your checkout enrollment clears. Enrollment itself is application-based and category-dependent. The full walkthrough, including what reviewers actually check, is in our [ACP enrollment guide](/learn/acp-enrollment-guide).',
    },
    {
      type: 'callout',
      tone: 'ready',
      title: 'Discovery and checkout are separate switches',
      text: 'Getting into ChatGPT’s product discovery requires a feed. Taking payment in-chat requires enrollment approval on top of that. Most merchants can flip the first switch this week and queue the second; treating them as one blocker is the most common reason merchants do neither. If you sell without a Shopify store, [you do not need one for this](/learn/sell-on-chatgpt-without-shopify).',
    },
    { type: 'h2', text: 'UCP: Google’s commerce protocol for Gemini and Search' },
    {
      type: 'p',
      text: 'Google introduced the Universal Commerce Protocol in early 2026 as the standard way its AI surfaces talk to merchants. The front door is [Google Merchant Center](https://support.google.com/merchants): your catalog data flows in the way Shopping feeds always have, and UCP layers agent-facing capabilities on top so Gemini and AI Mode in Search can move from recommending a product to transacting for it.',
    },
    {
      type: 'p',
      text: 'The design choice worth noticing is that UCP is transport-flexible. The same commerce capabilities can be served over a plain REST API, over MCP, or over A2A, Google’s agent-to-agent protocol. Payments compose with AP2, the Agent Payments Protocol Google published in September 2025 with a long roster of payments partners; AP2 handles the “did a human actually authorize this purchase” mandate so an agent cannot spend without provable consent.',
    },
    {
      type: 'p',
      text: 'Status as of mid-2026: discovery is the live half. Getting your catalog legible to Gemini through Merchant Center works today, while agentic checkout is rolling out in stages to enrolled merchants. If you already maintain a Merchant Center feed for Shopping ads, you are much closer to UCP-ready than you probably think.',
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
      text: 'There is also a distribution angle people miss. MCP servers are listed in the official MCP registry and mirrored across directories like Smithery and mcp.so, so a listed server is discoverable by agent builders in a way a private API never was. And because UCP accepts MCP as a transport, a well-built commerce MCP server is not a dead end; it is a component the bigger rails can reuse.',
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
          'OpenAI, with Stripe (open spec)',
          'Google, with launch partners',
          'Open standard started by Anthropic',
        ],
        [
          'What it is',
          'Checkout protocol for in-chat purchases',
          'Catalog + checkout protocol for Google’s AI surfaces',
          'General tool-calling protocol; commerce is one use',
        ],
        [
          'Surface it unlocks',
          'ChatGPT (product discovery + Instant Checkout)',
          'Gemini, AI Mode in Search, Shopping surfaces',
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
          'Status mid-2026',
          'Live; discovery-first revamp in March 2026; checkout enrollment gated',
          'Discovery live; agentic checkout rolling out in stages',
          'Mature, widely adopted, official registry live',
        ],
        [
          'Best first fit',
          'Merchants whose buyers already shop in ChatGPT',
          'Merchants already running Merchant Center feeds',
          'Service businesses and anyone wanting the widest agent reach',
        ],
      ],
    },
    {
      type: 'p',
      text: 'One caveat: “status” in this space has a shelf life measured in months. Treat the mid-2026 column as a snapshot, not a prediction.',
    },
    { type: 'h2', text: 'Where they overlap, and where they compose' },
    {
      type: 'p',
      text: 'These are not three competitors fighting for one socket. UCP explicitly supports MCP as a transport, so the “Google protocol” can literally run over the “Anthropic protocol.” ACP’s product feed is a close cousin of the Merchant Center feed, close enough that one well-structured catalog generates both. And AP2 is a payments layer, not a rival channel; it can sit underneath more than one of these rails.',
    },
    {
      type: 'p',
      text: 'The deeper overlap is the substrate. All three assume your business data exists in structured, machine-readable form, and an agent that discovers you through any protocol still cross-checks your actual website before recommending you. Schema.org JSON-LD, clean crawlable HTML, and conventions like llms.txt remain the common denominator underneath every rail; we cover that layer in [what llms.txt actually does](/learn/what-is-llms-txt).',
    },
    {
      type: 'p',
      text: 'In practice the protocols compose per buyer, not per merchant. One customer’s agent finds you through Gemini, another buys through ChatGPT, a third books through a custom concierge agent hitting your MCP server. Same catalog, three doors. The winners stopped asking which door and started keeping one catalog behind all of them.',
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
        'Follow your buyers, not the hype cycle. If your customers live in ChatGPT, do the ACP feed first and start the [enrollment process](/learn/acp-enrollment-guide) early. If you already run Merchant Center, UCP is your shortest path. If your buyers are businesses or agent builders, an MCP server reaches them all.',
        'Turn on discovery before checkout, on every rail. Feeds and discovery are the cheap, ungated half; checkout enrollment can lag by months. Being findable while you wait costs almost nothing.',
        'Watch your referrers and let data pick your second protocol. Agent traffic shows up in server logs and analytics in odd shapes; two months of real evidence beats any punditry, including this article.',
      ],
    },
    {
      type: 'p',
      text: 'If you run a service business, one more honest note: ACP and UCP grew up around physical products. Their feeds model SKUs, shipping, and returns, and bookable services fit awkwardly today. If you sell appointments, consults, or classes, an MCP server wired to real availability plus a normal Stripe checkout will beat waiting for the feed specs to catch up; we wrote up how that flow works end to end in [how AI agents book service businesses](/learn/ai-agents-book-service-businesses).',
    },
    {
      type: 'callout',
      tone: 'amber',
      title: 'Do not wait for a winner',
      text: 'These specs are young and moving quarterly, and betting months of engineering on hand-rolling one deep integration is how merchants end up locked to a rail that changes under them. The cheap move is keeping one canonical catalog and generating every protocol surface from it, so a spec revision is a regeneration, not a rebuild.',
    },
    { type: 'h2', text: 'The compounding move: one catalog, every rail' },
    {
      type: 'p',
      text: 'If maintaining a product feed, a checkout API, an MCP server, and structured markup sounds like a lot, that is the actual argument for a hosted layer. Nexez publishes each listing simultaneously as a human web page, JSON-LD, agent.json, llms.txt, an OpenAPI spec, and a per-merchant MCP server listed in the official registry, plus ACP and UCP feeds generated from the same money core. Discovery ships on [every plan](/pricing); agentic checkout is the Pro upgrade, with feed enrollment handled for you as the platforms open their gates.',
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
        'Different owners, different surfaces. ACP is OpenAI’s protocol (built with Stripe) and unlocks discovery and Instant Checkout inside ChatGPT via a product feed plus a checkout-sessions API. UCP is Google’s protocol, onboarded through Merchant Center, and unlocks Gemini and Google’s AI shopping surfaces over REST, MCP, or A2A transports. They overlap in intent, and most merchants will eventually want feeds on both.',
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
        'Both feeds are product-shaped today: SKUs, shipping, returns. Bookable services fit awkwardly, so service businesses get more value right now from agent-legible pages plus an MCP server that exposes real availability and booking. Keep an eye on category expansion though, because both platforms have obvious incentives to add services.',
    },
    {
      question: 'What is AP2 and do I need it as well?',
      answer:
        'AP2 is the Agent Payments Protocol Google published in September 2025. It is not a sales channel; it is the authorization layer that proves a human approved an agent’s purchase, and it composes with UCP checkout. You will almost never implement AP2 standalone as a merchant; it arrives bundled with whichever UCP path or platform you adopt.',
    },
  ],
}
