import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * Copy guard for the public scan results.
 *
 * These strings are the first thing a merchant reads about their own website,
 * on the homepage hero panel and on /scan. They are written for someone who
 * runs a party rental company, not someone who knows what JSON-LD is, and they
 * state the next action rather than the missing artifact.
 *
 * Asserted against the source text (same approach as homepage-story.test.ts)
 * so no scan fixture is needed to lock the wording.
 */
const source = readFileSync(new URL('./crawlability.ts', import.meta.url), 'utf8')
const body = source.split('export function evaluateCrawlability')[1] ?? ''

/** Quoted literals inside the checks, minus the code-ish ones (ids, statuses). */
const copyStrings = [...body.matchAll(/'([^'\\]*)'/g)]
  .map((m) => m[1])
  .filter((s) => s.length > 3 && !/^[a-z_.]+$/.test(s))

describe('scan result copy', () => {
  it('has strings to check', () => {
    expect(body).not.toHaveLength(0)
    expect(copyStrings.length).toBeGreaterThan(20)
  })

  it('never opens a finding with what is missing', () => {
    // "No JSON-LD found" told a merchant they had failed at something they had
    // never heard of. Every finding now names the next action instead.
    const negative = copyStrings.filter((s) => /^No\b/.test(s))
    expect(negative).toEqual([])
  })

  it('keeps developer vocabulary out of merchant-facing findings', () => {
    const banned = /JSON-LD|machine-readable|\bschema\b|Organization|semantic|transport|manifest|endpoint/i
    const offenders = copyStrings.filter((s) => banned.test(s))
    expect(offenders).toEqual([])
  })

  it('labels the buying dimension in plain words', () => {
    // "Transactability" is the one word on the scan panel a merchant would have
    // to look up. HeroScan also maps it defensively; this fixes it at source.
    expect(source).toContain("transactability: 'Ways to buy'")
    expect(source).not.toContain("transactability: 'Transactability'")
  })

  it('keeps the word out of the surfaces that render a scan', () => {
    // The dimension name is also spelled out in prose on both panels, which is
    // how it survived the first pass here.
    // `transactability:` as an object key is a DimensionKey, not copy, so only
    // the rendered prose and the quoted label are checked.
    for (const url of ['../components/home/HeroScan.tsx', '../app/scan/ScanClient.tsx']) {
      const surface = readFileSync(new URL(url, import.meta.url), 'utf8')
      expect(surface).not.toContain('understanding, transactability')
      expect(surface).not.toContain("'Transactability'")
      expect(surface).toContain('ways to buy, and trust.')
    }
  })

  it('states an action on the failing branch of each check', () => {
    for (const phrase of [
      'Add a guide that lists your offers and how to buy them',
      'Add an /llms.txt summary of your business and offers',
      'Add details assistants can read, like your name, offers, and prices',
      'Add your business name, location, and contact details',
      'List your products or services with names and prices',
      'Add a price to each offer',
      'Add a way to buy, book, or request a quote',
      'Say when you are available or how long delivery takes',
      'Say what each offer includes',
      'Add a link that takes buyers straight to the next step',
      'Switch your site to a secure connection',
      'Add a way for buyers to reach you',
      'Add your terms, privacy, or refund policy',
      'Show when your pages were last updated',
    ]) {
      expect(source).toContain(phrase)
    }
  })

  it('keeps the scoring contract untouched by copy edits', () => {
    // Scores are persisted and compared over time. Copy passes must never move
    // a threshold or drop a check.
    expect(source).toContain('version: 2')
    expect((body.match(/add\(\{/g) ?? []).length).toBe(18)
    for (const id of [
      'reachable', 'speed', 'robots', 'agent_docs', 'llms_txt', 'semantics',
      'jsonld', 'business_identity', 'offer_schema', 'pricing', 'action_path',
      'availability', 'offer_details', 'structured_action', 'https', 'contact',
      'policies', 'freshness',
    ]) {
      expect(body).toContain(`id: '${id}'`)
    }
  })
})
