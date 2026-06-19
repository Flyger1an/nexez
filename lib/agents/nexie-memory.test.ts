import { describe, it, expect } from 'vitest'
import { extractMemorySignals, mergeMemorySignals } from './nexie-memory'

describe('extractMemorySignals — budget (high precision; ceiling cue required)', () => {
  it('captures a budget only when an explicit ceiling cue precedes the amount', () => {
    expect(extractMemorySignals('keep it under $500').budgetObserved).toBe(500)
    expect(extractMemorySignals('my budget is $1,200 total').budgetObserved).toBe(1200)
    expect(extractMemorySignals('up to 2k please').budgetObserved).toBe(2000)
    expect(extractMemorySignals('no more than $99.50').budgetObserved).toBe(100)
  })

  it('does NOT mis-learn a stray dollar amount with no cue', () => {
    expect(extractMemorySignals('I made $5000 last year').budgetObserved).toBeNull()
    expect(extractMemorySignals('the spa costs $300').budgetObserved).toBeNull()
    expect(extractMemorySignals('find me a cleaner').budgetObserved).toBeNull()
  })

  it('picks the cued amount, not the largest number in the message', () => {
    expect(extractMemorySignals('I spent $5000 before but my budget is under $300').budgetObserved).toBe(300)
  })
})

describe('extractMemorySignals — timing + interest', () => {
  it('maps timing keywords', () => {
    expect(extractMemorySignals('I need this asap').timingObserved).toBe('asap')
    expect(extractMemorySignals('sometime next week is fine').timingObserved).toBe('this_week')
    expect(extractMemorySignals('no rush, whenever').timingObserved).toBe('flexible')
    expect(extractMemorySignals('just looking around').timingObserved).toBeNull()
  })

  it('returns a cleaned interest phrase (capped)', () => {
    expect(extractMemorySignals('  Find a WEB design expert!! ').interest).toBe('find a web design expert')
    expect(extractMemorySignals('   ').interest).toBeNull()
  })
})

describe('mergeMemorySignals', () => {
  const now = '2026-06-19T00:00:00.000Z'

  it('dedupes + caps interests and records last_intent/tools/updated_at', () => {
    const out = mergeMemorySignals({ interests: ['old'] }, extractMemorySignals('find a cleaner'), 'find a cleaner', ['search_pages'], now)
    expect(out.interests).toEqual(['find a cleaner', 'old'])
    expect(out.last_intent).toBe('find a cleaner')
    expect(out.last_tools).toEqual(['search_pages'])
    expect(out.updated_at).toBe(now)
  })

  it('writes budget/timing only when present — never clobbers a prior value with null', () => {
    const withBudget = mergeMemorySignals({}, extractMemorySignals('under $400'), 'under $400', [], now)
    expect(withBudget.budget_observed).toBe(400)
    // A later turn with no budget cue must NOT erase the learned budget.
    const noBudget = mergeMemorySignals(withBudget, extractMemorySignals('thanks!'), 'thanks!', [], now)
    expect(noBudget.budget_observed).toBe(400)
  })

  it('preserves unrelated memory keys (e.g. created_by)', () => {
    const out = mergeMemorySignals({ created_by: 'nexie_mvp' }, extractMemorySignals('hi'), 'hi', [], now)
    expect(out.created_by).toBe('nexie_mvp')
  })
})
