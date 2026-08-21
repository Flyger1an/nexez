import { describe, expect, it } from 'vitest'
import type { CommerceDemandSnapshot } from './commerce-demand'
import {
  buildCommerceLaunchCoveragePriorities,
  buildCommerceSupplyPriorities,
  commerceSupplyCatalog,
  type CommerceSupplyCatalog,
} from './commerce-supply-priority'

const catalog: CommerceSupplyCatalog = {
  activeTemplateIds: new Set(['events.private-chef', 'events.party-rentals']),
  canonicalCandidateIds: new Set([
    'events.private-chef',
    'events.party-rentals',
    'home.move-out-cleaning',
    'home.deep-cleaning',
    'automotive.interior-detail',
  ]),
  candidates: [
    candidate('events.private-chef', 'Private Chef', 'events-hospitality'),
    candidate('events.party-rentals', 'Party Rentals', 'events-hospitality'),
    candidate('home.move-out-cleaning', 'Move-Out Cleaning', 'home-property'),
    candidate('events.custom-celebration-cake', 'Custom Celebration Cake', 'events-hospitality'),
    candidate('home.deep-cleaning', 'Deep Cleaning', 'home-property', 'overlap-review'),
    candidate('automotive.interior-detail', 'Interior Detail', 'automotive-mobile', 'replacement-review'),
  ],
}

describe('Commerce supply priorities', () => {
  it('turns every active template into a unique launch-coverage priority without inventing demand', () => {
    const priorities = buildCommerceLaunchCoveragePriorities(catalog)

    expect(priorities.map((priority) => priority.referenceId).sort()).toEqual(
      [...catalog.activeTemplateIds].sort(),
    )
    expect(new Set(priorities.map((priority) => priority.referenceId)).size).toBe(priorities.length)
    expect(priorities).toEqual(expect.arrayContaining([
      expect.objectContaining({
        basis: 'launch-coverage',
        basisLabel: 'Launch coverage',
        observed: 0,
        live: 0,
        related: 0,
        reference: 0,
        unresolved: 0,
      }),
    ]))
  })

  it('keeps inactive and reference candidates out of the launch plan', () => {
    const ids = buildCommerceLaunchCoveragePriorities(catalog)
      .map((priority) => priority.referenceId)

    expect(ids).not.toContain('home.move-out-cleaning')
    expect(ids).not.toContain('events.custom-celebration-cake')
  })

  it('keeps the default launch plan exactly aligned with the active template registry', () => {
    const priorities = buildCommerceLaunchCoveragePriorities()

    expect(priorities.map((priority) => priority.referenceId).sort()).toEqual(
      [...commerceSupplyCatalog.activeTemplateIds].sort(),
    )
    expect(new Set(priorities.map((priority) => priority.referenceId)).size).toBe(priorities.length)
  })

  it('turns reference-only demand for an active template into exact-supply recruitment', () => {
    const priorities = buildCommerceSupplyPriorities(snapshot([
      demand('events.private-chef', 'Private Chef', 5, 0, 4, 1),
    ]), catalog)

    expect(priorities).toEqual([expect.objectContaining({
      referenceId: 'events.private-chef',
      lifecycle: 'active-template',
      action: 'recruit-exact-supply',
      actionLabel: 'Recruit exact supply',
      basis: 'observed-demand',
      unresolved: 4,
    })])
  })

  it('routes related-only demand to merchant verification rather than recruitment theater', () => {
    const priorities = buildCommerceSupplyPriorities(snapshot([
      demand('events.party-rentals', 'Party Rentals', 3, 2, 0, 1),
    ]), catalog)

    expect(priorities[0]).toMatchObject({
      lifecycle: 'active-template',
      action: 'verify-related-supply',
      actionLabel: 'Verify related supply',
      related: 2,
      reference: 0,
    })
  })

  it('requires category validation before recruiting against inactive or reference-only models', () => {
    const priorities = buildCommerceSupplyPriorities(snapshot([
      demand('home.move-out-cleaning', 'Move-Out Cleaning', 4, 0, 4, 0),
      demand('events.custom-celebration-cake', 'Custom Celebration Cake', 2, 0, 2, 0),
    ]), catalog)

    expect(priorities).toEqual([
      expect.objectContaining({
        referenceId: 'home.move-out-cleaning',
        lifecycle: 'curation-candidate',
        action: 'validate-and-recruit',
      }),
      expect.objectContaining({
        referenceId: 'events.custom-celebration-cake',
        lifecycle: 'reference-coverage',
        action: 'validate-and-recruit',
      }),
    ])
  })

  it('ranks transparently by unresolved volume and omits live-only or unknown categories', () => {
    const priorities = buildCommerceSupplyPriorities(snapshot([
      demand('events.private-chef', 'Private Chef', 7, 0, 3, 4),
      demand('events.party-rentals', 'Party Rentals', 9, 0, 0, 9),
      demand('unknown.category', 'Unknown Category', 10, 0, 10, 0),
    ]), catalog)

    expect(priorities.map((priority) => priority.referenceId)).toEqual([
      'events.private-chef',
    ])
    expect(priorities[0].rank).toBe(1)
  })

  it('routes overlap and replacement candidates to curation before recruitment', () => {
    const priorities = buildCommerceSupplyPriorities(snapshot([
      demand('home.deep-cleaning', 'Deep Cleaning', 3, 0, 3, 0),
      demand('automotive.interior-detail', 'Interior Detail', 2, 0, 2, 0),
    ]), catalog)

    expect(priorities).toEqual([
      expect.objectContaining({
        referenceId: 'home.deep-cleaning',
        action: 'resolve-category-overlap',
        actionLabel: 'Resolve category overlap',
      }),
      expect.objectContaining({
        referenceId: 'automotive.interior-detail',
        action: 'review-category-model',
        actionLabel: 'Review category model',
      }),
    ])
  })

  it('stays aligned with the versioned runtime and canonical catalogs', () => {
    const priorities = buildCommerceSupplyPriorities(snapshot([
      demand('events.private-chef', 'Private Chef', 4, 0, 4, 0),
      demand('home.deep-cleaning', 'Deep Cleaning', 3, 0, 3, 0),
      demand('automotive.interior-detail', 'Interior Detail', 2, 0, 2, 0),
      demand('events.custom-celebration-cake', 'Custom Celebration Cake', 1, 0, 1, 0),
    ]))

    expect(priorities.map(({ referenceId, lifecycle, action }) => ({
      referenceId,
      lifecycle,
      action,
    }))).toEqual([
      {
        referenceId: 'events.private-chef',
        lifecycle: 'active-template',
        action: 'recruit-exact-supply',
      },
      {
        referenceId: 'home.deep-cleaning',
        lifecycle: 'curation-candidate',
        action: 'resolve-category-overlap',
      },
      {
        referenceId: 'automotive.interior-detail',
        lifecycle: 'curation-candidate',
        action: 'review-category-model',
      },
      {
        referenceId: 'events.custom-celebration-cake',
        lifecycle: 'reference-coverage',
        action: 'validate-and-recruit',
      },
    ])
  })
})

function candidate(
  id: string,
  title: string,
  domain: CommerceSupplyCatalog['candidates'][number]['domain'],
  status: CommerceSupplyCatalog['candidates'][number]['status'] = 'retain',
) {
  return { id, title, domain, status }
}

function demand(
  referenceId: string,
  title: string,
  observed: number,
  related: number,
  reference: number,
  live: number,
) {
  return {
    referenceId,
    title,
    domain: referenceId.startsWith('home.')
      ? 'home-property' as const
      : referenceId.startsWith('automotive.')
        ? 'automotive-mobile' as const
        : 'events-hospitality' as const,
    observed,
    live,
    related,
    reference,
    unresolved: related + reference,
  }
}

function snapshot(categories: CommerceDemandSnapshot['categories']): CommerceDemandSnapshot {
  return {
    generatedAt: '2026-08-21T17:00:00.000Z',
    since: '2026-07-22T17:00:00.000Z',
    available: true,
    truncated: false,
    totalSignals: categories.reduce((total, category) => total + category.observed, 0),
    mappedSignals: categories.reduce((total, category) => total + category.observed, 0),
    liveMatches: categories.reduce((total, category) => total + category.live, 0),
    relatedMatches: categories.reduce((total, category) => total + category.related, 0),
    referenceMatches: categories.reduce((total, category) => total + category.reference, 0),
    coverageGaps: 0,
    categories,
  }
}
