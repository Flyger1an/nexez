import { describe, it, expect } from 'vitest'
import type { NextRequest } from 'next/server'
import { GET } from './route'

describe('GET /widget.js', () => {
  it('serves parseable JavaScript with no TypeScript-only casts (regression)', async () => {
    const res = await GET(new Request('https://nexez.app/widget.js') as unknown as NextRequest)
    expect(res.headers.get('content-type')).toContain('javascript')
    const js = await res.text()

    // The bug: TS casts inside the served string were a SyntaxError that broke the
    // whole IIFE, so Nexez.init never defined. These must NOT ship in the JS.
    expect(js).not.toMatch(/\bas\s+HTMLScriptElement\b/)
    expect(js).not.toMatch(/\bas\s+any\b/)

    // And the whole script must actually parse as JavaScript (compile-only; the IIFE
    // is not executed by new Function, so missing document/window doesn't matter).
    expect(() => new Function(js)).not.toThrow()

    // It still defines the public API + renders the button.
    expect(js).toContain('window.Nexez.init')
    expect(js).toContain('document.body.appendChild')
  })
})
