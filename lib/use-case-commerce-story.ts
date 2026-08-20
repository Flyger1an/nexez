export type UseCaseCommerceStory = {
  slug: string
  headline: string
  description: string
  buyerRequest: string
  problem: string
  merchantControls: Array<{ title: string; copy: string }>
  nexezHandles: Array<{ title: string; copy: string }>
  outcome: string
  faq: Array<{ title: string; copy: string }>
}

export const useCaseCommerceStories: UseCaseCommerceStory[] = [
  {
    slug: 'consultants',
    headline: 'Sell consulting without making every buyer start from zero.',
    description:
      'Turn sessions, audits, and ongoing advisory work into clear ways to buy while keeping scope, pricing, fit, and approval in your hands.',
    buyerRequest: 'I need a strategy consultant next week for a product launch. Show me a clear starting price and the fastest way to begin.',
    problem:
      'A buyer may know what outcome they want without knowing which of your services fits. Nexez helps turn that request into the right starting point without asking an AI assistant to invent your scope, price, or terms.',
    merchantControls: [
      { title: 'What you sell', copy: 'Choose the sessions, audits, packages, and ongoing services buyers can start with.' },
      { title: 'Price and scope', copy: 'Set the price, included work, options, and boundaries for each offer.' },
      { title: 'Who is a fit', copy: 'Ask for the details you need and set rules for requests that should proceed, need your review, or stop.' },
    ],
    nexezHandles: [
      { title: 'Collect the buyer details', copy: 'Nexez asks for the information you require before a buyer moves forward.' },
      { title: 'Work out the right purchase', copy: 'Buyer choices and add-ons resolve into the price and service they selected.' },
      { title: 'Keep the next step safe', copy: 'A request can move to checkout, booking, or your review based on the rules you set.' },
    ],
    outcome:
      'The buyer gets a clear next step. You get a better-qualified request or a purchase that still follows the way you chose to sell.',
    faq: [
      { title: 'What if my work is custom?', copy: 'Start with a clear first step such as a strategy session or paid audit. Bigger custom work can follow from there.' },
      { title: 'Do I have to publish every price?', copy: 'No. Use fixed prices where they make sense and route custom work to a quote or review when it does not.' },
      { title: 'Can I sell ongoing advisory work?', copy: 'Yes. You can define repeat services with the schedule and price you want buyers to agree to.' },
    ],
  },
  {
    slug: 'agencies',
    headline: 'Turn agency services into clear ways to start and buy.',
    description:
      'Give buyers concrete entry points into your agency while preserving your package rules, required project details, repeat work, and human review where it matters.',
    buyerRequest: 'We are launching in six weeks. Compare a launch sprint with ongoing support and tell me what I need to provide to get started.',
    problem:
      'Agency sites can explain everything the team is capable of while still leaving a buyer unsure how to begin. Nexez makes the starting points clear and keeps the buying process tied to the rules your agency actually uses.',
    merchantControls: [
      { title: 'Your starting offers', copy: 'Define audits, sprints, packages, retainers, and other ways a client can begin.' },
      { title: 'What each option includes', copy: 'Set scope, pricing, add-ons, timing expectations, and the information you need from the client.' },
      { title: 'When you need to step in', copy: 'Mark requests that can proceed normally and the ones that should come to your team first.' },
    ],
    nexezHandles: [
      { title: 'Match the request to an offer', copy: 'Nexez uses the buyer’s own answers to shape the purchase instead of guessing what they need.' },
      { title: 'Calculate selected options', copy: 'Packages, quantities, and add-ons can resolve into a clear price.' },
      { title: 'Support repeat work', copy: 'Ongoing services can use the repeat schedule and price you set instead of being treated like one-time purchases.' },
    ],
    outcome:
      'Smaller, well-defined work can move quickly. Bigger or unusual projects can arrive with the buyer context your team needs before continuing.',
    faq: [
      { title: 'We mostly sell custom projects. Does this still fit?', copy: 'Yes. Use Nexez for the parts that are repeatable and route unusual work to a proposal or review.' },
      { title: 'Can retainers repeat automatically?', copy: 'Yes. Repeat services can carry the schedule and amount the buyer approves.' },
      { title: 'Will AI decide what our agency agrees to?', copy: 'No. Your published offers, required buyer details, prices, and rules remain the source of truth.' },
    ],
  },
  {
    slug: 'coaches',
    headline: 'Make coaching easy to understand without making it impersonal.',
    description:
      'Let buyers choose the right session or program, answer the questions you need, and start one-time or repeat coaching on terms you control.',
    buyerRequest: 'Find me a career coach for product leaders. I want video sessions every other week and I need to stay under my monthly budget.',
    problem:
      'The relationship may be personal, but the buying questions are practical: specialty, format, schedule, price, and fit. Nexez handles those details before the first conversation so the human part can stay human.',
    merchantControls: [
      { title: 'Programs and sessions', copy: 'Choose the intro calls, packages, and ongoing coaching options you want to offer.' },
      { title: 'Format and pricing', copy: 'Set session length, meeting format, price, buyer choices, and repeat schedule where appropriate.' },
      { title: 'Fit questions', copy: 'Ask what you need to know before a buyer books and set rules for requests outside your normal fit.' },
    ],
    nexezHandles: [
      { title: 'Guide the buyer to the right option', copy: 'Nexez collects the buyer’s goals and choices before they move forward.' },
      { title: 'Keep repeat services clear', copy: 'The buyer sees and approves the schedule and amount for ongoing coaching.' },
      { title: 'Stop bad-fit purchases', copy: 'If a request falls outside the rules you set, Nexez can stop or send it for review instead of guessing.' },
    ],
    outcome:
      'The buyer reaches the first session knowing what they selected, what it costs, and what happens next. You keep control of who and how you serve.',
    faq: [
      { title: 'Does Nexez replace the relationship?', copy: 'No. It handles the buying details before the session. The coaching relationship remains between you and the client.' },
      { title: 'Can I offer packages and ongoing coaching?', copy: 'Yes. You can offer one-time options alongside repeat services with clearly defined terms.' },
      { title: 'What if I need to speak with someone first?', copy: 'Set that path. A buyer can be routed to your review or an intro step before any larger commitment.' },
    ],
  },
  {
    slug: 'local-services',
    headline: 'Help buyers book local services without giving up your rules.',
    description:
      'From cleaning and detailing to repairs and home services, Nexez can collect job details, work out the price from buyer choices, check your rules, and move the right requests forward.',
    buyerRequest: 'I need a move-out cleaning next Wednesday for a two-bedroom, two-bath apartment. There is one dog and I want inside-the-oven cleaning too.',
    problem:
      'Local service requests are full of details that change the job: size, timing, location, add-ons, condition, and repeat frequency. Nexez keeps those details clear so an AI assistant does not have to turn a vague request into a guessed booking.',
    merchantControls: [
      { title: 'Jobs you take', copy: 'Define your services, prices, options, service information, and the buyer details required for each one.' },
      { title: 'What changes the job', copy: 'Use buyer choices, quantities, and add-ons to shape the service and price.' },
      { title: 'Your acceptance rules', copy: 'Set which buyer answers can proceed, which need your review, and which requests you do not accept.' },
    ],
    nexezHandles: [
      { title: 'Ask the right questions', copy: 'Nexez gathers the details your business requires before checkout or handoff.' },
      { title: 'Calculate the selected service', copy: 'The options and quantities a buyer chooses can produce the price they are actually approving.' },
      { title: 'Support repeat service', copy: 'Eligible services can be sold on the repeat schedule and price you define.' },
    ],
    outcome:
      'Straightforward jobs can move toward booking or payment with the right details attached. Requests outside your rules stop or come to you first.',
    faq: [
      { title: 'What if every job is a little different?', copy: 'That is exactly why buyer questions matter. Collect the details that affect the service, then price or route the request based on your setup.' },
      { title: 'Can I sell recurring service?', copy: 'Yes. Repeat services can use a fixed schedule or a buyer-selected schedule that you define in advance.' },
      { title: 'Will Nexez accept work I do not want?', copy: 'Your rules control that. Requests can proceed, require your review, or stop before payment.' },
    ],
  },
  {
    slug: 'saas',
    headline: 'Make software services easier for AI-assisted buyers to evaluate.',
    description:
      'Present plans, onboarding, implementation, and support as clear buying choices while keeping custom enterprise work on the sales path you choose.',
    buyerRequest: 'We are a 20-person team. Compare the starter plan with implementation help and tell me what the first purchase would include.',
    problem:
      'AI-assisted software buying works best when pricing, limits, onboarding, and support are explicit. Nexez can make the parts you sell clearly understandable without pretending every enterprise deal should become instant checkout.',
    merchantControls: [
      { title: 'What can be bought directly', copy: 'Define plans, onboarding packages, implementation services, and other clear starting points.' },
      { title: 'Buyer choices and limits', copy: 'Set quantities, options, included scope, required questions, and the paths that need sales review.' },
      { title: 'Your sales boundary', copy: 'Keep larger or unusual purchases on a human-led path instead of forcing them through self-serve checkout.' },
    ],
    nexezHandles: [
      { title: 'Collect evaluation details', copy: 'Nexez can gather team size, requested package, timing, and the other answers you need.' },
      { title: 'Price defined services', copy: 'Clear quantities, options, and implementation add-ons can resolve to a clear amount.' },
      { title: 'Route the right next step', copy: 'Simple purchases can proceed while enterprise or exception cases can be sent to review.' },
    ],
    outcome:
      'Buyers get a clearer evaluation path and your sales team gets fewer mystery requests. Nexez does not need to pretend usage-based or custom contracts are simple when they are not.',
    faq: [
      { title: 'Does this replace our sales team?', copy: 'No. It can make straightforward buying paths easier while routing enterprise or unusual requests to sales.' },
      { title: 'What about complicated usage pricing?', copy: 'Keep it on the appropriate sales path. Nexez should only automate pricing that your offer defines clearly enough to calculate safely.' },
      { title: 'Can implementation be a separate offer?', copy: 'Yes. Setup, onboarding, training, and other services can be presented as their own clear ways to buy.' },
    ],
  },
  {
    slug: 'marketplaces',
    headline: 'Make each provider easier for AI buyers to understand and choose.',
    description:
      'Give individual providers clear offers, buyer questions, prices, rules, and next steps so an AI assistant can route a buyer without flattening every business into the same experience.',
    buyerRequest: 'Find a provider on this marketplace who fits my request, show me the relevant service, and tell me the correct next step.',
    problem:
      'A marketplace may have excellent providers but still leave an AI assistant staring at one large catalog. Nexez can make each provider and offer easier to understand while keeping each provider’s facts and buying path separate.',
    merchantControls: [
      { title: 'Each provider’s own offer', copy: 'Services, prices, buyer questions, and policies stay tied to the provider that actually owns them.' },
      { title: 'Provider-specific rules', copy: 'Different businesses can define different requirements and acceptance rules instead of inheriting one generic marketplace policy.' },
      { title: 'The handoff or checkout path', copy: 'Choose where each provider’s buyer should go next based on the buying path that is actually supported.' },
    ],
    nexezHandles: [
      { title: 'Make provider offers understandable', copy: 'Agents can compare clearer service and purchase information instead of guessing from marketplace page structure.' },
      { title: 'Keep each provider’s facts intact', copy: 'Provider details and rules stay attached to the provider rather than being invented from category assumptions.' },
      { title: 'Route one provider purchase safely', copy: 'Nexez can support the selected provider’s own buying path without claiming to coordinate several providers inside one order.' },
    ],
    outcome:
      'The marketplace becomes easier for agents to navigate while each provider keeps its own way of doing business. One order involving several providers stays outside the promise until Nexez can support it properly.',
    faq: [
      { title: 'Does this replace our marketplace?', copy: 'No. Nexez can make provider offers easier for AI buyers to understand and route while your marketplace remains the business relationship.' },
      { title: 'Can providers have different rules?', copy: 'Yes. Each provider’s offer details and acceptance rules stay specific to that provider.' },
      { title: 'Can one Nexez order coordinate several providers?', copy: 'Not today. Nexez currently keeps each provider purchase separate rather than pretending one order can coordinate several providers.' },
    ],
  },
]

export function getUseCaseCommerceStory(slug: string): UseCaseCommerceStory | undefined {
  return useCaseCommerceStories.find((story) => story.slug === slug)
}
