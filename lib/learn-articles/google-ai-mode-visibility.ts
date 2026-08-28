import type { LearnArticle } from '../learn-content'

export const googleAiModeVisibility: LearnArticle = {
  slug: 'google-ai-mode-visibility',
  metaTitle: 'How to Show Up in Google AI Mode',
  metaDescription:
    'AI Mode has two doors: answer citations from the web crawl and product panels from the Shopping Graph. Different pipelines, different work. Here is both.',
  title: 'How to show up in Google AI Mode and Gemini shopping',
  dek: 'Google AI Mode puts two different things on one screen: cited answer text and product panels. They come from two separate pipelines, and being excellent at one does not get you into the other. Here is what feeds each, and the work that actually moves them.',
  category: 'Agent readiness',
  publishedAt: '2026-08-28',
  updatedAt: '2026-08-28',
  readMinutes: 12,
  blocks: [
    {
      type: 'p',
      text: 'There are two ways to appear in Google AI Mode, and they run on completely separate infrastructure. Your brand can be cited inside the generated answer text, which comes from Google\u2019s ordinary web crawl and is judged on trustworthiness and clarity. Or your products can appear in the carousels and comparison panels, which come from the Shopping Graph and are fed by Merchant Center. Same screen, two pipelines, and no amount of excellence in one earns you the other.',
    },
    {
      type: 'p',
      text: 'This is the thing most guides blur, and blurring it is expensive. A retailer with an immaculate product feed and no useful content never gets cited in answers. A publisher with brilliant content and no Merchant Center presence never appears in a product panel. Teams routinely spend a quarter optimizing one track while wondering why the other stayed empty.',
    },
    {
      type: 'p',
      text: 'This guide covers what actually feeds each track, how query fan-out changes what you are optimizing for, the work that moves each one, where the two converge, and how to measure any of it. For the general answer-engine discipline that applies beyond Google, the [GEO guide](/learn/generative-engine-optimization) covers that side.',
    },
    { type: 'h2', text: 'The two tracks' },
    {
      type: 'table',
      headers: ['', 'Content citations', 'Product surfaces'],
      rows: [
        ['Where it appears', 'Inside the generated answer text', 'Carousels, comparison panels, agentic checkout'],
        ['Data source', 'Google\u2019s web crawl and index', 'The Shopping Graph'],
        ['You feed it via', 'Your website', 'Google Merchant Center'],
        ['Judged on', 'Trustworthiness, expertise, structural clarity', 'Attribute completeness, accuracy, freshness'],
        ['Fails when', 'Content is vague, buried, or unfetchable', 'Feed data is thin, stale, or wrong'],
      ],
    },
    {
      type: 'p',
      text: 'The Shopping Graph is the part worth understanding structurally, because it is not a search index. It is a live product knowledge graph holding more than 50 billion listings, refreshed continuously, and it is what Gemini queries when it needs to name actual products with actual prices. Merchant Center is the pipe into it. If your products are not in that graph, they cannot appear in a product panel regardless of how good your site is.',
    },
    { type: 'h2', text: 'Query fan-out changes the unit of optimization' },
    {
      type: 'p',
      text: 'AI Mode does not answer your query. It decomposes it. A question like "backpack for a hiking trip in the Pacific Northwest" gets broken into parallel sub-questions covering weather resistance, capacity, weight, materials, and price range, each searched independently, with the results synthesized into one answer. Google has been widening that fan-out to include use-case language, comparison attributes, and compatibility signals.',
    },
    {
      type: 'p',
      text: 'Two consequences follow, one per track. On the content side, the thing being matched is a passage answering a specific sub-question, not a page targeting a head term. On the product side, the thing being matched is a typed attribute. "Weather resistant" only helps you if it exists as a field or an explicit statement, not as a vibe your product photography conveys.',
    },
    {
      type: 'p',
      text: 'This is why the practical advice converges on the same instruction from both directions: say the specific thing, explicitly, in a place a machine can find it.',
    },
    { type: 'h2', text: 'Track one: getting cited in the answer' },
    {
      type: 'p',
      text: 'This is answer engine optimization, applied to Google specifically. The work, in priority order:',
    },
    {
      type: 'ol',
      items: [
        'Answer one question per page, in the opening. The first 40 to 50 words should contain the direct answer, because fan-out is matching passages and a wind-up buries the thing being matched.',
        'Structure for extraction. Descriptive headings, short paragraphs, comparison tables, and lists give the model clean passages to lift. A dense wall of prose is skipped in favour of a competitor who made it easy.',
        'Ship Product schema on product pages and FAQPage schema on content pages, so Gemini can extract and trust structured facts rather than inferring them. Templates are in the [JSON-LD guide](/learn/json-ld-for-ai-agents).',
        'Earn third-party citations from trusted domains. External corroboration is what gives the model confidence to name you, and it is the slowest-moving and most durable of these inputs.',
        'Confirm you are fetchable. Content behind JavaScript-only rendering, or blocked at the CDN, is content that cannot be cited.',
      ],
    },
    {
      type: 'callout',
      tone: 'amber',
      title: 'The Google-Extended misconception',
      text: 'You will read that blocking Google-Extended removes you from AI Mode. It does not. Per Google\u2019s own crawler documentation, Google-Extended governs whether your content trains and grounds Gemini apps. AI Overviews and AI Mode are Search surfaces and follow Googlebot, so the only way out of them is leaving Search itself. Getting this backwards leads people to block the wrong crawler and lose the wrong thing. The [crawler guide](/learn/which-ai-crawlers-to-allow) covers the full roster.',
    },
    { type: 'h2', text: 'Track two: getting into the product panels' },
    {
      type: 'p',
      text: 'This track runs entirely on your Merchant Center feed, and the quality bar is different from the one that governed shopping ads. Ads rewarded a feed that was complete enough to match a keyword. AI Mode rewards a feed rich enough to satisfy four simultaneous constraints in a sentence a person actually said.',
    },
    {
      type: 'p',
      text: 'That means long descriptive titles carrying the attributes shoppers name, fact-dense descriptions, conversational attributes covering common questions and compatible accessories and substitutes, multiple quality images, complete shipping and return terms, and availability that is actually current. The full breakdown is in [product feeds for AI agents](/learn/product-feeds-for-ai-agents), and the short version is that missing attributes exclude you from filtered results rather than ranking you slightly lower.',
    },
    {
      type: 'p',
      text: 'If you run Shopify, much of the pipe already exists: the Google and YouTube sales channel syncs your catalog into Merchant Center automatically, and pricing and availability updates propagate without a custom integration. Your remaining job is enrichment rather than plumbing.',
    },
    {
      type: 'p',
      text: 'Discovery is where this track ends. Completing a purchase inside AI Mode or the Gemini app is a further step that runs on UCP, covered in the [UCP merchant guide](/learn/what-is-google-ucp). Worth separating in your planning, because a great many merchants can win the panel long before they can transact in it.',
    },
    {
      type: 'cta',
      title: 'See which track you are failing',
      text: 'The free Nexez scanner fetches your site the way Google\u2019s AI surfaces do and scores the content side: crawler access, server-rendered content, structured data, and machine-readable offers. About a minute, no signup.',
      href: '/scan',
      label: 'Scan your site free',
    },
    { type: 'h2', text: 'Where the two tracks converge' },
    {
      type: 'p',
      text: 'They are separate pipelines but not separate realities, and the connection is verification. Google continuously compares what your feed claims against what your website shows, and disagreement costs you trust on both tracks at once. A price that differs between the two is not a feed problem or a content problem; it is an entity problem, and it makes you a less safe thing for a model to assert.',
    },
    {
      type: 'p',
      text: 'The other convergence is that the catalog work most retailers already did for shopping ads quietly became an AI visibility asset. The Shopping Graph that grounds product mentions in AI Mode, AI Overviews, and Gemini answers is built from the same Merchant Center feeds that have powered Shopping for a decade. Most teams have not noticed this, which is precisely why feed hygiene is currently underpriced as a visibility lever.',
    },
    { type: 'h2', text: 'Measuring it' },
    {
      type: 'p',
      text: 'Three instruments, each covering something the others miss:',
    },
    {
      type: 'ul',
      items: [
        'Merchant Center performance reporting, which shows Shopping Graph impressions by placement type, so you can see the product track separately from ads. Google began piloting an AI performance insights report for selected US accounts in July 2026, so availability varies by account.',
        'A prompt panel: 20 to 30 realistic questions your customers ask, run monthly in AI Mode and the Gemini app, logging whether you appear in the answer text, in a product panel, or not at all. Recording which of the two it was is the whole point, since the fixes differ.',
        'Referral and crawler data, since AI-sourced traffic behaves oddly in analytics and crawler activity never appears there at all. The [measurement guide](/learn/measure-ai-agent-traffic) covers instrumenting that properly.',
      ],
    },
    {
      type: 'p',
      text: 'One number worth holding onto while you wait for volume: referrals arriving from AI chat surfaces have been measured converting at roughly 7%, several times better than social traffic, because people arrive already recommended and already decided. Small numbers in this channel are worth more than the same numbers elsewhere, so judge it on quality before you judge it on scale.',
    },
    {
      type: 'p',
      text: 'The honest summary is that neither track is a trick. One asks you to write things that are clearly true and easy to extract; the other asks you to describe what you sell completely and keep it current. Both were good practice before AI Mode existed. What changed is that the penalty for skipping them stopped being a slightly worse ranking and started being absence from the answer entirely.',
    },
    {
      type: 'cta',
      title: 'One source of truth behind both tracks',
      text: 'Nexez publishes your business as agent-legible, agent-transactable listings from a single catalog: JSON-LD, llms.txt, agent.json, OpenAPI, a per-merchant MCP server, and ACP plus UCP feeds, with real Stripe checkout and Calendly-backed scheduling. Your pages and your feeds cannot disagree, because they come from the same place. Start on Free with no card; paid plans include a 7-day trial.',
      href: '/how-it-works',
      label: 'See how it works',
    },
  ],
  faqs: [
    {
      question: 'How do I get my products to appear in Google AI Mode?',
      answer:
        'Product panels in AI Mode are drawn from the Shopping Graph, which you feed through Google Merchant Center rather than through your website. Submit a complete, accurate, frequently refreshed product feed with rich titles, fact-dense descriptions, conversational attributes, multiple images, and full shipping and return terms. No amount of website quality substitutes for this, because the product surfaces do not read your site directly.',
    },
    {
      question: 'What is the difference between being cited in AI Mode and appearing in a product panel?',
      answer:
        'They come from different pipelines. Citations in the answer text draw on Google\u2019s ordinary web crawl and are judged on trustworthiness, expertise, and structural clarity, so they are earned with content. Product panels draw on the Shopping Graph fed by Merchant Center and are judged on attribute completeness, accuracy, and freshness, so they are earned with feed quality. Winning one does not get you the other.',
    },
    {
      question: 'Does blocking Google-Extended remove me from AI Mode?',
      answer:
        'No, and this is a common and costly misunderstanding. Google-Extended controls whether your content is used to train and ground Gemini apps. AI Overviews and AI Mode are Search surfaces that follow Googlebot, so the only way to exit them is to leave Search indexing entirely. Blocking Google-Extended sacrifices Gemini app grounding while leaving AI Mode visibility unchanged, which is rarely the trade people think they are making.',
    },
    {
      question: 'What is query fan-out and why does it matter?',
      answer:
        'AI Mode decomposes a complex question into many narrower sub-questions, searches them in parallel, and synthesizes one answer. It matters because the unit being matched is a passage or a typed attribute rather than a page targeting a keyword. Google has widened fan-out to include use-case language, comparison attributes, and compatibility signals, so specifics you never bothered to state explicitly are now the things being matched against.',
    },
    {
      question: 'Do I need UCP to appear in Google AI Mode?',
      answer:
        'No. Discovery and transaction are separate. A clean Merchant Center feed gets your products discovered and displayed in AI Mode. UCP is the additional layer that lets an agent complete a purchase without the shopper leaving the surface. Most merchants should win discovery first, since it is cheaper, ungated, and where the volume currently is.',
    },
    {
      question: 'How do I track whether any of this is working?',
      answer:
        'Use Merchant Center performance reporting for Shopping Graph impressions by placement, which isolates the product track, noting that Google began piloting an AI performance insights report for selected US accounts in July 2026. Pair it with a monthly prompt panel recording whether you appeared in answer text, a product panel, or neither, and with server-log and referral instrumentation as covered in the [measurement guide](/learn/measure-ai-agent-traffic).',
    },
  ],
}
