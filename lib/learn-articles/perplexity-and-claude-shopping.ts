import type { LearnArticle } from '../learn-content'

export const perplexityAndClaudeShopping: LearnArticle = {
  slug: 'perplexity-and-claude-shopping',
  metaTitle: 'Perplexity and Claude: The Merchant Guide',
  metaDescription:
    'Perplexity sells through PayPal, not a Perplexity feed. Claude has no shopping surface at all. What each one actually reads, and the work that reaches it.',
  title: 'Perplexity and Claude as shopping surfaces',
  dek: 'The agentic commerce conversation is almost entirely about ChatGPT and Google. The two surfaces underneath them work nothing like each other, and nothing like the ones you have read about. One sells through a payments company. The other refuses to complete a purchase at all.',
  category: 'Agentic commerce',
  publishedAt: '2026-08-31',
  updatedAt: '2026-08-31',
  readMinutes: 11,
  blocks: [
    {
      type: 'p',
      text: 'Almost everything written about selling to AI agents is about two companies. That is defensible, since that is where the volume is. But it leaves most merchants with one mental model, "submit a feed, appear in a panel, maybe transact," and then they go looking for the Perplexity version of Merchant Center and the Claude version of a product listing. Neither exists. Perplexity’s front door is a payments company. Claude does not have a shopping surface, and that is a deliberate design decision rather than a gap waiting to be filled.',
    },
    {
      type: 'p',
      text: 'The practical cost of getting this wrong is not just wasted effort. It is that the single most common defensive move, blocking AI crawlers at the edge, has exactly backwards effects across these two. It fails to stop the one that has told you it will ignore your rules, and it succeeds in stopping the one that would have arrived carrying a buyer.',
    },
    {
      type: 'p',
      text: 'This guide covers what each surface actually reads, how a purchase completes or fails on each, the robots.txt asymmetry between them, and what to do this quarter. For the Google and OpenAI side, [Google AI Mode visibility](/learn/google-ai-mode-visibility) and [how AI agents pay](/learn/how-ai-agents-pay) cover that ground.',
    },
    { type: 'h2', text: 'Two surfaces, two entirely different shapes' },
    {
      type: 'table',
      headers: ['', 'Perplexity', 'Claude'],
      rows: [
        ['What it is for merchants', 'A catalog and checkout surface', 'A capability surface, no catalog'],
        ['How your products get in', 'PayPal store sync, not a Perplexity feed', 'There is no product submission'],
        ['How it reads your site', 'PerplexityBot and Perplexity-User', 'ClaudeBot, Claude-User, Claude-SearchBot'],
        ['Structured way in', 'Catalog data through a commerce platform', 'An MCP connector, reviewed and listed'],
        ['Can it complete a purchase', 'Yes, PayPal settles it in the interface', 'No, it stops and hands the wheel back'],
        ['Who is merchant of record', 'You are', 'You are, because you take the order'],
      ],
    },
    {
      type: 'p',
      text: 'Read that table as two different jobs rather than two versions of one job. The Perplexity column is catalog work you have probably already started. The Claude column is not catalog work at all, and no amount of feed quality moves it.',
    },
    { type: 'h2', text: 'Perplexity: the front door is PayPal' },
    {
      type: 'p',
      text: 'Perplexity launched its current shopping experience on November 25, 2025, free to all US users on desktop and web. The part merchants keep missing is in the announcement itself: PayPal powers the checkout that happens inside Perplexity, and merchants remain the record holder for the transaction, keeping returns, loyalty, and the post-purchase relationship exactly as they would on their own site.',
    },
    {
      type: 'p',
      text: 'That single fact reorganizes the whole task. You do not integrate with Perplexity. You enroll with PayPal, whose agentic commerce services, announced October 28, 2025, split into two pieces that are worth naming separately because they land at different times and solve different problems:',
    },
    {
      type: 'ul',
      items: [
        'Store sync, the catalog side. This is what makes your products discoverable on the AI surfaces PayPal connects to, and it is the piece that maps onto the feed discipline you already know.',
        'Agent ready, the payment side. This is what lets the purchase complete inside the surface rather than bouncing the shopper to your checkout page.',
      ],
    },
    {
      type: 'p',
      text: 'PayPal named Wix, BigCommerce with Feedonomics, Cymbio, and Shopware as catalog integration partners at launch, which tells you how the plumbing is intended to work: your commerce platform pushes the catalog, rather than you building something bespoke. If you are on one of those, the question is whether the connector is switched on, not whether to build one.',
    },
    {
      type: 'p',
      text: 'There is an older program still circulating in blog posts: the merchant program that shipped alongside Buy with Pro on November 18, 2024, free to join, offering API access and an analytics dashboard to retailers who shared product specifications. It is worth knowing it existed, because a great deal of 2026 advice is still written against it. The live consumer surface is the one from November 2025, and the live merchant on-ramp runs through PayPal.',
    },
    {
      type: 'p',
      text: 'The work on this side is ordinary and unglamorous: complete, accurate, current product data, expressed the same way everywhere it appears. [Product feeds for AI agents](/learn/product-feeds-for-ai-agents) covers what a rich attribute set looks like and why missing attributes exclude you from filtered results rather than ranking you slightly lower. The same feed serves this surface.',
    },
    {
      type: 'cta',
      title: 'See what these agents actually see',
      text: 'The free Nexez scanner fetches your site the way an agent does and scores what comes back: crawler access, server-rendered content, structured data, and machine-readable offers. About a minute, no signup.',
      href: '/scan',
      label: 'Scan your site free',
    },
    { type: 'h2', text: 'Claude: there is no shopping surface, on purpose' },
    {
      type: 'p',
      text: 'There is no Claude product feed, no merchant program, and no shopping panel to be ranked in. As of this writing the Connectors Directory organizes listings into categories like productivity, data, design, financial services, and healthcare, with no retail or shopping category among them. Merchants who go looking for the Claude equivalent of Merchant Center find nothing, conclude Claude does not matter to them, and stop. That is the wrong conclusion drawn from a correct observation.',
    },
    {
      type: 'p',
      text: 'Claude reaches a business three ways, and each one asks something different of you:',
    },
    {
      type: 'ol',
      items: [
        'It reads your pages. Anthropic documents three agents: ClaudeBot for training data, Claude-User for fetching a page because a person asked something, and Claude-SearchBot for search quality. All three follow robots.txt directives, and Crawl-delay is supported if you want to rate limit rather than block.',
        'It drives a browser as the person. Claude in Chrome reads the page you are signed in to, then clicks, types, and fills forms. Cowork arrived in the Chrome side panel on August 12, 2026 with the same capability and persistent context across devices. This is your website being operated, not read, which makes your actual checkout flow the interface.',
        'It calls your MCP server. This is the only route that hands Claude live structured capability rather than text: real inventory, real availability, real booking. [What is an MCP server](/learn/what-is-an-mcp-server) covers the concept.',
      ],
    },
    {
      type: 'callout',
      tone: 'amber',
      title: 'Claude will not finish the purchase',
      text: 'This is the load-bearing difference and it is stated plainly in Anthropic’s own product documentation: Claude stops before sensitive actions, and purchases and other one-way doors wait for the person. The Cowork side panel announcement repeats it, saying Claude still asks before irreversible or costly actions like making a purchase. So there is no agentic checkout to enroll in here. The agent researches, compares, fills the form, and hands the wheel back at the payment step. Optimize for the handoff being clean rather than for a checkout integration that does not exist.',
    },
    {
      type: 'p',
      text: 'The directory route is real but gated, and it is worth knowing the shape before you plan around it. Submitting a remote MCP server happens inside a Team or Enterprise organization on Claude.ai, requires OAuth 2.0 for authenticated services, requires every tool to carry a title and the applicable read-only or destructive annotation, requires a privacy policy and setup documentation, and goes through human review. That is a real project, not an afternoon. It is also the only way to be a first-class thing Claude can act on rather than a page Claude can read.',
    },
    { type: 'h2', text: 'The robots.txt asymmetry, and why blanket blocking backfires' },
    {
      type: 'p',
      text: 'Put the two operators’ own documentation side by side and something uncomfortable shows up. Perplexity documents two agents: PerplexityBot, which indexes for search and respects robots.txt, and Perplexity-User, which fetches a page because a user asked and, in Perplexity’s own words, generally ignores robots.txt rules, on the reasoning that a person triggered it. Anthropic documents its three agents as following robots.txt, including Claude-User, which is the equivalent user-triggered fetch.',
    },
    {
      type: 'p',
      text: 'So the merchant who adds a broad disallow block to keep AI out gets a result almost exactly opposite to the intent. The user-triggered Perplexity fetch, the one attached to a person who is shopping right now, proceeds anyway. The user-triggered Claude fetch, attached to an equally real person, obeys and returns nothing. You have blocked the compliant traffic and kept the non-compliant traffic, and the compliant one was the buyer you wanted.',
    },
    {
      type: 'p',
      text: 'Which is also why 403s from these agents usually trace to a WAF or bot fight mode rather than to robots.txt. Blocking a fetcher that ignores robots.txt has to happen at the edge, which means the edge is where you decide, deliberately, who gets in. The [crawler guide](/learn/which-ai-crawlers-to-allow) has the full roster and a robots.txt you can copy.',
    },
    { type: 'h2', text: 'What to actually do' },
    {
      type: 'ol',
      items: [
        'Check what you are already blocking. Pull server logs for PerplexityBot, Perplexity-User, ClaudeBot, Claude-User, and Claude-SearchBot and look for 403s. This is the cheapest item on the list and the most likely to be quietly costing you something. The [measurement guide](/learn/measure-ai-agent-traffic) covers instrumenting it.',
        'If you sell products and use PayPal, look at store sync and agent ready. If your platform is Wix, BigCommerce, Cymbio, or Shopware, most of the work is a connector you turn on rather than a build.',
        'Make your site operable, not just readable. Claude in Chrome is going to run your actual checkout with a real person watching. A flow that needs three surprise fields, or an availability answer that only appears after a page transition, fails differently now.',
        'Publish structured facts on the page. Both surfaces read your site directly, and both do better with explicit typed facts than with inference. Templates are in the [JSON-LD guide](/learn/json-ld-for-ai-agents).',
        'Decide on MCP deliberately. If live availability, booking, or inventory is what makes you worth recommending, an MCP server is the only route that carries it. If your catalog is static, your pages plus your feed already say everything an agent needs.',
      ],
    },
    {
      type: 'p',
      text: 'The through-line worth carrying out of this: on these two surfaces the checkout question that dominates the ChatGPT and Google conversation is either outsourced to a payments company or refused outright. That takes the most complicated piece of agentic commerce off your plate for both of them, and it puts the weight back on the unglamorous things, which is that your pages can be fetched, your facts are explicit and current, and your site can be operated by someone who is not a fluent human reader.',
    },
    {
      type: 'cta',
      title: 'One catalog, every surface',
      text: 'Nexez publishes your business as agent-legible, agent-transactable listings from a single source: JSON-LD, llms.txt, agent.json, OpenAPI, a per-merchant MCP server, and ACP plus UCP feeds, with real Stripe checkout and Calendly-backed scheduling. Your pages, your feeds, and your MCP server cannot disagree, because they come from the same place. Start on Free with no card; paid plans include a 7-day trial.',
      href: '/how-it-works',
      label: 'See how it works',
    },
  ],
  faqs: [
    {
      question: 'How do I get my products into Perplexity shopping?',
      answer:
        'Not through Perplexity directly. Perplexity’s current shopping experience, launched in November 2025, uses PayPal for checkout, and PayPal’s agentic commerce services are the merchant on-ramp: store sync handles catalog discoverability and agent ready handles the payment. If your store runs on Wix, BigCommerce with Feedonomics, Cymbio, or Shopware, the catalog connector already exists and the job is switching it on and getting your attributes complete.',
    },
    {
      question: 'Does Claude have a shopping feed or a merchant program?',
      answer:
        'No. There is no product feed, no merchant program, and no shopping panel to rank in, and the Connectors Directory does not currently carry a retail or shopping category. Claude reaches your business by reading your pages, by driving a browser as the signed-in person through Claude in Chrome, or by calling an MCP server you publish. The absence of a feed is a design decision rather than a gap you should wait out.',
    },
    {
      question: 'Can Claude complete a purchase on my site?',
      answer:
        'No, and this is stated in Anthropic’s own documentation rather than being a limitation people inferred. Claude stops before sensitive actions, and purchases and other one-way doors wait for the person. The Cowork Chrome side panel announcement of August 2026 repeats the same rule. Practically, this means Claude will research, compare, and fill your form, then hand control back at payment, so the thing to optimize is a clean handoff rather than a checkout integration.',
    },
    {
      question: 'Will blocking AI crawlers keep Perplexity and Claude off my site?',
      answer:
        'It works asymmetrically, and usually not the way people intend. Perplexity documents that Perplexity-User, the fetch triggered when a person asks a question, generally ignores robots.txt, so a disallow rule does not stop it. Anthropic documents Claude-User as following robots.txt, so the same rule does stop that one. A blanket block therefore removes the compliant, buyer-attached traffic while leaving the non-compliant traffic in place.',
    },
    {
      question: 'Is an MCP server worth building for Claude?',
      answer:
        'It depends on whether live state is what makes you worth recommending. If an agent needs real availability, real inventory, or a real booking to be useful to a shopper, MCP is the only route that carries that, and directory submission requires a Team or Enterprise organization, OAuth 2.0, annotated tools, a privacy policy, documentation, and human review. If your catalog is static and rarely changes, your pages plus your feed already say everything an agent needs.',
    },
    {
      question: 'What is Buy with Pro, and is it still the way in?',
      answer:
        'Buy with Pro was Perplexity’s November 2024 one-click checkout for Pro subscribers, launched alongside a free merchant program that offered API access and an analytics dashboard to retailers sharing product specifications. A lot of current advice is still written against it. The live consumer surface is the free shopping experience launched in November 2025, and the live merchant on-ramp runs through PayPal rather than through that original program.',
    },
    {
      question: 'Do I need a different product feed for Perplexity than for Google?',
      answer:
        'Not a different one in substance. Both are fed by the same underlying catalog discipline: complete attributes, accurate prices and availability, and descriptions dense with the facts shoppers actually name. The pipes differ, since Google reads Merchant Center and the Perplexity path runs through PayPal store sync, but a catalog good enough for one is good enough for the other, and disagreement between your feed and your website hurts you on both.',
    },
  ],
}
