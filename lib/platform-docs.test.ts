import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  PLAN_FEATURE_MATRIX,
  PLAN_LIMIT_MATRIX,
  billingPlans,
  type PlanFeature,
  type PlanLimit,
} from './billing'
import {
  PLATFORM_DOCS_REVIEWED_AT,
  platformCapabilityCount,
  platformDocsChapters,
  platformTrustDestinations,
} from './platform-docs'

const entitlementDoc = readFileSync(join(process.cwd(), 'docs/plan-entitlements.md'), 'utf8')

function allocationCells(label: string): string[] {
  const row = entitlementDoc
    .split('\n')
    .find((line) => line.startsWith(`| ${label} |`))
  if (!row) throw new Error(`Missing plan-entitlement row: ${label}`)
  return row.split('|').slice(2, -1).map((cell) => cell.trim())
}

describe('platform documentation source of truth', () => {
  it('keeps a complete, uniquely addressable chapter index', () => {
    expect(platformDocsChapters).toHaveLength(10)
    expect(new Set(platformDocsChapters.map((chapter) => chapter.id)).size).toBe(platformDocsChapters.length)
    expect(new Set(platformDocsChapters.map((chapter) => chapter.number)).size).toBe(platformDocsChapters.length)
    expect(platformCapabilityCount()).toBeGreaterThanOrEqual(30)
  })

  it('documents every capability with evidence and a product surface', () => {
    for (const chapter of platformDocsChapters) {
      expect(chapter.promise.length).toBeGreaterThan(40)
      expect(chapter.capabilities.length).toBeGreaterThan(0)
      for (const capability of chapter.capabilities) {
        expect(capability.summary.length).toBeGreaterThan(40)
        expect(capability.details.length).toBeGreaterThanOrEqual(3)
        expect(capability.surfaces.length).toBeGreaterThan(0)
      }
    }
  })

  it('indexes exactly the refreshed Trust destinations without legal pages', () => {
    expect(platformTrustDestinations.map((destination) => destination.href)).toEqual([
      '/agent-readiness',
      '/agents',
      '/integrations',
      '/developers',
      '/developers/buyer-approval',
      '/security',
      '/compare',
      '/enterprise',
    ])
    expect(platformTrustDestinations.some((destination) => /privacy|terms/.test(destination.href))).toBe(false)
  })

  it('uses the official Nexxi buyer-agent name in published documentation', () => {
    expect(JSON.stringify(platformDocsChapters)).not.toContain('Nexie')
    expect(JSON.stringify(platformDocsChapters)).toContain('Nexxi')
    expect(Date.parse(`${PLATFORM_DOCS_REVIEWED_AT}T00:00:00Z`)).not.toBeNaN()
  })

  it('does not describe all-plan commerce as a paid entitlement', () => {
    const byName = new Map(
      platformDocsChapters.flatMap((chapter) => chapter.capabilities).map((capability) => [capability.name, capability]),
    )
    for (const name of [
      'Advanced offer contracts',
      'Direct checkout and agentic checkout protocols',
      'Escrow, staged settlement, and agreements',
      'Resource-aware booking and fulfillment',
      'Finance and immutable economics',
    ]) {
      expect(byName.get(name)?.availability, name).toBe('Core')
      expect(byName.get(name)?.summary, name).toMatch(/every plan|current-period/i)
    }
  })

  it('qualifies mixed core and paid capabilities with their exact boundary', () => {
    const byName = new Map(
      platformDocsChapters.flatMap((chapter) => chapter.capabilities).map((capability) => [capability.name, capability]),
    )
    const text = (name: string) => JSON.stringify(byName.get(name))

    expect(text('Storefronts and multi-listing portfolios')).toMatch(/core.*Launch/i)
    expect(text('Storefronts and multi-listing portfolios')).toMatch(/badge removal/i)
    expect(text('Guided creation, scanning, and import')).toMatch(/core.*Launch.*Pro/i)
    expect(text('Structured visual offer builder')).toMatch(/core.*Pro/i)
    expect(text('AI-assisted refinement and controlled drafts')).toMatch(/core.*Launch/i)
    expect(text('Agent readiness and trust context')).toMatch(/core.*Launch.*automated credential review/i)
    expect(text('Per-listing agent simulation')).toMatch(/core.*Launch.*model-enhanced/i)
    expect(text('URL and competitor research')).toMatch(/Launch.*public buyer simulator.*core/i)
    expect(text('Negotiation and seller decisioning')).toMatch(/Pro.*downgrade.*settle.*refund/i)
    expect(text('Negotiation operations reporting')).toMatch(/Pro.*in-flight.*downgrade/i)
    expect(text('Traffic, intent, and action analytics')).toMatch(/30-day.*Pro/i)
    expect(text('Finance and immutable economics')).toMatch(/current-period.*Pro/i)
    expect(text('Commerce and catalog connections')).toMatch(/installed Shopify.*core.*Pro/i)
    expect(text('Scheduling and availability connections')).toMatch(/Pro.*OAuth.*live free\/busy.*disconnect/i)
    expect(byName.get('Webhooks and freshness automation')?.availability).toBe('Plan-controlled')
  })

  it('separates listing-side collaboration from owner-only lifecycle authority', () => {
    const collaboration = platformDocsChapters
      .flatMap((chapter) => chapter.capabilities)
      .find((capability) => capability.name === 'Teams and controlled collaboration')

    expect(JSON.stringify(collaboration)).toMatch(/listing content.*listing-scoped configuration/i)
    expect(JSON.stringify(collaboration)).toMatch(/Owner-only.*transaction decisions.*money movement.*negotiation lifecycle.*final approvals/i)
  })

  it('keeps the canonical Markdown allocation table synchronized with TypeScript', () => {
    const limitRows: ReadonlyArray<[string, PlanLimit]> = [
      ['Published listings', 'publishedListings'],
      ['Storefronts', 'storefronts'],
      ['Active custom domains', 'customDomains'],
      ['Team seats', 'teamSeats'],
    ]
    for (const [label, limit] of limitRows) {
      expect(allocationCells(label), label).toEqual(billingPlans.map((plan) => {
        const value = PLAN_LIMIT_MATRIX[plan.id][limit]
        return Number.isFinite(value) ? String(value) : 'Custom/unlimited'
      }))
    }

    expect(allocationCells('Installed Shopify App Store connector')).toEqual(billingPlans.map(() => 'Yes'))
    for (const plan of billingPlans) {
      expect(PLAN_FEATURE_MATRIX[plan.id].whiteLabel, `${plan.id} branding/badge bundle`).toBe(
        PLAN_FEATURE_MATRIX[plan.id].removeBadge,
      )
    }

    const featureRows: ReadonlyArray<[string, PlanFeature]> = [
      ['Custom domain', 'customDomain'],
      ['AI refinement', 'aiFeatures'],
      ['Custom branding and badge removal', 'whiteLabel'],
      ['Premium catalog/scheduling integrations and sync (manual Shopify credentials included; installed Shopify OAuth excluded)', 'integrations'],
      ['Outbound webhooks', 'outboundWebhooks'],
      ['Private management API', 'apiAccess'],
      ['Negotiation and smart pricing', 'negotiation'],
      ['Full analytics history', 'analyticsHistory'],
      ['Team collaboration', 'teamCollaboration'],
      ['Priority support routing', 'prioritySupport'],
      ['SSO / SAML', 'sso'],
    ]
    for (const [label, feature] of featureRows) {
      const cells: string[] = billingPlans.map((plan) => PLAN_FEATURE_MATRIX[plan.id][feature] ? 'Yes' : '—')
      if (feature === 'sso') cells[cells.length - 1] = 'Sales-assisted'
      expect(allocationCells(label), label).toEqual(cells)
    }

    expect(allocationCells('Default settlement commission')).toEqual(
      billingPlans.map((plan) => plan.id === 'enterprise'
        ? `${plan.commissionPercent}% (negotiated 1–2%)`
        : `${plan.commissionPercent}%`),
    )
  })
})
