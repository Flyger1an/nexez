import { describe, expect, it } from 'vitest'
import type { AgentPage } from './agent-page'
import type { CommerceDemandSnapshot } from './commerce-demand'
import type { MarketplaceCurationQueueItem } from './marketplace-curation'
import {
  buildCommerceSupplyBrief,
  buildCommerceSupplyWorkflow,
  withCommerceSupplyCampaign,
} from './commerce-supply-workflow'

describe('Commerce supply workflow', () => {
  it('turns an unresolved category into an evidence-bound recruitment brief', () => {
    const workflow = buildCommerceSupplyWorkflow({ demand: demand('events.private-chef', 'Private Chef') })
    const item = workflow.items[0]

    expect(item).toMatchObject({
      referenceId: 'events.private-chef',
      status: 'new',
      campaign: null,
      brief: {
        objective: expect.stringContaining('real Private Chef merchant'),
        successBoundary: expect.stringContaining('does not prove location'),
      },
    })
    expect(item.brief.verificationQuestions.length).toBeGreaterThan(0)
    expect(item.brief.capabilityTags).toContain('QUOTE_REQUIRED')
  })

  it('derives live only from a certified offer with a unique canonical identity', () => {
    const workflow = buildCommerceSupplyWorkflow({
      demand: demand('events.private-chef', 'Private Chef'),
      marketplaceItems: [curationItem({
        status: 'certified',
        services: [{
          name: 'Private Chef',
          description: 'On-location chef service for dinner parties.',
          price: 'Quote',
          url: 'https://chef.example.test',
        }],
      })],
    })

    expect(workflow.items[0]).toMatchObject({
      status: 'live',
      certifiedSupply: [{ pageName: 'Example Merchant', offerName: 'Private Chef' }],
    })
  })

  it('does not let an adjacent or ambiguous certified offer close the category', () => {
    const workflow = buildCommerceSupplyWorkflow({
      demand: demand('events.private-chef', 'Private Chef'),
      marketplaceItems: [curationItem({
        status: 'certified',
        services: [{
          name: 'Wedding Videography',
          description: 'Video coverage for weddings and private events.',
          price: 'Quote',
          url: 'https://video.example.test',
        }],
      })],
    })

    expect(workflow.items[0]).toMatchObject({ status: 'new', certifiedSupply: [] })
  })

  it('never treats an uncertified marketplace listing as category resolution', () => {
    const workflow = buildCommerceSupplyWorkflow({
      demand: demand('events.private-chef', 'Private Chef'),
      marketplaceItems: [curationItem({
        status: 'candidate',
        services: [{
          name: 'Private Chef',
          description: 'On-location custom menu service.',
          price: 'Quote',
          url: 'https://chef.example.test',
        }],
      })],
    })

    expect(workflow.items[0]).toMatchObject({ status: 'new', certifiedSupply: [] })
  })

  it('overlays persisted operator progress without changing evidence or rank', () => {
    const item = buildCommerceSupplyWorkflow({ demand: demand('events.private-chef', 'Private Chef') }).items[0]
    const updated = withCommerceSupplyCampaign(item, {
      referenceId: 'events.private-chef',
      referenceDomain: 'events-hospitality',
      status: 'contacted',
      decisionReason: 'Two local operators contacted',
      createdBy: 'admin-1',
      updatedBy: 'admin-1',
      createdAt: '2026-08-21T00:00:00.000Z',
      updatedAt: '2026-08-21T01:00:00.000Z',
    })

    expect(updated.status).toBe('contacted')
    expect(updated.rank).toBe(item.rank)
    expect(updated.unresolved).toBe(item.unresolved)
  })

  it('builds a fail-closed fallback brief for catalog-safe inputs', () => {
    const brief = buildCommerceSupplyBrief({
      referenceId: 'unknown.category',
      title: 'Unknown Category',
      domain: 'professional-creative-technical',
    })
    expect(brief.capabilityTags).toEqual([])
    expect(brief.successBoundary).toContain('does not prove')
  })
})

function demand(referenceId: string, title: string): CommerceDemandSnapshot {
  return {
    generatedAt: '2026-08-21T12:00:00.000Z',
    since: '2026-07-22T12:00:00.000Z',
    available: true,
    truncated: false,
    totalSignals: 4,
    mappedSignals: 4,
    liveMatches: 0,
    relatedMatches: 1,
    referenceMatches: 3,
    coverageGaps: 0,
    categories: [{
      referenceId,
      title,
      domain: 'events-hospitality',
      observed: 4,
      live: 0,
      related: 1,
      reference: 3,
      unresolved: 4,
    }],
  }
}

function curationItem(input: {
  status: MarketplaceCurationQueueItem['decision']['status']
  services: AgentPage['services']
}): MarketplaceCurationQueueItem {
  return {
    page: {
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Example Merchant',
      slug: 'example-merchant',
      description: 'Example description',
      website_url: null,
      cta_url: null,
      cta_label: null,
      audience: null,
      location: null,
      contact_email: null,
      industry: 'Event Services',
      prefer_original_site: false,
      products: [],
      services: input.services,
      faqs: [],
      is_published: true,
      custom_domain: null,
      custom_domain_verified: false,
      domain_path: null,
      branding: null,
      created_at: '2026-08-20T00:00:00.000Z',
      updated_at: '2026-08-20T00:00:00.000Z',
      mcp_enabled: true,
      next_available: null,
      last_booking: null,
      llm_opt_in: true,
      currency: 'usd',
      preferred_contact: null,
      marketplace_discoverable: true,
    },
    decision: {
      pageId: '11111111-1111-4111-8111-111111111111',
      status: input.status,
      decisionReason: null,
      notes: null,
      reviewedBy: null,
      reviewedAt: null,
      certifiedAt: input.status === 'certified' ? '2026-08-20T00:00:00.000Z' : null,
      updatedAt: '2026-08-20T00:00:00.000Z',
    },
    assessment: {
      version: 1,
      assessedAt: '2026-08-20T00:00:00.000Z',
      readiness: 100,
      trust: 100,
      offerCount: input.services?.length ?? 0,
      pricedOfferCount: input.services?.length ?? 0,
      actionableOfferCount: input.services?.length ?? 0,
      blockerCount: 0,
      warningCount: 0,
      suggestedStatus: 'candidate',
      flags: [],
    },
    duplicateNameCount: 1,
  }
}
