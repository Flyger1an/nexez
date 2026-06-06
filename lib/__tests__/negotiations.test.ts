import { describe, expect, it } from 'vitest'
import {
  canTransitionNegotiation,
  formatNegotiationAmount,
  getAllowedNegotiationTransitions,
  getNegotiationStatusLabel,
  getNegotiationStatusTone,
  isMissingTableError,
  isTerminalNegotiationStatus,
  summarizeNegotiations,
} from '../negotiations'

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

describe('formatNegotiationAmount', () => {
  it('formats cents as currency', () => {
    expect(formatNegotiationAmount(12500, 'usd')).toBe('$125.00')
  })

  it('falls back when amount is unknown', () => {
    expect(formatNegotiationAmount(null)).toBe('Open / to be agreed')
    expect(formatNegotiationAmount(undefined)).toBe('Open / to be agreed')
  })
})
