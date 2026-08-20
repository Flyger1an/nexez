import type { LearnArticle } from '../learn-content'

export const chatgptInstantCheckoutRetired: LearnArticle = {
  slug: 'chatgpt-instant-checkout-retired',
  metaTitle: 'What Happened to ChatGPT Instant Checkout',
  metaDescription:
    'OpenAI retired Instant Checkout in March 2026, five months after launch. What happened, why, what survived, and the model that replaced it.',
  title: 'What happened to ChatGPT Instant Checkout, and what merchants should do now',
  dek: 'OpenAI shut down in-chat checkout in March 2026, about five months after launching it. The protocol underneath survived, the shopping surface did not, and a lot of published advice still tells merchants to enroll in a program that no longer exists. Here is the accurate picture.',
  category: 'Agentic commerce',
  publishedAt: '2026-08-17',
  updatedAt: '2026-08-17',
  readMinutes: 11,
  blocks: [
    {
      type: 'p',
      text: 'You cannot buy things inside ChatGPT anymore. OpenAI retired Instant Checkout on March 4, 2026, roughly five months after launching it, and moved ChatGPT back to what it was already good at: helping people decide what to buy, then sending them to the merchant to actually buy it. If your agent-commerce plan says integrate Instant Checkout, that plan is out of date, and a great deal of published advice still says exactly that.',
    },
    {
      type: 'p',
      text: 'The nuance that most coverage gets wrong in one direction or the other: the Agentic Commerce Protocol did not die with the feature it launched alongside. ACP is alive, actively specified, and arguably more relevant now than it was in September 2025. What ended was OpenAI\u2019s in-chat checkout surface, not the standard underneath it. Those are different things, and merchants who conflate them either write off work that still matters or keep chasing a door that is closed.',
    },
    {
      type: 'p',
      text: 'This guide covers the timeline, the actual reasons (which are more interesting than the announcement suggests), what survived, where agentic checkout went instead, and the durable model that emerged. If you want the wider frame first, [what agentic commerce is](/learn/what-is-agentic-commerce) sets it up.',
    },
    { type: 'h2', text: 'The timeline' },
    {
      type: 'p',
      text: 'The whole arc ran about five months, which is worth seeing laid out because the speed is the story.',
    },
    {
      type: 'table',
      headers: ['When', 'What happened'],
      rows: [
        ['September 29, 2025', 'OpenAI launches Instant Checkout with Etsy, and publishes ACP with Stripe under Apache 2.0'],
        ['October 2025', 'Glossier, Vuori, Spanx, and SKIMS come on through Shopify; PayPal adopts ACP on October 28'],
        ['December 11, 2025', 'Stripe ships its Agentic Commerce Suite built on the protocol'],
        ['March 4, 2026', 'OpenAI pulls back in-chat checkout, disclosed in a post about product discovery'],
        ['April 17, 2026', 'ACP publishes a stable spec revision covering cart, feed, orders, and MCP integration'],
      ],
    },
    {
      type: 'p',
      text: 'OpenAI did not put out a press release announcing the shutdown. The disclosure sat near the end of a post titled "Powering Product Discovery in ChatGPT," in language worth quoting because it is the company\u2019s own framing: they found the initial version did not offer the level of flexibility they aspire to provide, so they are allowing merchants to use their own checkout experiences while they focus their efforts on product discovery. The Information reported the pullback first. TD Cowen analysts called it a stunning admission, Booking.com stock rose about 8% on the news and Expedia about 13%, and a chorus on LinkedIn declared agentic commerce dead on arrival.',
    },
    { type: 'h2', text: 'Why it actually failed' },
    {
      type: 'p',
      text: 'The obituaries mostly blamed consumer reluctance. The evidence points somewhere less philosophical.',
    },
    {
      type: 'p',
      text: 'It was conversion math. Walmart measured checkout inside ChatGPT converting roughly three times worse than a click-through to walmart.com, even while ChatGPT drove about twice the new-customer rate of search. Read those two numbers together and the strategic conclusion writes itself: the assistant was excellent at bringing new buyers and bad at closing them. If a channel sends you better customers but loses two thirds of them at the till, you want the traffic and not the till.',
    },
    {
      type: 'p',
      text: 'Adoption was also thinner than the launch coverage implied. Across the feature\u2019s entire run, the Shopify merchant count never exceeded roughly a dozen brands, despite headlines about millions of merchants becoming eligible. A checkout rail with a dozen live sellers is a pilot, not a channel, and it never reached the catalog breadth that would have made it useful for the multi-constraint shopping questions people actually ask.',
    },
    {
      type: 'p',
      text: 'The product was narrow, too. Instant Checkout supported single-item purchases only, from US sellers to US buyers. Multi-item carts, international availability, and expanded categories were all roadmapped for 2026 and none of them shipped before the retirement. Meanwhile OpenAI was fighting on several fronts at once: its share of US daily AI app users fell from about 57% to 42% between August 2025 and February 2026 while Gemini roughly doubled to 25% and Claude tripled its US share in February alone. Building payment infrastructure is an expensive thing to do while losing ground on the core product.',
    },
    {
      type: 'callout',
      tone: 'amber',
      title: 'Why so much advice is still wrong',
      text: 'The retirement was disclosed quietly, inside a post about something else, with no press cycle of its own. Guides published in April and May 2026, months after the shutdown, still walk readers through enrollment steps for a closed program. If you are reading anything that describes applying to Instant Checkout, checking eligibility, or waiting on OpenAI review, check its date and then check whether it was ever corrected. Ours were not, until now, which is why this article exists.',
    },
    { type: 'h2', text: 'What survived: the protocol' },
    {
      type: 'p',
      text: 'ACP is open source under Apache 2.0 and did not depend on Instant Checkout to continue. PayPal adopted it in October 2025 to bring its merchant network into agentic commerce. Stripe built its Agentic Commerce Suite on it. The specification kept shipping revisions after the retirement, and the stable version dated April 17, 2026 covers checkout, payment delegation, cart, feed, orders, authentication, and integration with the Model Context Protocol.',
    },
    {
      type: 'p',
      text: 'That last item matters more than it sounds. A commerce protocol reaching into [MCP](/learn/what-is-an-mcp-server) means agent-initiated purchasing is converging with the general tool-calling standard the whole industry already adopted, rather than living in a walled commerce silo. The plumbing outlived the storefront, which is a normal pattern for infrastructure standards and an unusual one for product launches.',
    },
    { type: 'h2', text: 'Where agentic checkout went instead' },
    {
      type: 'p',
      text: 'The demand did not evaporate when OpenAI stepped back. It moved.',
    },
    {
      type: 'ul',
      items: [
        'Google\u2019s Universal Commerce Protocol, launched at NRF in January 2026 with Shopify, Etsy, Wayfair, Target, and Walmart, now covers discovery through post-purchase across AI Mode, Gemini, and YouTube Shopping. The [UCP guide](/learn/what-is-google-ucp) covers the merchant side.',
        'Shopify turned on Agentic Storefronts by default in its Winter 2026 Edition, activating UCP and native MCP servers for its merchants without per-merchant integration work.',
        'Perplexity continued building its own buying flow, and OpenAI itself routed commerce toward third-party apps like Instacart, Target, and Booking.com rather than native checkout.',
      ],
    },
    {
      type: 'p',
      text: 'The pattern across all of it: platforms that already owned merchant relationships and payment infrastructure absorbed the checkout problem, while the pure assistant surfaces retreated to recommendation. That is a more defensible division of labor and probably where this settles.',
    },
    { type: 'h2', text: 'The model that replaced it: discover in AI, buy on your site' },
    {
      type: 'p',
      text: 'The durable 2026 pattern is a split. AI assistants do discovery, comparison, and recommendation. Purchase completes in the merchant\u2019s own environment, where conversion is measurably better and the merchant controls the experience, the upsell, the loyalty enrollment, and the returns flow.',
    },
    {
      type: 'p',
      text: 'For merchants this is genuinely good news, and not just as consolation. The work that gets you recommended is the same work whether checkout happens in-chat or on your site: accurate structured product data, crawlable pages, verifiable prices and availability, and third-party corroboration. None of that was wasted by the retirement. What changed is that the last mile came home, which means your own checkout quality matters again rather than being bypassed.',
    },
    {
      type: 'cta',
      title: 'Check what assistants can actually read about you',
      text: 'Discovery is now the whole ChatGPT opportunity, and it runs on what an assistant can fetch and verify. The free Nexez scanner checks your site the way an AI crawler does and scores crawler access, structured data, and machine-readable offers. No signup, about a minute.',
      href: '/scan',
      label: 'Scan your site free',
    },
    { type: 'h2', text: 'What to do now' },
    {
      type: 'ol',
      items: [
        'Stop pursuing ChatGPT in-chat checkout. There is no queue, no application, and no eligibility review to pass. Any effort budgeted for it should move to discovery and to your own checkout.',
        'Win the recommendation instead. Being named in a ChatGPT answer is still the thing that decides whether you are in the consideration set, and the mechanics are covered in [how to get recommended by ChatGPT](/learn/get-recommended-by-chatgpt).',
        'Make your own checkout worth arriving at. The traffic AI sends converts well when it lands somewhere fast and frictionless. That is now the deciding surface rather than a formality.',
        'Pick your protocol by where your buyers are. UCP is the live agentic checkout rail with real distribution behind it. ACP remains worth supporting if your platform or payment provider speaks it, particularly given the MCP convergence.',
        'Instrument the channel. AI-sourced revenue arrives with unusual attribution, and the [measurement guide](/learn/measure-ai-agent-traffic) covers how to see it across crawler logs, referrals, and orders.',
      ],
    },
    { type: 'h2', text: 'Does this mean agentic commerce failed?' },
    {
      type: 'p',
      text: 'No, and the market data cuts against that reading. AI-referred retail traffic grew 393% year over year in Q1 2026 and converts substantially better than traditional search, and every major forecast for agent-mediated commerce remained intact through the retirement. What failed was one company\u2019s first implementation of one part of the stack, at a moment when that company had bigger problems.',
    },
    {
      type: 'p',
      text: 'The useful lesson is narrower and more practical. Bet on the layer that does not depend on any single vendor\u2019s product decisions. Structured, accurate, machine-readable business data was valuable before Instant Checkout, stayed valuable during it, and is still valuable now that it is gone. Merchants who built on that foundation lost nothing in March. Merchants who built specifically for one company\u2019s checkout surface learned an expensive lesson about platform risk.',
    },
    {
      type: 'cta',
      title: 'Build on the layer that survives platform churn',
      text: 'Nexez publishes your business as agent-legible, agent-transactable listings: JSON-LD, llms.txt, agent.json, OpenAPI, a per-merchant MCP server, and ACP plus UCP feeds, with real Stripe checkout and Calendly-backed scheduling behind them, all generated from one source of truth. When a protocol changes, it is a regeneration rather than a rebuild. Start on Free with no card; paid plans include a 7-day trial.',
      href: '/how-it-works',
      label: 'See how it works',
    },
  ],
  faqs: [
    {
      question: 'Is ChatGPT Instant Checkout still available?',
      answer:
        'No. OpenAI retired it on March 4, 2026, about five months after its September 29, 2025 launch. Shoppers can no longer complete purchases inside ChatGPT. OpenAI disclosed the change in a post about product discovery, stating that the initial version lacked the flexibility they wanted and that merchants would use their own checkout experiences while OpenAI focused on discovery.',
    },
    {
      question: 'Why did OpenAI shut down Instant Checkout?',
      answer:
        'Primarily conversion economics. Walmart measured in-chat checkout converting roughly three times worse than a click-through to its own site, even though ChatGPT delivered about twice the new-customer rate of search. Adoption was also thin, with the Shopify cohort never exceeding around a dozen brands, and the product remained limited to single-item US-only purchases. OpenAI was simultaneously losing daily-user share to Gemini and Claude, making expensive payment infrastructure hard to justify.',
    },
    {
      question: 'Is the Agentic Commerce Protocol dead too?',
      answer:
        'No, and this is the most common misunderstanding. ACP is open source under Apache 2.0 and continued after the retirement. PayPal adopted it, Stripe built its Agentic Commerce Suite on it, and the stable spec dated April 17, 2026 covers checkout, payment delegation, cart, feed, orders, authentication, and integration with the Model Context Protocol. The surface closed; the standard did not.',
    },
    {
      question: 'Did I waste my time building an ACP integration?',
      answer:
        'Mostly no, though the payoff moved. Feed and catalog work transfers directly to other surfaces because structured product data is the shared input across every agentic channel. Checkout-session endpoints retain value if your payment provider or platform speaks ACP, and the protocol\u2019s convergence with MCP suggests continued relevance. What lost value is anything built specifically to satisfy OpenAI\u2019s enrollment requirements.',
    },
    {
      question: 'Where can AI agents actually complete purchases now?',
      answer:
        'Mainly through Google\u2019s Universal Commerce Protocol across AI Mode, Gemini, and YouTube Shopping, and through platforms that implement it, with Shopify enabling Agentic Storefronts by default in its Winter 2026 Edition. Perplexity operates its own buying flow, and OpenAI now routes commerce through third-party apps such as Instacart, Target, and Booking.com rather than native checkout.',
    },
    {
      question: 'Should I still optimise for ChatGPT?',
      answer:
        'Yes, arguably more than before, because discovery is now the entire ChatGPT opportunity and it feeds your own checkout where conversion is better. Being named in a ChatGPT recommendation still determines whether you make the consideration set. The work is crawler access, accurate structured data, real prices, and third-party corroboration, covered in [how to get recommended by ChatGPT](/learn/get-recommended-by-chatgpt).',
    },
  ],
}
