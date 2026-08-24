import type { LearnArticle } from '../learn-content'

export const howAiAgentsPay: LearnArticle = {
  slug: 'how-ai-agents-pay',
  metaTitle: 'How AI Agents Pay: A Merchant Guide',
  metaDescription:
    'Two separate agent payment worlds: delegated tokens on existing rails, and x402 machine payments. Which one applies to you, and which announcements to ignore.',
  title: 'How AI agents actually pay: two payment worlds, and only one of them is yours',
  dek: 'Almost every article about agent payments blends two unrelated problems into one story, which is why the advice reads as urgent and turns out to be unactionable. An agent buying a mattress for a person and an agent buying an API call for itself use different rails, different money, and different trust models. Here is the split, what is genuinely live in August 2026, and the honest answer about which half you can ignore.',
  category: 'Agentic commerce',
  publishedAt: '2026-08-24',
  updatedAt: '2026-08-24',
  readMinutes: 13,
  blocks: [
    {
      type: 'p',
      text: 'There are two agent payment worlds. In the first, an agent buys a normal product or service for a person, and money moves down the rails that already exist: a card, a wallet, your payment processor. In the second, an agent buys machine-scale resources for itself, in amounts too small for a card to carry, with no human present and no account anywhere. The first is live today and probably describes your business. The second is real infrastructure, genuinely new, and almost certainly not your problem this year.',
    },
    {
      type: 'p',
      text: 'The reason this matters is that the second world generates most of the headlines. Wallets for agents, stablecoin micropayments, machine-to-machine networks: all real, all announced in the last few months, none of it something a clinic or a retailer can ship against in the next quarter. If you have been reading those announcements and feeling behind, you are not behind. You are reading about someone else.',
    },
    {
      type: 'p',
      text: 'This question got sharper in March 2026, when [OpenAI retired Instant Checkout](/learn/chatgpt-instant-checkout-retired) and checkout went back to the merchant’s own site. Once the assistant is not the cashier, the obvious next question is who is, and with what.',
    },
    { type: 'h2', text: 'World 1: an agent buys something for a person' },
    {
      type: 'p',
      text: 'This is the ordinary case, and the mechanism is duller than the coverage suggests. The agent never holds your customer’s card number. What it carries is a delegated credential: a token minted for one transaction, scoped to one amount and one merchant, useless the moment it is spent or expires. The rail underneath is the same card network that has been there for decades.',
    },
    {
      type: 'p',
      text: 'Two implementations of that idea are in the field. [UCP checkout](/learn/what-is-google-ucp) runs through Google Pay with methods stored in Google Wallet, and composes with AP2, the Agent Payments Protocol Google published in September 2025, which supplies cryptographic proof that a human actually authorized the purchase. ACP takes the same shape through Stripe’s Shared Payment Tokens, covered in the [ACP enrollment guide](/learn/acp-enrollment-guide). The [protocol comparison](/learn/ucp-vs-acp-vs-mcp) puts them side by side.',
    },
    {
      type: 'p',
      text: 'Three consequences are worth stating plainly, because they answer most of the anxiety merchants bring to this topic.',
    },
    {
      type: 'ul',
      items: [
        'You stay the merchant of record. You keep the customer relationship, the order data, the confirmation email, the loyalty accrual, and the support obligation. No agent platform inserts itself as the seller in any of the live delegated-payment designs.',
        'You never touch raw card data, and you never touch agent-held funds. Your processor sees a token. Your reconciliation looks the way it already looks.',
        'Your existing checkout already works. An agent that can hand a person a link to a clean, fast, correctly-priced checkout page has completed the job. That path required no protocol adoption in 2024 and still requires none.',
      ],
    },
    {
      type: 'p',
      text: 'That last point is the one people skip past, and it is the reason this article does not end with a shopping list. For a business selling to humans, the payment leg is largely solved. What is unsolved is everything upstream of it: whether an agent can find you, read your prices, and hand a buyer a link that works.',
    },
    { type: 'h2', text: 'World 2: an agent buys something for itself' },
    {
      type: 'p',
      text: 'Now change the buyer. An agent needs an API call, a dataset row, a page of content, a second of inference. The amount is a fraction of a cent. There is no human awake to approve it, no account, no prior relationship, and no patience for a signup flow built for someone with hands.',
    },
    {
      type: 'p',
      text: 'Cards cannot do this. Not for policy reasons, for arithmetic ones: interchange plus a fixed per-transaction fee makes a sub-cent charge cost more to process than it collects, and the account-opening step assumes a legal person who can pass identity checks. Every part of the flow assumes a human, and the buyer is not one.',
    },
    {
      type: 'p',
      text: 'x402 is the answer that has gathered the most weight behind it, and the trick is elegant. HTTP reserved a status code called 402, "Payment Required," roughly thirty years ago, then never standardized what to do with it. x402 fills in the missing half.',
    },
    {
      type: 'ol',
      items: [
        'The agent requests a resource with no credential at all.',
        'The server answers 402 instead of 401, and includes the price and where to pay.',
        'The agent pays from its own wallet, typically in a stablecoin such as USDC.',
        'The agent retries the same request, this time carrying proof of payment in a header.',
        'The server verifies the proof and returns 200 with the resource.',
      ],
    },
    {
      type: 'p',
      text: 'Notice what is missing: there is no signup, no API key, no account, no prior relationship. The payment is the credential. That inverts the normal order of onboarding, where you prove who you are before you are allowed to spend, and it is precisely why an agent can use it without a human in the loop. It is also why the same mechanism works for a caller you have never seen and will never see again.',
    },
    {
      type: 'p',
      text: 'Governance has moved deliberately. Coinbase built the protocol and announced the x402 Foundation with Cloudflare in September 2025; the Linux Foundation formalized it on April 2, 2026, with Stripe as a founding member; an operational launch followed in July 2026 with roughly forty member organizations, premier members including AWS, American Express, Circle, Google, Mastercard, Shopify, Stripe, and Visa. That is an unusually broad tent for a protocol this young, and it is the strongest available signal that the machine-payment problem is considered real by people with rails to protect.',
    },
    {
      type: 'callout',
      tone: 'amber',
      title: 'Real, and still not something you can depend on',
      text: 'Treat World 2 as an architecture to design for, not a dependency to ship against this quarter. A payment rail is worth exactly what its acceptance network is worth, and these networks are being built from zero against card rails with decades of merchant relationships. Raw x402 is self-hostable, but it is a protocol rather than a product: it gives you a 402 response and a signature to verify, not deposit detection, confirmations, webhooks, reconciliation, refunds, or a checkout. Everything a payment processor does for you, you would be doing yourself.',
    },
    { type: 'h2', text: 'Cloudflare is building the toll booth' },
    {
      type: 'p',
      text: 'Cloudflare deserves its own section, because it is the only company assembling both sides of World 2 in public, and the pattern is more interesting than any single launch.',
    },
    {
      type: 'p',
      text: 'On July 1, 2026 it opened the waitlist for Monetization Gateway, which extends charging past crawlers to any caller and any resource: the seller side, how to price access and verify payment at the edge. On August 4, 2026, during Agents Week, it announced Cloudflare Wallets and cloudflare.pay, described as giving agents a stable identity and the ability to make purchases online within limits set by their human creators. That is the buyer side of the same trade.',
    },
    {
      type: 'p',
      text: 'The architecture separates custody from spending, which is the part worth borrowing whatever rail you eventually use. An Account Wallet belongs to a person or a company, holds the funds, and can add, withdraw, and delegate. Virtual Wallets are issued to individual agents through API keys and can only spend inside permissions the Account Wallet owner set. The nearest human analogy is a corporate checking account versus a stack of pre-loaded restricted debit cards handed out to staff, except the staff are agents and the restrictions are enforced by infrastructure rather than by an expense policy nobody reads.',
    },
    {
      type: 'p',
      text: 'Set those alongside pay per crawl, and the shift from static bot lists toward continuously evaluating how an agent behaves, and the direction is unmistakable. Cloudflare is not resisting agent traffic. It is building the toll booth, and it would like to own both the gate and the coin.',
    },
    {
      type: 'p',
      text: 'One caveat, in Cloudflare’s own tense. Handle reservation opened on August 4. Funding, Virtual Wallets, and programmable agent spending are described as coming in the following months, no custodian or banking partner has been named publicly, and pricing is unknown. Reserving a handle costs you nothing. Planning a roadmap around it costs you something.',
    },
    { type: 'h2', text: 'The rails, side by side' },
    {
      type: 'table',
      headers: ['Rail', 'Buyer it serves', 'What it moves', 'Custody', 'Status, August 2026'],
      rows: [
        [
          'Ordinary hosted checkout',
          'Any agent that can hand a person a working link',
          'Everything a normal card takes',
          'Your processor holds it',
          'Live, unglamorous, already yours',
        ],
        [
          'UCP checkout via Google Pay',
          'Agents shopping inside Gemini and AI Mode',
          'Consumer payments, wallet-stored methods',
          'Google Pay holds it',
          'Live; you stay merchant of record',
        ],
        [
          'ACP delegated tokens via Stripe',
          'Agents buying from merchants publishing an ACP feed',
          'Consumer payments, single-transaction tokens',
          'Stripe holds it',
          'Spec live and current; its original ChatGPT surface is retired',
        ],
        [
          'x402',
          'Agents buying APIs, data, content, compute',
          'Stablecoins, routinely sub-cent',
          'Self-custody in principle, provider custody in most products',
          'Protocol live under the Linux Foundation; tooling maturing',
        ],
        [
          'Cloudflare Wallets',
          'Agents running on Cloudflare paying for tools and content',
          'Stablecoins inside human-set caps',
          'Cloudflare holds it',
          'Announced August 4, 2026; handles reservable, payments not yet live',
        ],
        [
          'Mastercard Agent Pay for Machines',
          'Agents and machines paying each other at scale',
          'Cards, bank accounts, stablecoins, down to fractions of a cent',
          'Network and its partners hold it',
          'Launched June 10, 2026; 30+ partners validating use cases',
        ],
        [
          'AP2',
          'Not a rail: an authorization layer beneath one',
          'Nothing. It proves a human consented',
          'Not applicable',
          'Published September 2025; composes with UCP checkout',
        ],
      ],
    },
    {
      type: 'p',
      text: 'Read the custody column twice. Card networks, Stripe, PayPal, Google Pay, Cloudflare, and every hosted agent network are custodial: a provider sits between the agent and your money, and can gate, delay, or reverse funds. That is not a criticism, it is what buys you dispute handling and a phone number to call. But "the agent pays you directly" is rarely true of anything you can actually adopt today, and it is worth knowing which arrangement you are in before you need it.',
    },
    {
      type: 'cta',
      title: 'The payment leg is fine. Check the leg before it.',
      text: 'Before any of this matters, an agent has to be able to reach your site, read your prices, and hand a buyer something that works. The free Nexez scanner fetches your site the way an agent does and reports exactly what came back. About a minute, no signup.',
      href: '/scan',
      label: 'Scan your site free',
    },
    { type: 'h2', text: 'Prompt injection stops being a data problem' },
    {
      type: 'p',
      text: 'Here is the consequence almost nobody has priced in. For the last two years, prompt injection has been a confidentiality problem: a poisoned page convinces an agent to leak a system prompt or exfiltrate a document. Give that same agent a funded wallet and the failure mode changes category. A poisoned page that persuades an agent to call an attacker’s priced endpoint is now draining a budget, in a rail designed for speed, with no human in the approval path by construction.',
    },
    {
      type: 'p',
      text: 'Which reframes the guardrails. Spend caps, merchant allowlists, and maximum transaction sizes are not conveniences or nice-to-have admin settings. In a world where the agent’s instructions arrive from whatever it happens to read, an enforced ceiling is the only control that holds when the reasoning is compromised, because it does not depend on the reasoning being sound.',
    },
    {
      type: 'p',
      text: 'On the receiving side, the trust question is symmetrical: 78% of financial institutions expect fraud attempts to rise with agent traffic, and 2026 is the year "know your agent" frameworks are being formalized, including cryptographic agent signatures pushed by infrastructure providers. Expect to verify agents the way you already verify payments, and expect the identity layer to arrive bundled with whichever rail you adopt rather than as a separate project.',
    },
    { type: 'h2', text: 'The honest verdict, by what you sell' },
    {
      type: 'p',
      text: 'Most of the decision is made for you by your product. Find yourself here and stop reading the other rows.',
    },
    {
      type: 'ul',
      items: [
        'You sell goods or services to people (retail, clinics, trades, restaurants, professional services). World 1 only. Your work is a clean checkout you control and accurate machine-readable offers. Do nothing about wallets or stablecoins. Revisit in a year.',
        'You sell through Google surfaces. UCP through Merchant Center is the live path, payments come with it, and you stay merchant of record. The protocol work is catalog and capability declaration, not payments.',
        'You sell APIs, data, content, or compute to other software. World 2 is genuinely yours. Read the x402 spec, price a single endpoint as an experiment, and reserve a cloudflare.pay handle since it costs nothing.',
        'You are building agents that spend. Custody and guardrails are the whole design. Separate the account that holds funds from the wallet that spends, cap everything, allowlist destinations, and log every call as a financial event rather than an API event.',
        'You are a platform or marketplace. Watch AP4M and the x402 Foundation membership rather than any single product launch. Rails consolidate around whoever the acceptance network follows.',
      ],
    },
    { type: 'h2', text: 'What to actually build, given all of it' },
    {
      type: 'p',
      text: 'The durable move is rail-agnostic, which is convenient, because nobody knows which rails win. It has two halves and neither of them requires a protocol decision.',
    },
    {
      type: 'p',
      text: 'First, a checkout you control that works on the first try: correct prices, real availability, no login wall in front of the buy, no ten-step flow that assumes a human with a mouse. Every rail above eventually terminates in a transaction against your system, and a checkout that breaks under an agent breaks under all of them at once.',
    },
    {
      type: 'p',
      text: 'Second, offers a machine can read without guessing: [structured data that states your facts in a typed form](/learn/json-ld-for-ai-agents), a feed if you sell products, and where it fits, [an endpoint an agent can act on](/learn/what-is-an-mcp-server) rather than only quote. That is the same work whether the money ends up moving through Google Pay, a delegated token, or a stablecoin nobody has issued yet.',
    },
    {
      type: 'p',
      text: 'Then measure whether any of it is landing. Agent traffic does not appear in Google Analytics, because agents do not execute JavaScript, so the check is a log query. [Measuring AI agent traffic](/learn/measure-ai-agent-traffic) covers the instrument set. If the answer is that no agents are reaching you, the payment rail was never the binding constraint, and this whole article was a preview rather than a to-do list.',
    },
    {
      type: 'cta',
      title: 'Be readable, then be transactable',
      text: 'Nexez publishes your business as agent-legible listings: clean HTML with JSON-LD, agent.json, llms.txt, an OpenAPI spec, and a per-merchant MCP server, with real checkout and scheduling behind them. Start on Free with no card.',
      href: '/how-it-works',
      label: 'See how it works',
    },
  ],
  faqs: [
    {
      question: 'Do I need a crypto wallet to sell to AI agents?',
      answer:
        'Almost certainly not. If you sell products or services to people, agents pay you through the rails you already accept: a card, a wallet, your existing processor, using a delegated token minted for that one transaction. Stablecoin rails such as x402 exist to solve sub-cent machine-to-machine payments for APIs, data, and compute. If that is not what you sell, it is not your problem.',
    },
    {
      question: 'Does an AI agent ever see my customer’s card number?',
      answer:
        'No, and the designs are explicit about it. Both UCP checkout and ACP pass a delegated credential rather than a card: a token scoped to a single transaction and a single merchant, which is worthless once spent or expired. Your processor receives the token, you never store raw card data, and the practical difference on your side is that payment error handling needs its own paths because token failures are not card declines.',
    },
    {
      question: 'What is x402 in plain terms?',
      answer:
        'It is a way for software to pay for something without ever having an account. HTTP reserved a status code called 402 Payment Required and never defined how to use it. x402 defines it: the server answers a request with 402 plus a price and a payment address, the agent pays from its own wallet in a stablecoin, then retries the request carrying proof of payment, and the server hands over the resource. The payment is the credential, which is why no signup is needed.',
    },
    {
      question: 'Who is the merchant of record when an agent buys?',
      answer:
        'You are, on every live delegated-payment design. UCP was built that way deliberately, and it is a large part of why retailers who had refused marketplace-style checkout were willing to participate. You keep the customer relationship, the order data, the confirmation emails, loyalty accrual, and the support obligation. That also means returns and chargebacks remain yours.',
    },
    {
      question: 'Should I reserve a cloudflare.pay handle now?',
      answer:
        'Reserving one is free and takes a minute, so there is little reason not to if you sell anything machines consume. Building a plan around it is different. As of August 2026 only handle reservation is available; Cloudflare describes account funding, Virtual Wallets, and programmable agent spending as arriving in the following months, and has not publicly named a custodian or published pricing.',
    },
    {
      question: 'How is AP2 different from x402?',
      answer:
        'They solve opposite halves of the problem. AP2 is an authorization layer that proves a human actually consented to a purchase, and it sits beneath a rail such as UCP checkout rather than replacing one. x402 is a payment rail for cases where no human consented to anything because no human was involved. You would use AP2 when a person is behind the agent, and x402 when nobody is.',
    },
  ],
}
