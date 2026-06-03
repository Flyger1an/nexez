import { describe, expect, it } from 'vitest'
import {
  hasBranding,
  normalizeBranding,
  sanitizeAccentColor,
  sanitizeLogoUrl,
} from '../branding'

describe('sanitizeAccentColor', () => {
  it('accepts 3- and 6-digit hex', () => {
    expect(sanitizeAccentColor('#fff')).toBe('#fff')
    expect(sanitizeAccentColor('#7C3AED')).toBe('#7C3AED')
  })
  it('rejects anything that could break out of an inline style', () => {
    expect(sanitizeAccentColor('red')).toBeNull()
    expect(sanitizeAccentColor('#fff; background: url(x)')).toBeNull()
    expect(sanitizeAccentColor('rgb(0,0,0)')).toBeNull()
    expect(sanitizeAccentColor(123)).toBeNull()
    expect(sanitizeAccentColor(null)).toBeNull()
  })
})

describe('sanitizeLogoUrl', () => {
  it('accepts http(s) URLs', () => {
    expect(sanitizeLogoUrl('https://acme.com/logo.svg')).toBe('https://acme.com/logo.svg')
    expect(sanitizeLogoUrl('http://acme.com/logo.png')).toBe('http://acme.com/logo.png')
  })
  it('rejects dangerous / non-absolute URLs', () => {
    expect(sanitizeLogoUrl('javascript:alert(1)')).toBeNull()
    expect(sanitizeLogoUrl('data:image/svg+xml,...')).toBeNull()
    expect(sanitizeLogoUrl('/relative.png')).toBeNull()
    expect(sanitizeLogoUrl('')).toBeNull()
    expect(sanitizeLogoUrl(42)).toBeNull()
  })
})

describe('normalizeBranding', () => {
  it('produces a fully sanitized shape', () => {
    expect(
      normalizeBranding({
        brand_name: '  Acme  ',
        accent_color: '#abc',
        logo_url: 'https://acme.com/l.svg',
        hide_nexez_badge: true,
      }),
    ).toEqual({
      brand_name: 'Acme',
      accent_color: '#abc',
      logo_url: 'https://acme.com/l.svg',
      hide_nexez_badge: true,
    })
  })

  it('drops invalid values and defaults the flag to false', () => {
    expect(normalizeBranding({ accent_color: 'red', logo_url: 'javascript:x', hide_nexez_badge: 'yes' })).toEqual({
      brand_name: null,
      accent_color: null,
      logo_url: null,
      hide_nexez_badge: false,
    })
  })

  it('handles non-object input', () => {
    expect(normalizeBranding(null)).toEqual({
      brand_name: null,
      accent_color: null,
      logo_url: null,
      hide_nexez_badge: false,
    })
  })
})

describe('hasBranding', () => {
  it('is false for empty branding, true when anything is set', () => {
    expect(hasBranding(normalizeBranding({}))).toBe(false)
    expect(hasBranding(normalizeBranding({ brand_name: 'Acme' }))).toBe(true)
    expect(hasBranding(normalizeBranding({ hide_nexez_badge: true }))).toBe(true)
  })
})
