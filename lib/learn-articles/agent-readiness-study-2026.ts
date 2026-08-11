import type { LearnArticle } from '../learn-content'

export const agentReadinessStudy2026: LearnArticle = {
  slug: 'agent-readiness-study-2026',
  metaTitle: 'We Scanned 652 SMB Sites for AI Agents',
  metaDescription:
    'Original data from 652 US small-business sites in five industries: 31% are invisible to AI agents, none expose a callable agent surface. Full methodology.',
  title: 'We scanned 652 small-business websites. 31% are invisible to AI agents.',
  dek: 'Original data from a neutral, reproducible sample of real SMB websites across restaurants, health, home trades, personal care, and independent retail. Nearly a third offer AI agents nothing machine-readable at all, and not a single site in the sample exposes a surface an agent could act on. Here is the data, industry by industry, with the full methodology so you can check our work.',
  category: 'Agent readiness',
  publishedAt: '2026-08-10',
  updatedAt: '2026-08-10',
  readMinutes: 11,
  blocks: [
    {
      type: 'p',
      text: 'AI assistants now recommend, book, and buy on behalf of their users, and the sales they influence are measured in the hundreds of billions of dollars. So we asked a question with a measurable answer: if an AI agent visits an ordinary small-business website today, what can it actually read? We scanned 652 real SMB websites across five industries with the same deterministic scanner that powers our free [/scan](/scan) tool. The headline: 30.7% are invisible to agents, meaning they offer no machine-readable facts and no agent artifact of any kind. And on the question of whether an agent could act rather than just read, the number is not low, it is zero: not one site in the sample exposes a callable agent surface.',
    },
    {
      type: 'p',
      text: 'This article reports what we found, industry by industry, and then shows the full methodology: where the sample came from, how sites were selected, what the scanner checks, and what this study cannot tell you. Every number below is reproducible from the stored per-site results.',
    },
    { type: 'h2', text: 'The headline numbers' },
    {
      type: 'ul',
      items: [
        '30.7% of sites are invisible to agents: unreachable at scan time, or no valid structured data and no agent artifact of any kind (defined precisely below).',
        '38.8% have no valid JSON-LD structured data, the single highest-leverage artifact an agent consumes.',
        '100% expose zero callable agent artifacts. Across all 652 sites we found no agent.json, no MCP server card, and no OpenAPI spec. Not one.',
        '4.1% publish machine-readable pricing, even though 22.7% show a price somewhere a human can see it.',
        '8.9% returned no successful response to our honestly identified scanner (hard 403/503 blocks or outages), and a site that refuses an identified bot refuses real agent traffic too.',
        '5.1% block at least one major AI crawler in robots.txt, and 33.0% serve an llms.txt file, a number with an interesting explanation covered below.',
      ],
    },
    {
      type: 'p',
      text: 'The mean readiness score across the sample was 49.1 out of 100 (median 51). For calibration: a site scores in that range when it is reachable over HTTPS with normal semantic HTML and perhaps builder-generated structured data, but nothing typed about its offers and nothing callable. Human-readable, machine-opaque.',
    },
    { type: 'h2', text: 'What "invisible to agents" means, precisely' },
    {
      type: 'p',
      text: 'Composites are where studies cheat, so here is ours in full. A site counts as invisible to agents when either (a) its homepage was not reachable with a successful response at scan time, or (b) it has no valid, parseable JSON-LD structured data AND none of the six agent artifacts the scanner probes for: agent.json, a well-known agent.json, an A2A agent card, an MCP server card, an OpenAPI spec, or an llms.txt file. In plain terms: the site gives an agent no typed facts and no machine-readable surface at all. An agent visiting it can only scrape prose, which is exactly the failure mode that makes assistants hallucinate prices and hours or skip a business entirely.',
    },
    {
      type: 'p',
      text: 'The definition is deliberately generous, and the generosity is measurable. We count llms.txt as an artifact in a site\u2019s favor even though it has [no documented consumers](/learn/what-is-llms-txt), and 8.6% of sites qualify as visible only because of it. Remove llms.txt from the definition and the invisible share rises from 30.7% to 38.8%. We report the generous number as the headline and the strict one here, so nobody has to take our framing on faith.',
    },
    { type: 'h2', text: 'The per-industry breakdown' },
    {
      type: 'table',
      headers: ['Vertical', 'Sites', 'Mean score', 'No valid JSON-LD', 'Structured pricing', 'Invisible to agents'],
      rows: [
        ['Restaurants and cafes', '156', '48', '40%', '3%', '33%'],
        ['Health (clinics, dentists, doctors)', '145', '50', '32%', '5%', '28%'],
        ['Home trades (plumbers, electricians, HVAC)', '83', '52', '36%', '13%', '31%'],
        ['Personal care (salons, beauty, massage)', '129', '49', '38%', '2%', '33%'],
        ['Independent retail', '139', '48', '47%', '1%', '29%'],
      ],
    },
    {
      type: 'p',
      text: 'Three patterns stand out. Home trades lead on transactability signals by a wide margin (18% publish some structured offer schema and 13% structured pricing, against low single digits everywhere else), consistent with trade-focused site builders baking LocalBusiness and Service markup into their templates. Independent retail is the structured-data laggard, with 47% lacking any valid JSON-LD despite being the vertical closest to e-commerce. And health is the least invisible vertical (28%) while publishing machine-readable pricing almost never (5%), a familiar opacity that will serve those practices poorly when patients start asking assistants what an appointment costs. Restaurants and personal care tie for the most invisible at 33%.',
    },
    { type: 'h2', text: 'The transactability gap' },
    {
      type: 'p',
      text: 'Discovery is only half of agentic commerce; the other half is whether an agent can act. Here the numbers fall off a cliff. 58.4% of sites show a human-clickable action (book, order, request a quote), and 31.9% expose that action somewhere in structured data, but the artifacts an agent could actually call are simply absent: 0% serve an agent.json, 0% an MCP server card, 0% an OpenAPI spec, across the entire sample. The pattern is unmistakable: Main Street has built for human eyes and left machines to guess. In practice, when a customer asks an assistant to "book me a plumber Tuesday afternoon," the assistant cannot complete that request against any of these 652 sites; at best it summarizes a phone number. The businesses that close this gap first inherit that intent, and the mechanics are covered in [how AI agents book service businesses](/learn/ai-agents-book-service-businesses).',
    },
    {
      type: 'cta',
      title: 'Where does your site land in this data?',
      text: 'The scanner behind this study is free and public. It fetches your site the way an AI agent does and scores the same checks used here: crawlability, structured data, pricing, actions, and agent artifacts. No signup, about a minute.',
      href: '/scan',
      label: 'Scan your site free',
    },
    { type: 'h2', text: 'Robots.txt and the llms.txt surprise' },
    {
      type: 'p',
      text: 'Crawler blocking turned out to be modest and oddly targeted. 5.1% of sites block at least one major AI token in robots.txt, and the blocking skews heavily toward training crawlers: GPTBot (4.9%), ClaudeBot (4.6%), and Google-Extended (4.1%) are the usual targets, while the agents that fetch pages on behalf of a live user request (ChatGPT-User, Claude-User, Perplexity, the search bots) are blocked by fewer than 1% of sites. That pattern looks like anti-training defaults spreading through CMS plugins rather than deliberate anti-agent policy, and it means the blocking is mostly symbolic today: a site that blocks GPTBot still serves an agent acting for a real customer. The self-inflicted damage sits elsewhere, in the 8.9% of sites whose firewalls returned hard 403 or 503 responses to an honestly identified scanner.',
    },
    {
      type: 'p',
      text: 'The genuine surprise was llms.txt at 33.0%, an order of magnitude above what organic adoption would predict. The likely explanation is not a grassroots movement: major website builders began auto-generating llms.txt for every site they host in 2025, and 24.4% of our sample serves llms.txt alongside valid builder-style JSON-LD, the signature of platform defaults rather than deliberate choice. Read against our [earlier llms.txt analysis](/learn/what-is-llms-txt), the takeaway is unchanged: the file is cheap infrastructure that platforms now ship automatically, while the artifacts with documented consumers still depend on the business doing real work.',
    },
    { type: 'h2', text: 'Methodology' },
    {
      type: 'p',
      text: 'The sample frame is OpenStreetMap, queried through the public Overpass API on August 10-11, 2026. OSM is a public commons directory rather than a marketing-selected or self-submitted list, and the exact queries are code in our repository, so the frame is reproducible. We drew from 12 fixed, region-diverse mid-size US metros chosen in advance (Columbus OH, Raleigh NC, Tucson AZ, Spokane WA, Grand Rapids MI, Chattanooga TN, Boise ID, Worcester MA, Baton Rouge LA, Reno NV, Des Moines IA, Richmond VA) across the five verticals in the table above.',
    },
    {
      type: 'ul',
      items: [
        'Eligibility: the OSM listing must link the business\u2019s own website. Platform pages (Facebook, Instagram, link hubs, ordering platforms) were excluded, and chains were excluded via OSM brand tags, because the study measures independent businesses\u2019 own sites.',
        'Selection: within each metro-vertical cell, eligible domains were ordered by a cryptographic hash seeded on the cohort label and capped at 14 per cell. No manual picking anywhere in the pipeline; domains were deduplicated across the sample.',
        'Scanning: each site\u2019s homepage was fetched once with the same deterministic scanner (version 2) that powers the public /scan, which also probes robots.txt, llms.txt, agent.json, well-known agent endpoints, an MCP server card, and an OpenAPI spec. No LLM is involved in scoring; every check is a reproducible boolean.',
        'Politeness: before fetching any page, the harness checked each site\u2019s robots.txt for its own honestly named user agent and skipped sites that disallowed it (5 sites were excluded this way and are not in any denominator). Scans ran in small batches spread over hours.',
        'Accounting: 722 sites were sampled, 655 completed scans, and 62 failed after three attempts (unresolvable hostnames, timeouts); failures are excluded from all percentages. After deduplicating redirect targets by hashed domain, 652 unique sites form the reported dataset.',
      ],
    },
    {
      type: 'callout',
      tone: 'amber',
      title: 'What this study cannot tell you',
      text: 'Three honest limitations. First, the frame is businesses that are mapped in OSM with their own website tagged; businesses whose only web presence is a social page are not measured, so the invisibility percentages are, if anything, understatements for the broader SMB population. Second, OSM coverage skews toward better-mapped areas, and per-cell eligibility varied widely (from hundreds of candidates down to single digits for sparsely tagged trades), so this is not a probability sample of all US small businesses. Third, we scanned homepages; a site keeping agent artifacts only on deeper paths would be undercounted, matching how real agent discovery typically starts.',
    },
    { type: 'h2', text: 'Why this gap exists, and why it will not last' },
    {
      type: 'p',
      text: 'None of these numbers reflect laziness. Ten years of SEO advice taught businesses to write for Google\u2019s crawler, and Google could always compensate for messy markup with scale. Agents are different consumers: they need typed facts to trust (a price field, not a price mentioned in a paragraph) and callable surfaces to act (a bookable endpoint, not a phone number in a footer). The tooling to publish those artifacts has existed for years ([JSON-LD](/learn/json-ld-for-ai-agents) is a copy-paste job for most sites), but nothing forced adoption. Agent-mediated purchasing is that forcing function, and the current state of [agentic commerce](/learn/what-is-agentic-commerce) rewards early movers precisely because the baseline is this low.',
    },
    {
      type: 'p',
      text: 'The competitive read is simple. In a sample where roughly a third of local competitors are invisible and none are transactable, being merely legible puts a business in the upper tier of its market, and being transactable, where an agent can [check availability and book](/learn/ai-agents-book-service-businesses) or complete a checkout, is literally uncontested: zero sites in 652 offer it. That is a strange, temporary arbitrage, and it is measurable: we will rerun this exact methodology on a fresh cohort in six months and publish the trend.',
    },
    {
      type: 'cta',
      title: 'Move from invisible to transactable in one setup',
      text: 'Nexez turns an existing website into agent-legible, agent-transactable listings: clean HTML, JSON-LD, llms.txt, agent.json, an OpenAPI spec, a per-merchant MCP server, and ACP/UCP feeds, with Stripe checkout and Calendly-backed scheduling behind them. Start on Free with no card; paid plans include a 7-day trial.',
      href: '/how-it-works',
      label: 'See how it works',
    },
  ],
  faqs: [
    {
      question: 'How many websites did the study scan?',
      answer:
        '722 small-business websites were sampled from OpenStreetMap across 12 US metros and five industries. 655 scans completed (62 sites failed with unresolvable hostnames or timeouts, and 5 were skipped out of respect for their robots.txt), and deduplicating redirect targets left 652 unique sites in the reported dataset.',
    },
    {
      question: 'What does "invisible to AI agents" mean in this study?',
      answer:
        'A site counted as invisible when it was unreachable at scan time, or when it had no valid JSON-LD structured data and none of six agent artifacts (agent.json, well-known agent.json, A2A agent card, MCP server card, OpenAPI spec, llms.txt). Such a site offers an agent no machine-readable facts and no callable surface, only prose. By this generous definition 30.7% of sites were invisible; excluding llms.txt from the artifact list raises it to 38.8%.',
    },
    {
      question: 'Where did the sample of websites come from?',
      answer:
        'From OpenStreetMap via the public Overpass API: a neutral public commons directory rather than a marketing list. Twelve fixed mid-size US metros, five verticals, chains excluded via brand tags, platform-hosted pages excluded, and selection within each cell by cryptographic hash so no site was manually picked.',
    },
    {
      question: 'Was an AI or LLM used to score the websites?',
      answer:
        'No. Scoring used a deterministic scanner (the same one behind the free public /scan): every check is a reproducible boolean like "does valid JSON-LD parse" or "does robots.txt allow GPTBot." The same input site produces the same score every time, which is what makes the study repeatable.',
    },
    {
      question: 'Why do a third of small-business sites have llms.txt?',
      answer:
        'Almost certainly platform defaults rather than deliberate adoption: major website builders began auto-generating llms.txt for hosted sites in 2025, and most llms.txt files in the sample appear alongside builder-style JSON-LD. The file has no documented consumers among major AI providers, so its prevalence says more about platform behavior than about agent readiness.',
    },
    {
      question: 'Will the study be repeated?',
      answer:
        'Yes. The methodology, sample frame, and scanner version are documented and the per-site results are stored, so the identical study can run on a fresh cohort. A six-month follow-up is planned to measure how quickly small-business agent-readiness is actually moving.',
    },
  ],
}
