import { describe, it, expect } from 'vitest'
import { parseBuyerIdentity, buyerMetadata, hasBuyerIdentity } from '../buyer-identity'

describe('parseBuyerIdentity', () => {
  it('accepts + lowercases a valid email and trims fields (spaces/hyphens preserved)', () => {
    const b = parseBuyerIdentity({
      buyerEmail: '  Buyer@Example.COM ',
      buyerName: '  Jean-Luc Picard ',
      buyerReference: 'ORDER-42',
      buyerAgent: 'acme-agent/1.0',
    })
    expect(b.email).toBe('buyer@example.com')
    expect(b.name).toBe('Jean-Luc Picard')
    expect(b.reference).toBe('ORDER-42')
    expect(b.agent).toBe('acme-agent/1.0')
  })

  it('rejects a malformed email (null) and ignores non-strings', () => {
    expect(parseBuyerIdentity({ buyerEmail: 'not-an-email' }).email).toBeNull()
    expect(parseBuyerIdentity({ buyerEmail: 'a@b' }).email).toBeNull()
    expect(parseBuyerIdentity({ buyerEmail: 42 }).email).toBeNull()
  })

  it('strips control chars / newlines (metadata + line injection guard)', () => {
    const b = parseBuyerIdentity({ buyerName: 'Acme\nInc\t', buyerReference: 'refx' })
    expect(b.name).toBe('AcmeInc')
    expect(b.reference).toBe('refx')
  })

  it('caps lengths', () => {
    const long = 'a'.repeat(500)
    expect(parseBuyerIdentity({ buyerName: long }).name?.length).toBe(200)
    expect(parseBuyerIdentity({ buyerAgent: long }).agent?.length).toBe(120)
  })

  it('returns all-null for empty input', () => {
    const b = parseBuyerIdentity({})
    expect(b).toEqual({ email: null, name: null, reference: null, agent: null })
    expect(hasBuyerIdentity(b)).toBe(false)
  })
})

describe('buyerMetadata', () => {
  it('includes only present fields with the nexez_buyer_ prefix', () => {
    expect(buyerMetadata({ email: 'b@x.com', name: null, reference: 'r1', agent: null })).toEqual({
      nexez_buyer_email: 'b@x.com',
      nexez_buyer_reference: 'r1',
    })
    expect(buyerMetadata({ email: null, name: null, reference: null, agent: null })).toEqual({})
  })
})
