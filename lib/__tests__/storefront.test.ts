import { describe, it, expect } from 'vitest'
import { normalizeHandle, isValidHandle, HANDLE_MAX } from '../storefront'

describe('normalizeHandle', () => {
  it('lowercases + collapses non-alphanumerics to single hyphens', () => {
    expect(normalizeHandle('My Storefront!')).toBe('my-storefront')
    expect(normalizeHandle('UPPER CASE')).toBe('upper-case')
    expect(normalizeHandle('a/b__c..d')).toBe('a-b-c-d')
  })

  it('trims leading/trailing/doubled hyphens', () => {
    expect(normalizeHandle('  --Foo__Bar--  ')).toBe('foo-bar')
    expect(normalizeHandle('---')).toBe('')
  })

  it('keeps already-clean handles + single chars', () => {
    expect(normalizeHandle('kismetpros')).toBe('kismetpros')
    expect(normalizeHandle('a')).toBe('a')
  })

  it('caps at HANDLE_MAX with no trailing hyphen', () => {
    const out = normalizeHandle('x'.repeat(80))
    expect(out.length).toBe(HANDLE_MAX)
    expect(out.endsWith('-')).toBe(false)
  })

  it('returns empty for unusable / non-string input', () => {
    expect(normalizeHandle('   ')).toBe('')
    expect(normalizeHandle(42 as unknown as string)).toBe('')
  })
})

describe('isValidHandle', () => {
  it('accepts canonical handles, rejects the rest', () => {
    expect(isValidHandle('kismetpros')).toBe(true)
    expect(isValidHandle('a-b-c')).toBe(true)
    expect(isValidHandle('Foo')).toBe(false) // uppercase
    expect(isValidHandle('-foo')).toBe(false) // leading hyphen
    expect(isValidHandle('')).toBe(false)
  })
})
