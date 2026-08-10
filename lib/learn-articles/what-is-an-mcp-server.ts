import type { LearnArticle } from '../learn-content'

export const whatIsAnMcpServer: LearnArticle = {
  slug: 'what-is-an-mcp-server',
  metaTitle: 'What Is an MCP Server? A Business Owner\u2019s Guide',
  metaDescription:
    'MCP servers explained in plain English: what the Model Context Protocol is, who supports it, and how one makes your business bookable by AI agents.',
  title: 'What is an MCP server? A plain-English guide for business owners',
  dek: 'An MCP server is how you give AI assistants buttons to press instead of pages to read: check availability, quote a price, book the slot. Here is what the Model Context Protocol actually is, who supports it, what a merchant server exposes, and how to get one without an engineering team.',
  category: 'Guides',
  publishedAt: '2026-08-10',
  updatedAt: '2026-08-10',
  readMinutes: 9,
  blocks: [
    {
      type: 'p',
      text: 'An MCP server is a small service that exposes your business\u2019s capabilities as tools an AI assistant can call. Instead of an agent reading your website and telling its user "this clinic offers physio, call to confirm availability," an agent connected to your MCP server can check Tuesday\u2019s open slots, quote the current price, and complete the booking. MCP stands for Model Context Protocol, the open standard that defines how that connection works, and the server is your side of it.',
    },
    {
      type: 'p',
      text: 'Business owners keep running into the term because MCP quietly became the default way AI products talk to the outside world. If you have wondered whether it is another passing acronym or something worth an afternoon of attention, the short answer: it is infrastructure, it is already broadly adopted, and for a business that takes bookings or sells anything, it is the difference between being readable by agents and being usable by them.',
    },
    {
      type: 'p',
      text: 'This guide explains the protocol in plain English, who actually supports it, what a merchant MCP server exposes, the security guardrails that matter, and the realistic paths to having one. For where MCP sits next to the commerce-specific protocols, the [UCP vs ACP vs MCP comparison](/learn/ucp-vs-acp-vs-mcp) maps the whole landscape.',
    },
    { type: 'h2', text: 'MCP in plain English' },
    {
      type: 'p',
      text: 'The Model Context Protocol was open-sourced by Anthropic in November 2024 to solve an integration mess. Before it, every AI product needed a custom connector for every service it wanted to use: one for the calendar, one for the database, one for the payment system, multiplied across every vendor. MCP standardizes that plug. The common analogy is USB-C for AI: one connector shape, so any compliant assistant can use any compliant service without bespoke wiring.',
    },
    {
      type: 'p',
      text: 'The moving parts are simple. A client is the AI application (Claude, ChatGPT, a custom agent). A server is the thing offering capabilities. Servers offer tools, which are actions the AI can invoke, and resources, which are data it can read. When an assistant connects to a server, the first thing it does is ask what tools exist, and the server answers with a machine-readable list: each tool\u2019s name, what it does, and what inputs it takes. From then on, the assistant can call those tools mid-conversation the way a person would tap buttons in an app.',
    },
    {
      type: 'p',
      text: 'For a service business, that tool list might look like this:',
    },
    {
      type: 'code',
      language: 'json',
      content: `{
  "tools": [
    {
      "name": "list_services",
      "description": "Current services with prices and durations"
    },
    {
      "name": "check_availability",
      "description": "Live open slots for a service on a given date"
    },
    {
      "name": "create_booking",
      "description": "Book a slot; returns confirmation and a payment link"
    }
  ]
}`,
    },
    {
      type: 'p',
      text: 'That is the whole trick. Nothing about MCP is conceptually exotic; it is a standard way to publish "here is what you can do with my business" so that software, not just people, can act on it.',
    },
    { type: 'h2', text: 'Who actually supports it' },
    {
      type: 'p',
      text: 'Adoption is the reason MCP matters and the thing that separates it from most AI-era acronyms. Anthropic built it natively into Claude across desktop, web, and its developer products. OpenAI adopted the standard in March 2025 across its Agents SDK and products, an unusual case of the two biggest labs converging on one spec. Google committed Gemini support the same spring, and the ecosystem around them (developer tools, agent frameworks, and thousands of published servers for everything from GitHub to Stripe) treats MCP as the default integration layer. When one standard is spoken by the major assistants, a single server on your side reaches all of them.',
    },
    { type: 'h2', text: 'Why a business would want its own server' },
    {
      type: 'p',
      text: 'Everything else in the agent-readiness stack makes your business easier to read: structured data, feeds, clean HTML. An MCP server is the layer that makes it possible to act. The distinction shows up at every step of a delegated purchase:',
    },
    {
      type: 'table',
      headers: ['Step', 'Without an MCP server', 'With an MCP server'],
      rows: [
        [
          'Discovery',
          'Agent reads your pages and summarizes them',
          'Same, plus a machine-readable list of what it can actually do',
        ],
        [
          'Availability',
          '"The site says to call for availability"',
          'Agent calls check_availability and gets live slots',
        ],
        [
          'Pricing',
          'Quoted from HTML that may be stale',
          'Agent calls a quote tool and gets the current price',
        ],
        [
          'Booking or purchase',
          'Agent hands the user a link and wishes them luck',
          'Agent completes the booking and returns a confirmation',
        ],
        [
          'Outcome',
          'A referral that may convert',
          'A transaction',
        ],
      ],
    },
    {
      type: 'p',
      text: 'The economics follow from the last row. In [agentic commerce](/learn/what-is-agentic-commerce), assistants preferentially route to merchants where the journey completes without friction, because a failed handoff reflects badly on the assistant. Callable beats readable, and the gap widens as more purchasing gets delegated. For appointment-driven businesses in particular, this is the mechanism behind [AI agents booking service businesses](/learn/ai-agents-book-service-businesses): the booking happens because there was a tool to call.',
    },
    { type: 'h2', text: 'What a good merchant server exposes' },
    {
      type: 'p',
      text: 'Resist the urge to expose everything. A tight, reliable tool set beats a sprawling one, because agents choose tools by their descriptions and trust servers that behave predictably. The core set for most businesses:',
    },
    {
      type: 'ul',
      items: [
        'Catalog tools: list services or products with live prices, durations, and options, so the agent never quotes from stale copy.',
        'Availability tools: real-time open slots or stock levels, scoped to what is actually bookable or buyable.',
        'Transaction tools: create a booking or order, returning an explicit confirmation and, where payment is due, a secure payment step rather than raw card handling.',
        'Policy resources: cancellation terms, service area, and FAQs as readable resources, so the agent answers policy questions from your canonical text instead of guessing.',
      ],
    },
    {
      type: 'callout',
      tone: 'ready',
      title: 'Write tool descriptions like they are ad copy for robots',
      text: 'Agents pick tools by reading their names and descriptions, the same way people pick search results. "check_availability: live open slots for a service on a given date, returns times in the customer\u2019s timezone" gets called correctly; a vague "getData" gets ignored or misused. Precision in the tool list is free conversion optimization.',
    },
    { type: 'h2', text: 'Security and guardrails' },
    {
      type: 'p',
      text: 'Giving software the ability to act on your business deserves the same care as hiring a new front-desk employee. The guardrails are well understood: authenticate callers rather than running an open server, scope tools to the minimum needed (an agent that books appointments needs no refund tool), require explicit confirmation semantics for anything that moves money, log every call so you can audit what agents did, and rate-limit so a misbehaving client cannot flood your calendar. Treat any text an agent passes in as untrusted input, exactly as you would a web form.',
    },
    {
      type: 'callout',
      tone: 'amber',
      title: 'The mistake to avoid',
      text: 'Do not wire an AI-facing server straight into internal systems with broad permissions. The widely-reported MCP security incidents trace to overprivileged servers and unvetted third-party connectors, not to the protocol itself. A merchant server should be a narrow, audited surface over your booking and catalog systems, nothing more.',
    },
    { type: 'h2', text: 'Build one or get one' },
    {
      type: 'p',
      text: 'Building is genuinely accessible for a developer: official SDKs exist in the major languages, and a minimal read-only server (catalog plus availability) is a small project. The real cost is what comes after: hosting, authentication, keeping tools synced with your actual prices and calendar, and maintaining it as the spec and clients evolve. That maintenance tail is why most small businesses should not hand-roll one, the same way most do not hand-roll their payment stack.',
    },
    {
      type: 'p',
      text: 'The alternative is a platform that runs the server for you. Nexez publishes a per-merchant MCP server as part of its standard stack: your services, live pricing, and availability exposed as tools, with real Stripe checkout and Calendly-backed scheduling behind the transaction tools, alongside the readable layer (JSON-LD, agent.json, llms.txt, OpenAPI) and the shopping-surface feeds. One setup, and the same source of truth feeds everything, so the price an agent is quoted is the price on your page.',
    },
    {
      type: 'cta',
      title: 'See whether agents can act on your business today',
      text: 'The free Nexez scanner checks your site the way an agent does: what it can read, what it can verify, and whether there is anything it can actually call. Results in about a minute, no signup.',
      href: '/scan',
      label: 'Scan your site free',
    },
    {
      type: 'p',
      text: 'The pattern to remember: MCP is not a marketing channel, it is a socket. The businesses wiring into it now are not betting on an acronym; they are making sure that when an assistant is asked "book me the appointment," their calendar is one it can reach.',
    },
    {
      type: 'cta',
      title: 'Get a merchant MCP server without building one',
      text: 'Nexez turns your existing website into agent-legible, agent-transactable listings, including a hosted per-merchant MCP server with booking and checkout tools. Start on Free with no card; paid plans include a 7-day trial.',
      href: '/how-it-works',
      label: 'See how it works',
    },
  ],
  faqs: [
    {
      question: 'What does MCP stand for and who created it?',
      answer:
        'MCP is the Model Context Protocol, an open standard created and open-sourced by Anthropic in November 2024. It defines how AI applications connect to external tools and data. Adoption spread across the industry in 2025, including OpenAI and Google, which is why one MCP server can serve users of many different assistants.',
    },
    {
      question: 'How is an MCP server different from a normal API?',
      answer:
        'An ordinary API assumes a developer will read documentation and write integration code for it specifically. An MCP server describes itself in a standard format that AI clients discover and use at runtime with no custom integration: the assistant asks what tools exist, reads their descriptions, and calls them. Under the hood an MCP server often wraps your existing APIs; the value is the standardized, self-describing layer on top.',
    },
    {
      question: 'How does MCP relate to ACP and UCP?',
      answer:
        'They occupy different layers. ACP (from Stripe and OpenAI) and UCP (from Google) are commerce-specific protocols for transacting on those platforms\u2019 shopping surfaces, powered by product feeds. MCP is a general-purpose tool protocol any agent can use for live actions like availability checks and bookings. A well-prepared merchant typically wants both: feeds for the big shopping surfaces, MCP for everything that acts. The [UCP vs ACP vs MCP guide](/learn/ucp-vs-acp-vs-mcp) breaks down exactly which does what.',
    },
    {
      question: 'Do I need to know how to code to have an MCP server?',
      answer:
        'Not anymore. Building one from scratch is a developer task, but hosted options exist where the platform generates and runs the server from your business data. Nexez, for example, includes a per-merchant MCP server with catalog, availability, and booking tools as part of its standard listing stack, with no code on your side.',
    },
    {
      question: 'Is it safe to let AI agents book and buy through my systems?',
      answer:
        'It is when the server is scoped properly: authenticated access, minimal tool permissions, explicit confirmation for anything involving payment, full logging, and rate limits. The publicized MCP security problems have come from overprivileged servers wired into internal systems, not from narrow merchant surfaces. Handled that way, an agent booking a slot is no riskier than a customer using your online booking form.',
    },
    {
      question: 'How do AI agents find my MCP server in the first place?',
      answer:
        'Discovery works through the readable layer: an agent.json file and structured data on your site advertise that the server exists and where to connect, and agent directories and registries index published servers. That is why the callable layer and the legible layer ship together; a perfect server no agent can find does nothing. A [free scan](/scan) shows whether your discovery artifacts are in place.',
    },
  ],
}
