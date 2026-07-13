import type { LearnArticle } from '../learn-content'

export const aiAgentsBookServiceBusinesses: LearnArticle = {
  slug: 'ai-agents-book-service-businesses',
  metaTitle: 'How AI Agents Find & Book Service Businesses',
  metaDescription:
    'How AI agents source local recommendations in 2026, what makes a business quotable vs bookable, and the rails that let an agent book and pay.',
  title: 'How AI agents find, compare, and book service businesses in 2026',
  dek: 'Most advice about "getting recommended by ChatGPT" stops at discovery. This is the full pipeline: where agents source local recommendations, how they pick a winner, and what actually happens when one tries to book and pay.',
  category: 'Agentic commerce',
  publishedAt: '2026-07-13',
  updatedAt: '2026-07-13',
  readMinutes: 9,
  blocks: [
    {
      type: 'p',
      text: 'Ask ChatGPT to find a mobile dog groomer in Austin who can come Saturday morning and you get a confident shortlist in seconds. Ask it to book one and the confidence evaporates. The agent opens a website, meets a JavaScript booking widget it cannot operate, and hands back a phone number.',
    },
    {
      type: 'p',
      text: 'That gap, between being recommended and being bookable, is the most under-covered topic in local marketing right now. Nearly everything written about AI visibility comes from SEO agencies, and their advice is genuinely useful: directory data, reviews, and structured markup really do drive which businesses agents mention. It just stops at the exact moment money could change hands.',
    },
    {
      type: 'p',
      text: 'This guide covers the whole pipeline. How agents source local and service recommendations today, what makes them pick one business over another, and what happens when they try to complete a booking, including the rails that now exist to let them finish.',
    },
    { type: 'h2', text: 'How AI agents find businesses in the first place' },
    {
      type: 'p',
      text: 'When someone asks an assistant for a service recommendation, the answer gets assembled from three sources: what the model absorbed in training, what a live web search returns in the moment, and licensed structured data from directories and aggregators.',
    },
    {
      type: 'p',
      text: 'The directory layer surprises most owners. ChatGPT’s local results lean heavily on aggregator data; one widely cited local-SEO analysis found that more than 70% of ChatGPT’s local business results drew on Foursquare data. Its web search has historically drawn on Bing’s index, which is why Bing Places matters more than its consumer market share suggests. Gemini pulls from Google’s index and Google Business Profile, and Perplexity has sourced local data from review platforms like Yelp and Tripadvisor.',
    },
    {
      type: 'ul',
      items: [
        'Directories and aggregators (Foursquare, Yelp, Google Business Profile, Bing Places, Apple Maps). A stale category or wrong hours here follows you into every AI answer built on that source.',
        'Live web search. The agent runs a query, opens the top handful of results, and extracts facts from the HTML. If your prices and services only exist inside a JavaScript app or a PDF, extraction fails and the agent quotes a competitor instead.',
        'Reviews. Agents do not just count stars; they summarize. "Reviewers repeatedly mention that he shows up on time" is exactly the kind of sentence assistants generate from review text.',
      ],
    },
    {
      type: 'p',
      text: 'So the standard agency checklist (claim your Google Business Profile, fix your name-address-phone consistency, accumulate recent reviews) is correct. It is just the first third of the pipeline.',
    },
    { type: 'h2', text: 'The comparison step: why agents pick one business over another' },
    {
      type: 'p',
      text: 'Discovery gets you into the candidate pool. Getting picked is a different game, and it rewards one property above everything else: being quotable.',
    },
    {
      type: 'p',
      text: 'Watch what an assistant does when a user asks it to compare two plumbers. It does not weigh brand feelings. It builds a table: price or price range, response time, service area, licensing, review sentiment, cancellation policy. A site that says "drain clearing from $149, same-day slots most weekdays" fills five cells of that table. A site that says "contact us for a personalized quote" fills none, and frequently drops out of the answer entirely.',
    },
    {
      type: 'callout',
      tone: 'amber',
      title: 'The "contact us for pricing" penalty',
      text: 'Hiding prices was a lead-capture tactic in the search era: make them call, then sell. In the agent era it works as a filter that silently removes you from comparisons, because agents cannot compare what they cannot read. Publish at least a starting price or an honest range.',
    },
    {
      type: 'p',
      text: 'Structured data is how you make quotability unambiguous. JSON-LD markup using [schema.org](https://schema.org/Service) types like LocalBusiness, Service, and Offer hands the agent exact fields instead of forcing it to infer from prose. It is the same markup Google has used for rich results for a decade, which is why the AI-visibility playbook overlaps so heavily with classic technical SEO.',
    },
    { type: 'h2', text: 'The wall: what happens when an agent tries to book' },
    {
      type: 'p',
      text: 'Here is the part the ranking articles skip. The user says "book the second one for Friday at 2pm." The agent navigates to the business’s site and meets a typical booking flow: a JavaScript calendar that loads availability over background requests, holds the slot in session state, and confirms through a form guarded by bot detection. Some agents can drive parts of that. None drive it reliably, and the careful ones will not guess at somebody’s calendar or push payment forms on spec.',
    },
    {
      type: 'p',
      text: 'So the agent falls back to the safest move it has: "Here is their number, they are open until 6." Every discovery signal you invested in ends in a handoff, and handoffs leak. Some users call. Many do not. If the business one result down can complete the booking inside the conversation, the leaked demand lands there.',
    },
    {
      type: 'p',
      text: 'This is the distinction that will define local AI marketing for the next few years:',
    },
    {
      type: 'ul',
      items: [
        'Quotable: the agent can accurately state what you sell, for how much, and under what terms.',
        'Bookable: the agent can finish the job. Pick a real open slot, pay, and hand the user a confirmation.',
      ],
    },
    {
      type: 'p',
      text: 'The money is already moving. Salesforce reported AI influenced $262 billion of 2025 holiday sales, and nearly all of that influence still ended with a human completing checkout by hand. The rails in the next section exist to close that last step.',
    },
    { type: 'h2', text: 'The booking rails that exist in 2026' },
    {
      type: 'p',
      text: 'A workable stack has assembled fast over the past year. It has four layers, and each one is useful without the layers above it.',
    },
    {
      type: 'table',
      headers: ['Layer', 'What it gives an agent', 'Typical artifact'],
      rows: [
        [
          'Structured listings',
          'Unambiguous facts: services, prices, durations, policies',
          'JSON-LD (Service/Offer), llms.txt, agent.json',
        ],
        [
          'Live availability',
          'Real open slots instead of guesses',
          'Calendar-backed scheduling (e.g. Calendly)',
        ],
        [
          'Callable actions',
          'A sanctioned way to ask "book this" programmatically',
          'An MCP server exposing offers and booking tools',
        ],
        [
          'Agentic checkout',
          'Payment completed inside the assistant',
          'OpenAI’s ACP, Google’s UCP',
        ],
      ],
    },
    {
      type: 'p',
      text: '[MCP](https://modelcontextprotocol.io) (Model Context Protocol) is the piece most owners have not met yet: an open standard that lets an assistant call a business’s tools directly (list offers, check a slot, start a booking) instead of scraping its website. Agentic checkout protocols sit on top: OpenAI’s ACP powers Instant Checkout in ChatGPT, and Google’s UCP plays the equivalent role for Gemini surfaces. If the acronyms are blurring together, [UCP vs ACP vs MCP](/learn/ucp-vs-acp-vs-mcp) untangles them.',
    },
    {
      type: 'p',
      text: 'Two honest status notes. Agentic checkout for services is younger than for products; the early Instant Checkout merchants sold goods. And OpenAI revamped Instant Checkout in March 2026 toward discovery-first, which in practice means product feeds now earn visibility in ChatGPT even before a merchant is enrolled for in-chat checkout. Feeds first, checkout as it opens up; the [ACP enrollment guide](/learn/acp-enrollment-guide) covers the sequence.',
    },
    {
      type: 'callout',
      tone: 'ready',
      title: 'You do not need the whole stack on day one',
      text: 'Discovery feeds are readable by assistants today, before any checkout enrollment, and structured listings alone move you from invisible to quotable. Each layer pays for itself independently.',
    },
    { type: 'h2', text: 'Making a service business bookable, step by step' },
    {
      type: 'p',
      text: 'Concretely, for a cleaner, groomer, tutor, consultant, or studio, the sequence looks like this.',
    },
    {
      type: 'ol',
      items: [
        'Audit what agents can currently read. Run your site through a free [agent-legibility scan](/scan): can services, prices, and a booking path be extracted from your raw HTML? Most service sites score poorly here, for fixable reasons.',
        'Publish each service as a structured offer. Name, price, duration, what is included, in human-readable HTML and JSON-LD both. One page per service beats one mega-page, because agents cite and link specific pages.',
        'Add agent-facing artifacts to your own site: llms.txt, an agent.json manifest, corrected JSON-LD. These are static files; Nexez’s Agent-Ready Kit generates copy-paste versions, and its WordPress plugin injects them automatically.',
        'Wire scheduling to your real calendar. The availability an agent sees must be availability you actually have. Nexez does this with Calendly-backed offers and mints a single-use scheduling link at checkout, so a booked slot is confirmed rather than merely requested.',
        'Take payment on rails an agent can complete: hosted Stripe checkout with you as the merchant of record, plus refunds and order status, because the transaction has to survive after the conversation ends.',
        'Enroll in checkout protocols as they open to your category. ACP and UCP feeds are live for discovery today; in-chat checkout enrollment follows.',
      ],
    },
    {
      type: 'cta',
      title: 'See what AI agents can read on your site',
      text: 'The free Nexez scanner fetches your site the way an agent does and scores its agent-legibility: structured data, machine-readable services, booking path. No account needed, takes about thirty seconds.',
      href: '/scan',
      label: 'Run the free scan',
    },
    {
      type: 'p',
      text: 'If you sell products rather than services, the same logic applies with inventory in place of calendars; [selling on ChatGPT without Shopify](/learn/sell-on-chatgpt-without-shopify) walks that path.',
    },
    { type: 'h2', text: 'The discovery work that still matters' },
    {
      type: 'p',
      text: 'None of this replaces the fundamentals, because agents cannot book a business they never found. The fair version of the discovery checklist:',
    },
    {
      type: 'ul',
      items: [
        'Google Business Profile complete, correct, and categorized precisely. This is Gemini’s home turf.',
        'Foursquare, Yelp, and Bing Places consistent with your website. This is where ChatGPT’s local answers tend to draw from.',
        'Reviews with volume and recency, plus responses. Agents summarize review text, so specific praise ("rebalanced the whole door, showed up early") becomes your marketing copy.',
        'Server-rendered HTML with real text. Prices, hours, and service area should exist in the page source, not only after JavaScript runs.',
      ],
    },
    {
      type: 'p',
      text: 'One deflating note on the trendiest tactic, llms.txt. Google’s guidance says llms.txt is not required, and Ahrefs found no ranking correlation for llms.txt across the sites it studied. It costs ten minutes and some agent tooling does read it, so publish one, but treat it as a courtesy file rather than a growth lever. The full honest treatment is in [what llms.txt actually does](/learn/what-is-llms-txt).',
    },
    { type: 'h2', text: 'The window' },
    {
      type: 'p',
      text: 'Here is the strategic read. Today almost no local service business is bookable by an agent, so the few that are win complete-the-task queries by default. Not because they out-marketed anyone, but because they were the only option the agent could finish. That is arbitrage, and arbitrage closes: once booking platforms and site builders ship this by default, bookable stops being a differentiator and becomes the price of entry.',
    },
    {
      type: 'p',
      text: 'The discovery layer is crowded and slow to move; reviews take years to compound. The booking layer is nearly empty and takes an afternoon to enter. That asymmetry is the whole argument for starting now, and [how it works](/how-it-works) shows what the setup involves.',
    },
    {
      type: 'cta',
      title: 'Make your services agent-bookable',
      text: 'Nexez turns your existing website’s services into structured, schedulable, checkout-ready listings: JSON-LD, agent.json, a per-merchant MCP server, ACP and UCP feeds, real Calendly availability, and Stripe checkout with you as merchant of record. Free 7-day trial; discovery is free on every plan.',
      href: '/how-it-works',
      label: 'See how it works',
    },
  ],
  faqs: [
    {
      question: 'How do I get my business recommended by ChatGPT?',
      answer:
        'Cover the sources ChatGPT actually draws from: keep Foursquare, Yelp, and Bing Places accurate, accumulate recent reviews, and publish concrete services with prices in plain HTML plus JSON-LD markup. Then check what agents can extract from your site with a [free scan](/scan). Vague pages get skipped; quotable pages get cited.',
    },
    {
      question: 'Can AI agents actually book appointments with local businesses today?',
      answer:
        'Only when a machine-usable path exists: structured offers, live availability from a real calendar, and a checkout the agent can complete. Against a typical JavaScript booking widget, agents fail or decline and fall back to handing the user a phone number. Businesses that expose booking through structured listings and agentic checkout rails are still the exception, which is exactly why it is an advantage.',
    },
    {
      question: 'Do AI agents use Google Business Profile?',
      answer:
        'Gemini and Google’s AI surfaces draw on Google Business Profile directly, so keep it complete and precisely categorized. ChatGPT relies more on aggregators like Foursquare and on Bing’s index. The safe play is consistency: the same services, hours, and contact details everywhere, matching your website.',
    },
    {
      question: 'Does llms.txt help my business get recommended by AI?',
      answer:
        'There is no evidence it affects rankings or recommendations: Ahrefs found no ranking correlation, and Google says it is not required. Some agent tooling reads it and it takes minutes to publish, so it is a cheap hedge. Just do not mistake it for a strategy; structured listings and a completable booking path matter far more.',
    },
    {
      question: 'Do I need ACP or UCP as a small service business?',
      answer:
        'Not to be discovered. Feeds and structured listings are readable by assistants today without checkout enrollment, and on Nexez discovery is free on [every plan](/pricing). Checkout enrollment starts to matter as assistants complete more transactions in-chat; the [ACP enrollment guide](/learn/acp-enrollment-guide) explains when and how to enroll.',
    },
  ],
}
