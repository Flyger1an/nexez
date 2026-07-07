// A/B variant serving (Phase 6).
//
// Offers that share an `ab_test` id are variants of one experiment. The public
// page serves a SINGLE variant per visitor - chosen by a sticky bucket cookie -
// so the comparison is unbiased (vs. simply showing both, which is not a test).
// Conversions and impressions are attributed per variant via checkout_events
// metadata, and rolled up here for the analytics dashboard.

import type { OfferItem } from './agent-page'
import type { CheckoutEvent } from './checkout-events'
import { conversionEventTypes, isDryRunEvent } from './analytics'

export const AB_BUCKET_COOKIE = 'nx_ab'
export const AB_BUCKET_MAX = 1000

/** Parse a raw cookie value into a bucket in [0, AB_BUCKET_MAX); 0 on garbage. */
export function parseBucket(raw: string | null | undefined): number {
  if (!raw) return 0
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n) || n < 0) return 0
  return n % AB_BUCKET_MAX
}

/** A fresh random bucket for a first-time visitor. */
export function randomBucket(): number {
  return Math.floor(Math.random() * AB_BUCKET_MAX)
}

/**
 * Group offers into active A/B tests.
 * Returns testId -> ascending member indices. Only tests with >= 2 members
 * (i.e. an actual experiment) are included.
 */
export function getActiveTests(offers: OfferItem[] | null | undefined): Map<string, number[]> {
  const groups = new Map<string, number[]>()
  ;(offers ?? []).forEach((offer, index) => {
    const test = offer.ab_test
    if (!test) return
    const list = groups.get(test) ?? []
    list.push(index)
    groups.set(test, list)
  })
  for (const [test, indices] of groups) {
    if (indices.length < 2) groups.delete(test)
    else indices.sort((a, b) => a - b)
  }
  return groups
}

/** Deterministically pick the served member index for a test, given a bucket. */
export function servedIndexForTest(memberIndices: number[], bucket: number): number {
  if (memberIndices.length === 0) return -1
  return memberIndices[bucket % memberIndices.length]
}

/**
 * Indices to HIDE on the human-facing page for a given visitor bucket: every
 * test member except the one served. Non-test offers are never hidden.
 */
export function hiddenVariantIndices(offers: OfferItem[] | null | undefined, bucket: number): Set<number> {
  const hidden = new Set<number>()
  for (const indices of getActiveTests(offers).values()) {
    const served = servedIndexForTest(indices, bucket)
    for (const i of indices) {
      if (i !== served) hidden.add(i)
    }
  }
  return hidden
}

/**
 * Canonical hidden indices for stable agent contracts (agent.json etc.): keep
 * only the first member of each test, dedupe the rest. Deterministic, no bucket.
 */
export function canonicalHiddenIndices(offers: OfferItem[] | null | undefined): Set<number> {
  const hidden = new Set<number>()
  for (const indices of getActiveTests(offers).values()) {
    for (let i = 1; i < indices.length; i++) hidden.add(indices[i])
  }
  return hidden
}

/** The served variants (with index) for a bucket - used to log impressions. */
export function servedVariants(
  offers: OfferItem[] | null | undefined,
  bucket: number,
): Array<{ index: number; ab_test: string; ab_label: string }> {
  const served: Array<{ index: number; ab_test: string; ab_label: string }> = []
  for (const [test, indices] of getActiveTests(offers)) {
    const idx = servedIndexForTest(indices, bucket)
    const offer = (offers ?? [])[idx]
    if (offer) served.push({ index: idx, ab_test: test, ab_label: offer.ab_label || '' })
  }
  return served
}

export const AB_IMPRESSION_EVENT = 'ab_impression' as const

export type AbVariantResult = {
  label: string
  offerName: string
  impressions: number
  conversions: number
  rate: number // conversions / impressions, 0 when no impressions
}

export type AbTestResult = {
  test: string
  slug: string | null
  variants: AbVariantResult[]
  winnerLabel: string | null // highest rate among variants with impressions; null if undecidable
}

/**
 * Roll up A/B impression + conversion events into per-test, per-variant results.
 * - impressions: `ab_impression` events tagged with the variant
 * - conversions: real conversion events (provider_redirect / stripe_session_created)
 *   tagged with the variant, excluding dry-run simulator traffic.
 */
export function rollupAbResults(events: CheckoutEvent[]): AbTestResult[] {
  type Acc = { offerName: string; impressions: number; conversions: number }
  const tests = new Map<string, { slug: string | null; variants: Map<string, Acc> }>()

  for (const event of events) {
    const meta = (event.metadata ?? {}) as Record<string, unknown>
    const test = typeof meta.ab_test === 'string' ? meta.ab_test : null
    if (!test) continue
    const label = typeof meta.ab_label === 'string' && meta.ab_label ? meta.ab_label : '-'

    const entry = tests.get(test) ?? { slug: event.slug ?? null, variants: new Map<string, Acc>() }
    const variant = entry.variants.get(label) ?? { offerName: event.offer_name || '', impressions: 0, conversions: 0 }
    if (!variant.offerName && event.offer_name) variant.offerName = event.offer_name

    if (event.event_type === AB_IMPRESSION_EVENT) {
      variant.impressions += 1
    } else if (!isDryRunEvent(event) && conversionEventTypes.includes(event.event_type)) {
      variant.conversions += 1
    } else {
      // Not an impression or a counted conversion - skip (but keep variant if seen).
      entry.variants.set(label, variant)
      tests.set(test, entry)
      continue
    }

    entry.variants.set(label, variant)
    tests.set(test, entry)
  }

  const results: AbTestResult[] = []
  for (const [test, entry] of tests) {
    const variants: AbVariantResult[] = [...entry.variants.entries()]
      .map(([label, acc]) => ({
        label,
        offerName: acc.offerName,
        impressions: acc.impressions,
        conversions: acc.conversions,
        rate: acc.impressions > 0 ? acc.conversions / acc.impressions : 0,
      }))
      .sort((a, b) => a.label.localeCompare(b.label))

    const withImpressions = variants.filter((v) => v.impressions > 0)
    let winnerLabel: string | null = null
    if (withImpressions.length >= 2) {
      const top = [...withImpressions].sort((a, b) => b.rate - a.rate)
      if (top[0].rate > top[1].rate) winnerLabel = top[0].label
    }

    results.push({ test, slug: entry.slug, variants, winnerLabel })
  }

  // Most active tests first.
  return results.sort((a, b) => {
    const aTotal = a.variants.reduce((s, v) => s + v.impressions + v.conversions, 0)
    const bTotal = b.variants.reduce((s, v) => s + v.impressions + v.conversions, 0)
    return bTotal - aTotal
  })
}
