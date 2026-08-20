import type { LearnArticle } from '../learn-content'

export const acpEnrollmentGuide: LearnArticle = {
  slug: 'acp-enrollment-guide',
  metaTitle: 'ACP in 2026: The Protocol After Instant Checkout',
  metaDescription:
    'There is no ChatGPT checkout enrollment anymore. What the Agentic Commerce Protocol is now, what is still worth implementing, and what to stop chasing.',
  title: 'ACP in 2026: what the Agentic Commerce Protocol is now that Instant Checkout is gone',
  dek: 'If you came here looking for how to enroll in ChatGPT Instant Checkout, the honest answer is that there is nothing to enroll in. OpenAI retired it in March 2026. The protocol underneath survived and is still worth understanding, so here is what ACP actually is now, what is worth building, and what to stop chasing.',
  category: 'Agentic commerce',
  publishedAt: '2026-07-13',
  updatedAt: '2026-08-20',
  readMinutes: 10,
  blocks: [
    {
      type: 'callout',
      tone: 'amber',
      title: 'This guide was substantially rewritten on August 20, 2026',
      text: 'An earlier version walked through enrolling in ChatGPT Instant Checkout. OpenAI retired that feature on March 4, 2026, so the enrollment path it described no longer exists. We have corrected the guide rather than quietly deleting it, because merchants are still searching for the old process and deserve to land on an accurate answer. The full story is in [what happened to ChatGPT Instant Checkout](/learn/chatgpt-instant-checkout-retired).',
    },
    {
      type: 'p',
      text: 'The Agentic Commerce Protocol is an open specification, published by OpenAI and Stripe in September 2025 under Apache 2.0, that defines how an AI agent transacts with a merchant. It launched alongside ChatGPT Instant Checkout, and for about five months those two things were effectively synonymous in most people’s minds. Then OpenAI shut the checkout surface down and kept the protocol, which is why the two need separating now.',
    },
    {
      type: 'p',
      text: 'What follows is what ACP still does, what parts of an implementation retain value, the technical details that trip teams up, and an honest assessment of whether you should spend time on it at all in late 2026.',
    },
    { type: 'h2', text: 'What ACP is, minus the ChatGPT framing' },
    {
      type: 'p',
      text: 'ACP has two halves that were always separable, and the retirement made that separation obvious.',
    },
    {
      type: 'p',
      text: 'The first half is the product feed: a structured catalog an agent can read to know what you sell, at what price, in what variants, and whether it is in stock. The second half is the checkout API: REST endpoints where an agent creates a checkout session, updates it with fulfillment details, and completes it, with payment arriving as a delegated token so raw card credentials never touch your servers.',
    },
    {
      type: 'p',
      text: 'The feed half is the durable one. Structured product data is the shared input across every agentic surface, so a clean ACP feed is close to a clean UCP feed is close to a clean Merchant Center feed. That work transfers. The checkout half is the part that was tied to a specific surface, and its value now depends entirely on whether something you use actually speaks ACP.',
    },
    { type: 'h2', text: 'Who still speaks ACP' },
    {
      type: 'p',
      text: 'More parties than the obituaries suggested. PayPal adopted ACP in October 2025 to bring its merchant network into agentic commerce. Stripe built its Agentic Commerce Suite on the protocol and shipped it in December 2025. The specification itself kept advancing after the retirement, with a stable revision dated April 17, 2026 covering checkout, payment delegation, cart, feed, orders, authentication, and integration with the Model Context Protocol.',
    },
    {
      type: 'p',
      text: 'That MCP convergence is the most interesting signal. It means agent-initiated purchasing is merging with the general tool-calling standard rather than staying in a commerce silo, which is a reasonable bet on where this ends up. If you already run [an MCP server](/learn/what-is-an-mcp-server), the distance between it and ACP-shaped commerce is shrinking rather than growing.',
    },
    { type: 'h2', text: 'What is worth implementing now' },
    {
      type: 'p',
      text: 'Ordered by how confident you can be that the effort pays off:',
    },
    {
      type: 'ol',
      items: [
        'Clean, accurate product data. Complete titles and descriptions, correct GTINs or equivalent identifiers, real availability, and price parity with your own site. Every agentic surface consumes this, so it is the one investment with no platform risk attached.',
        'A structured feed. Publish it in the formats the surfaces you care about actually ingest. If you sell products and want the live agentic checkout rail, that means [UCP](/learn/what-is-google-ucp) first in 2026, since that is where the distribution is.',
        'Callable actions. Availability checks, quotes, and bookings exposed through an MCP server or an OpenAPI spec reach agents that no feed touches, and they are protocol-agnostic.',
        'ACP checkout endpoints, conditionally. Worth building if your payment provider or platform speaks ACP and you have volume to justify it. Not worth building speculatively in the hope a surface adopts it.',
      ],
    },
    {
      type: 'callout',
      tone: 'ready',
      title: 'The discovery half was always the cheaper win',
      text: 'This was true before the retirement and is more true after it. Being findable, comparable, and accurately described costs a fraction of what transactional integration costs, and it is what determines whether you enter the consideration set at all. With in-chat checkout gone, discovery is the entire ChatGPT opportunity, covered in [how to get recommended by ChatGPT](/learn/get-recommended-by-chatgpt).',
    },
    { type: 'h2', text: 'Technical details that trip teams up' },
    {
      type: 'p',
      text: 'If you are implementing ACP checkout because something in your stack speaks it, these are the parts that cause real incidents rather than merely failing review.',
    },
    {
      type: 'p',
      text: 'Delegated payment is not a card number. The buyer’s credential arrives as a token scoped to one transaction, through Stripe’s Shared Payment Tokens or an equivalent mechanism. You never receive or store raw card data, which is the point, but it also means your normal payment error handling does not directly apply and needs its own paths.',
    },
    {
      type: 'p',
      text: 'Idempotency is not optional. Agents retry. A network blip between the agent and your endpoint, with no idempotency key honored, is a double charge against a real customer. Every mutating endpoint needs an idempotency key and a stored result keyed to it, and this is the single most common source of production pain in agent-facing commerce.',
    },
    {
      type: 'p',
      text: 'Verify webhook signatures, always. Order lifecycle updates arrive as signed webhooks, and an unverified endpoint is an open door for forged order state. Treat everything an agent sends as untrusted input, exactly as you would a public web form.',
    },
    {
      type: 'p',
      text: 'Watch the account boundary in Stripe Connect setups. A recurring integration bug is wiring checkout to the platform account rather than the connected merchant account, which produces sessions that appear to succeed while settling to the wrong place. Confirm which account your session objects belong to before you go anywhere near live traffic.',
    },
    {
      type: 'cta',
      title: 'Start with what every surface reads',
      text: 'Whatever protocol you land on, all of them cross-check your actual website. The free Nexez scanner fetches your site the way an agent does and scores structured data, crawlability, and machine-readable offers. No signup, about a minute.',
      href: '/scan',
      label: 'Scan your site free',
    },
    { type: 'h2', text: 'The honest recommendation' },
    {
      type: 'p',
      text: 'For most merchants in late 2026, ACP is something to understand rather than something to build against directly. Understand it because it is the reference design most agentic commerce borrows from, because your payment provider may already implement it on your behalf, and because its convergence with MCP suggests it will keep mattering. Build against it directly only when a platform you actually use requires it.',
    },
    {
      type: 'p',
      text: 'Spend the freed effort on the layer nobody can retire out from under you: accurate structured data, crawlable pages, real prices, live availability, and callable actions. That was the right answer in September 2025, it was the right answer during Instant Checkout, and March 2026 proved the point rather than undermining it. Merchants who built on that foundation lost nothing when the surface closed.',
    },
    {
      type: 'cta',
      title: 'One catalog, every surface, no rebuild when a protocol changes',
      text: 'Nexez publishes your business as agent-legible, agent-transactable listings: JSON-LD, llms.txt, agent.json, OpenAPI, a per-merchant MCP server, and ACP plus UCP feeds, all generated from one source of truth, with real Stripe checkout and Calendly-backed scheduling behind them. Start on Free with no card; paid plans include a 7-day trial.',
      href: '/how-it-works',
      label: 'See how it works',
    },
  ],
  faqs: [
    {
      question: 'How do I enroll in ChatGPT Instant Checkout?',
      answer:
        'You cannot. OpenAI retired Instant Checkout on March 4, 2026, and there is no application, eligibility review, or waiting list. Shoppers can no longer complete purchases inside ChatGPT. Any guide still describing an enrollment process predates the shutdown or was never corrected. The background is in [what happened to ChatGPT Instant Checkout](/learn/chatgpt-instant-checkout-retired).',
    },
    {
      question: 'Is ACP still a live specification?',
      answer:
        'Yes. It remains open source under Apache 2.0 and continued advancing after the retirement, with a stable revision dated April 17, 2026 covering checkout, payment delegation, cart, feed, orders, authentication, and MCP integration. PayPal adopted it and Stripe built its Agentic Commerce Suite on it, so the protocol has adopters independent of OpenAI.',
    },
    {
      question: 'Should I build an ACP checkout integration in 2026?',
      answer:
        'Only if a platform or payment provider you already use speaks ACP and your volume justifies the engineering. Building it speculatively, hoping a surface will adopt it, is a bet on someone else’s roadmap. Feed and catalog work is the part that transfers across every surface, so it is the safer place to spend first.',
    },
    {
      question: 'What is the difference between the ACP feed and the ACP checkout API?',
      answer:
        'The feed is a structured catalog that lets agents discover and compare what you sell. The checkout API is a set of REST endpoints letting an agent create and complete a purchase with a delegated payment token. They were always separable, and the retirement made that concrete: feed work transfers to other surfaces, while checkout endpoints only pay off where something actually speaks ACP.',
    },
    {
      question: 'Where can agents actually complete a purchase now?',
      answer:
        'Mainly through Google’s Universal Commerce Protocol across AI Mode, Gemini, and YouTube Shopping, plus platforms implementing it, with Shopify enabling Agentic Storefronts by default. Perplexity runs its own buying flow. The [UCP guide](/learn/what-is-google-ucp) covers what merchants need for the live rail.',
    },
    {
      question: 'Did the Instant Checkout shutdown mean agentic commerce is failing?',
      answer:
        'The market data says otherwise. AI-referred retail traffic grew 393% year over year in Q1 2026 and converts substantially better than traditional search. What failed was one vendor’s first implementation of one layer, largely on conversion economics, since in-chat checkout converted roughly three times worse than sending buyers to the merchant’s own site. Discovery kept growing throughout.',
    },
  ],
}
