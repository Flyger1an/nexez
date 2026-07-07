import { describe, it, expect } from 'vitest'
import {
  getSourceAdapters,
  nexezAdapter,
  registerSourceAdapter,
  searchAllSources,
  type SourceAdapter,
  type SourceAdapterContext,
} from './source-adapters'
import type { AgentSearchResult } from '../agent-search'

function result(score: number, slug: string): AgentSearchResult {
  return {
    score,
    page: { name: slug, slug, url: `https://x/${slug}`, agent_json_url: '', description: null, audience: null, location: null, contact_email: null },
    offer: null,
  }
}

function stub(id: string, results: AgentSearchResult[], opts: { fail?: boolean } = {}): SourceAdapter {
  return {
    id,
    label: id,
    async search() {
      if (opts.fail) throw new Error(`${id} down`)
      return results
    },
  }
}

const ctx: SourceAdapterContext = { db: {} as never, baseUrl: 'https://nexez.app' }

describe('source adapters', () => {
  it('ships the nexez adapter by default', () => {
    expect(nexezAdapter.id).toBe('nexez')
    expect(typeof nexezAdapter.search).toBe('function')
    expect(getSourceAdapters().some((a) => a.id === 'nexez')).toBe(true)
  })

  it('merges results across sources, ranks by score desc, and caps to limit', async () => {
    const a = stub('a', [result(0.4, 'a1'), result(0.9, 'a2')])
    const b = stub('b', [result(0.7, 'b1')])
    const out = await searchAllSources('q', 2, ctx, {}, [a, b])
    expect(out.map((r) => r.page.slug)).toEqual(['a2', 'b1']) // 0.9, 0.7; the 0.4 falls past limit=2
  })

  it('isolates a single failing source (best-effort) and returns the rest', async () => {
    const ok = stub('ok', [result(0.5, 'ok1')])
    const bad = stub('bad', [], { fail: true })
    const out = await searchAllSources('q', 5, ctx, {}, [ok, bad])
    expect(out.map((r) => r.page.slug)).toEqual(['ok1'])
  })

  it('surfaces the error when EVERY source fails (so the deterministic fallback still triggers)', async () => {
    await expect(searchAllSources('q', 5, ctx, {}, [stub('bad', [], { fail: true })])).rejects.toThrow('bad down')
  })

  it('does NOT throw when the core source succeeds with zero results but another fails', async () => {
    const nexez = stub('nexez', []) // succeeded, just empty
    const bad = stub('bad', [], { fail: true })
    await expect(searchAllSources('q', 5, ctx, {}, [nexez, bad])).resolves.toEqual([])
  })

  it('stamps each result with its source for attribution', async () => {
    const out = await searchAllSources('q', 5, ctx, {}, [stub('yelp', [result(0.5, 'y1')])])
    expect(out[0].source).toEqual({ id: 'yelp', label: 'yelp' })
  })

  it('enabledIds filters external sources but always keeps the core nexez source', async () => {
    const nexez = stub('nexez', [result(0.5, 'n1')])
    const yelp = stub('yelp', [result(0.9, 'y1')])
    const google = stub('google_places', [result(0.8, 'g1')])
    const out = await searchAllSources('q', 5, ctx, { enabledIds: ['yelp'] }, [nexez, yelp, google])
    expect(out.map((r) => r.page.slug).sort()).toEqual(['n1', 'y1']) // nexez forced in, google excluded
  })

  it('ranks the core Nexez source above discovery sources regardless of score (transactable-first)', async () => {
    const nexez = stub('nexez', [result(0.2, 'n1')]) // low score, but bookable
    const web = stub('brave', [result(0.95, 'w1'), result(0.9, 'w2')]) // higher discovery scores
    const out = await searchAllSources('q', 5, ctx, {}, [nexez, web])
    expect(out.map((r) => r.page.slug)).toEqual(['n1', 'w1', 'w2']) // Nexez leads despite 0.2
  })

  it('discovery sources fill remaining slots only when Nexez has matches; take all when it has none', async () => {
    const web = stub('brave', [result(0.95, 'w1'), result(0.9, 'w2')])
    const out = await searchAllSources('q', 5, ctx, {}, [stub('nexez', []), web])
    expect(out.map((r) => r.page.slug)).toEqual(['w1', 'w2']) // Nexez empty → discovery fills
  })

  it('enabledIds: [] means Nexez only (explicit opt-out of all external sources)', async () => {
    const nexez = stub('nexez', [result(0.5, 'n1')])
    const yelp = stub('yelp', [result(0.9, 'y1')])
    const out = await searchAllSources('q', 5, ctx, { enabledIds: [] }, [nexez, yelp])
    expect(out.map((r) => r.page.slug)).toEqual(['n1'])
  })

  it('skips unavailable (unconfigured) sources', async () => {
    const off: SourceAdapter = { ...stub('yelp', [result(0.9, 'y1')]), available: () => false }
    const out = await searchAllSources('q', 5, ctx, {}, [stub('nexez', [result(0.5, 'n1')]), off])
    expect(out.map((r) => r.page.slug)).toEqual(['n1'])
  })

  it('register-by-config: a newly registered source joins the default fan-out - zero agent-loop change', async () => {
    registerSourceAdapter(stub('stub-source', [result(0.99, 'stub-hit')]))
    expect(getSourceAdapters().some((a) => a.id === 'stub-source')).toBe(true)
    // Exercise the DEFAULT registry (what the agent loop calls), but only over a sub-list
    // that excludes nexez (its search needs a live DB) - proving the stub participates.
    const out = await searchAllSources('q', 5, ctx, {}, getSourceAdapters().filter((a) => a.id !== 'nexez'))
    expect(out.some((r) => r.page.slug === 'stub-hit')).toBe(true)
  })
})
