import type { LearnArticle } from '../learn-content'

export const whenAiAgentsCallYourBusiness: LearnArticle = {
  slug: 'when-ai-agents-call-your-business',
  metaTitle: 'When Google’s AI Calls Your Business',
  metaDescription:
    'Google’s Search agents now phone local businesses on a customer’s behalf. Your phone line became an agent interface, and nobody sent you the spec.',
  title: 'When Google’s AI calls your business',
  dek: 'Every other agent-readiness question is about data you publish in advance. This one is about what happens live, at 4:40 on a Friday, when something calls your front desk and asks whether you can do the job on Tuesday. For a service business that is now the interaction that decides it.',
  category: 'Agent readiness',
  publishedAt: '2026-09-03',
  updatedAt: '2026-09-03',
  readMinutes: 10,
  blocks: [
    {
      type: 'p',
      text: 'For a service business, the most consequential thing an AI agent does in 2026 is not crawl your website. It is call you. At I/O in May, Google said it was expanding agentic booking in Search to "a wide range of new tasks, including local experiences and services," and that for select categories users could ask Google to call businesses on their behalf. The categories named were home repair, beauty, and pet care, rolling out to everyone in the US over the summer.',
    },
    {
      type: 'p',
      text: 'Google’s own guidance to businesses is more specific than the announcement, and worth reading as a spec rather than a notice. Its automated systems call to confirm operating hours and service availability, to process customer requests such as appointment bookings and restaurant wait times, to verify pricing and availability, and to map phone trees. That last one deserves a second read. Your phone menu is being indexed.',
    },
    {
      type: 'p',
      text: 'This is a different kind of problem from everything else in this library. Structured data, feeds, crawler access: all of it is about information you publish ahead of time and can check on a Tuesday afternoon. A phone call is live, it happens once, and if it goes badly you will never know it happened. The data side of getting booked by an agent is covered in [how AI agents book service businesses](/learn/ai-agents-book-service-businesses). This is the other half.',
    },
    { type: 'h2', text: 'Why services get called and products do not' },
    {
      type: 'p',
      text: 'The difference is state. To recommend a product, an agent needs to know what exists, at what price, in stock or not. That is a catalog, it can be submitted in advance, and the entire feed apparatus exists to move it. To book a service, an agent needs to know whether you can do this particular job, when, and what it costs for this specific situation. That is not a catalog. It is state, and state cannot be submitted ahead of time because it changes hourly.',
    },
    {
      type: 'p',
      text: 'So the agent has three options: read something you published and hope it is current, query an endpoint you expose, or ask a human. Most service businesses expose no endpoint. Which leaves reading and asking, and asking is now automated.',
    },
    {
      type: 'table',
      headers: ['What the agent needs', 'For a product', 'For a service'],
      rows: [
        ['What exists', 'Merchant Center feed', 'Your website, in prose'],
        ['What it costs', 'A price field', '"It depends", which is unusable'],
        ['Whether it is available', 'An inventory field', 'A calendar nobody can see'],
        ['How to commit to it', 'A checkout protocol', 'A phone call'],
      ],
    },
    {
      type: 'p',
      text: 'Read the right-hand column as a list of things that are currently answered by a person. Every one of them is a place an agent either gives up or dials.',
    },
    { type: 'h2', text: 'Your phone tree is now crawled infrastructure' },
    {
      type: 'p',
      text: 'Google lists phone tree mapping as one of the reasons its automated systems call. That means the menu a caller hears is being traversed and recorded the way a crawler traverses a site, and the same logic applies: depth costs you. A menu that puts booking behind four options and a submenu is doing to an agent exactly what a checkout with three surprise fields does to a shopper.',
    },
    {
      type: 'p',
      text: 'The practical version is unglamorous. Put booking and hours in the first level of the menu. Do not require a human to route a booking request that a menu option could route. And if your line answers with sixty seconds of recorded marketing before the first option, understand that you are now spending that minute on machines as well as people.',
    },
    { type: 'h2', text: 'The failure modes you will never see' },
    {
      type: 'p',
      text: 'A failed agent call produces no bounce, no 404, no log line on your server. It produces nothing. Which is why this section is a list rather than a metric:',
    },
    {
      type: 'ul',
      items: [
        'Nobody answers, and there is no path that ends in a booking. The agent moves to the next business and the customer never learns you existed.',
        'Voicemail only. A caller can leave a message and wait. An agent acting on someone’s behalf has nothing to wait for, because the person asked a question and expects an answer in the conversation.',
        '"We will call you back with a price." This is the most expensive one, because it feels like good service and it fails completely. The callback lands on a customer who has already been given three alternatives.',
        'Whoever answers cannot quote. If the only person who can price a job is out on a job, then for several hours a day your business is unquotable, and an agent comparing three providers will read that as no answer rather than as a scheduling detail.',
        'Your published hours are aspirational. Google says it calls to confirm hours and service availability, which means the gap between your posted hours and your real ones is now something that gets checked rather than assumed.',
      ],
    },
    {
      type: 'callout',
      tone: 'amber',
      title: 'The quiet part',
      text: 'None of these are new problems. A business that does not answer its phone was losing customers in 2015. What changed is the volume and the indifference: an agent will try you, get nothing, and move on within seconds, without the small human hesitation that used to make someone try again later or leave a message. The cost of a bad phone experience used to be some of the callers. It is now all of the agents, every time, until you fix it.',
    },
    {
      type: 'cta',
      title: 'Start with what an agent can see',
      text: 'The free Nexez scanner fetches your site the way an agent does and scores what comes back: crawler access, server-rendered content, structured data, and machine-readable offers. About a minute, no signup.',
      href: '/scan',
      label: 'Scan your site free',
    },
    { type: 'h2', text: 'What answering well actually means' },
    {
      type: 'p',
      text: 'An agent on the phone is doing one of four jobs Google names: confirming your hours, booking something, checking a price, or learning your menu. Each wants a definite answer, and "it depends" is the one response that cannot be relayed back to the person waiting.',
    },
    {
      type: 'ol',
      items: [
        'Give a number or a range, always. "Between $180 and $260 depending on access" is a usable answer. "I would have to see it" ends the call with nothing to report. If you genuinely cannot price without a visit, price the visit.',
        'Give a time, not a promise to find one. A specific slot beats "sometime next week", which an agent cannot book against.',
        'Confirm out loud, in a sentence that contains the service, the date, the time, and the price. Whatever is on the call is what gets relayed, and anything left implicit is lost.',
        'Say what you do not do. Agents are comparing, and a fast clean no is worth more to you than a vague maybe that wastes a slot and produces a bad review.',
        'Make sure the person most likely to pick up at 4:40 on a Friday can do all of the above. This is a staffing decision wearing a technology costume.',
      ],
    },
    { type: 'h2', text: 'You can opt out, and here is what it costs' },
    {
      type: 'p',
      text: 'Google documents four ways off the list: tell the caller to remove your business, turn the features off under Advanced settings in your Business Profile, reply STOP to the texts, or leave a voicemail on the phone tree mapping line. It also notes that after opting out you may still occasionally get manual calls.',
    },
    {
      type: 'p',
      text: 'Whether that is a good trade depends entirely on whether the calls are reaching a business that can convert them. If your line is answered by someone who can quote and book, these calls are pre-qualified demand arriving with the buying decision already most of the way made, and Google says as much when it notes that responding can encourage customers to visit. If your line goes to voicemail, you are opting out of a channel that was already failing, and the honest fix is the phone, not the opt-out.',
    },
    { type: 'h2', text: 'The way out of being phoned at all' },
    {
      type: 'p',
      text: 'A call is what happens when there is no better interface. The better interface is an endpoint that answers the same four questions in milliseconds, and the paths to one are narrower than the marketing suggests.',
    },
    {
      type: 'ul',
      items: [
        'Google’s end-to-end reservations integration is real and is not available to you directly. It requires a partner holding a direct contractual relationship with every merchant in its feed, merchant, services and availability feeds, and a booking server implementing CreateBooking, UpdateBooking and BatchAvailabilityLookup. The documentation covers restaurant reservations. Worth knowing so you do not spend a quarter chasing it.',
        'A booking link on your Business Profile is the cheap version and worth doing today. Pick a provider through Reserve with Google or add your own link; it appears within about a week. It gets a human to a booking page. It does not let an agent see whether Tuesday at two is free.',
        'UCP is not your road yet. It starts from Merchant Center shopping feeds and is expanding into Lodging and Food, which is to say it is still catalog-shaped. The [UCP merchant guide](/learn/what-is-google-ucp) covers where it does apply.',
        'An MCP server is the one route that hands an agent live state. Apps in ChatGPT are built on MCP, and OpenAI’s own launch list was dominated by booking-shaped businesses. Claude’s Connectors Directory is the equivalent door and is gated: a Team or Enterprise organization, OAuth 2.0, annotated tools, a privacy policy, documentation, and human review. [What is an MCP server](/learn/what-is-an-mcp-server) covers the concept.',
      ],
    },
    {
      type: 'callout',
      tone: 'ready',
      title: 'The order that actually works',
      text: 'Fix the phone first, because it is free and it is failing today. Publish your constraints in plain text second: what you do, where you go, how much notice you need, what you charge, what you refuse. Structured data third, using the templates in the [JSON-LD guide](/learn/json-ld-for-ai-agents). An endpoint last, and only if live availability is genuinely what makes you worth choosing. Reversing that order is the common expensive mistake.',
    },
    {
      type: 'p',
      text: 'There is a version of this article that reads as a warning, and it is not the right reading. A machine that phones three plumbers, gets one clear answer and two voicemails, and books the clear answer is not a threat to a business that answers its phone. It is the best lead generation a small service business has ever been offered, and it costs nothing to qualify for. It just happens to reward operational competence rather than marketing spend, which is a genuinely unusual thing for a distribution channel to do.',
    },
    {
      type: 'cta',
      title: 'Give agents something better to call',
      text: 'Nexez publishes your business as agent-legible, agent-transactable listings from a single source: JSON-LD, llms.txt, agent.json, OpenAPI, a per-merchant MCP server, and ACP plus UCP feeds, with real Stripe checkout and Calendly-backed scheduling. Live availability an agent can query, instead of a number it has to dial. Start on Free with no card; paid plans include a 7-day trial.',
      href: '/how-it-works',
      label: 'See how it works',
    },
  ],
  faqs: [
    {
      question: 'Is Google’s AI really calling businesses?',
      answer:
        'Yes. At I/O in May 2026 Google said users could ask Google to call businesses on their behalf in select categories, naming home repair, beauty and pet care, with a US rollout over the summer. Separately, Google’s guidance to businesses documents that its automated systems call to confirm hours and service availability, process requests such as appointment bookings, verify pricing, and map phone trees.',
    },
    {
      question: 'How do I stop AI agents from calling my business?',
      answer:
        'Google documents four routes: tell the caller to remove your business from the list, disable the relevant features under Advanced settings in your Business Profile, reply STOP to the text messages, or leave a voicemail on the phone tree mapping line. Note that Google says you may still occasionally receive manual verification calls afterwards, and consider whether the calls are demand you actually want to decline.',
    },
    {
      question: 'Why do agents phone service businesses but not shops?',
      answer:
        'Because a product is a catalog and a service is state. An agent recommending a product needs to know what exists at what price, which can be submitted in a feed ahead of time. An agent booking a service needs to know whether you can do this job, when, and what it costs in this specific case, which changes hourly and lives in nobody’s feed. When there is no endpoint to query, the remaining option is to ask a person.',
    },
    {
      question: 'What should whoever answers the phone actually say?',
      answer:
        'Give a price or a range rather than deferring to a site visit, offer a specific time rather than a promise to find one, and confirm out loud in a single sentence containing the service, date, time and price, because whatever is said on the call is what gets relayed back. Say a clear no to work you do not do. An agent cannot relay "it depends" to the person waiting for an answer.',
    },
    {
      question: 'Does structured data still matter if the agent is going to call anyway?',
      answer:
        'Yes, and it reduces how often the call happens. The call is what an agent does when the published information does not answer the question, so better data means fewer calls and better-qualified ones. It also decides whether you are among the businesses called at all, since the agent has to shortlist somebody before it dials, and that shortlist comes from what it could read.',
    },
    {
      question: 'Can I just integrate with Google so agents book me directly?',
      answer:
        'Not directly. Google’s end-to-end reservations integration requires a partner with a direct contractual relationship with every merchant in its feed, plus merchant, services and availability feeds and a booking server implementing CreateBooking, UpdateBooking and BatchAvailabilityLookup, and the documentation covers restaurant reservations. A booking link on your Business Profile is the accessible version, and it takes a human to a booking page rather than exposing availability to an agent.',
    },
    {
      question: 'Should a service business build an MCP server?',
      answer:
        'Only if live availability, pricing or booking is genuinely what makes you worth choosing rather than a detail. It is the one route that hands an agent real state instead of text, and apps in ChatGPT are built on MCP, but the directory routes are a real project: Claude’s requires a Team or Enterprise organization, OAuth 2.0, annotated tools, a privacy policy, documentation and human review. Fix the phone and the published facts first.',
    },
  ],
}
