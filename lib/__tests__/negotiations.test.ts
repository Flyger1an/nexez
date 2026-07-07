import { describe, expect, it } from 'vitest'
import {
  canTransitionNegotiation,
  formatNegotiationAmount,
  formatRequestedTerms,
  getAllowedNegotiationTransitions,
  getNegotiationStatusLabel,
  getNegotiationStatusTone,
  humanizeTermKey,
  isMissingTableError,
  isTerminalNegotiationStatus,
  summarizeNegotiations,
} from '../negotiations'

describe('humanizeTermKey', () => {
  it('title-cases camelCase, snake_case, and kebab-case keys', () => {
    expect(humanizeTermKey('procurementMode')).toBe('Procurement mode')
    expect(humanizeTermKey('desiredSettlement')).toBe('Desired settlement')
    expect(humanizeTermKey('max_revisions')).toBe('Max revisions')
    expect(humanizeTermKey('delivery-window')).toBe('Delivery window')
    expect(humanizeTermKey('note')).toBe('Note')
  })
  it('handles numbers in keys and is resilient to odd input', () => {
    expect(humanizeTermKey('tier2Pricing')).toBe('Tier2 pricing')
    expect(humanizeTermKey('')).toBe('')
  })
})

describe('formatRequestedTerms', () => {
  it('renders the reported bug payload as readable rows (no raw JSON)', () => {
    expect(formatRequestedTerms({ procurementMode: 'qa-gauntlet', desiredSettlement: 'standard' })).toEqual([
      { label: 'Procurement mode', value: 'qa-gauntlet' },
      { label: 'Desired settlement', value: 'standard' },
    ])
  })
  it('formats primitives, arrays, and nested objects', () => {
    expect(formatRequestedTerms({ rush: true, quantity: 3, regions: ['us', 'eu'] })).toEqual([
      { label: 'Rush', value: 'true' },
      { label: 'Quantity', value: '3' },
      { label: 'Regions', value: 'us, eu' },
    ])
    expect(formatRequestedTerms({ scope: { included: 'logo', maxRevisions: 2 } })).toEqual([
      { label: 'Scope', value: 'Included: logo; Max revisions: 2' },
    ])
  })
  it('renders the non-JSON form fallback as a Note row', () => {
    expect(formatRequestedTerms({ note: 'just call me' })).toEqual([{ label: 'Note', value: 'just call me' }])
  })
  it('returns [] for null/empty terms', () => {
    expect(formatRequestedTerms(null)).toEqual([])
    expect(formatRequestedTerms({})).toEqual([])
    expect(formatRequestedTerms(undefined)).toEqual([])
    expect(formatRequestedTerms([])).toEqual([])
  })
  it('surfaces a top-level array or bare primitive under a single "Terms" row (no silent drop)', () => {
    expect(formatRequestedTerms(['rush', 'gift wrap'])).toEqual([{ label: 'Terms', value: 'rush, gift wrap' }])
    expect(formatRequestedTerms('call me')).toEqual([{ label: 'Terms', value: 'call me' }])
    expect(formatRequestedTerms(42)).toEqual([{ label: 'Terms', value: '42' }])
  })
  it('falls back to "Term" for blank/whitespace/punctuation-only keys', () => {
    expect(formatRequestedTerms({ '   ': 'x', '___': 'y' })).toEqual([
      { label: 'Term', value: 'x' },
      { label: 'Term', value: 'y' },
    ])
  })
  it('uses an em-dash for null/empty values rather than "null"', () => {
    expect(formatRequestedTerms({ budget: null, notes: '' })).toEqual([
      { label: 'Budget', value: '-' },
      { label: 'Notes', value: '-' },
    ])
  })
})

describe('isMissingTableError', () => {
  it('detects a not-yet-migrated table by code or message', () => {
    expect(isMissingTableError({ code: '42P01' })).toBe(true)
    expect(isMissingTableError({ code: 'PGRST205' })).toBe(true)
    expect(isMissingTableError({ message: 'relation "agent_negotiations" does not exist' })).toBe(true)
    expect(isMissingTableError({ message: "Could not find the table 'public.agent_negotiations' in the schema cache" })).toBe(true)
  })

  it('does not flag transient/unrelated errors or empty input', () => {
    expect(isMissingTableError({ code: '57014', message: 'canceling statement due to statement timeout' })).toBe(false)
    expect(isMissingTableError({ message: 'JWT expired' })).toBe(false)
    expect(isMissingTableError(null)).toBe(false)
    expect(isMissingTableError(undefined)).toBe(false)
  })
})

describe('negotiation status labels & tones', () => {
  it('labels every status', () => {
    expect(getNegotiationStatusLabel('negotiation')).toBe('New proposal')
    expect(getNegotiationStatusLabel('agreement_proposed')).toBe('Agreement proposed')
    expect(getNegotiationStatusLabel('complete')).toBe('Complete')
  })

  it('maps statuses to tones', () => {
    expect(getNegotiationStatusTone('negotiation')).toBe('open')
    expect(getNegotiationStatusTone('agreement_proposed')).toBe('progress')
    expect(getNegotiationStatusTone('held')).toBe('progress')
    expect(getNegotiationStatusTone('complete')).toBe('success')
    expect(getNegotiationStatusTone('declined')).toBe('muted')
    expect(getNegotiationStatusTone('expired')).toBe('muted')
  })

  it('identifies terminal statuses', () => {
    expect(isTerminalNegotiationStatus('complete')).toBe(true)
    expect(isTerminalNegotiationStatus('declined')).toBe(true)
    expect(isTerminalNegotiationStatus('expired')).toBe(true)
    expect(isTerminalNegotiationStatus('negotiation')).toBe(false)
    expect(isTerminalNegotiationStatus('held')).toBe(false)
  })
})

describe('allowed transitions', () => {
  it('new proposal can be progressed or declined', () => {
    expect(getAllowedNegotiationTransitions('negotiation')).toEqual([
      'agreement_proposed',
      'declined',
    ])
  })

  it('gates "held" behind escrow availability', () => {
    expect(getAllowedNegotiationTransitions('agreement_proposed', { escrowAvailable: false })).toEqual([
      'complete',
      'declined',
    ])
    expect(getAllowedNegotiationTransitions('agreement_proposed', { escrowAvailable: true })).toEqual([
      'held',
      'complete',
      'declined',
    ])
  })

  it('held can only complete or decline', () => {
    expect(getAllowedNegotiationTransitions('held')).toEqual(['complete', 'declined'])
  })

  it('terminal statuses allow no further transitions', () => {
    expect(getAllowedNegotiationTransitions('complete')).toEqual([])
    expect(getAllowedNegotiationTransitions('declined')).toEqual([])
    expect(getAllowedNegotiationTransitions('expired')).toEqual([])
  })

  it('canTransitionNegotiation respects the allowed set and escrow gating', () => {
    expect(canTransitionNegotiation('negotiation', 'agreement_proposed')).toBe(true)
    expect(canTransitionNegotiation('negotiation', 'complete')).toBe(false)
    expect(canTransitionNegotiation('agreement_proposed', 'held', { escrowAvailable: false })).toBe(false)
    expect(canTransitionNegotiation('agreement_proposed', 'held', { escrowAvailable: true })).toBe(true)
  })
})

describe('summarizeNegotiations', () => {
  it('counts by bucket', () => {
    const summary = summarizeNegotiations([
      { status: 'negotiation' },
      { status: 'negotiation' },
      { status: 'agreement_proposed' },
      { status: 'held' },
      { status: 'complete' },
      { status: 'declined' },
      { status: 'expired' },
    ])

    expect(summary).toEqual({
      total: 7,
      open: 2,
      proposed: 1,
      held: 1,
      complete: 1,
      declined: 2, // declined + expired
    })
  })

  it('handles an empty list', () => {
    expect(summarizeNegotiations([])).toEqual({
      total: 0,
      open: 0,
      proposed: 0,
      held: 0,
      complete: 0,
      declined: 0,
    })
  })
})

describe('refunded / disputed statuses (Burst 2)', () => {
  it('have labels and are terminal', () => {
    expect(getNegotiationStatusLabel('refunded')).toBe('Refunded')
    expect(getNegotiationStatusLabel('disputed')).toBe('Disputed (chargeback)')
    expect(isTerminalNegotiationStatus('refunded')).toBe(true)
    expect(isTerminalNegotiationStatus('disputed')).toBe(true)
  })

  it('are never offered as manual transition targets', () => {
    expect(getAllowedNegotiationTransitions('complete', { escrowAvailable: true })).toEqual([])
    expect(canTransitionNegotiation('complete', 'refunded', { escrowAvailable: true })).toBe(false)
    expect(getAllowedNegotiationTransitions('refunded')).toEqual([])
    expect(getAllowedNegotiationTransitions('disputed')).toEqual([])
  })

  it('count toward the terminal/closed bucket in the summary', () => {
    const s = summarizeNegotiations([{ status: 'refunded' }, { status: 'disputed' }, { status: 'declined' }])
    expect(s.total).toBe(3)
    expect(s.declined).toBe(3)
  })

  it('render with a muted tone', () => {
    expect(getNegotiationStatusTone('refunded')).toBe('muted')
    expect(getNegotiationStatusTone('disputed')).toBe('muted')
  })
})

describe('formatNegotiationAmount', () => {
  it('formats cents as currency', () => {
    expect(formatNegotiationAmount(12500, 'usd')).toBe('$125.00')
  })

  it('falls back when amount is unknown', () => {
    expect(formatNegotiationAmount(null)).toBe('Open / to be agreed')
    expect(formatNegotiationAmount(undefined)).toBe('Open / to be agreed')
  })
})
