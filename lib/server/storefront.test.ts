import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSupabaseMock } from '../../test/supabase-mock'

vi.mock('../../utils/supabase/admin', () => ({ createAdminClient: vi.fn(), hasSupabaseAdminEnv: vi.fn() }))

import { loadPublicStorefronts, loadStorefrontByHandle, loadStorefrontHandlesForSlugs } from './storefront'
import { createAdminClient, hasSupabaseAdminEnv } from '../../utils/supabase/admin'

function drive(opts: { storefronts: any[]; pages: any[]; curations?: any[] }) {
  const queries: any[] = []
  vi.mocked(hasSupabaseAdminEnv).mockReturnValue(true)
  vi.mocked(createAdminClient).mockReturnValue(
    createSupabaseMock((ctx: any) => {
      queries.push(ctx)
      if (ctx.table === 'storefronts') return { data: opts.storefronts, error: null }
      if (ctx.table === 'pages') return { data: opts.pages, error: null }
      if (ctx.table === 'marketplace_curations') return { data: opts.curations ?? [], error: null }
      return { data: null, error: null }
    }) as any,
  )
  return queries
}

describe('loadPublicStorefronts - durable Free visibility', () => {
  beforeEach(() => vi.clearAllMocks())

  it('keeps published storefronts discoverable without consulting legacy billing pause state', async () => {
    const queries = drive({
      storefronts: [
        { id: 'sf_free', handle: 'free-store', display_name: 'Free Store', logo_url: null },
        { id: 'sf_active', handle: 'active-store', display_name: 'Active Store', logo_url: null },
      ],
      pages: [
        { id: 'p_free', storefront_id: 'sf_free', owner_id: 'free_owner' },
        { id: 'p_active', storefront_id: 'sf_active', owner_id: 'active_owner' },
      ],
    })

    const handles = (await loadPublicStorefronts()).map((s) => s.handle)

    expect(handles).toEqual(['free-store', 'active-store'])
    const spy = vi.mocked(createAdminClient)
    const client = spy.mock.results[0]?.value as { from: ReturnType<typeof vi.fn> }
    const tablesQueried = client.from.mock.calls.map((c: any[]) => c[0])
    expect(tablesQueried).not.toContain('billing_subscriptions')
    expect(tablesQueried).not.toContain('platform_admins')
    expect(queries.find((query) => query.table === 'storefronts')?.calls).toContainEqual([
      'is',
      'plan_suspended_at',
      null,
    ])
  })

  it('returns [] without the service role', async () => {
    vi.mocked(hasSupabaseAdminEnv).mockReturnValue(false)
    expect(await loadPublicStorefronts()).toEqual([])
  })

  it('does not advertise storefronts whose published listings are direct-only', async () => {
    drive({
      storefronts: [
        { id: 'sf_visible', handle: 'visible-store', display_name: 'Visible', logo_url: null },
        { id: 'sf_direct', handle: 'direct-store', display_name: 'Direct only', logo_url: null },
      ],
      pages: [
        { id: 'p_visible', storefront_id: 'sf_visible', owner_id: 'o1' },
        { id: 'p_direct', storefront_id: 'sf_direct', owner_id: 'o2' },
      ],
      curations: [{ page_id: 'p_direct' }],
    })

    expect(await loadPublicStorefronts()).toEqual([
      expect.objectContaining({ handle: 'visible-store', listing_count: 1 }),
    ])
  })
})

describe('loadStorefrontHandlesForSlugs - exact multi-storefront routing', () => {
  beforeEach(() => vi.clearAllMocks())

  it('maps each listing to its assigned active storefront and uses the oldest active storefront only for legacy rows', async () => {
    const queries = drive({
      pages: [
        { slug: 'alpha-listing', owner_id: 'owner-1', storefront_id: 'sf-alpha' },
        { slug: 'beta-listing', owner_id: 'owner-1', storefront_id: 'sf-beta' },
        { slug: 'legacy-listing', owner_id: 'owner-1', storefront_id: null },
      ],
      storefronts: [
        { id: 'sf-alpha', owner_id: 'owner-1', handle: 'alpha' },
        { id: 'sf-beta', owner_id: 'owner-1', handle: 'beta' },
      ],
    })

    const handles = await loadStorefrontHandlesForSlugs([
      'alpha-listing',
      'beta-listing',
      'legacy-listing',
    ])

    expect(Object.fromEntries(handles)).toEqual({
      'alpha-listing': 'alpha',
      'beta-listing': 'beta',
      'legacy-listing': 'alpha',
    })
    expect(queries.find((query) => query.table === 'pages')?.calls).toContainEqual([
      'select',
      'slug, owner_id, storefront_id',
    ])
    expect(queries.find((query) => query.table === 'storefronts')?.calls).toContainEqual([
      'is',
      'plan_suspended_at',
      null,
    ])
  })
})

describe('loadStorefrontByHandle - public branding entitlement', () => {
  beforeEach(() => vi.clearAllMocks())

  function wirePlan(planId: 'free' | 'launch') {
    vi.mocked(hasSupabaseAdminEnv).mockReturnValue(true)
    vi.mocked(createAdminClient).mockReturnValue(createSupabaseMock((ctx: any) => {
      if (ctx.table === 'storefronts') {
        return {
          data: {
            id: 'sf-1',
            owner_id: 'owner-1',
            handle: 'acme',
            display_name: 'Acme',
            description: null,
            logo_url: 'https://cdn.example/logo.svg',
            accent_color: '#ff6a33',
          },
          error: null,
        }
      }
      if (ctx.table === 'pages') return { data: [], error: null }
      if (ctx.table === 'billing_subscriptions') {
        return { data: { owner_id: 'owner-1', plan_id: planId, status: 'active', trial_ends_at: null }, error: null }
      }
      if (ctx.table === 'promotional_plan_grants') return { data: [], error: null }
      return { data: null, error: null }
    }) as any)
  }

  it('retains stored values but strips storefront logo and accent from Free public output', async () => {
    wirePlan('free')
    expect((await loadStorefrontByHandle('acme'))?.storefront).toMatchObject({
      logo_url: null,
      accent_color: null,
    })
  })

  it('emits storefront logo and accent on Launch', async () => {
    wirePlan('launch')
    expect((await loadStorefrontByHandle('acme'))?.storefront).toMatchObject({
      logo_url: 'https://cdn.example/logo.svg',
      accent_color: '#ff6a33',
    })
  })
})
