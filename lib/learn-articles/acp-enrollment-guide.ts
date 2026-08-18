import type { LearnArticle } from '../learn-content'

export const acpEnrollmentGuide: LearnArticle = {
  slug: 'acp-enrollment-guide',
  metaTitle: 'Agentic Commerce Protocol (ACP): Enrollment Guide',
  metaDescription:
    'A merchant-side guide to OpenAI’s ACP: the four surfaces you build, the enrollment path, honest effort estimates, and the gotchas that bite real integrations.',
  title: 'The Agentic Commerce Protocol (ACP): an enrollment guide for merchants',
  dek: 'ACP is how ChatGPT buys from you: your feed, your checkout API, your Stripe account, OpenAI’s buyer. Here’s what you actually build, how enrollment works, and where implementations go wrong, written by a team that shipped one.',
  category: 'Agentic commerce',
  publishedAt: '2026-07-13',
  updatedAt: '2026-07-13',
  readMinutes: 10,
  blocks: [
    {
      type: 'p',
      text: 'In September 2025, OpenAI launched Instant Checkout in ChatGPT, built on the Agentic Commerce Protocol (ACP), an open specification it developed with Stripe. The promise to merchants is direct: a ChatGPT user asks for something, your product appears, and they buy it inside the conversation while the order lands in your systems like any other sale.',
    },
    {
      type: 'p',
      text: 'The demand side is not hypothetical. Salesforce reported AI influenced $262B of 2025 holiday sales, and OpenAI revamped Instant Checkout in March 2026 toward discovery-first product surfacing. The buyers are arriving faster than most merchant roadmaps assumed.',
    },
    {
      type: 'p',
      text: 'The official docs tell you what the API looks like. What they don’t give you is the merchant-side view: what you actually have to build, what enrollment involves, and where implementations break. We built and shipped a complete ACP implementation at Nexez, including feeds, checkout sessions, order webhooks, and settlement. This guide comes from doing the work, not paraphrasing the spec.',
    },
    { type: 'h2', text: 'What ACP actually is (and what it isn’t)' },
    {
      type: 'p',
      text: 'ACP is a REST contract between an AI application and a merchant. The AI surface, whether ChatGPT today or anything else that speaks the protocol, discovers your products through a feed you publish, runs a checkout against an API you host, and hands you a payment credential at the end. You fulfill the order, you answer the support emails, you process the refunds.',
    },
    {
      type: 'p',
      text: 'The most important design decision sits in that last sentence: you remain the merchant of record. OpenAI is not a marketplace. It never takes custody of the money or the customer. Per OpenAI’s launch announcement, the buyer pays the same price they would on your site and merchants pay a small fee on completed purchases, while discovery costs nothing. Your fraud, tax, and chargeback obligations don’t move. Neither does your customer relationship.',
    },
    {
      type: 'p',
      text: 'Payment works through a Shared Payment Token (SPT): a Stripe-issued delegated credential scoped to a specific merchant, an amount ceiling, and an expiry window. At the end of checkout, OpenAI hands you a token and you charge it the way you’d charge any payment method. You never see the buyer’s card.',
    },
    {
      type: 'p',
      text: 'Two things ACP is not. It’s not a switch you flip in a dashboard; it’s an API integration with a partner-approval gate in front of it. And it’s not the only protocol in this space: Google’s UCP and the Model Context Protocol solve adjacent problems, and it’s worth understanding [how UCP, ACP, and MCP differ](/learn/ucp-vs-acp-vs-mcp) before committing engineering time to any of them.',
    },
    { type: 'h2', text: 'The four surfaces you have to build' },
    {
      type: 'p',
      text: 'A working ACP integration is four distinct pieces. None is individually hard, but they have to agree with each other exactly. Most integration pain comes from surfaces disagreeing: a feed price that doesn’t match the checkout total, an order status that never gets reported back.',
    },
    {
      type: 'table',
      headers: ['Surface', 'Direction', 'What it does'],
      rows: [
        [
          'Product feed',
          'You → OpenAI',
          'A machine-readable catalog OpenAI ingests so ChatGPT can surface your products',
        ],
        [
          'checkout_sessions API',
          'OpenAI → you',
          'REST endpoints on your domain that create, update, complete, and cancel a checkout',
        ],
        [
          'Order webhooks',
          'You → OpenAI',
          'Signed status events (confirmed, shipped, refunded, disputed) so the buyer sees updates in ChatGPT',
        ],
        [
          'Payment settlement',
          'You ↔ Stripe',
          'Charging the Shared Payment Token and reconciling the order in your books',
        ],
      ],
    },
    { type: 'h3', text: 'The product feed' },
    {
      type: 'p',
      text: 'The feed is a JSON catalog of everything sellable: identifiers, titles, descriptions, prices, availability, images, and a link back to the canonical product page. Each item carries eligibility flags telling ChatGPT whether it may appear in search results and whether it’s eligible for checkout. Those flags are independent, which matters: you can publish a discovery-only feed today and flip checkout eligibility after enrollment clears.',
    },
    {
      type: 'p',
      text: 'Treat the feed as a cache of your catalog living in someone else’s system. It goes stale the moment you change a price, which is exactly why the protocol makes your checkout API, not the feed, the source of truth for money.',
    },
    { type: 'h3', text: 'The checkout_sessions API' },
    {
      type: 'p',
      text: 'This is the core of the build: REST endpoints under your domain that OpenAI calls with a Bearer key it issues you. A session is created with line items, updated as the buyer supplies address and fulfillment choices, then either completed with a payment token or canceled. Every response returns the full recalculated state: items, totals, taxes, fulfillment options, and any buyer-facing messages.',
    },
    {
      type: 'p',
      text: 'The state machine sounds trivial and isn’t. A session that hasn’t collected enough information isn’t ready for payment. A completed session must be terminal. A canceled one must never charge. Your implementation has to enforce those transitions server-side, because you cannot assume the caller always will.',
    },
    { type: 'h3', text: 'Order webhooks' },
    {
      type: 'p',
      text: 'After money moves, the relationship inverts: now you call OpenAI. At enrollment they give you a webhook URL and an HMAC signing secret, and your job is to push signed order events whenever state changes: confirmed, shipped, refunded, or disputed. Skip this and the buyer’s order view in ChatGPT silently goes stale, which turns into support tickets on your side, not theirs.',
    },
    { type: 'h3', text: 'Settlement' },
    {
      type: 'p',
      text: 'At the complete step you receive the delegated token and create a PaymentIntent with it as the payment method on your own Stripe account. The money settles exactly where your web orders settle, and refunds ride your existing rails. This is the leg teams assume is easy and then get wrong. See the idempotency gotcha below.',
    },
    { type: 'h2', text: 'The enrollment path, step by step' },
    {
      type: 'p',
      text: 'Instant Checkout is an approved-partner program, not self-serve. OpenAI’s merchant documentation at [developers.openai.com/commerce](https://developers.openai.com/commerce) describes the integration, but production credentials come through an application. Here’s the sequence as it actually plays out:',
    },
    {
      type: 'ol',
      items: [
        'Apply to the program. You describe your business, catalog, and technical setup. There’s no published approval timeline, so start this before you build, not after.',
        'Publish your product feed and give OpenAI the URL. Discovery-eligible items can start appearing in ChatGPT independent of checkout approval.',
        'Stand up the checkout_sessions endpoints for create, retrieve, update, complete, and cancel behind Bearer auth that fails closed with a 401 until credentials exist.',
        'Receive credentials: the Bearer key OpenAI presents on every request, a request-signing secret, and their order-webhook URL plus HMAC secret for your outbound events.',
        'Wire settlement. Confirm with Stripe that Shared Payment Tokens work with your account structure, then charge the token at the complete step.',
        'Certify with a test payment credential: session created, completed, a real test-mode charge, a durable order record, and a buyer receipt. Complete the full loop before using any real delegated token.',
        'Flip checkout eligibility in your feed only after the smoke test passes end to end.',
      ],
    },
    {
      type: 'callout',
      tone: 'ready',
      title: 'Discovery doesn’t wait for checkout',
      text: 'Feed ingestion and checkout enrollment are decoupled. Your products can be findable in ChatGPT while your checkout credentials are still in review, so publish the feed first and treat checkout as phase two, not a blocker.',
    },
    { type: 'h2', text: 'How much work is it, honestly?' },
    {
      type: 'p',
      text: 'It depends entirely on which of three paths you take.',
    },
    {
      type: 'table',
      headers: ['Path', 'What you build', 'Payment work', 'Realistic effort'],
      rows: [
        [
          'DIY on your own stack',
          'All four surfaces, plus monitoring and certification',
          'Direct SPT integration with Stripe',
          'Weeks of engineering up front, maintenance forever',
        ],
        [
          'Wait for your platform',
          'Nothing; Shopify-class platforms are wiring ACP for their merchants',
          'Handled upstream',
          'Zero effort, zero control over timing or eligibility',
        ],
        [
          'Agent-commerce layer (Nexez)',
          'Import or create your listings once',
          'Already wired, with you as merchant of record',
          'Under an hour to a live feed',
        ],
      ],
    },
    {
      type: 'p',
      text: 'The DIY estimate deserves honesty, because the endpoints themselves are only a few days of work. The long tail is everything around them: idempotent settlement, webhook signing, feed regeneration on every price change, state-machine edge cases, and keeping all of it alive when your catalog system changes. If you have in-house engineers and a high-volume catalog, owning it makes sense. If you’re a twelve-listing service business, it almost certainly doesn’t.',
    },
    {
      type: 'cta',
      title: 'Skip the build, keep the money path',
      text: 'Nexez publishes an ACP feed and a UCP feed for your listings automatically, runs the checkout-session lifecycle, and settles through Stripe with you as merchant of record. Discovery and agentic checkout are available on every plan when the merchant and surface are commerce-ready; paid plans add scale, operating tools, and lower commission rates.',
      href: '/pricing',
      label: 'See plans and pricing',
    },
    { type: 'h2', text: 'Gotchas that bite real implementations' },
    {
      type: 'p',
      text: 'These are the failure modes we explicitly designed against, in roughly the order they’ll hurt you.',
    },
    {
      type: 'callout',
      tone: 'amber',
      title: 'Idempotency is not optional',
      text: 'Networks retry. If OpenAI replays a complete call and your endpoint charges twice, that’s a double charge on a real buyer. Key every settlement on the session id. A Stripe idempotency key plus a unique index on the PaymentIntent works, so a replayed complete returns the original order, never a second charge.',
    },
    {
      type: 'callout',
      tone: 'amber',
      title: 'One session, one merchant',
      text: 'An ACP checkout session belongs to a single merchant. If you run anything multi-tenant, such as a marketplace, multiple storefronts, or even two brands on one backend, validate that every item in a session resolves to the same seller and reject mixed carts outright rather than attempting split settlement.',
    },
    {
      type: 'callout',
      tone: 'amber',
      title: 'Feed prices drift; checkout is truth',
      text: 'OpenAI ingests your feed on its schedule, not yours, so between refreshes ChatGPT may quote a stale price. Your checkout must recompute totals server-side from the live catalog. When they differ from what the buyer saw, return the corrected total with a buyer-facing message instead of silently charging the feed price.',
    },
    {
      type: 'callout',
      tone: 'signal',
      title: 'On Stripe Connect? Ask about SPT first',
      text: 'If your money model is Stripe Connect with direct charges on connected accounts and a platform application fee, confirm with Stripe that a Shared Payment Token can be the payment method on that exact charge shape before you build settlement. It’s a one-question email that can save you a re-architecture.',
    },
    {
      type: 'p',
      text: 'One more that’s really a design stance: build the whole thing fail-closed. No credentials configured should mean a 401 on every checkout endpoint, not a best-effort guess. A dormant checkout surface is annoying; an unauthenticated one is a liability.',
    },
    { type: 'h2', text: 'What to do while your application is in review' },
    {
      type: 'p',
      text: 'Enrollment timing isn’t in your control. Discovery is. The same structured catalog data that feeds ACP makes your site legible to every other agent, including Claude, Gemini, Perplexity, and browser agents, through JSON-LD, llms.txt, and clean machine-readable pages. Even before ChatGPT can check out with you, agents can find you, compare you, and send buyers to the checkout you already have.',
    },
    {
      type: 'p',
      text: 'That groundwork is measurable: run your site through a [free agent-legibility scan](/scan) to see what agents can currently extract from it, and read [what llms.txt actually does](/learn/what-is-llms-txt) before adding one. If you sell services rather than products, the deeper question is bookings. [How AI agents book service businesses](/learn/ai-agents-book-service-businesses) covers that side, and [selling on ChatGPT without Shopify](/learn/sell-on-chatgpt-without-shopify) covers the storefront question.',
    },
    {
      type: 'p',
      text: 'ACP is early, and early is the point. The merchants who publish feeds and structure their catalogs now are the ones agents will already know when checkout enrollment opens wider. The protocol work compounds; waiting doesn’t.',
    },
    {
      type: 'cta',
      title: 'See what AI agents can read on your site today',
      text: 'The free Nexez scanner reads your website the way an agent does and scores what it can actually extract: offers, prices, booking info, and structured data. No signup, results in about a minute.',
      href: '/scan',
      label: 'Scan your website free',
    },
  ],
  faqs: [
    {
      question: 'Do I have to use Stripe to accept ACP payments?',
      answer:
        'The spec defines delegated payment generically, but the Shared Payment Token flow was designed with Stripe and that’s where it works today. If you’re on another processor, expect to either wait for support or run a Stripe account alongside it for agentic orders. Practically: Stripe first.',
    },
    {
      question: 'Who is the merchant of record for ACP orders?',
      answer:
        'You are. OpenAI passes you the buyer and a payment credential, but the charge lands on your processor account. Refunds, chargebacks, sales tax, and customer service remain yours, exactly like an order from your own website.',
    },
    {
      question: 'How long does ACP enrollment take?',
      answer:
        'OpenAI hasn’t published a timeline; it’s an application-and-review partner program and experiences vary. The practical move is to publish your product feed immediately (discovery doesn’t require checkout approval) and build the checkout surfaces fail-closed so going live is a credential change, not a rebuild.',
    },
    {
      question: 'Can service businesses use ACP, or is it just physical products?',
      answer:
        'The feed format is product-shaped, but a bookable service such as a consult, class, or session models cleanly as an offer with a price. The real work is fulfillment: a booking needs scheduling, not shipping. That’s the gap platforms like Nexez cover with calendar-backed offers and real scheduling links minted at checkout.',
    },
    {
      question: 'What’s the difference between ACP and Google’s UCP?',
      answer:
        'Same job, different ecosystems: ACP is OpenAI and ChatGPT (built with Stripe), UCP is Google’s equivalent across its surfaces. The session lifecycles are similar enough that one clean money core can serve both. See the full [UCP vs ACP vs MCP comparison](/learn/ucp-vs-acp-vs-mcp).',
    },
    {
      question: 'What does ACP cost merchants?',
      answer:
        'There’s no listing fee; the cost is the integration itself. OpenAI has said buyers pay the same price they’d pay on your site and merchants pay a small fee on completed purchases, while discovery placement costs nothing.',
    },
  ],
}
