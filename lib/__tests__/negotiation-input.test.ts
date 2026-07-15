import { describe, it, expect } from 'vitest'
import { sanitizeBuyerInput } from '../negotiation-input'

describe('sanitizeBuyerInput', () => {
  it('passes normal input through unchanged (truncated=false)', () => {
    const r = sanitizeBuyerInput({ query: 'need a logo', budget: '$900', buyerAgent: 'Acme', requestedTerms: { scope: 'x' } })
    expect(r.truncated).toBe(false)
    expect(r.query).toBe('need a logo')
    expect(r.budget).toBe('$900')
    expect(r.buyerAgent).toBe('Acme')
    expect(r.requestedTerms).toEqual({ scope: 'x' })
  })

  it('truncates an oversized query and flags it', () => {
    const r = sanitizeBuyerInput({ query: 'a'.repeat(5000) })
    expect(r.truncated).toBe(true)
    expect(r.query!.length).toBeLessThanOrEqual(2000 + 20)
    expect(r.query!.endsWith('[truncated]')).toBe(true)
  })

  it('caps oversized requestedTerms by serialized size', () => {
    const r = sanitizeBuyerInput({ requestedTerms: { blob: 'x'.repeat(5000) } })
    expect(r.truncated).toBe(true)
    expect(r.requestedTerms).toEqual({ note: '<omitted: oversized requestedTerms>' })
  })

  it('fails closed when requestedTerms are too deeply nested to serialize', () => {
    let nested: Record<string, unknown> = {}
    for (let index = 0; index < 20_000; index += 1) nested = { next: nested }
    const r = sanitizeBuyerInput({ requestedTerms: nested })
    expect(r.truncated).toBe(true)
    expect(r.requestedTerms).toEqual({ note: '<omitted: invalid requestedTerms>' })
  })

  it('strips C0 control characters but preserves tab/newline', () => {
    // NUL + BEL injected between "hello" and the space; tab/newline must survive.
    const ctrl = 'hello' + String.fromCharCode(0, 7) + ' world' + String.fromCharCode(10) + 'line2' + String.fromCharCode(9) + 'tab'
    const r = sanitizeBuyerInput({ query: ctrl })
    expect(r.query).toBe('hello world\nline2\ttab')
    expect(r.truncated).toBe(false)
  })

  it('caps the per-field string limits (e.g. buyerAgent to 120)', () => {
    const r = sanitizeBuyerInput({ buyerAgent: 'A'.repeat(500) })
    expect(r.truncated).toBe(true)
    expect(r.buyerAgent!.startsWith('A'.repeat(120))).toBe(true)
    expect(r.buyerAgent!.endsWith('[truncated]')).toBe(true)
  })

  it('only returns fields that were provided', () => {
    const r = sanitizeBuyerInput({ query: 'x' })
    expect('budget' in r).toBe(false)
    expect('requestedTerms' in r).toBe(false)
    expect(r.query).toBe('x')
  })
})
