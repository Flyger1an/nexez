import { describe, expect, it, vi } from 'vitest'
import { createSupabaseMock } from '../../../test/supabase-mock'
import { formatOfferLines, parseOfferLines, type OfferItem } from '../../agent-page'
import {
  commitIntakeSession,
  draftReadiness,
  handleIntakeTurn,
  importResultToExtraction,
  type IntakeSessionRow,
} from '../intake'
import { applyIntakeAction, createIntakeState, type IntakeState } from '../../intake'

// ---------------------------------------------------------------------------
// Fixtures

const T0 = '2026-07-06T00:00:00.000Z'
const OWNER = { id: 'owner-1', email: 'owner@example.com' }

/** A realistic analyzed session: one URL source, extraction folded, gaps live.
 *  Built through the real machine so the fixture can never drift from it. */
function analyzedState(): IntakeState {
  let state = createIntakeState()
  for (const action of [
    { type: 'ADD_SOURCE' as const, source: { id: 'src-1', kind: 'url' as const, value: 'https://apex.example', addedAt: T0 } },
    {
      type: 'RECORD_EXTRACTION' as const,
      extraction: {
        sourceId: 'src-1',
        title: 'Apex Catering Co.',
        description: 'Full-service catering.',
        website_url: 'https://apex.example',
        offers: [
          { name: 'Event Catering', description: 'Full service', price: '$1,200', url: '', duration: '4 hours' },
          { name: 'Drop-off Trays', description: 'Delivered trays', price: '', url: '' },
        ] as OfferItem[],
        industry: 'Catering',
        clarifyingQuestions: null,
      },
    },
    { type: 'ANALYZE_GAPS' as const },
  ]) {
    const applied = applyIntakeAction(state, action)
    if (!applied.ok) throw new Error(`fixture failed at ${action.type}: ${applied.error}`)
    state = applied.state
  }
  return state
}

function sessionRow(state: IntakeState, overrides: Partial<IntakeSessionRow> = {}): IntakeSessionRow {
  return { id: 'sess-1', owner_id: OWNER.id, page_id: null, status: 'active', phase: state.phase, state, ...overrides }
}

/** DB mock serving one intake_sessions row + capturing updates per table. */
function makeDb(row: IntakeSessionRow | null, captured: { sessions: any[]; pages: any[] } = { sessions: [], pages: [] }) {
  const db = createSupabaseMock((ctx) => {
    if (ctx.table === 'intake_sessions' && ctx.op === 'select') return { data: row }
    if (ctx.table === 'intake_sessions' && ctx.op === 'update') {
      captured.sessions.push(ctx.payload)
      return { data: null }
    }
    if (ctx.table === 'pages' && ctx.op === 'update') {
      captured.pages.push(ctx.payload)
      return { data: null }
    }
    return { data: null }
  })
  return { db: db as any, captured }
}

const toolCall = (name: string, args: unknown) => ({
  id: `call-${name}`,
  type: 'function' as const,
  function: { name, arguments: JSON.stringify(args) },
})

const ids = { now: () => new Date(T0), newId: (() => { let n = 0; return () => `id-${n++}` })() }

// ---------------------------------------------------------------------------

describe('handleIntakeTurn — session guards', () => {
  it('404s when the session does not exist (or belongs to someone else — RLS + eq)', async () => {
    const { db } = makeDb(null)
    const result = await handleIntakeTurn({ db, user: OWNER, sessionId: 'sess-1', content: 'hi' }, ids)
    expect(result).toMatchObject({ ok: false, status: 404 })
  })

  it('409s when the interview already handed off', async () => {
    const { db } = makeDb(sessionRow(analyzedState(), { status: 'handed_off' }))
    const result = await handleIntakeTurn({ db, user: OWNER, sessionId: 'sess-1', content: 'hi' }, ids)
    expect(result).toMatchObject({ ok: false, status: 409, code: 'already_handed_off' })
  })
})

describe('handleIntakeTurn — deterministic interviewer (no LLM)', () => {
  it('asks the top gap batch verbatim with a gap_batch card and persists', async () => {
    const { db, captured } = makeDb(sessionRow(analyzedState()))
    const result = await handleIntakeTurn({ db, user: OWNER, sessionId: 'sess-1', content: 'ready when you are' }, ids)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state.phase).toBe('INTERVIEW')
    const batch = result.cards.find((c) => c.type === 'gap_batch')
    expect(batch).toBeTruthy()
    if (batch?.type === 'gap_batch') {
      expect(batch.gaps.length).toBeGreaterThan(0)
      expect(batch.gaps.length).toBeLessThanOrEqual(3)
      expect(result.message).toContain(batch.gaps[0].question)
    }
    expect(captured.sessions).toHaveLength(1)
    expect(captured.sessions[0].phase).toBe('INTERVIEW')
  })

  it('applies structured quick-answers through the reducer and re-interviews', async () => {
    const { db, captured } = makeDb(sessionRow(analyzedState()))
    const result = await handleIntakeTurn(
      {
        db,
        user: OWNER,
        sessionId: 'sess-1',
        structuredAnswers: [
          { gapId: 'offer:services-1:price', answer: '$250', fields: [{ target: 'offer', offerKey: 'services-1', field: 'price', value: '$250' }] },
        ],
      },
      ids,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state.draft.services[1].price).toBe('$250')
    expect(result.state.provenance['offer:dropofftrays:price']).toBe('stated')
    expect(captured.sessions).toHaveLength(1)
  })

  it('rejects invalid structured answers with a 400 and does not persist', async () => {
    const { db, captured } = makeDb(sessionRow(analyzedState()))
    const result = await handleIntakeTurn(
      { db, user: OWNER, sessionId: 'sess-1', structuredAnswers: [{ gapId: 'not-a-gap', answer: 'x' }] },
      ids,
    )
    expect(result).toMatchObject({ ok: false, status: 400, code: 'unknown_gap' })
    expect(captured.sessions).toHaveLength(0)
  })

  it('auto-advances INGEST sessions through analysis on the first turn', async () => {
    let state = createIntakeState()
    const added = applyIntakeAction(state, {
      type: 'ADD_SOURCE',
      source: { id: 'src-s', kind: 'none', value: '', addedAt: T0 },
    })
    if (added.ok) state = added.state
    const { db } = makeDb(sessionRow(state))
    const result = await handleIntakeTurn({ db, user: OWNER, sessionId: 'sess-1', content: 'starting from scratch' }, ids)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state.phase).toBe('INTERVIEW') // INGEST → analyzed → asked
  })
})

describe('handleIntakeTurn — LLM tool loop (the reducer is the firewall)', () => {
  it('a valid ask_gaps tool call interviews with the model phrasing', async () => {
    const state = analyzedState()
    const firstGap = state.gaps[0]
    const llm = vi
      .fn()
      .mockResolvedValueOnce({
        choices: [{ message: { content: null, tool_calls: [toolCall('ask_gaps', { gapIds: [firstGap.id], phrasing: 'Quick one — what do the trays cost?' })] } }],
      })
      .mockResolvedValueOnce({ choices: [{ message: { content: '' } }] })
    const { db } = makeDb(sessionRow(state))
    const result = await handleIntakeTurn({ db, user: OWNER, sessionId: 'sess-1', content: 'hi' }, { ...ids, llm })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.message).toBe('Quick one — what do the trays cost?')
    expect(result.state.phase).toBe('INTERVIEW')
    expect(result.cards.some((c) => c.type === 'gap_batch')).toBe(true)
  })

  it('rejects a phase-skip: request_handoff with blocking gaps feeds the error back and never advances', async () => {
    const state = analyzedState() // Drop-off Trays unpriced → blocking gap
    const llm = vi
      .fn()
      .mockResolvedValueOnce({
        choices: [{ message: { content: null, tool_calls: [toolCall('request_handoff', { summary: 'All done!' })] } }],
      })
      .mockResolvedValueOnce({ choices: [{ message: { content: 'You are right — one more question first.' } }] })
    const { db } = makeDb(sessionRow(state))
    const result = await handleIntakeTurn({ db, user: OWNER, sessionId: 'sess-1', content: 'wrap it up' }, { ...ids, llm })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state.phase).not.toBe('REVIEW_HANDOFF')
    expect(result.state.handoff).toBeNull()
    // the model saw the rejection as a tool result on the second round
    const secondCallMessages = llm.mock.calls[1][0] as Array<{ role: string; content: string }>
    const toolResult = secondCallMessages.find((m) => m.role === 'tool')
    expect(toolResult?.content).toContain('blocking_gaps_remain')
    expect(result.message).toBe('You are right — one more question first.')
  })

  it('rejects invented offers: propose_offers outside the pool leaves the draft untouched', async () => {
    const state = analyzedState()
    const llm = vi
      .fn()
      .mockResolvedValueOnce({
        choices: [{ message: { content: null, tool_calls: [toolCall('propose_offers', { kind: 'services', offers: [{ name: 'Platinum Mega Package', description: '', price: '$9,999', url: '' }] })] } }],
      })
      .mockResolvedValueOnce({ choices: [{ message: { content: 'Understood — sticking to what your site offers.' } }] })
    const { db } = makeDb(sessionRow(state))
    const result = await handleIntakeTurn({ db, user: OWNER, sessionId: 'sess-1', content: 'make me look bigger' }, { ...ids, llm })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state.draft.services.map((o) => o.name)).toEqual(['Event Catering', 'Drop-off Trays'])
    const secondCallMessages = llm.mock.calls[1][0] as Array<{ role: string; content: string }>
    expect(secondCallMessages.find((m) => m.role === 'tool')?.content).toContain('invented_offer')
  })

  it('malformed tool arguments are survivable (bad_arguments fed back, no crash, no state change)', async () => {
    const state = analyzedState()
    const llm = vi
      .fn()
      .mockResolvedValueOnce({
        choices: [{ message: { content: null, tool_calls: [{ id: 'c1', type: 'function' as const, function: { name: 'ask_gaps', arguments: '{not json' } }] } }],
      })
      .mockResolvedValueOnce({ choices: [{ message: { content: 'Let me rephrase.' } }] })
    const { db } = makeDb(sessionRow(state))
    const result = await handleIntakeTurn({ db, user: OWNER, sessionId: 'sess-1', content: 'hi' }, { ...ids, llm })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state.phase).toBe('GAP_ANALYSIS') // unchanged by the bad call
  })

  it('an LLM failure mid-turn falls back to the deterministic interviewer', async () => {
    const llm = vi.fn().mockRejectedValue(new Error('model down'))
    const { db } = makeDb(sessionRow(analyzedState()))
    const result = await handleIntakeTurn({ db, user: OWNER, sessionId: 'sess-1', content: 'hi' }, { ...ids, llm })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.message.length).toBeGreaterThan(0)
    expect(result.state.phase).toBe('INTERVIEW')
  })

  it('a legitimate handoff (no blocking gaps) succeeds and surfaces the draft_summary + handoff cards', async () => {
    // Resolve the blocking gap first through the machine.
    let state = analyzedState()
    const answered = applyIntakeAction(state, {
      type: 'RECORD_ANSWERS',
      answers: [{ gapId: 'offer:services-1:price', answer: '$250', fields: [{ target: 'offer', offerKey: 'services-1', field: 'price', value: '$250' }] }],
    })
    if (answered.ok) state = answered.state
    const llm = vi.fn().mockResolvedValueOnce({
      choices: [{ message: { content: null, tool_calls: [toolCall('request_handoff', { summary: 'Two offers, priced — review in the builder.' })] } }],
    })
    const { db } = makeDb(sessionRow(state))
    const result = await handleIntakeTurn({ db, user: OWNER, sessionId: 'sess-1', content: 'looks good' }, { ...ids, llm })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state.phase).toBe('REVIEW_HANDOFF')
    expect(result.cards.some((c) => c.type === 'draft_summary')).toBe(true)
    expect(result.cards.some((c) => c.type === 'handoff' && c.via === 'agent')).toBe(true)
    expect(result.message).toContain('review in the builder')
    expect(llm).toHaveBeenCalledTimes(1) // handoff ends the loop's usefulness; no repair round needed
  })
})

describe('commitIntakeSession — materialization (spec §10)', () => {
  /** Rich offers exercising every roundtrip-sensitive field. */
  const richOffers: OfferItem[] = [
    {
      name: 'Event Catering',
      description: 'Full service',
      price: '$1,200',
      url: 'https://apex.example/book',
      duration: '4 hours',
      serviceArea: 'Austin metro',
      travelFee: '$50',
      isMobile: true,
      offerType: 'negotiable',
      rules: { minPrice: '$900', minNoticeHours: 48 },
      tiers: [{ name: 'Basic', price: '$800' }],
    },
    { name: 'Drop-off Trays', description: 'Delivered trays', price: '$250', url: '' },
  ]

  function committableState(): IntakeState {
    let state = analyzedState()
    for (const [i, offer] of richOffers.entries()) {
      const applied = applyIntakeAction(state, {
        type: 'RECORD_ANSWERS',
        answers: [
          {
            gapId: `volunteered:offer-${i}`,
            answer: 'offer details',
            fields: [{ target: 'new_offer', kind: 'services', offer }],
          },
        ],
      })
      if (applied.ok) state = applied.state
    }
    return state
  }

  function makeAdmin(takenSlugs: string[], inserted: any[]) {
    return createSupabaseMock((ctx) => {
      if (ctx.table === 'pages' && ctx.op === 'select') {
        return { data: takenSlugs.includes(ctx.eqs.slug) ? { id: 'taken' } : null }
      }
      if (ctx.table === 'pages' && ctx.op === 'insert') {
        inserted.push(ctx.payload)
        return { data: { id: 'page-new', slug: ctx.payload.slug } }
      }
      return { data: null }
    }) as any
  }

  it('creates a NEW page owned by the caller, as a draft, with a unique slug', async () => {
    const state = committableState()
    const { db, captured } = makeDb(sessionRow(state))
    const inserted: any[] = []
    const admin = makeAdmin(['apex-catering-co'], inserted) // base slug taken → -2
    const result = await commitIntakeSession({ db, admin, user: OWNER, sessionId: 'sess-1' }, { now: () => new Date(T0) })
    expect(result).toMatchObject({ ok: true, pageId: 'page-new', slug: 'apex-catering-co-2', alreadyCommitted: false })
    expect(inserted).toHaveLength(1)
    expect(inserted[0]).toMatchObject({ owner_id: OWNER.id, is_published: false, name: 'Apex Catering Co.', industry: 'Catering' })
    // the session is closed and linked
    expect(captured.sessions[0]).toMatchObject({ status: 'handed_off', page_id: 'page-new' })
    expect(captured.sessions[0].state.phase).toBe('REVIEW_HANDOFF')
    expect(captured.sessions[0].state.handoff.via).toBe('owner_exit') // commit before agent handoff = the owner exit
  })

  it('serializes offers losslessly — the formatOfferLines/parseOfferLines roundtrip holds for every field', async () => {
    const state = committableState()
    const { db } = makeDb(sessionRow(state))
    const inserted: any[] = []
    const result = await commitIntakeSession({ db, admin: makeAdmin([], inserted), user: OWNER, sessionId: 'sess-1' })
    expect(result.ok).toBe(true)
    const services = inserted[0].services as OfferItem[]
    const roundtripped = parseOfferLines(formatOfferLines(services))
    expect(roundtripped).toHaveLength(services.length)
    for (const [i, original] of services.entries()) {
      const back = roundtripped[i]
      expect(back.name).toBe(original.name)
      expect(back.price).toBe(original.price)
      expect(back.description).toBe(original.description)
      expect(back.url).toBe(original.url)
      expect(back.duration).toBe(original.duration)
      expect(back.serviceArea).toBe(original.serviceArea)
      expect(back.travelFee).toBe(original.travelFee)
      expect(Boolean(back.isMobile)).toBe(Boolean(original.isMobile))
      expect(back.offerType).toBe(original.offerType)
      expect(back.rules).toEqual(original.rules)
      expect(back.tiers).toEqual(original.tiers)
    }
  })

  it('re-interview stages onto pages.draft and never touches live columns', async () => {
    const state = committableState()
    const { db, captured } = makeDb(sessionRow(state, { page_id: 'page-existing' }))
    const result = await commitIntakeSession({ db, admin: makeAdmin([], []), user: OWNER, sessionId: 'sess-1' }, { now: () => new Date(T0) })
    expect(result).toMatchObject({ ok: true, pageId: 'page-existing' })
    expect(captured.pages).toHaveLength(1)
    const patch = captured.pages[0]
    expect(patch.draft).toBeTruthy()
    expect(patch.draft.services.length).toBeGreaterThan(0)
    // live columns stay untouched — publishing is the builder's job
    expect(patch.name).toBeUndefined()
    expect(patch.services).toBeUndefined()
    expect(patch.is_published).toBeUndefined()
  })

  it('is idempotent — a committed session replays to the same page id', async () => {
    const { db } = makeDb(sessionRow(committableState(), { status: 'handed_off', page_id: 'page-done' }))
    const result = await commitIntakeSession({ db, admin: makeAdmin([], []), user: OWNER, sessionId: 'sess-1' })
    expect(result).toMatchObject({ ok: true, pageId: 'page-done', alreadyCommitted: true })
  })

  it('404s for a session the caller does not own', async () => {
    const { db } = makeDb(null)
    const result = await commitIntakeSession({ db, admin: makeAdmin([], []), user: OWNER, sessionId: 'sess-1' })
    expect(result).toMatchObject({ ok: false, status: 404 })
  })
})

describe('helpers', () => {
  it('importResultToExtraction trims the importer result into the stored shape', () => {
    const extraction = importResultToExtraction('src-9', {
      title: 'Biz',
      description: 'Desc',
      website_url: 'https://b.example',
      structuredOffers: [{ name: 'A', description: '', price: '$1', url: '', confidence: 0.9 }],
      servicesText: 'A | $1 |  | ',
      faqs: [{ question: 'Q', answer: 'A' }],
      industry: 'Plumbing',
      audience: null,
      location: 'Austin',
      cta_label: 'Book',
      cta_url: 'https://b.example/book',
      clarifyingQuestions: [{ id: 'q1', field: 'audience', question: '?', why: 'w' }],
      confidence: 0.8,
      aiStatus: { configured: false, attempted: false, used: false, status: 'deterministic', provider: '', model: '', reason: '' },
      pagesAnalyzed: 3,
    })
    expect(extraction).toMatchObject({
      sourceId: 'src-9',
      title: 'Biz',
      industry: 'Plumbing',
      confidence: 0.8,
    })
    expect(extraction.offers).toHaveLength(1)
    expect(extraction.clarifyingQuestions).toHaveLength(1)
  })

  it('draftReadiness runs the platform rubric over the working draft', () => {
    const empty = createIntakeState().draft
    expect(draftReadiness(empty)).toBe(0)
    const state = analyzedState()
    expect(draftReadiness(state.draft)).toBeGreaterThan(0)
  })
})
