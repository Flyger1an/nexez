// Seller intake interview - deterministic gap analysis (spec §3 GAP_ANALYSIS).
// Pure function of the session state: no I/O, no LLM, no randomness. The LLM's
// job is to phrase these gaps conversationally - never to decide what to ask.
//
// Inputs, in dedup priority order (first writer wins per field):
//   1. importer clarifyingQuestions (already typed with field + why)
//   2. readiness rubric (getReadinessCriteria coverage on the working draft)
//   3. per-offer OfferItem field coverage (price, duration, serviceArea, posture)
//   4. industry expectations (a caterer gets asked about minimums, a
//      photographer about turnaround/licensing, ...)
//
// Gap kinds: 'blocking' prevents a publishable draft; 'quality' raises
// readiness; 'opportunity' is upside. Coverage-based gaps persist until the
// draft actually covers them (or the owner skips); knowledge gaps (industry /
// opportunity) are one-shot - answered means done, whatever the answer was.
import { getCheckoutOfferKey, type OfferItem, type OfferKind } from '../agent-page'
import type { Gap, GapKind, IntakeDraft, IntakeState } from './types'

// ---------------------------------------------------------------------------
// Priorities: kind bands keep ordering deterministic and testable.
const PRIORITY_BLOCKING = 0
const PRIORITY_QUALITY = 100
const PRIORITY_OPPORTUNITY = 200

/** Canonical page-field question set, in ask order. `blocking` marks the
 *  publishable minimum: a page with no name, no description, or nothing to
 *  sell cannot go live. Everything else raises readiness. */
const PAGE_FIELD_GAPS: Array<{
  field: keyof IntakeDraft & string
  kind: GapKind
  order: number
  question: string
  why: string
}> = [
  { field: 'name', kind: 'blocking', order: 0, question: 'What is the name of your business?', why: 'Agents need a name to identify who they are buying from.' },
  { field: 'description', kind: 'blocking', order: 1, question: 'How would you describe what you do in a sentence or two?', why: 'The description is the first thing an agent reads to decide relevance.' },
  { field: 'website_url', kind: 'quality', order: 0, question: 'Do you have a website I should link to?', why: 'A linked site lets agents verify the business is real.' },
  { field: 'cta_url', kind: 'quality', order: 1, question: 'Where should buyers go to book or pay - a booking page, checkout, or contact form?', why: 'Agents need a conversion destination to send buyers to.' },
  { field: 'audience', kind: 'quality', order: 2, question: 'Who is your ideal customer?', why: 'Knowing the best-fit buyer helps agents match you to the right requests.' },
  { field: 'industry', kind: 'quality', order: 3, question: 'What industry or niche are you in?', why: 'A category improves agent matching and unlocks industry defaults.' },
  { field: 'location', kind: 'quality', order: 4, question: 'Where are you located, or what area do you serve?', why: 'Local buyers filter by area; agents skip listings without one.' },
  { field: 'contact_email', kind: 'quality', order: 5, question: 'What email should agents use to reach a human when needed?', why: 'A contact channel is a trust signal and a fallback for complex requests.' },
]

/** Importer clarifying-question fields → the draft coverage that answers them.
 *  An importer question only surfaces while its field is still uncovered. */
function importerFieldCovered(field: string, draft: IntakeDraft): boolean {
  switch (field) {
    case 'audience':
      return Boolean(draft.audience)
    case 'offers':
      return draft.services.length + draft.products.length > 0
    case 'pricing':
      return offerEntries(draft).length > 0 && offerEntries(draft).every(({ offer }) => Boolean(offer.price?.trim()))
    case 'action':
      return Boolean(draft.cta_url)
    case 'location':
      return Boolean(draft.location)
    case 'contact':
      return Boolean(draft.contact_email)
    default:
      return false
  }
}

/** Importer question fields that are part of the publishable minimum. */
const IMPORTER_BLOCKING_FIELDS = new Set(['offers'])

/** Canonical dedup slot per importer field, shared with the rubric's page
 *  gaps so the same underlying question never surfaces twice ('action' and
 *  'cta_url' are one slot). 'pricing' returns null: per-offer price coverage
 *  owns pricing with more actionable, offer-specific questions. */
function importerDedupSlot(field: string): string | null {
  switch (field) {
    case 'audience':
      return 'field:audience'
    case 'offers':
      return 'field:offers'
    case 'action':
      return 'field:cta_url'
    case 'location':
      return 'field:location'
    case 'contact':
      return 'field:contact_email'
    default:
      return null // 'pricing' and anything unknown
  }
}

// ---------------------------------------------------------------------------
// Industry expectations (spec §3): what a given kind of business should be
// asked beyond the generic rubric. Matching mirrors lib/industry-catalog.ts
// (lowercase substring on the draft industry). One-shot knowledge gaps unless
// `coveredBy` says the draft already answers them.
type IndustryExpectation = {
  key: string
  match: string[]
  kind: GapKind
  order: number
  field: string
  question: string
  why: string
  /** When present and true for the draft, the question is unnecessary. */
  coveredBy?: (draft: IntakeDraft) => boolean
}

const INDUSTRY_EXPECTATIONS: IndustryExpectation[] = [
  // Catering / food / events
  {
    key: 'catering-minimums', match: ['catering', 'private chef', 'food truck', 'meal prep'], kind: 'quality', order: 0,
    field: 'offer.minimums',
    question: 'Do you have a minimum order or guest count for events?',
    why: 'Agents pre-filter requests by minimums, so stating them avoids dead-end inquiries.',
  },
  {
    key: 'catering-radius', match: ['catering', 'private chef', 'food truck', 'meal prep'], kind: 'quality', order: 1,
    field: 'offer.serviceArea',
    question: 'How far do you travel for events - what is your service radius?',
    why: 'Local buyers are matched by area; a radius makes you eligible for more precise requests.',
    coveredBy: (draft) => offerEntries(draft).some(({ offer }) => Boolean(offer.serviceArea?.trim())),
  },
  {
    key: 'catering-dietary', match: ['catering', 'private chef', 'food truck', 'meal prep'], kind: 'opportunity', order: 0,
    field: 'offer.dietary',
    question: 'Do you offer dietary options - vegetarian, vegan, gluten-free, halal, kosher?',
    why: 'Dietary coverage is one of the most common agent-side filters for food requests.',
  },
  // Photography / video / creative production
  {
    key: 'photo-turnaround', match: ['photography', 'video production', 'videography'], kind: 'quality', order: 0,
    field: 'offer.turnaround',
    question: 'What is your typical turnaround time for delivering finished work?',
    why: 'Turnaround is a top question buyers ask before booking creative work.',
  },
  {
    key: 'photo-licensing', match: ['photography', 'video production', 'videography'], kind: 'quality', order: 1,
    field: 'offer.licensing',
    question: 'How do you handle usage rights and licensing - are they included in the price?',
    why: 'Licensing ambiguity stalls agent-led purchases of creative work.',
  },
  // Home / field services
  {
    key: 'home-service-area', match: ['plumbing', 'hvac', 'electrical', 'roofing', 'handyman', 'cleaning', 'landscaping', 'pest control', 'locksmith', 'moving', 'appliance repair', 'pressure washing', 'window cleaning', 'pool cleaning', 'home services'], kind: 'quality', order: 0,
    field: 'offer.serviceArea',
    question: 'What area do you serve - which neighborhoods, cities, or radius?',
    why: 'Field-service requests are matched by coverage area first.',
    coveredBy: (draft) => offerEntries(draft).some(({ offer }) => Boolean(offer.serviceArea?.trim())),
  },
  {
    key: 'home-emergency', match: ['plumbing', 'hvac', 'electrical', 'locksmith', 'appliance repair'], kind: 'quality', order: 1,
    field: 'offer.emergency',
    question: 'Do you take emergency or after-hours calls, and is there a different rate?',
    why: 'Emergency availability is a high-intent match - agents route urgent jobs to businesses that state it.',
  },
  {
    key: 'home-callout', match: ['plumbing', 'hvac', 'electrical', 'handyman', 'appliance repair'], kind: 'opportunity', order: 0,
    field: 'offer.callout',
    question: 'Is there a call-out or diagnostic fee, and does it apply toward the repair?',
    why: 'A clear call-out policy removes the most common friction point in service bookings.',
  },
  // Consulting / coaching / professional services
  {
    key: 'consulting-engagement', match: ['consulting', 'consultant', 'coaching', 'advisory', 'strategy'], kind: 'quality', order: 0,
    field: 'offer.engagement',
    question: 'How do clients typically engage you - one-off projects, retainers, or hourly?',
    why: 'Engagement shape determines which agent requests you fit.',
  },
  {
    key: 'consulting-timeline', match: ['consulting', 'consultant', 'coaching', 'advisory', 'strategy'], kind: 'opportunity', order: 0,
    field: 'offer.timeline',
    question: 'What does a typical engagement timeline look like?',
    why: 'Buyers with deadlines filter on delivery expectations.',
  },
]

// ---------------------------------------------------------------------------
// Offer helpers

/** Every draft offer with its stable-for-this-turn address (`services-0` style).
 *  Shared with the reducer, which resolves GapAnswer offerKeys through it. */
export function offerEntries(draft: IntakeDraft): Array<{ kind: OfferKind; index: number; key: string; offer: OfferItem }> {
  return [
    ...draft.services.map((offer, index) => ({ kind: 'services' as const, index, key: getCheckoutOfferKey('services', index), offer })),
    ...draft.products.map((offer, index) => ({ kind: 'products' as const, index, key: getCheckoutOfferKey('products', index), offer })),
  ]
}

/** Prices agents cannot transact on without a follow-up. Empty is blocking;
 *  vague-but-present ("Custom", "call for pricing") is a quality nudge. */
const VAGUE_PRICE_RE = /^(custom|varies|variable|call( for pricing| us)?|contact( us)?( for pricing)?|tbd|ask|quote|pricing varies|n\/?a)[.!]?$/i

export function isVaguePrice(price: string | undefined | null): boolean {
  const value = (price ?? '').trim()
  if (!value) return false
  return VAGUE_PRICE_RE.test(value)
}

/** True when the industry string matches any of the expectation's terms
 *  (same lowercase-substring matching as lib/industry-catalog.ts). */
function industryMatches(industry: string, terms: string[]): boolean {
  const value = industry.toLowerCase()
  return terms.some((term) => value.includes(term))
}

// ---------------------------------------------------------------------------

/**
 * The deterministic core of the interview (spec §3): compute every gap the
 * conversation could ask about, prioritized, deduped, and filtered by what the
 * owner has already answered or skipped. Pure - same state in, same gaps out.
 */
export function analyzeGaps(state: Pick<IntakeState, 'draft' | 'extractions' | 'answers'>): Gap[] {
  const { draft } = state
  const answeredIds = new Set(state.answers.filter((a) => !a.skipped).map((a) => a.gapId))
  const skippedIds = new Set(state.answers.filter((a) => a.skipped).map((a) => a.gapId))
  const gaps: Gap[] = []
  const seenFields = new Set<string>()

  const push = (gap: Gap, dedupKey: string, oneShot: boolean) => {
    if (skippedIds.has(gap.id)) return
    // Coverage-based gaps stay askable after an answer that failed to fill the
    // field (the agent rephrases); one-shot knowledge gaps retire once answered.
    if (oneShot && answeredIds.has(gap.id)) return
    if (seenFields.has(dedupKey)) return
    seenFields.add(dedupKey)
    gaps.push(gap)
  }

  // 1. Importer clarifying questions - the extraction already knows what was
  //    ambiguous, with a typed field + why. Only while still uncovered.
  for (const extraction of state.extractions) {
    for (const q of extraction.clarifyingQuestions ?? []) {
      const slot = importerDedupSlot(q.field)
      if (!slot) continue
      if (importerFieldCovered(q.field, draft)) continue
      const kind: GapKind = IMPORTER_BLOCKING_FIELDS.has(q.field) ? 'blocking' : 'quality'
      push(
        {
          id: `imp:${q.id}`,
          field: q.field,
          question: q.question,
          why: q.why,
          kind,
          priority: (kind === 'blocking' ? PRIORITY_BLOCKING : PRIORITY_QUALITY) + 10,
        },
        slot,
        false,
      )
    }
  }

  // 2. Readiness rubric - canonical page-field coverage. (slug auto-derives
  //    from the name and publish is the handoff outcome, so neither is a gap.)
  for (const spec of PAGE_FIELD_GAPS) {
    const value = draft[spec.field]
    if (typeof value === 'string' && value.trim()) continue
    const base = spec.kind === 'blocking' ? PRIORITY_BLOCKING : PRIORITY_QUALITY
    push(
      {
        id: `page:${spec.field}`,
        field: spec.field,
        question: spec.question,
        why: spec.why,
        kind: spec.kind,
        priority: base + 20 + spec.order,
      },
      `field:${spec.field}`,
      false,
    )
  }

  // No offers at all is blocking - the most important gap AFTER identity
  // (name/description sort first: a scratch interview starts with who you are,
  // then what agents can buy).
  const entries = offerEntries(draft)
  if (entries.length === 0) {
    push(
      {
        id: 'page:offers',
        field: 'offers',
        question: 'What services or products should agents be able to buy from you?',
        why: 'A page with nothing to transact on cannot convert an agent visit.',
        kind: 'blocking',
        priority: PRIORITY_BLOCKING + 25,
      },
      'field:offers', // shares the dedup slot with the importer's offers question
      false,
    )
  }

  // 3. Per-offer field coverage.
  for (const { key, offer } of entries) {
    const label = offer.name?.trim() || key
    const price = (offer.price ?? '').trim()
    if (!price) {
      push(
        {
          id: `offer:${key}:price`,
          field: 'price',
          offerKey: key,
          question: `What does "${label}" cost?`,
          why: 'Agents cannot transact on an offer without a price.',
          kind: 'blocking',
          priority: PRIORITY_BLOCKING + 40,
        },
        `offer:${key}:price`,
        false,
      )
    } else if (isVaguePrice(price)) {
      push(
        {
          id: `offer:${key}:price-vague`,
          field: 'price',
          offerKey: key,
          question: `"${label}" is listed as "${price}" - can we anchor it with a starting price (even "From $X")?`,
          why: 'A concrete anchor price makes the offer eligible for agent-led transactions.',
          kind: 'quality',
          priority: PRIORITY_QUALITY + 40,
        },
        `offer:${key}:price-vague`,
        false,
      )
    }
    if (!offer.duration?.trim()) {
      push(
        {
          id: `offer:${key}:duration`,
          field: 'duration',
          offerKey: key,
          question: `How long does "${label}" take?`,
          why: 'Duration helps agents schedule and compare offers.',
          kind: 'quality',
          priority: PRIORITY_QUALITY + 50,
        },
        `offer:${key}:duration`,
        false,
      )
    }
    // Commerce posture: an untyped offer defaults to fixed. Surfacing the
    // negotiable option is upside, not a defect.
    if (!offer.offerType) {
      push(
        {
          id: `offer:${key}:posture`,
          field: 'offerType',
          offerKey: key,
          question: `Would you accept offers on "${label}", or is the price fixed?`,
          why: 'Negotiable offers let agents close deals within rules you set.',
          kind: 'opportunity',
          priority: PRIORITY_OPPORTUNITY + 10,
        },
        `offer:${key}:posture`,
        true,
      )
    } else if (offer.offerType === 'negotiable') {
      // Smart Rules minimums (spec §3): a negotiable offer without a floor
      // routes every proposal to manual review - recommend the guardrails.
      const rules = offer.rules ?? {}
      if (!rules.minPrice && rules.maxDiscountPercent == null) {
        push(
          {
            id: `offer:${key}:floor`,
            field: 'rules.minPrice',
            offerKey: key,
            question: `What is the lowest price you would accept for "${label}"?`,
            why: 'A floor price lets agent negotiations auto-settle inside your rules instead of waiting on manual review.',
            kind: 'quality',
            priority: PRIORITY_QUALITY + 30,
          },
          `offer:${key}:floor`,
          false,
        )
      }
      if (rules.minNoticeHours == null && !rules.blackoutDates?.length && rules.maxBookingsPerWeek == null) {
        push(
          {
            id: `offer:${key}:booking-rules`,
            field: 'rules.booking',
            offerKey: key,
            question: `Any booking guardrails for "${label}" - minimum notice, blackout dates, or a weekly cap?`,
            why: 'Booking constraints protect your calendar while agents book autonomously.',
            kind: 'opportunity',
            priority: PRIORITY_OPPORTUNITY + 20,
          },
          `offer:${key}:booking-rules`,
          true,
        )
      }
    }
  }

  // 4. Industry expectations - what this kind of business should be asked.
  if (draft.industry.trim()) {
    for (const exp of INDUSTRY_EXPECTATIONS) {
      if (!industryMatches(draft.industry, exp.match)) continue
      if (exp.coveredBy?.(draft)) continue
      const base = exp.kind === 'blocking' ? PRIORITY_BLOCKING : exp.kind === 'quality' ? PRIORITY_QUALITY : PRIORITY_OPPORTUNITY
      push(
        {
          id: `ind:${exp.key}`,
          field: exp.field,
          question: exp.question,
          why: exp.why,
          kind: exp.kind,
          priority: base + 60 + exp.order,
        },
        `ind:${exp.key}`,
        true, // knowledge gaps are one-shot
      )
    }
  }

  // FAQs - last quality nudge.
  if (draft.faqs.length === 0) {
    push(
      {
        id: 'page:faqs',
        field: 'faqs',
        question: 'What are the 2–3 questions customers always ask before buying?',
        why: 'FAQs answer the questions agents would otherwise have to interrupt a purchase to ask.',
        kind: 'quality',
        priority: PRIORITY_QUALITY + 90,
      },
      'page:faqs',
      false,
    )
  }

  return gaps.sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id))
}

/** True when the agent may request handoff (spec §3 SYNTHESIS): no blocking
 *  gap remains askable. Skipped blocking gaps are the owner's call - they are
 *  excused here and land in the builder as unfinished work. */
export function hasBlockingGaps(gaps: Gap[]): boolean {
  return gaps.some((gap) => gap.kind === 'blocking')
}
