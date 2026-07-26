import type { LearnArticle } from '../learn-content'

export const sellOnChatgptWithoutShopify: LearnArticle = {
  slug: 'sell-on-chatgpt-without-shopify',
  metaTitle: 'Sell on ChatGPT Without Shopify or Etsy (2026)',
  metaDescription:
    'No Shopify or Etsy catalog? The three real routes into ChatGPT shopping in 2026: platform feeds, a DIY ACP build, or a hosted agent layer, plus a checklist.',
  title: 'How to sell on ChatGPT without Shopify or Etsy (2026 guide)',
  dek: 'ChatGPT shopping is not a marketplace you sign up for. It is an answer engine that recommends whatever it can read and trust. Here is how it sources those answers, the three realistic routes in, and the checklist worth doing this week even if you never touch a product feed.',
  category: 'Guides',
  publishedAt: '2026-07-13',
  updatedAt: '2026-07-13',
  readMinutes: 10,
  blocks: [
    {
      type: 'p',
      text: 'ChatGPT is now a place where people shop. Salesforce reported that AI influenced $262 billion of 2025 holiday sales, and OpenAI has been steadily building commerce into ChatGPT itself: product results inside answers, an Instant Checkout flow, and a published protocol for merchants who want in. Almost every guide to this assumes you have a Shopify or Etsy catalog. What if you don’t?',
    },
    {
      type: 'p',
      text: 'Plenty of businesses that could sell through ChatGPT have no product feed at all. Consultants, agencies, studios, clinics, trainers, local service companies. This guide covers how ChatGPT actually sources shopping answers, the three realistic routes in as of mid-2026, and the do-it-today checklist that applies no matter which route you pick.',
    },
    { type: 'h2', text: 'How ChatGPT sources its shopping answers' },
    {
      type: 'p',
      text: 'There is no dashboard where you buy placement. When someone asks ChatGPT for “a deep-tissue massage near Capitol Hill” or “a branding consultant for a product launch,” the model assembles an answer from two kinds of sources.',
    },
    {
      type: 'ul',
      items: [
        'The open web. OpenAI’s OAI-SearchBot crawls and indexes pages for ChatGPT search, and ChatGPT-User fetches pages live when a conversation triggers browsing. If your site blocks these crawlers, or your prices only exist inside JavaScript an agent never executes, you are invisible to this half of the pipeline.',
        'Structured merchant data. OpenAI and Stripe published the Agentic Commerce Protocol (ACP) as an open spec in September 2025. Merchants, or the platforms they sell on, submit product feeds through it, and that feed data powers rich product results and in-chat checkout.',
      ],
    },
    {
      type: 'p',
      text: 'OpenAI has said shopping results are organic and ranked on relevance, not paid placement. That cuts both ways: you cannot buy your way in, but a small business with clean data genuinely can appear next to much larger competitors.',
    },
    {
      type: 'p',
      text: 'The March 2026 change matters most for this guide. OpenAI revamped Instant Checkout toward discovery-first: merchants can now surface in shopping results and route buyers to their own checkout, with in-chat checkout as a deeper enrollment tier rather than the price of admission. The bar dropped from “integrate a checkout API” to “publish data agents can read.”',
    },
    { type: 'h2', text: 'Route 1: ride a platform integration' },
    {
      type: 'p',
      text: 'The launch cohort came in through platforms. OpenAI switched on Instant Checkout in September 2025 with Etsy sellers first and Shopify merchants following, and those platforms handle the feed and checkout plumbing behind what is essentially a toggle. If you already run a Shopify store, this is your answer: meet the eligibility requirements at [chatgpt.com/merchants](https://chatgpt.com/merchants), enroll, done.',
    },
    {
      type: 'p',
      text: 'The problem is who it leaves out. Platform integrations assume your business is a catalog of SKUs living inside their cart. A fractional CFO, a dog trainer, a wedding photographer, an HVAC company: none of these have a Shopify catalog, and standing one up just to generate a product feed means paying for and maintaining a store you do not otherwise need.',
    },
    {
      type: 'callout',
      tone: 'amber',
      title: 'Don’t migrate for the feed',
      text: 'Moving a service business onto a cart platform purely to reach ChatGPT is solving the problem backwards. The data formats agents need can be published from, or alongside, the website you already have.',
    },
    { type: 'h2', text: 'Route 2: build a direct ACP integration' },
    {
      type: 'p',
      text: 'ACP is an open specification, so nothing stops you from integrating directly. That is genuinely good news: there is no gatekeeper, and the documentation is public on [OpenAI’s developer site](https://developers.openai.com/commerce). But go in with clear eyes about the scope. A direct integration means:',
    },
    {
      type: 'ol',
      items: [
        'Publish a product feed in the ACP format and keep it current as prices and availability change.',
        'Implement the checkout API: REST endpoints where the agent creates a checkout session, updates it with address and fulfillment choices, and completes it.',
        'Handle delegated payments with Stripe’s Shared Payment Tokens, so the buyer’s payment credential reaches you scoped to that single transaction.',
        'Wire up order-lifecycle webhooks, verify request signatures, and make every endpoint idempotent so a retried call never double-charges.',
        'Test against the sandbox, then apply for enrollment and wait on OpenAI’s review.',
      ],
    },
    {
      type: 'p',
      text: 'For a team with backend engineers this is a real but bounded project. Think weeks rather than days, plus ongoing maintenance as the spec versions. For a business without engineers, it is not a realistic weekend job. We wrote a separate step-by-step for the build path in our [ACP enrollment guide](/learn/acp-enrollment-guide), and if you are wondering how this relates to Google’s competing spec, see [UCP vs ACP vs MCP](/learn/ucp-vs-acp-vs-mcp). Supporting the second protocol roughly doubles the surface you maintain.',
    },
    { type: 'h2', text: 'Route 3: use a hosted agent-commerce layer' },
    {
      type: 'p',
      text: 'The third route is the one current search results barely cover: keep the website you have, and let a hosted layer publish your offers in the formats agents consume. It is the same move card acceptance made decades ago. You do not implement the network protocols yourself; you plug into something that already speaks them.',
    },
    {
      type: 'p',
      text: 'This is what we built [Nexez](/how-it-works) to do. You describe your offers once, or import them from your site, Stripe, or Calendly, and Nexez serves them as structured listings agents can actually use: clean HTML plus JSON-LD, agent.json, llms.txt, an OpenAPI spec, and a per-merchant MCP server listed in the official MCP registry. On the checkout protocols, the ACP and UCP product feeds are live for discovery today, with checkout enrollment in progress. Buyers can already pay through hosted Stripe checkout with you as the merchant of record, including real Calendly-backed scheduling for bookable services.',
    },
    {
      type: 'p',
      text: 'The honest tradeoffs: you are relying on a layer you do not control, and advanced capabilities require a paid plan after the trial. The Free plan includes discovery; agentic checkout is a Pro feature (details on the [pricing page](/pricing)). What you get for that is hours-to-live instead of weeks, and one catalog feeding every protocol as the landscape keeps shifting.',
    },
    {
      type: 'cta',
      title: 'See what ChatGPT can read on your site right now',
      text: 'The free scanner checks your website the way an agent would: structured data, crawlability, machine-readable offers. You get a score and a fix list in about a minute, no signup.',
      href: '/scan',
      label: 'Scan your site free',
    },
    { type: 'h2', text: 'The three routes compared' },
    {
      type: 'p',
      text: 'Effort estimates assume you have a working website and no existing Shopify or Etsy presence.',
    },
    {
      type: 'table',
      headers: ['Route', 'Effort', 'Best fit', 'Time to live', 'Checkout story'],
      rows: [
        [
          'Platform integration (Shopify, Etsy)',
          'Low if you already sell there; high if you would be migrating just for the feed',
          'Product catalogs already on the platform',
          'Days, mostly eligibility review',
          'In-chat Instant Checkout, handled by the platform',
        ],
        [
          'Direct ACP build',
          'High: feed + checkout API + Shared Payment Tokens + certification, then ongoing maintenance',
          'Teams with backend engineers and volume that justifies it',
          'Weeks to months, including review',
          'Your own infrastructure end to end',
        ],
        [
          'Hosted agent-commerce layer (e.g. Nexez)',
          'Low: import or describe your offers, publish',
          'Services, consultants, local businesses, small catalogs',
          'Hours for discovery artifacts; protocol checkout as enrollment completes',
          'Hosted Stripe checkout now; ACP/UCP checkout via the layer’s enrollment',
        ],
      ],
    },
    { type: 'h2', text: 'Selling services when there is no “product” to feed' },
    {
      type: 'p',
      text: 'Most “get into ChatGPT shopping” advice quietly assumes physical goods. Services differ in ways an agent actually notices: the thing being sold is a slot in a calendar, price often depends on scope, and fulfillment is an appointment rather than a shipment.',
    },
    {
      type: 'p',
      text: 'None of that excludes services. It changes what your data has to say. An agent acting for a buyer needs a named, priced offer (“90-minute deep-tissue massage, $140”) instead of a menu of vague categories, and it needs availability it can act on rather than a “call to book” line. We cover the mechanics in [how AI agents book service businesses](/learn/ai-agents-book-service-businesses).',
    },
    {
      type: 'p',
      text: 'Location is part of legibility too. Agents cross-check where you actually operate, so a LocalBusiness or Service JSON-LD block with a real address and service area does more work than a paragraph of marketing copy. If that is your situation, the [local services use case](/use-cases/local-services) walks through the specifics.',
    },
    { type: 'h2', text: 'The do-it-today checklist' },
    {
      type: 'p',
      text: 'Whichever route you take, including “none yet,” these steps make you legible to the crawling half of ChatGPT’s pipeline. All of them fit in a week.',
    },
    {
      type: 'ol',
      items: [
        'Let OpenAI’s crawlers in. Check that robots.txt allows OAI-SearchBot (the crawler behind ChatGPT search citations) and ChatGPT-User (live fetches during conversations). OpenAI documents its bots at [platform.openai.com/docs/bots](https://platform.openai.com/docs/bots). Blocking GPTBot, the training crawler, is a separate decision that does not remove you from search.',
        'Publish real prices. An agent comparing options skips “contact us for pricing.” An offer without a number cannot be ranked, compared, or bought.',
        'Add JSON-LD structured data. Product schema for goods; Service plus Offer for services, with price, currency, and availability filled in. This is the same markup Google rewards, so none of it is wasted if agentic shopping grows slower than you hope.',
        'Add an llms.txt file, with expectations in check. Ahrefs found no ranking correlation for llms.txt and Google’s guidance says it is not required. It also takes ten minutes, some agent tooling does read it, and writing one forces a plain-language summary of what you sell. Details in [what is llms.txt](/learn/what-is-llms-txt).',
        'Give every offer its own page. One URL per service or product, a descriptive H1, and two plain sentences on who it is for and what it costs. Agents cite pages, not paragraphs buried in a homepage carousel.',
        'Check your work the way an agent would. Run your site through the [free scanner](/scan), or fetch your own pages with curl and see whether price, offer, and booking information survives without JavaScript.',
      ],
    },
    { type: 'h2', text: 'How you will know it is working' },
    {
      type: 'p',
      text: 'This channel is measurable, which is more than most new channels can claim. Three signals are worth watching from day one:',
    },
    {
      type: 'ul',
      items: [
        'Server logs. Hits from OAI-SearchBot mean OpenAI’s index is looking at you; hits from ChatGPT-User mean real conversations are pulling your pages.',
        'Referral traffic. Links ChatGPT cites typically arrive tagged with utm_source=chatgpt.com, so one analytics segment shows you the channel’s size and trend.',
        'Direct questioning. Ask ChatGPT the questions your customers ask, city and niche included, and see whether you are cited. Anecdotal, but it surfaces legibility problems fast.',
      ],
    },
    {
      type: 'p',
      text: 'Set expectations honestly. For most small businesses this is an early, compounding channel, not an overnight one. The reason to move now is that the underlying work, structured offers with real prices on crawlable pages, is cheap, durable, and exactly what every future agent surface will read too.',
    },
    {
      type: 'cta',
      title: 'Make your offers agent-ready in an afternoon',
      text: 'Nexez turns what you already sell into listings agents can read and transact: JSON-LD, agent.json, llms.txt, ACP and UCP feeds, an MCP server, and Stripe checkout with you as merchant of record. Start on Free with no card; paid plans include a 7-day trial.',
      href: '/how-it-works',
      label: 'See how it works',
    },
  ],
  faqs: [
    {
      question: 'Do I need Shopify or Etsy to sell on ChatGPT?',
      answer:
        'No. Platform integrations are the easiest path if you already sell there, but the Agentic Commerce Protocol is an open spec anyone can implement, and since OpenAI’s March 2026 discovery-first revamp you can appear in shopping results while sending buyers to your own checkout. Non-catalog businesses can publish agent-readable data directly or through a hosted layer like [Nexez](/how-it-works).',
    },
    {
      question: 'How much does it cost to appear in ChatGPT shopping?',
      answer:
        'OpenAI has said shopping results are organic, so there is no fee for visibility itself; merchants pay OpenAI a fee on completed Instant Checkout purchases. Your real costs sit in the integration: platform subscription fees, engineering time for a direct ACP build, or a hosted layer’s plan (see [pricing](/pricing)).',
    },
    {
      question: 'Can a service business show up in ChatGPT shopping results?',
      answer:
        'Yes. Nothing in how ChatGPT sources answers is limited to physical goods; it recommends whatever it can read and trust. The requirements are the same as for products: named offers, real prices, structured data, crawlable pages. Add bookable availability if you want agents to complete a booking rather than just recommend you, as covered in [how AI agents book service businesses](/learn/ai-agents-book-service-businesses).',
    },
    {
      question: 'What is OAI-SearchBot and should I allow it?',
      answer:
        'OAI-SearchBot is the crawler OpenAI uses to index pages for ChatGPT search citations, and ChatGPT-User fetches pages live during conversations. If you want ChatGPT traffic, allow both in robots.txt. GPTBot is the separate model-training crawler; per OpenAI’s bot documentation, blocking it does not remove you from ChatGPT search.',
    },
    {
      question: 'How long until my business shows up in ChatGPT?',
      answer:
        'Live browsing can surface a crawlable page almost immediately when a user’s question triggers a fetch, while inclusion in indexed shopping results follows crawling on a less predictable schedule. Instant Checkout enrollment adds a review step measured in weeks. There is no submission queue for organic results: publish clean data and be findable.',
    },
    {
      question: 'Is optimizing for ChatGPT the same as SEO?',
      answer:
        'They overlap heavily. Crawlability, structured data, and clear pages help both, so nothing is wasted. The differences: agents weigh machine-readable offer data (prices, availability, schema) more than backlinks, and an answer engine cites a handful of sources instead of listing ten links, so being legible and quotable matters more than inching up one ranking spot.',
    },
  ],
}
