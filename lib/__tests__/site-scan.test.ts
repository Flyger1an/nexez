import { describe, expect, it, vi, beforeEach } from 'vitest'

const safeFetch = vi.fn()
let importUrlError: string | null = null
let resolvedUrlError: string | null = null

vi.mock('../importer', () => ({
  safeFetch: (...a: unknown[]) => safeFetch(...a),
  getImportUrlError: () => importUrlError,
  getResolvedImportUrlError: async () => resolvedUrlError,
}))

import { gatherSiteSignals, normalizeScanUrl, readBodyCapped } from '../server/site-scan'

/** A ReadableStream that emits the given byte chunks (to exercise capped reads). */
function streamOf(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  let i = 0
  return new ReadableStream({
    pull(controller) {
      if (i < chunks.length) controller.enqueue(chunks[i++])
      else controller.close()
    },
  })
}
function bodyRes(chunks: Uint8Array[]): Response {
  return { ok: true, status: 200, body: streamOf(chunks) } as unknown as Response
}
const enc = (s: string) => new TextEncoder().encode(s)

describe('normalizeScanUrl', () => {
  it('prepends https for bare domains, rejects garbage', () => {
    expect(normalizeScanUrl('acme.com')).toBe('https://acme.com/')
    expect(normalizeScanUrl('https://x.io/p')).toBe('https://x.io/p')
    expect(normalizeScanUrl('')).toBeNull()
    expect(normalizeScanUrl('   ')).toBeNull()
  })
})

describe('readBodyCapped', () => {
  it('truncates at the byte cap across multiple chunks', async () => {
    const res = bodyRes([enc('aaaa'), enc('bbbb'), enc('cccc')]) // 12 bytes
    expect(await readBodyCapped(res, 6)).toBe('aaaabb')
  })
  it('returns the whole body when under the cap', async () => {
    expect(await readBodyCapped(bodyRes([enc('hello')]), 1024)).toBe('hello')
  })
  it('falls back to .text() when there is no stream body', async () => {
    const res = { ok: true, body: null, text: async () => 'plain-text-body' } as unknown as Response
    expect(await readBodyCapped(res, 1024)).toBe('plain-text-body')
  })
})

describe('gatherSiteSignals', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    importUrlError = null
    resolvedUrlError = null
  })

  it('rejects SSRF-guarded URLs with an error (no fetch attempted)', async () => {
    importUrlError = 'Blocked private host'
    const out = await gatherSiteSignals('http://169.254.169.254/')
    expect(out).toEqual({ error: 'Blocked private host' })
    expect(safeFetch).not.toHaveBeenCalled()
  })

  it('rejects DNS-resolved private IPs', async () => {
    resolvedUrlError = 'Resolves to a private IP'
    const out = await gatherSiteSignals('http://localtest.me/')
    expect('error' in out && out.error).toBe('Resolves to a private IP')
  })

  it('derives signals from the fetched page + probes', async () => {
    const pageHtml =
      '<html><head><title>x</title><meta name="description" content="d"><script type="application/ld+json">{}</script></head><body><h1>H</h1></body></html>'
    // The primary page HTML now streams through safeFetch → readBodyCapped (capped),
    // NOT the old uncapped fetchHtmlSafe. /agent.json JSON ok, /.well-known 404, /llms.txt ok.
    safeFetch.mockImplementation(async (u: string) => {
      if (u.endsWith('/agent.json') && !u.includes('.well-known')) return bodyRes([enc('{"ok":true}')])
      if (u.includes('/.well-known/agent.json')) return { ok: false, status: 404, body: null } as unknown as Response
      if (u.endsWith('/llms.txt')) return { ok: true, status: 200, body: null } as unknown as Response
      if (u.endsWith('/robots.txt')) return { ok: false, status: 404, body: null } as unknown as Response
      // Primary page: probe(url) reads ok/status; fetchCapped(url) reads the body.
      return bodyRes([enc(pageHtml)])
    })

    const out = await gatherSiteSignals('acme.com')
    expect('error' in out).toBe(false)
    if ('error' in out) return
    expect(out.origin).toBe('https://acme.com')
    expect(out.signals.hasJsonLd).toBe(true)
    expect(out.signals.hasTitle).toBe(true)
    expect(out.signals.hasH1).toBe(true)
    expect(out.signals.agentJsonOk).toBe(true)
    expect(out.signals.wellKnownAgentJsonOk).toBe(false)
    expect(out.signals.llmsTxtOk).toBe(true)
  })
})
