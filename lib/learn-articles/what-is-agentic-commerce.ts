import type { LearnArticle } from '../learn-content'

export const whatIsAgenticCommerce: LearnArticle = {
  slug: 'what-is-agentic-commerce',
  metaTitle: 'What Is Agentic Commerce? The 2026 Guide',
  metaDescription:
    'Agentic commerce explained: how AI agents discover, compare, and buy on behalf of shoppers, the market numbers behind the shift, and how merchants get ready.',
  title: 'What is agentic commerce? A plain-English guide for 2026',
  dek: 'Agentic commerce is shopping where an AI agent, not a human with a browser, does the discovering, comparing, and increasingly the buying. Here is how a machine-mediated purchase actually works, what the market data really shows, and what merchants should do about it now.',
  category: 'Agentic commerce',
  publishedAt: '2026-08-10',
  updatedAt: '2026-08-20',
  readMinutes: 11,
  blocks: [
    {
      type: 'p',
      text: 'Agentic commerce is the model where an AI agent handles part or all of a purchase on behalf of a person. The shopper states an intent ("find me a physio appointment this week" or "restock my coffee under $20 a bag") and the agent does the discovery, comparison, and, where the merchant supports it, the checkout. It is distinct from conversational commerce, where a chatbot assists a human who is still doing the shopping. In agentic commerce, the human delegates; the agent executes.',
    },
    {
      type: 'p',
      text: 'The reason everyone from Stripe to Google shipped a commerce protocol in the last year is that the delegation is no longer hypothetical. AI-referred retail traffic grew 393% year over year in Q1 2026 and converts roughly 42% better than traditional search, according to Adobe Analytics. OpenAI says ChatGPT handles on the order of 50 million shopping queries a day. McKinsey pegs the global opportunity at $3 to $5 trillion by 2030. Those are the headline numbers; the fine print is more interesting, and this guide covers both.',
    },
    {
      type: 'p',
      text: 'What follows: how an agentic purchase actually flows step by step, the market data with sources, the protocol stack underneath it, which businesses feel the shift first, and a concrete readiness checklist. If you want the protocol acronyms untangled first, the [UCP vs ACP vs MCP explainer](/learn/ucp-vs-acp-vs-mcp) does exactly that.',
    },
    { type: 'h2', text: 'How an agentic purchase actually works' },
    {
      type: 'p',
      text: 'Strip away the branding and every agentic transaction moves through the same stages. Where a merchant is invisible or unreadable at any stage, the agent routes around them and the sale goes elsewhere.',
    },
    {
      type: 'ol',
      items: [
        'Intent. The person tells their assistant what they want in natural language, with constraints: budget, timing, brand preferences, size, location.',
        'Discovery. The agent searches the open web, structured catalogs, and protocol-compliant feeds to build a candidate list. This is where crawlability and structured data decide whether you exist at all.',
        'Evaluation. The agent compares candidates on the facts it can verify: price, availability, reviews, policies, shipping, fit with the stated constraints. Typed data beats marketing prose here, because an agent will not risk asserting a claim it cannot ground.',
        'Configuration and negotiation. For anything beyond a simple SKU, the agent resolves options: variant, date and time slot, delivery window, sometimes price or bundle terms where the seller exposes room to negotiate.',
        'Transaction. The agent either completes checkout directly through a commerce protocol, hands off to the merchant with the cart pre-built, or books the appointment through a callable endpoint.',
        'Post-purchase. Confirmations, tracking, rescheduling, and support increasingly flow back through the same agent, which remembers the merchant that made steps one through five easy.',
      ],
    },
    {
      type: 'p',
      text: 'The contrast with conversational commerce matters for planning. A chatbot on your own site improves your funnel. An external buying agent replaces the funnel: there may be no visit, no pageview, and no branded moment before money moves. Analysts have started calling the end state zero-click commerce, and it changes what "being found" means.',
    },
    { type: 'h2', text: 'The numbers, with sources' },
    {
      type: 'p',
      text: 'This topic attracts inflated claims, so here are the figures worth building strategy on, each attributed. Forecasts disagree on magnitude but agree on direction.',
    },
    {
      type: 'table',
      headers: ['Projection', 'Figure', 'Source'],
      rows: [
        ['Global agentic commerce by 2030', '$3 to $5 trillion', 'McKinsey'],
        ['Share of US e-commerce through agents by 2030', '15 to 25% of online sales', 'Bain, J.P. Morgan'],
        ['Shoppers using AI agents by 2030', 'Nearly half, covering ~25% of their spending', 'Morgan Stanley'],
        ['AI-referred retail traffic, Q1 2026', 'Up 393% year over year', 'Adobe Analytics'],
        ['Conversion of AI-referred traffic vs search', 'Roughly 42% better', 'Adobe Analytics'],
        ['ChatGPT shopping queries', '~50 million per day', 'OpenAI'],
        ['AI-influenced 2025 holiday sales', '$262 billion', 'Salesforce'],
      ],
    },
    {
      type: 'p',
      text: 'Consumer attitude data explains the shape of adoption. Around 70% of shoppers say they are at least somewhat comfortable with an AI agent making purchases for them, but only about 4% would trust one to buy without a final human review. Most people today use agents for research, comparison, and shortlisting, then approve the last step themselves. That is why the near-term prize is being the merchant the agent recommends, not just the merchant with a checkout API.',
    },
    {
      type: 'callout',
      tone: 'amber',
      title: 'The honest caveat in the data',
      text: 'Demand is ahead of infrastructure. Several analyses through 2025 and early 2026 found that while AI-referred visits convert well when the merchant is agent-legible, agents frequently fail to complete journeys on merchants that are not: content locked behind JavaScript, prices absent from structured data, no way to check availability. The gap between the traffic growth and completed transactions is not consumer reluctance, it is merchant readability. That gap is fixable, and fixing it is the entire agent-readiness discipline.',
    },
    { type: 'h2', text: 'The protocol stack underneath it' },
    {
      type: 'p',
      text: 'Three open protocols turned agentic commerce from demos into plumbing. The Agentic Commerce Protocol (ACP), launched by Stripe and OpenAI in September 2025 under an Apache 2.0 license, defines how an agent transacts with a merchant. It launched as the rail behind ChatGPT Instant Checkout, which OpenAI [retired in March 2026](/learn/chatgpt-instant-checkout-retired), and now lives through adopters including PayPal and Stripe.',
    },
    {
      type: 'p',
      text: 'Google debuted the Universal Commerce Protocol (UCP) at NRF in January 2026 to cover the full commerce journey across its surfaces. And the Model Context Protocol (MCP), open-sourced by Anthropic in late 2024 and since adopted across the major AI vendors, is the general-purpose standard that lets an agent call live tools: check a calendar, quote a price, place an order.',
    },
    {
      type: 'p',
      text: 'The practical takeaway is that these are complements, not competitors. Feeds make you discoverable across the big shopping surfaces, UCP is where agent-completed checkout actually runs today, and an MCP server makes you callable by everything else. The [ACP guide](/learn/acp-enrollment-guide) covers what that protocol is worth now, and the [MCP server explainer](/learn/what-is-an-mcp-server) covers what a merchant tool server actually exposes.',
    },
    { type: 'h2', text: 'Who feels it first' },
    {
      type: 'p',
      text: 'J.P. Morgan expects early agent-driven volume to concentrate in recurring, low-risk categories: groceries, subscriptions, replenishment. Those purchases are constraint-driven and low-regret, exactly what people delegate first. Commodity retail with clean product feeds is next, because the shopping surfaces already exist and enrollment is mostly a data exercise.',
    },
    {
      type: 'p',
      text: 'The sleeper category is services. Appointments, quotes, and bookings are natural agent tasks ("book me a haircut Thursday after 5pm") but most service businesses expose nothing an agent can act on: no structured offer data, no availability endpoint, no bookable action. The businesses that fix that convert delegated intent directly into revenue while competitors field phone calls. The [guide to AI agents booking service businesses](/learn/ai-agents-book-service-businesses) covers that path in detail.',
    },
    {
      type: 'cta',
      title: 'Find out what agents can see of your business today',
      text: 'The free Nexez scanner fetches your site the way a buying agent does and scores it on crawlability, structured data, and callable actions. No signup, results in about a minute.',
      href: '/scan',
      label: 'Scan your site free',
    },
    { type: 'h2', text: 'What merchants should do now' },
    {
      type: 'p',
      text: 'Agent readiness is a stack, and the layers build on each other. In priority order:',
    },
    {
      type: 'ol',
      items: [
        'Be fetchable. Server-render your content, keep prices and hours out of JavaScript-only rendering, and confirm robots.txt is not blocking GPTBot, ClaudeBot, or Google-Extended unless you mean to.',
        'Be legible. Publish JSON-LD structured data for your business, products, services, offers, and reviews. This is the cheapest hour on the list and the one with the best-documented consumers.',
        'Be listed. Publish a product or offer feed and get into the shopping surfaces that fit your category. Feed data drives product discovery on ChatGPT, and UCP on the Google side is where agent-completed checkout runs today. Without a feed you are not in the catalog.',
        'Be callable. Expose actions, not just facts: an OpenAPI spec, agent.json, or an MCP server that lets an agent check availability, get a live quote, and complete a booking or purchase.',
        'Be measurable. Segment AI-referred traffic and agent transactions separately in analytics. You cannot manage a channel you cannot see, and this one is growing under most dashboards’ radar.',
      ],
    },
    {
      type: 'p',
      text: 'Being cited by AI assistants when people research is its own adjacent discipline, with its own evidence base. The [generative engine optimization guide](/learn/generative-engine-optimization) covers that half: how answer engines choose what to cite, and what measurably moves it.',
    },
    { type: 'h2', text: 'The honest risks' },
    {
      type: 'p',
      text: 'Three deserve a clear-eyed look. First, fraud and trust: 78% of financial institutions expect fraud attempts to rise with agent traffic, and 2026 is the year "know your agent" authentication frameworks are being formalized, including cryptographic agent signatures pushed by infrastructure providers. Expect to verify agents the way you verify payments.',
    },
    {
      type: 'p',
      text: 'Second, margin pressure: when an agent compares on verifiable facts, weak differentiation gets priced out fast. Third, brand disintermediation: if the agent owns the relationship, the merchant risks becoming an anonymous fulfiller. The counterweight to all three is the same: be the merchant whose data is accurate, whose actions work on the first try, and whose name the agent has good reason to surface.',
    },
    {
      type: 'p',
      text: 'None of this requires believing the most aggressive forecasts. Even the conservative scenarios put a double-digit share of online transactions through agents within a few years, and the work to be ready for that is the same work that improves ordinary search visibility today. The merchants who treat 2026 as the preparation year get the compounding benefit; the ones who wait will be retrofitting under pressure.',
    },
    {
      type: 'cta',
      title: 'Ship the whole readiness stack in one setup',
      text: 'Nexez turns your existing website into agent-legible, agent-transactable listings: clean HTML plus JSON-LD, agent.json, llms.txt, an OpenAPI spec, a per-merchant MCP server, and ACP/UCP feeds, with real Stripe checkout and Calendly-backed scheduling behind them. Start on Free with no card; paid plans include a 7-day trial.',
      href: '/how-it-works',
      label: 'See how it works',
    },
  ],
  faqs: [
    {
      question: 'What is agentic commerce in simple terms?',
      answer:
        'It is shopping delegated to an AI agent. A person states what they want, and the agent finds options, compares them on verifiable facts like price and availability, and either completes the purchase or hands it back for final approval. The defining feature is delegation: the agent acts on the shopper’s behalf rather than just answering questions.',
    },
    {
      question: 'How is agentic commerce different from conversational commerce?',
      answer:
        'Conversational commerce is a chat interface helping a human who is still doing the shopping, typically on the merchant’s own site. Agentic commerce moves the work to the agent: discovery, comparison, and increasingly checkout happen inside the assistant, sometimes without the shopper ever visiting the merchant’s website.',
    },
    {
      question: 'How big will agentic commerce actually get?',
      answer:
        'Forecasts vary but point the same direction. McKinsey projects $3 to $5 trillion globally by 2030, Bain and J.P. Morgan both land around 15 to 25% of US online sales by 2030, and Morgan Stanley expects nearly half of online shoppers to use AI agents by then. Present-day signals back the trajectory: Adobe measured AI-referred retail traffic up 393% year over year in Q1 2026, converting about 42% better than traditional search.',
    },
    {
      question: 'Do AI agents buy things without human approval?',
      answer:
        'Mostly not yet. Surveys consistently find around 70% of shoppers are comfortable with agents purchasing for them in principle, but only a small minority would skip a final review. Today’s common pattern is agent-does-everything-except-confirm, with fully autonomous purchasing appearing first in low-risk recurring categories like replenishment and subscriptions.',
    },
    {
      question: 'How do I make my store visible to AI shopping agents?',
      answer:
        'In order: make your pages fetchable without JavaScript, add JSON-LD structured data for products, services, and offers, publish a structured feed and get into the agentic shopping surfaces relevant to your category, and expose callable actions through an OpenAPI spec or MCP server. A [free agent-legibility scan](/scan) shows which of those layers your site is missing right now.',
    },
    {
      question: 'Does agentic commerce replace SEO?',
      answer:
        'No, it extends it. Agents lean on ordinary crawling and search infrastructure for discovery, so crawlable, authoritative pages still matter. What changes is the target: being cited inside AI answers and being transactable by agents, alongside ranking in links. The citation half of that is [generative engine optimization](/learn/generative-engine-optimization); the transactable half is feeds, protocols, and callable endpoints.',
    },
  ],
}
