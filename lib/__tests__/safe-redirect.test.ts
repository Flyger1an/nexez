import { describe, it, expect } from 'vitest'
import { safeNextPath } from '../safe-redirect'

describe('safeNextPath', () => {
  it('passes through same-origin absolute paths', () => {
    expect(safeNextPath('/dashboard')).toBe('/dashboard')
    expect(safeNextPath('/dashboard/negotiations?id=1&token=x')).toBe('/dashboard/negotiations?id=1&token=x')
    expect(safeNextPath('/')).toBe('/')
    expect(safeNextPath('/a/b/c#frag')).toBe('/a/b/c#frag')
  })

  it('rejects absolute external URLs', () => {
    expect(safeNextPath('https://evil.example/pwn')).toBe('/dashboard')
    expect(safeNextPath('http://evil.example')).toBe('/dashboard')
    expect(safeNextPath('javascript:alert(1)')).toBe('/dashboard')
    expect(safeNextPath('mailto:a@b.c')).toBe('/dashboard')
  })

  it('rejects protocol-relative forms a browser treats as a host', () => {
    expect(safeNextPath('//evil.example/pwn')).toBe('/dashboard')
    expect(safeNextPath('/\\evil.example')).toBe('/dashboard')
  })

  it('rejects empty / nullish input', () => {
    expect(safeNextPath('')).toBe('/dashboard')
    expect(safeNextPath(null)).toBe('/dashboard')
    expect(safeNextPath(undefined)).toBe('/dashboard')
  })

  it('honors a custom fallback', () => {
    expect(safeNextPath('https://evil.example', '/login')).toBe('/login')
    expect(safeNextPath(null, '/')).toBe('/')
  })

  it('allows a backslash later in an otherwise same-origin path', () => {
    // Only the protocol-relative prefix is dangerous; an interior backslash stays same-origin.
    expect(safeNextPath('/foo\\bar')).toBe('/foo\\bar')
  })

  it('rejects control-char injection the WHATWG URL parser would strip into a host', () => {
    // The URL parser SILENTLY removes tab/newline/CR mid-string, so `/<tab>/evil`
    // resolves to protocol-relative `//evil`. Guard must reject before that sink.
    const TAB = String.fromCharCode(0x09)
    const LF = String.fromCharCode(0x0a)
    const CR = String.fromCharCode(0x0d)
    const BSLASH = String.fromCharCode(0x5c)
    for (const ctrl of [TAB, LF, CR]) {
      expect(safeNextPath('/' + ctrl + '/evil.example')).toBe('/dashboard')
      expect(safeNextPath('/' + ctrl + BSLASH + 'evil.example')).toBe('/dashboard')
    }
    // Regression proof: the guarded result must never resolve cross-origin.
    const malicious = '/' + TAB + '/evil.example'
    expect(new URL(malicious, 'https://app.nexez.ai').origin).toBe('https://evil.example') // parser strips the tab
    expect(new URL(safeNextPath(malicious), 'https://app.nexez.ai').origin).toBe('https://app.nexez.ai') // ...but the guard neutralizes it
  })
})
