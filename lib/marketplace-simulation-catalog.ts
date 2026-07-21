import type { AgentPage, OfferItem } from './agent-page'

export const MARKETPLACE_SIMULATION_DISCLAIMER =
  'Synthetic marketplace data for product previews and automated tests. This is not a real seller and cannot accept transactions.'

type SimulationOffer = Pick<OfferItem, 'name' | 'price' | 'description'>

type SimulationSeed = {
  name: string
  slug: string
  scenario: string
  region: 'Africa' | 'Asia Pacific' | 'Europe' | 'Latin America' | 'North America'
  industry: string
  location: string
  audience: string
  description: string
  currency: string
  offers: SimulationOffer[]
}

export type MarketplaceSimulationListing = AgentPage & {
  simulation: {
    enabled: true
    scenario: string
    region: SimulationSeed['region']
    disclaimer: typeof MARKETPLACE_SIMULATION_DISCLAIMER
  }
}

const SEEDS: SimulationSeed[] = [
  {
    name: 'Northline Fractional Finance',
    slug: 'northline-fractional-finance',
    scenario: 'Recurring professional service with a paid diagnostic entry point',
    region: 'North America',
    industry: 'Fractional Finance',
    location: 'Chicago, Illinois',
    audience: 'Founder-led companies preparing for disciplined growth',
    description: 'Fractional finance operations for small teams that need cash-flow clarity, forecasting, and board-ready reporting.',
    currency: 'usd',
    offers: [
      { name: 'Cash Flow Diagnostic', price: '$900', description: 'A focused review of runway, working capital, and reporting gaps.' },
      { name: 'Fractional CFO Partnership', price: '$3,500/month', description: 'Monthly forecasting, finance leadership, and decision support.' },
    ],
  },
  {
    name: 'Harborlight Immigration Process Consulting',
    slug: 'harborlight-immigration-process',
    scenario: 'Regulated-service discovery with a clear non-legal-advice boundary',
    region: 'North America',
    industry: 'Immigration Process Consulting',
    location: 'Toronto, Ontario',
    audience: 'Employers and professionals organizing immigration application workflows',
    description: 'Process planning and document-readiness support for immigration workflows, with licensed legal review referred separately.',
    currency: 'cad',
    offers: [
      { name: 'Process Readiness Session', price: 'CAD 275', description: 'A 60-minute workflow and document-readiness review.' },
      { name: 'Employer Sponsorship Roadmap', price: 'CAD 1,800', description: 'A structured process plan for an employer-sponsored application.' },
    ],
  },
  {
    name: 'Cedar and Slate Home Organization',
    slug: 'cedar-slate-home-organization',
    scenario: 'Local consumer service with on-site delivery',
    region: 'North America',
    industry: 'Home Organization',
    location: 'Austin, Texas',
    audience: 'Busy households seeking practical, maintainable organization systems',
    description: 'In-home organization for kitchens, closets, moves, and whole-home resets across the Austin area.',
    currency: 'usd',
    offers: [
      { name: 'Pantry Reset', price: '$325', description: 'A four-hour on-site pantry edit and organization session.' },
      { name: 'Whole Home Plan', price: 'From $1,800', description: 'A room-by-room organization plan with implementation support.' },
    ],
  },
  {
    name: 'Meridian Brand Systems',
    slug: 'meridian-brand-systems',
    scenario: 'High-value agency work with fixed discovery and custom implementation',
    region: 'Europe',
    industry: 'Brand Strategy',
    location: 'London, United Kingdom',
    audience: 'B2B companies repositioning for a new market or growth stage',
    description: 'Positioning, messaging, and identity systems for B2B teams that need a sharper market narrative.',
    currency: 'gbp',
    offers: [
      { name: 'Positioning Sprint', price: 'GBP 2,400', description: 'A two-week positioning and messaging engagement.' },
      { name: 'Brand System', price: 'From GBP 8,500', description: 'Strategy, verbal identity, and practical brand-system delivery.' },
    ],
  },
  {
    name: 'Atlas Tax Operations',
    slug: 'atlas-tax-operations',
    scenario: 'Financial operations workflow with an advisory boundary',
    region: 'Asia Pacific',
    industry: 'Tax Operations',
    location: 'Sydney, New South Wales',
    audience: 'Small businesses preparing clean records for registered tax professionals',
    description: 'Bookkeeping cleanup and tax-readiness operations that prepare organized records for a registered tax adviser.',
    currency: 'aud',
    offers: [
      { name: 'Quarterly Readiness Review', price: 'AUD 1,200', description: 'A quarterly records, reconciliation, and handoff review.' },
      { name: 'Bookkeeping Recovery', price: 'From AUD 2,800', description: 'Catch-up reconciliation and reporting for disorganized accounts.' },
    ],
  },
  {
    name: 'Juniper Movement Coaching',
    slug: 'juniper-movement-coaching',
    scenario: 'Remote wellness coaching with explicit scope and duration',
    region: 'North America',
    industry: 'Health and Wellness Coaching',
    location: 'Denver, Colorado and remote',
    audience: 'Desk-based professionals building sustainable mobility habits',
    description: 'Non-clinical movement coaching for professionals who want practical mobility routines and accountability.',
    currency: 'usd',
    offers: [
      { name: 'Movement Planning Session', price: '$120', description: 'A 60-minute goals, routine, and habit-planning session.' },
      { name: 'Six-Week Mobility Coaching', price: '$720', description: 'Weekly coaching with a personalized movement routine.' },
    ],
  },
  {
    name: 'Rivet Product Design',
    slug: 'rivet-product-design',
    scenario: 'Specialist B2B design service with milestone-based work',
    region: 'Europe',
    industry: 'Industrial Design',
    location: 'Berlin, Germany',
    audience: 'Hardware startups moving from concept to testable prototype',
    description: 'Industrial design support for early hardware teams developing clear concepts and prototype-ready direction.',
    currency: 'eur',
    offers: [
      { name: 'Prototype Review', price: 'EUR 950', description: 'An expert review of a concept, prototype, and next-step risks.' },
      { name: 'Concept Sprint', price: 'EUR 4,500', description: 'A two-week concept-development sprint with design direction.' },
    ],
  },
  {
    name: 'Paloma Event Table',
    slug: 'paloma-event-table',
    scenario: 'Local event service with a tasting before a custom booking',
    region: 'Latin America',
    industry: 'Event Catering',
    location: 'Mexico City, Mexico',
    audience: 'Hosts planning private celebrations and brand events',
    description: 'Seasonal catering for private and brand events, with menu planning, tastings, and staffed service.',
    currency: 'mxn',
    offers: [
      { name: 'Private Menu Tasting', price: 'MXN 1,800', description: 'A guided tasting for up to four event decision-makers.' },
      { name: 'Staffed Event Service', price: 'From MXN 28,000', description: 'Menu, staffing, setup, and service for a private event.' },
    ],
  },
  {
    name: 'Nuru Solar Planning',
    slug: 'nuru-solar-planning',
    scenario: 'Location-bound technical service with an assessment step',
    region: 'Africa',
    industry: 'Renewable Energy Services',
    location: 'Nairobi, Kenya',
    audience: 'Homes and small businesses evaluating solar installations',
    description: 'Solar site assessment and system planning for homes and small commercial properties in greater Nairobi.',
    currency: 'kes',
    offers: [
      { name: 'Solar Site Survey', price: 'KES 18,000', description: 'An on-site load, roof, and installation-readiness assessment.' },
      { name: 'System Design Plan', price: 'From KES 85,000', description: 'A right-sized solar and battery plan with implementation scope.' },
    ],
  },
  {
    name: 'Sakura Language Coaching',
    slug: 'sakura-language-coaching',
    scenario: 'Education service with individual and cohort formats',
    region: 'Asia Pacific',
    industry: 'Language Education',
    location: 'Tokyo, Japan and remote',
    audience: 'Professionals improving practical Japanese for work',
    description: 'Practical Japanese coaching for international professionals preparing for workplace communication.',
    currency: 'jpy',
    offers: [
      { name: 'Conversation Intensive', price: 'JPY 18,000', description: 'Three focused sessions for a specific communication goal.' },
      { name: 'Business Japanese Cohort', price: 'JPY 48,000', description: 'An eight-week small-group workplace language program.' },
    ],
  },
  {
    name: 'Haven Eldercare Navigation',
    slug: 'haven-eldercare-navigation',
    scenario: 'Sensitive family service with planning and referral boundaries',
    region: 'North America',
    industry: 'Eldercare Navigation',
    location: 'Boston, Massachusetts',
    audience: 'Families comparing care options for an aging relative',
    description: 'Non-clinical eldercare navigation that helps families organize options, questions, and provider conversations.',
    currency: 'usd',
    offers: [
      { name: 'Care Options Plan', price: '$450', description: 'A structured plan covering needs, options, and next conversations.' },
      { name: 'Placement Search Support', price: '$1,500', description: 'Guided research and comparison support for local care options.' },
    ],
  },
  {
    name: 'Forma UX Research',
    slug: 'forma-ux-research',
    scenario: 'Remote research agency with packaged engagements',
    region: 'Europe',
    industry: 'UX Research',
    location: 'Lisbon, Portugal and remote',
    audience: 'Product teams validating a workflow before investing in development',
    description: 'Focused user research for product teams that need evidence before making roadmap and design decisions.',
    currency: 'eur',
    offers: [
      { name: 'Usability Sprint', price: 'EUR 3,200', description: 'Five moderated tests with findings and prioritized recommendations.' },
      { name: 'Discovery Interview Study', price: 'EUR 4,800', description: 'Eight customer interviews with a decision-ready synthesis.' },
    ],
  },
  {
    name: 'Tideway Property Care',
    slug: 'tideway-property-care',
    scenario: 'Recurring local maintenance with one-time inspection entry',
    region: 'North America',
    industry: 'Property Maintenance',
    location: 'Miami, Florida',
    audience: 'Remote owners of seasonal and second homes',
    description: 'Routine property checks and maintenance coordination for seasonal homes across greater Miami.',
    currency: 'usd',
    offers: [
      { name: 'Seasonal Property Inspection', price: '$280', description: 'A documented interior and exterior condition inspection.' },
      { name: 'Monthly Property Care', price: '$650/month', description: 'Scheduled checks, maintenance coordination, and owner reporting.' },
    ],
  },
  {
    name: 'Koru Leadership Practice',
    slug: 'koru-leadership-practice',
    scenario: 'Executive coaching with individual and team offers',
    region: 'Asia Pacific',
    industry: 'Leadership Coaching',
    location: 'Auckland, New Zealand and remote',
    audience: 'New executives and leadership teams navigating growth',
    description: 'Practical leadership coaching for executives and teams moving through change, scale, and new responsibility.',
    currency: 'nzd',
    offers: [
      { name: 'Executive Coaching Session', price: 'NZD 350', description: 'A private 75-minute coaching session focused on one priority.' },
      { name: 'Team Alignment Workshop', price: 'NZD 3,200', description: 'A facilitated half-day workshop for leadership alignment.' },
    ],
  },
  {
    name: 'Lantern Security Review',
    slug: 'lantern-security-review',
    scenario: 'Technical risk service with bounded assessment scope',
    region: 'Asia Pacific',
    industry: 'Cybersecurity Consulting',
    location: 'Singapore and remote',
    audience: 'Small software companies preparing for customer security reviews',
    description: 'Bounded security reviews and incident-readiness workshops for growing software teams.',
    currency: 'sgd',
    offers: [
      { name: 'Web Security Review', price: 'SGD 2,400', description: 'A scoped application review with prioritized remediation guidance.' },
      { name: 'Incident Tabletop Workshop', price: 'SGD 4,800', description: 'A facilitated incident exercise with roles and follow-up actions.' },
    ],
  },
  {
    name: 'Solstice Wedding Photography',
    slug: 'solstice-wedding-photography',
    scenario: 'Creative local service with date-dependent availability',
    region: 'North America',
    industry: 'Wedding Photography',
    location: 'Vancouver, British Columbia',
    audience: 'Couples planning intimate and mid-sized weddings',
    description: 'Natural-light wedding and engagement photography for couples across greater Vancouver.',
    currency: 'cad',
    offers: [
      { name: 'Engagement Session', price: 'CAD 650', description: 'A 90-minute location session with a curated digital gallery.' },
      { name: 'Wedding Collection', price: 'From CAD 4,800', description: 'Eight hours of coverage with planning and edited delivery.' },
    ],
  },
  {
    name: 'Alba Legal Operations',
    slug: 'alba-legal-operations',
    scenario: 'Legal-adjacent operational consulting with no legal advice',
    region: 'Europe',
    industry: 'Legal Operations Consulting',
    location: 'Madrid, Spain and remote',
    audience: 'In-house legal teams improving intake and contract workflows',
    description: 'Legal operations consulting focused on workflow, tooling, and intake efficiency, without providing legal advice.',
    currency: 'eur',
    offers: [
      { name: 'Contract Workflow Audit', price: 'EUR 1,800', description: 'A review of intake, handoffs, approvals, and reporting friction.' },
      { name: 'Intake Automation Blueprint', price: 'EUR 3,600', description: 'A requirements and implementation plan for legal request intake.' },
    ],
  },
  {
    name: 'Verdant Landscape Design',
    slug: 'verdant-landscape-design',
    scenario: 'Residential design with regional service-area matching',
    region: 'North America',
    industry: 'Landscape Design',
    location: 'Portland, Oregon',
    audience: 'Homeowners planning climate-conscious outdoor spaces',
    description: 'Residential landscape concepts and planting plans designed for Pacific Northwest homes and seasons.',
    currency: 'usd',
    offers: [
      { name: 'Landscape Concept Plan', price: '$1,250', description: 'A site-informed layout and direction for one outdoor area.' },
      { name: 'Planting Design Package', price: '$2,400', description: 'A detailed plant palette, quantities, and seasonal plan.' },
    ],
  },
  {
    name: 'Brightpath Academic Coaching',
    slug: 'brightpath-academic-coaching',
    scenario: 'Education service with cohort and one-to-one offers',
    region: 'North America',
    industry: 'Academic Coaching',
    location: 'Atlanta, Georgia and remote',
    audience: 'High-school students preparing for admissions milestones',
    description: 'Structured test preparation and application coaching for students and families navigating admissions.',
    currency: 'usd',
    offers: [
      { name: 'SAT Preparation Cohort', price: '$680', description: 'An eight-week small-group preparation program.' },
      { name: 'College Essay Coaching', price: '$420', description: 'Three individual sessions from story selection through revision.' },
    ],
  },
]

function createSimulation(seed: SimulationSeed, index: number): MarketplaceSimulationListing {
  const website = `https://${seed.slug}.example`
  const name = `[Simulation] ${seed.name}`
  return {
    id: `simulation-${String(index + 1).padStart(2, '0')}`,
    name,
    slug: `simulation-${seed.slug}`,
    description: `${MARKETPLACE_SIMULATION_DISCLAIMER} ${seed.description}`,
    website_url: website,
    cta_url: `${website}/book`,
    cta_label: 'Preview booking flow',
    audience: seed.audience,
    location: seed.location,
    contact_email: `hello@${seed.slug}.example`,
    industry: seed.industry,
    prefer_original_site: true,
    products: [],
    services: seed.offers.map((offer) => ({
      ...offer,
      url: `${website}/book`,
      prefer_original_for_this: true,
    })),
    faqs: [
      { question: 'Is this a real seller?', answer: MARKETPLACE_SIMULATION_DISCLAIMER },
      { question: 'Can this listing accept payment?', answer: 'No. All actions are non-transactional preview links on a reserved .example domain.' },
      { question: 'What is this data for?', answer: `It exercises the ${seed.scenario.toLowerCase()} marketplace scenario.` },
    ],
    is_published: false,
    marketplace_discoverable: false,
    mcp_enabled: false,
    llm_opt_in: false,
    currency: seed.currency,
    created_at: '2026-07-21T00:00:00.000Z',
    updated_at: '2026-07-21T00:00:00.000Z',
    simulation: {
      enabled: true,
      scenario: seed.scenario,
      region: seed.region,
      disclaimer: MARKETPLACE_SIMULATION_DISCLAIMER,
    },
  }
}

export const MARKETPLACE_SIMULATION_LISTINGS = SEEDS.map(createSimulation)
