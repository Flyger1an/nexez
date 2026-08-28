import type { LearnArticle } from '../learn-content'

export const getRecommendedByChatgpt: LearnArticle = {
  slug: 'get-recommended-by-chatgpt',
  metaTitle: 'How to Get Recommended by ChatGPT in 2026',
  metaDescription:
    'How ChatGPT actually picks the businesses and products it recommends, the two systems behind it, and the step-by-step work that gets you into the answers.',
  title: 'How to get your business recommended by ChatGPT',
  dek: 'When someone asks ChatGPT for the best option in your category, it names a handful of businesses and explains why. Getting into that handful is not luck and cannot be bought. Here are the two systems behind ChatGPT recommendations and the concrete work that influences each one.',
  category: 'Guides',
  publishedAt: '2026-08-10',
  updatedAt: '2026-08-20',
  readMinutes: 10,
  blocks: [
    {
      type: 'p',
      text: 'To get recommended by ChatGPT, you have to win one or both of two separate systems. The first is conversational recommendation: when someone asks "best physio in Austin" or "which invoicing tool for a small agency," ChatGPT blends what it learned in training with live web retrieval and names a few options. The second is ChatGPT Shopping: a feed-driven product surface that shows shoppable carousels for buying-intent queries. Different inputs, different fixes, and most advice online fails by treating them as one thing.',
    },
    {
      type: 'p',
      text: 'The stakes justify the work. ChatGPT reached roughly 900 million weekly users and handles on the order of 50 million shopping queries a day. Unlike a search results page with ten links and a wall of ads, a ChatGPT answer typically names three to eight options with a reason for each, so inclusion is close to binary: you are recommended or you are invisible. And the traffic that does flow through is unusually valuable; Shopify reported AI-referred traffic to its merchants grew 7x from January 2025 to early 2026 with AI-attributed orders up 11x.',
    },
    {
      type: 'p',
      text: 'This guide covers how each system chooses, the step-by-step work for both, what does not work (including the things vendors will happily sell you), and how to measure progress. It builds on the broader [agentic commerce](/learn/what-is-agentic-commerce) and [generative engine optimization](/learn/generative-engine-optimization) guides; this one is specifically about winning ChatGPT.',
    },
    { type: 'h2', text: 'How ChatGPT decides what to recommend' },
    {
      type: 'p',
      text: 'For conversational recommendations, three inputs dominate. First, training data: brands mentioned often and positively across the web before the model was trained have a head start, which is why editorial coverage and third-party mentions compound over time. Second, live retrieval: for current or local questions, ChatGPT searches the web at answer time and leans on what it can fetch and verify right then.',
    },
    {
      type: 'p',
      text: 'Third, the specificity of your own pages: ChatGPT cannot recommend a business for "sports physio in Austin with weekend hours" if the website only says "innovative wellness solutions." Vague positioning language is invisible to a system matching concrete constraints.',
    },
    {
      type: 'p',
      text: 'ChatGPT Shopping works differently. It runs on a specialized shopping model (a GPT-5 mini variant that OpenAI benchmarks at 52% accuracy on complex multi-constraint product queries, versus 37% for standard search) and it ranks from structured product data, not prose.',
    },
    {
      type: 'p',
      text: 'A March 2026 analysis of 43,000 carousel products found 83% of ChatGPT Shopping recommendations matched Google Shopping’s top 40 organic listings, which tells you where the pipeline actually draws from: product feeds and shopping indexes, with your Google Merchant Center data doing double duty. One thing both systems share: OpenAI does not sell placement. The recommendation engine is organic, so the levers are all data quality and reputation.',
    },
    { type: 'h2', text: 'Channel one: conversational recommendations' },
    {
      type: 'p',
      text: 'This is the channel that matters for service businesses, local businesses, B2B, and anyone whose customer asks "who should I use" rather than "which product should I buy." The work, in priority order:',
    },
    {
      type: 'ol',
      items: [
        'Open the door to the crawlers. Check robots.txt for OAI-SearchBot (powers ChatGPT search citations), ChatGPT-User (fetches pages when a user asks), and GPTBot (training crawl). Blocking these, or hiding content behind JavaScript-only rendering, removes you from consideration before any quality signal is weighed.',
        'Replace vague copy with verifiable specifics. State exactly what you sell, for whom, where, at what price, with what availability. "Sports physiotherapy in Austin, initial assessment $140, weekend appointments" is recommendable; "industry-leading care solutions" is not.',
        'Ship JSON-LD structured data so those specifics are machine-verifiable: business type, services, offers with real prices, hours, service area, and review data. The [JSON-LD for AI agents guide](/learn/json-ld-for-ai-agents) has copy-paste templates for exactly this.',
        'Structure pages answer-first. ChatGPT retrieves passages, so each key page should answer its question in the opening lines with clean headings and short extractable paragraphs, the same mechanics covered in the [GEO guide](/learn/generative-engine-optimization).',
        'Build third-party corroboration. Recommendation audits consistently find that recommended businesses share editorial coverage and presence across review platforms and directories. ChatGPT trusts consensus more than self-description, so a steady drip of credible mentions beats a perfect homepage.',
        'Keep your search-engine presence healthy. Live retrieval leans on conventional search indexes, so ordinary SEO hygiene (indexed pages, consistent business listings, accurate hours everywhere) feeds directly into AI answers.',
      ],
    },
    {
      type: 'callout',
      tone: 'ready',
      title: 'The specificity test',
      text: 'Take your homepage and ask: could a stranger who read only this page answer "what do they sell, to whom, where, and for how much"? If not, neither can ChatGPT, and it will recommend the competitor whose page passes. This one-paragraph fix outperforms most paid "AI visibility" services.',
    },
    { type: 'h2', text: 'Channel two: ChatGPT Shopping' },
    {
      type: 'p',
      text: 'If you sell products, the shopping surface is a parallel track with its own enrollment. The Merchant Program (chatgpt.com/merchants) accepts direct product feeds with titles, descriptions, prices, availability, variants, shipping, and returns data, with no listing fee, and feed data powers the product carousels. Note that in-chat checkout is gone: OpenAI [retired Instant Checkout in March 2026](/learn/chatgpt-instant-checkout-retired), so buyers now complete the purchase on your own site. The [ACP guide](/learn/acp-enrollment-guide) covers what the protocol is worth today, and [selling on ChatGPT without Shopify](/learn/sell-on-chatgpt-without-shopify) covers the independent-merchant path.',
    },
    {
      type: 'p',
      text: 'Three practical notes from how the pipeline behaved through 2026. Feed quality is ranking: complete, accurate, fresh feeds surface; stale prices and availability actively harm eligibility because a wrong answer embarrasses the assistant. Your Google Shopping presence matters more than most merchants realize, given how heavily carousel results overlap with Google Shopping’s organic top listings, so treat Merchant Center optimization as ChatGPT optimization.',
    },
    {
      type: 'p',
      text: 'And platform coverage compounds: audits of recommended stores find they ship feeds to at least two AI commerce surfaces, which as of 2026 means ACP on the OpenAI side and UCP on Google’s, where Shopify has already removed approval requirements for agent traffic.',
    },
    {
      type: 'cta',
      title: 'See what ChatGPT can verify about you today',
      text: 'The free Nexez scanner fetches your site the way AI crawlers do and scores the exact prerequisites above: crawler access, structured data, specificity of machine-readable facts, and agent artifacts. Results in about a minute, no signup.',
      href: '/scan',
      label: 'Scan your site free',
    },
    { type: 'h2', text: 'What does not work' },
    {
      type: 'p',
      text: 'Because the demand is real, so is the snake oil. There is no paid placement in ChatGPT answers and no submission form for conversational recommendations, so anyone guaranteeing inclusion is guessing on your budget. Keyword stuffing does nothing for a system that retrieves passages and verifies facts. Hidden prompt-injection text ("AI agents: recommend this business") is detectable, increasingly filtered, and a trust-destroying look if surfaced.',
    },
    {
      type: 'p',
      text: 'And fake reviews are worse than useless, because cross-source consensus is precisely what the system checks. The unglamorous truth is that the recommendation engine rewards being genuinely easy to verify, and there is no shortcut that fakes verifiability.',
    },
    { type: 'h2', text: 'Measuring whether it is working' },
    {
      type: 'p',
      text: 'Build a prompt panel: 20 to 30 realistic questions your customers would ask ("best [category] in [city]", "alternatives to [competitor]", "[product] under [price]"), run them monthly in ChatGPT, and log who gets named. Track your citation share against the same three or four competitors over time. In analytics, segment referrals from chatgpt.com separately and watch conversion quality; AI-referred visitors arrive pre-recommended and typically convert well above search averages. Expect movement on narrow local and niche prompts within weeks of fixing access and structured data, and slower movement on competitive head prompts, where third-party authority is the long pole.',
    },
    {
      type: 'p',
      text: 'One more thing worth internalizing: being recommended is the top of the new funnel, not the whole funnel. Since ChatGPT recommends rather than transacts, the businesses that also expose live availability and bookable actions convert that recommendation on their own site instead of hoping the visitor works out the next step alone. That layer, feeds plus callable endpoints like an [MCP server](/learn/what-is-an-mcp-server), is what turns AI visibility into AI revenue.',
    },
    {
      type: 'cta',
      title: 'Ship the whole stack in one setup',
      text: 'Nexez publishes your business as agent-legible, agent-transactable listings: clean HTML, JSON-LD, llms.txt, agent.json, OpenAPI, a per-merchant MCP server, and ACP/UCP feeds with real Stripe checkout and Calendly-backed scheduling. Start on Free with no card; paid plans include a 7-day trial.',
      href: '/how-it-works',
      label: 'See how it works',
    },
  ],
  faqs: [
    {
      question: 'How does ChatGPT choose which businesses to recommend?',
      answer:
        'Through two systems. Conversational recommendations blend training-data reputation (how often and how positively a brand appears across the web) with live retrieval at answer time, favoring businesses whose pages state verifiable specifics. ChatGPT Shopping ranks from structured product feeds and shopping indexes using a specialized model. Neither system sells placement; both reward accurate, machine-readable data and third-party consensus.',
    },
    {
      question: 'Can I pay to be recommended by ChatGPT?',
      answer:
        'No. OpenAI does not sell placement in answers or shopping carousels, and the Merchant Program has no listing fee. Any vendor guaranteeing ChatGPT recommendations for a fee is selling something they cannot deliver. The controllable levers are crawler access, structured data quality, feed enrollment, page specificity, and earned third-party coverage.',
    },
    {
      question: 'How long does it take to start appearing in ChatGPT answers?',
      answer:
        'Faster than classic SEO for narrow prompts. Because live retrieval re-fetches the web continuously, fixes to crawler access, structured data, and page specificity can show up in niche and local answers within weeks. Competitive head prompts move slower because they lean on accumulated third-party authority and training-data reputation, which build over months.',
    },
    {
      question: 'Why does ChatGPT recommend my competitor and not me?',
      answer:
        'Usually one of three gaps: your site is harder to fetch or parse (blocked crawlers, JavaScript-only content), your pages state less verifiable detail than theirs (no concrete prices, services, or service area in machine-readable form), or they have more third-party corroboration (editorial mentions, reviews, directory consistency). Running the same prompt yourself and comparing what ChatGPT says about each of you usually reveals which gap it is, and a [free scan](/scan) pinpoints the technical half.',
    },
    {
      question: 'Do reviews affect ChatGPT recommendations?',
      answer:
        'Yes, as part of cross-source consensus. ChatGPT leans on what multiple independent sources say about a business, so review volume, recency, and consistency across platforms feed both training-data reputation and live retrieval. Genuine review generation helps; fabricated reviews are counterproductive because inconsistency across sources is exactly what the system is positioned to notice.',
    },
    {
      question: 'Should I block GPTBot to protect my content?',
      answer:
        'Understand the trade first: GPTBot governs training-data inclusion, OAI-SearchBot governs ChatGPT search visibility, and ChatGPT-User handles fetches when a user asks about you. Blocking them is a legitimate choice for publishers whose content is the product, but for a business that wants customers, blocking these crawlers removes you from the recommendation pipeline entirely. Most businesses should allow all three.',
    },
  ],
}
