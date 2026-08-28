import type { LearnArticle } from '../learn-content'

export const whatIsAgentJson: LearnArticle = {
  slug: 'what-is-agent-json',
  metaTitle: 'What Is agent.json? The Complete 2026 Guide',
  metaDescription:
    'agent.json is not one standard, it is a name several different specs share. Here is the honest map of what each one does and what to actually publish.',
  title: 'What is agent.json? The file name five different standards are fighting over',
  dek: 'Search for "agent.json" and you will find at least four unrelated specifications answering to a similar name. This guide untangles them, explains what a business actually needs to publish, and shows the shape a good one takes.',
  category: 'Guides',
  publishedAt: '2026-08-12',
  updatedAt: '2026-08-12',
  readMinutes: 10,
  blocks: [
    {
      type: 'p',
      text: 'There is no single agent.json standard. That is the honest answer, and most explainers skip it because it is a less satisfying place to start than a clean definition. In reality, agent.json (and its close cousins agents.json, ai-agent.json, and agent-card.json) is a name that at least four unrelated groups have independently reached for in 2026, each describing a different kind of file for a different purpose. If you have read one explainer and then a second that seems to contradict it, you did not misread either one. They are describing different things.',
    },
    {
      type: 'p',
      text: 'The common thread across all of them, and the reason the name keeps getting reused, is worth holding onto: a JSON file, usually at a predictable well-known location, that lets a machine understand what a website, API, or agent can do without a human reading prose first. That idea is sound and increasingly necessary. This guide maps the actual landscape as of August 2026, tells you which file solves which problem, and shows what a commerce-oriented agent.json (the kind a business actually needs) looks like in practice.',
    },
    { type: 'h2', text: 'The naming collision, mapped honestly' },
    {
      type: 'p',
      text: 'Here is what is actually out there, each with a different author, a different purpose, and a different level of adoption. None of these is a W3C or IETF ratified standard as of this writing.',
    },
    {
      type: 'table',
      headers: ['File', 'Origin', 'What it describes', 'Adoption'],
      rows: [
        ['agents.json', 'Wildcard AI, open proposal', 'API actions for a site, built on OpenAPI: endpoints, params, how they chain', 'Early-stage, version 0.1.x'],
        ['ai-agent.json', 'Aiia working group, March 2026', 'An AI agent\u2019s own identity and capabilities, for agent-to-agent discovery', 'New, has a registry and validator'],
        ['agent-card.json', 'Google\u2019s A2A protocol', 'An autonomous agent\u2019s identity card for other agents to discover and call', 'Growing alongside A2A adoption'],
        ['ai-catalog.json', 'Agentic Resource Discovery (ARD), June 2026', 'A catalog-of-catalogs pointing to a site\u2019s MCP server, A2A agent, and API', 'Backed by Google plus 10 companies at launch'],
        ['agent.json (commerce manifest)', 'No single author; used by agent-commerce platforms', 'A business\u2019s offers, prices, and buyable/bookable actions for buyer agents', 'Pattern-level convention, not a formal spec'],
      ],
    },
    {
      type: 'p',
      text: 'Two of these solve genuinely different problems that only look similar because they share three letters. agents.json and ai-catalog.json describe what a system can DO (actions, APIs, tool catalogs). ai-agent.json and agent-card.json describe what an autonomous agent IS (identity, so other agents know who they are talking to). The commerce manifest pattern in the last row is closer to the first group: it describes what a business sells and how to buy it, using agent.json as a plain, memorable filename rather than a claim to any particular spec.',
    },
    {
      type: 'callout',
      tone: 'amber',
      title: 'Why no explainer tells you this straight',
      text: 'Most agent.json articles are written by whoever proposed one of these specs, so naturally each explains its own version as though it were the only one. None is lying, exactly, but none mentions the other three either. If a guide defines agent.json with total confidence and no acknowledgment that other formats exist under the same name, that confidence is the tell.',
    },
    { type: 'h2', text: 'Which one should a business actually care about' },
    {
      type: 'p',
      text: 'If you are a business owner rather than someone building an autonomous agent, the identity-card formats (ai-agent.json, agent-card.json) mostly do not apply to you; those describe agents, and your business is not an agent. What applies is the commerce manifest pattern: a machine-readable file describing your business, your offers, and how an agent can act on them (check availability, get a quote, complete a purchase or booking). That is the "agent.json" this guide focuses on from here, and it is the one [agentic commerce](/learn/what-is-agentic-commerce) actually runs on.',
    },
    {
      type: 'p',
      text: 'It sits at the transactable end of the readiness stack, downstream of [JSON-LD](/learn/json-ld-for-ai-agents) and [llms.txt](/learn/what-is-llms-txt).',
    },
    {
      type: 'p',
      text: 'Where JSON-LD tells a crawler what your business IS in schema.org’s vocabulary, and llms.txt is a plain-text index for language models, agent.json goes further: it is API-shaped, meant to be fetched and acted on programmatically, listing not just facts but callable next steps with URLs and expected request bodies.',
    },
    {
      type: 'p',
      text: 'If [an MCP server](/learn/what-is-an-mcp-server) is the live, conversational version of "here is what you can do with my business," agent.json is its static cousin: fetchable with a single GET request, no protocol handshake required, ideal for agents doing a first pass over many candidates before committing to a deeper connection.',
    },
    { type: 'h2', text: 'What a good commerce agent.json actually contains' },
    {
      type: 'p',
      text: 'Strip away vendor-specific field names and the shape converges on the same handful of sections almost every implementation reaches for, because they map to what a buyer agent actually needs to decide and act:',
    },
    {
      type: 'ul',
      items: [
        'Identity: business name, URL, a plain-language description, and a link back to the manifest itself so an agent can always find the canonical source.',
        'Contact and channels: a preferred way to reach a human, explicitly ranked, so an agent never has to guess between an email address and a contact form.',
        'Offers: each product or service as a discrete entry with a stable key, name, description, price, currency, and current availability, never buried in prose.',
        'Actions: for each offer, the concrete next step. HTTP method, endpoint, content type, and the exact request body an agent should send, so a checkout or booking is executable, not just describable.',
        'Discovery links: pointers to the site\u2019s other agent artifacts (llms.txt, an OpenAPI spec, an MCP server) so agent.json functions as a hub rather than a dead end.',
        'A plain-text fallback: a flattened, human-and-machine-readable summary of the same facts, which matters because not every consuming system parses nested JSON equally well, and a plain-text version is cheap insurance.',
      ],
    },
    {
      type: 'p',
      text: 'Here is a trimmed but real shape, representative of what a business-facing agent.json contains once you strip it to essentials:',
    },
    {
      type: 'code',
      language: 'json',
      content: `{
  "schema_version": "agent-page.v1",
  "page": {
    "name": "Riverside Physio",
    "url": "https://riversidephysio.com",
    "agent_json_url": "https://riversidephysio.com/agent.json",
    "description": "Sports physiotherapy clinic in Austin, TX.",
    "currency": "usd",
    "contact": { "value": "book@riversidephysio.com", "channels": ["email", "phone"] },
    "llms_url": "https://riversidephysio.com/llms.txt",
    "openapi_url": "https://riversidephysio.com/openapi.json"
  },
  "offers": [
    {
      "key": "initial-assessment",
      "name": "Initial Physiotherapy Assessment",
      "price": "140.00",
      "currency": "usd",
      "availability": "available",
      "action": {
        "method": "POST",
        "endpoint": "https://riversidephysio.com/api/checkout",
        "content_type": "application/json",
        "body": { "offer": "initial-assessment" }
      }
    }
  ],
  "recommended_actions": [
    "Use an offer action for booking intent.",
    "Quote the source page URL when summarizing this offer for a buyer."
  ]
}`,
    },
    {
      type: 'p',
      text: 'Notice what this is not: it is not marketing copy, and it is not a restatement of your homepage. Every field exists because an agent needs it to make or execute a decision. That discipline is the whole point, and it is why hand-writing one well takes real thought about what a buyer agent actually asks.',
    },
    { type: 'h2', text: 'Should you build your own' },
    {
      type: 'p',
      text: 'You can, and for a single static offer list it is a reasonable afternoon project: pick a shape close to the example above, publish it at /agent.json, and keep it current by hand.',
    },
    {
      type: 'p',
      text: 'The honest complication is the same one that applies to structured data generally: a manifest that quotes a price your checkout no longer honors is worse than no manifest, because an agent will act on it confidently and your customer, or your support inbox, absorbs the mismatch.',
    },
    {
      type: 'p',
      text: 'The moment you have more than a handful of offers, or prices and availability that change, hand-maintenance becomes the actual risk, not the missing file.',
    },
    {
      type: 'p',
      text: 'The alternative is generating it from the same source of truth that runs your checkout and calendar, so the manifest can never say something your systems would not honor. That is the approach agent-commerce platforms take, Nexez included: agent.json (both a root manifest describing the platform and a per-business manifest at each published page) is generated automatically from live offer, pricing, and availability data, with negotiation and booking actions wired in only when the underlying plan and offer actually support them, never advertised speculatively.',
    },
    {
      type: 'cta',
      title: 'See what your site would need to publish',
      text: 'The free Nexez scanner checks whether your site has any agent-readable manifest today, alongside the rest of the readiness stack: crawler access, structured data, and callable actions. No signup, about a minute.',
      href: '/scan',
      label: 'Scan your site free',
    },
    { type: 'h2', text: 'What to watch next' },
    {
      type: 'p',
      text: 'The closest thing to convergence so far is Agentic Resource Discovery (ARD), the ai-catalog.json convention that Google and ten other companies shipped together in June 2026. It does not replace agent.json-style commerce manifests; it sits a level above them, as an index pointing to a site’s MCP server, A2A agent identity, and APIs in one place.',
    },
    {
      type: 'p',
      text: 'If a genuine standard consolidates the naming mess described in this guide, ARD-style multi-party backing is the most likely shape it takes, because a spec with one author rarely becomes the default.',
    },
    {
      type: 'p',
      text: 'Until then, the pragmatic move is the one that has been true of every emerging web convention: publish the artifact that solves your actual problem, keep it accurate and current, and treat the exact filename as far less important than whether the facts inside it are true.',
    },
    {
      type: 'cta',
      title: 'Get an accurate, always-current agent.json without maintaining it by hand',
      text: 'Nexez generates your agent.json, llms.txt, JSON-LD, OpenAPI spec, and per-merchant MCP server from the same live offer data that powers checkout and booking, so what an agent reads can never drift from what it gets. Start on Free with no card; paid plans include a 7-day trial.',
      href: '/how-it-works',
      label: 'See how it works',
    },
  ],
  faqs: [
    {
      question: 'Is agent.json an official web standard?',
      answer:
        'No, not as of August 2026. Several different groups use the name agent.json or a close variant (agents.json, ai-agent.json, agent-card.json) for different, unrelated purposes, and none has been ratified by a body like the W3C or IETF. The closest thing to a multi-party convergence is Agentic Resource Discovery (ARD), an index format backed by Google and ten other companies, launched June 2026, which sits above these files rather than replacing them.',
    },
    {
      question: 'What is the difference between agent.json and agents.json?',
      answer:
        'They are different proposals despite the near-identical name. agents.json (plural) is Wildcard AI\u2019s early-stage proposal built on OpenAPI, describing API actions a site exposes. agent.json (singular) has no single owner and is used more loosely, most commonly by agent-commerce platforms as a business-facing manifest of offers and buyable or bookable actions. Always check what a specific source means by the term rather than assuming.',
    },
    {
      question: 'Do I need agent.json if I already have JSON-LD?',
      answer:
        'They serve different purposes and work well together. JSON-LD, using the schema.org vocabulary, tells crawlers and answer engines what your business and offers ARE, in a format search engines already consume. Agent.json goes further for a narrower audience: it is API-shaped, listing concrete callable actions (endpoints, methods, request bodies) so a buyer agent can execute a purchase or booking, not just learn a fact. Most businesses benefit from both: JSON-LD for broad discoverability, agent.json for agents ready to transact.',
    },
    {
      question: 'How is agent.json different from an MCP server?',
      answer:
        'Agent.json is a static file fetched with one GET request; an MCP server is a live connection an assistant opens to call tools interactively, like checking real-time availability or completing a multi-step booking. Agent.json works well for a fast first pass across many candidate businesses; an MCP server suits deeper, stateful interaction once an agent has decided to engage. The two are complementary, and the [MCP server guide](/learn/what-is-an-mcp-server) covers when each fits.',
    },
    {
      question: 'Where should I put my agent.json file?',
      answer:
        'The convention that has emerged across commerce-oriented implementations is the site root, at yoursite.com/agent.json, mirroring how robots.txt and llms.txt work. Some frameworks additionally recommend a well-known path such as /.well-known/agent.json for machine-discovery conventions; publishing at the root covers the widest range of consuming agents today.',
    },
    {
      question: 'What happens if my agent.json has a wrong price?',
      answer:
        'An agent will act on it as though it were true, since that is the entire point of a machine-readable manifest, which makes a stale or wrong price worse than no manifest at all. The safest approach is generating agent.json programmatically from the same data that drives your checkout, rather than hand-maintaining a separate copy, so the two can never disagree.',
    },
  ],
}
