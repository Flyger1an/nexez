import type { LearnArticle } from '../learn-content'

export const sellOnChatgptWithoutShopify: LearnArticle = {
  slug: 'sell-on-chatgpt-without-shopify',
  metaTitle: 'Sell on ChatGPT Without Shopify or Etsy (2026)',
  metaDescription:
    'No Shopify or Etsy catalog? How ChatGPT shopping actually works in 2026, why checkout now happens on your own site, and the checklist to get discovered.',
  title: 'How to sell on ChatGPT without Shopify or Etsy (2026 guide)',
  dek: 'ChatGPT shopping is not a marketplace you sign up for. It is an answer engine that recommends whatever it can read and trust, and since March 2026 the purchase itself happens on your site rather than in the chat. Here is how it sources those answers, the realistic routes in, and the checklist worth doing this week.',
  category: 'Guides',
  publishedAt: '2026-07-13',
  updatedAt: '2026-08-17',
  readMinutes: 10,
  blocks: [
    {
      type: 'callout',
      tone: 'amber',
      title: 'Updated August 17, 2026',
      text: 'An earlier version of this guide treated in-chat checkout as a deeper enrollment tier you could work toward. OpenAI retired Instant Checkout on March 4, 2026, so that tier no longer exists and the routes below have been corrected. Discovery is now the entire ChatGPT opportunity, and it feeds your own checkout. Background in [what happened to ChatGPT Instant Checkout](/learn/chatgpt-instant-checkout-retired).',
    },
    {
      type: 'p',
      text: 'ChatGPT is now a place where people shop, even though it is no longer a place where people pay. Salesforce reported that AI influenced $262 billion of 2025 holiday sales, and ChatGPT surfaces product results inside answers for enormous volumes of shopping questions. What it does not do, since March 2026, is complete the transaction. It recommends, and you close. Almost every guide to this assumes you have a Shopify or Etsy catalog. What if you do not?',
    },
    {
      type: 'p',
      text: 'Plenty of businesses that could sell through ChatGPT have no product feed at all. Consultants, agencies, studios, clinics, trainers, local service companies. This guide covers how ChatGPT actually sources shopping answers, the realistic routes in as of August 2026, and the do-it-today checklist that applies no matter which route you pick.',
    },
    { type: 'h2', text: 'How ChatGPT sources its shopping answers' },
    {
      type: 'p',
      text: 'There is no dashboard where you buy placement. When someone asks ChatGPT for "a deep-tissue massage near Capitol Hill" or "a branding consultant for a product launch," the model assembles an answer from two kinds of sources.',
    },
    {
      type: 'ul',
      items: [
        'The open web. OpenAI\u2019s OAI-SearchBot crawls and indexes pages for ChatGPT search, and ChatGPT-User fetches pages live when a conversation triggers browsing. If your site blocks these crawlers, or your prices only exist inside JavaScript an agent never executes, you are invisible to this half of the pipeline.',
        'Structured merchant data. Product feed data powers rich product results and comparison inside answers. OpenAI and Stripe published the Agentic Commerce Protocol as an open spec in September 2025, and while the in-chat checkout it launched with is gone, structured catalog data still drives what gets surfaced.',
      ],
    },
    {
      type: 'p',
      text: 'OpenAI has said shopping results are organic and ranked on relevance, not paid placement. That cuts both ways: you cannot buy your way in, but a small business with clean data genuinely can appear next to much larger competitors.',
    },
    {
      type: 'p',
      text: 'The March 2026 change is what makes this guide simpler than it used to be. OpenAI retired Instant Checkout and moved ChatGPT to discovery only, letting merchants use their own checkout experiences. The bar dropped from "integrate a checkout API and pass enrollment review" to "publish data agents can read." For a business without engineers, that is a meaningful reduction in what standing in this channel requires.',
    },
    { type: 'h2', text: 'Route 1: ride a platform integration' },
    {
      type: 'p',
      text: 'Platforms still do the heaviest lifting, though what they unlock has shifted. Shopify enabled Agentic Storefronts by default in its Winter 2026 Edition, activating [Google\u2019s UCP](/learn/what-is-google-ucp) and native MCP servers for its merchants, which is where live agentic checkout now runs. If you already run a Shopify store, much of your agentic surface is on without you doing anything.',
    },
    {
      type: 'p',
      text: 'The problem is who it leaves out. Platform integrations assume your business is a catalog of SKUs living inside their cart. A fractional CFO, a dog trainer, a wedding photographer, an HVAC company: none of these have a Shopify catalog, and standing one up just to generate a product feed means paying for and maintaining a store you do not otherwise need.',
    },
    {
      type: 'callout',
      tone: 'amber',
      title: 'Do not migrate for the feed',
      text: 'Moving a service business onto a cart platform purely to reach AI shopping surfaces is solving the problem backwards. The data formats agents need can be published from, or alongside, the website you already have.',
    },
    { type: 'h2', text: 'Route 2: build a direct protocol integration' },
    {
      type: 'p',
      text: 'The specifications are open, so nothing stops you from integrating directly. Go in with clear eyes about scope and about which protocol is worth your engineering time. In 2026 that is UCP if you sell products, since it is the rail with live checkout and real distribution. A direct integration means:',
    },
    {
      type: 'ol',
      items: [
        'Publish a structured product feed and keep it current as prices and availability change.',
        'Implement the checkout endpoints your chosen protocol defines, where an agent creates a session, updates it with address and fulfillment choices, and completes it.',
        'Handle delegated payments so the buyer\u2019s credential reaches you scoped to a single transaction, rather than as raw card data.',
        'Wire up order-lifecycle webhooks, verify request signatures, and make every endpoint idempotent so a retried call never double-charges.',
        'Test against a sandbox before going anywhere near live traffic.',
      ],
    },
    {
      type: 'p',
      text: 'For a team with backend engineers this is a real but bounded project. Think weeks rather than days, plus ongoing maintenance as the specs version. For a business without engineers, it is not a realistic weekend job. We cover what ACP is worth today in the [ACP guide](/learn/acp-enrollment-guide), and how the protocols compare in [UCP vs ACP vs MCP](/learn/ucp-vs-acp-vs-mcp). Supporting a second protocol roughly doubles the surface you maintain.',
    },
    { type: 'h2', text: 'Route 3: use a hosted agent-commerce layer' },
    {
      type: 'p',
      text: 'The third route is the one current search results barely cover: keep the website you have, and let a hosted layer publish your offers in the formats agents consume. It is the same move card acceptance made decades ago. You do not implement the network protocols yourself; you plug into something that already speaks them.',
    },
    {
      type: 'p',
      text: 'This is what we built [Nexez](/how-it-works) to do. You describe your offers once, or import them from your site, Stripe, or Calendly, and Nexez serves them as structured listings agents can actually use: clean HTML plus JSON-LD, agent.json, llms.txt, an OpenAPI spec, and a per-merchant MCP server listed in the official MCP registry, plus ACP and UCP feeds from the same catalog. Buyers pay through hosted Stripe checkout with you as the merchant of record, including real Calendly-backed scheduling for bookable services.',
    },
    {
      type: 'p',
      text: 'The honest tradeoffs: you are relying on a layer you do not control, and advanced operating capabilities require a paid plan after the trial. What you get is hours-to-live instead of weeks, and one catalog feeding every protocol as the landscape keeps shifting, which March 2026 demonstrated it will (details on the [pricing page](/pricing)).',
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
          'Days, often already on by default',
          'Platform-handled UCP checkout, plus your own storefront',
        ],
        [
          'Direct protocol build',
          'High: feed + checkout endpoints + delegated payment + maintenance',
          'Teams with backend engineers and volume that justifies it',
          'Weeks to months',
          'Your own infrastructure end to end',
        ],
        [
          'Hosted agent-commerce layer (e.g. Nexez)',
          'Low: import or describe your offers, publish',
          'Services, consultants, local businesses, small catalogs',
          'Hours for discovery artifacts',
          'Hosted Stripe checkout with you as merchant of record',
        ],
      ],
    },
    { type: 'h2', text: 'Selling services when there is no "product" to feed' },
    {
      type: 'p',
      text: 'Most "get into ChatGPT shopping" advice quietly assumes physical goods. Services differ in ways an agent actually notices: the thing being sold is a slot in a calendar, price often depends on scope, and fulfillment is an appointment rather than a shipment.',
    },
    {
      type: 'p',
      text: 'None of that excludes services. It changes what your data has to say. An agent acting for a buyer needs a named, priced offer ("90-minute deep-tissue massage, $140") instead of a menu of vague categories, and it needs availability it can act on rather than a "call to book" line. We cover the mechanics in [how AI agents book service businesses](/learn/ai-agents-book-service-businesses).',
    },
    {
      type: 'p',
      text: 'Location is part of legibility too. Agents cross-check where you actually operate, so a LocalBusiness or Service JSON-LD block with a real address and service area does more work than a paragraph of marketing copy. If you are a local business, [how AI search works for local](/learn/ai-search-local-businesses) covers the sources that decide those recommendations.',
    },
    { type: 'h2', text: 'The do-it-today checklist' },
    {
      type: 'p',
      text: 'Whichever route you take, including "none yet," these steps make you legible to the crawling half of ChatGPT\u2019s pipeline. All of them fit in a week.',
    },
    {
      type: 'ol',
      items: [
        'Let OpenAI\u2019s crawlers in. Check that robots.txt allows OAI-SearchBot (the crawler behind ChatGPT search citations) and ChatGPT-User (live fetches during conversations). Blocking GPTBot, the training crawler, is a separate decision that does not remove you from search.',
        'Publish real prices. An agent comparing options skips "contact us for pricing." An offer without a number cannot be ranked, compared, or recommended.',
        'Add JSON-LD structured data. Product schema for goods; Service plus Offer for services, with price, currency, and availability filled in. Templates are in the [JSON-LD guide](/learn/json-ld-for-ai-agents), and this is the same markup Google rewards, so none of it is wasted.',
        'Add an llms.txt file, with expectations in check. Ahrefs found no ranking correlation and Google\u2019s guidance says it is not required. It also takes ten minutes and forces a plain-language summary of what you sell. Details in [what is llms.txt](/learn/what-is-llms-txt).',
        'Give every offer its own page. One URL per service or product, a descriptive H1, and two plain sentences on who it is for and what it costs. Agents cite pages, not paragraphs buried in a homepage carousel.',
        'Make your own checkout fast. Now that the purchase always happens on your site, the quality of that last step decides whether a recommendation becomes revenue.',
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
        'Server logs. Hits from OAI-SearchBot mean OpenAI\u2019s index is looking at you; hits from ChatGPT-User mean real conversations are pulling your pages.',
        'Referral traffic. Links ChatGPT cites typically arrive tagged with utm_source=chatgpt.com, so one analytics segment shows you the channel\u2019s size and trend.',
        'Direct questioning. Ask ChatGPT the questions your customers ask, city and niche included, and see whether you are cited. Anecdotal, but it surfaces legibility problems fast.',
      ],
    },
    {
      type: 'p',
      text: 'The [measurement guide](/learn/measure-ai-agent-traffic) covers all three properly, including why your analytics platform reports zero crawler traffic no matter how much you get. Set expectations honestly: for most small businesses this is an early, compounding channel, not an overnight one. The reason to move now is that the underlying work, structured offers with real prices on crawlable pages, is cheap, durable, and exactly what every future agent surface will read too.',
    },
    {
      type: 'cta',
      title: 'Make your offers agent-ready in an afternoon',
      text: 'Nexez turns what you already sell into listings agents can read and act on: JSON-LD, agent.json, llms.txt, ACP and UCP feeds, an MCP server, and Stripe checkout with you as merchant of record. Start on Free with no card; paid plans include a 7-day trial.',
      href: '/how-it-works',
      label: 'See how it works',
    },
  ],
  faqs: [
    {
      question: 'Do I need Shopify or Etsy to sell on ChatGPT?',
      answer:
        'No. Platform integrations are the easiest path if you already sell there, but nothing about appearing in ChatGPT shopping results requires them. Since OpenAI retired Instant Checkout in March 2026, ChatGPT surfaces recommendations and sends buyers to your own checkout, so the requirement is publishing data agents can read rather than integrating a checkout API. Non-catalog businesses can publish agent-readable data directly or through a hosted layer like [Nexez](/how-it-works).',
    },
    {
      question: 'Can customers buy directly inside ChatGPT?',
      answer:
        'Not since March 4, 2026, when OpenAI retired Instant Checkout and moved to a discovery-first model, letting merchants use their own checkout experiences. ChatGPT recommends products and links out; the transaction completes on your site. That is also better for conversion, since in-chat checkout measured substantially worse than click-through for merchants who tested both.',
    },
    {
      question: 'How much does it cost to appear in ChatGPT shopping?',
      answer:
        'OpenAI has said shopping results are organic, so there is no fee for visibility, and with in-chat checkout retired there is no longer a transaction fee to OpenAI either. Your real costs sit in getting legible: platform subscription fees, engineering time for a direct protocol build, or a hosted layer\u2019s plan (see [pricing](/pricing)).',
    },
    {
      question: 'Can a service business show up in ChatGPT shopping results?',
      answer:
        'Yes. Nothing in how ChatGPT sources answers is limited to physical goods; it recommends whatever it can read and trust. The requirements are the same as for products: named offers, real prices, structured data, crawlable pages. Add bookable availability if you want agents to move a customer toward a booking, as covered in [how AI agents book service businesses](/learn/ai-agents-book-service-businesses).',
    },
    {
      question: 'How long until my business shows up in ChatGPT?',
      answer:
        'Live browsing can surface a crawlable page almost immediately when a user\u2019s question triggers a fetch, while inclusion in indexed shopping results follows crawling on a less predictable schedule. There is no submission queue and no enrollment review to wait on: publish clean data and be findable.',
    },
    {
      question: 'Is optimizing for ChatGPT the same as SEO?',
      answer:
        'They overlap heavily. Crawlability, structured data, and clear pages help both, so nothing is wasted. The differences: agents weigh machine-readable offer data (prices, availability, schema) more than backlinks, and an answer engine cites a handful of sources instead of listing ten links, so being legible and quotable matters more than inching up one ranking spot.',
    },
  ],
}
