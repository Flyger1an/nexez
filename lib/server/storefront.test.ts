import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSupabaseMock } from '../../test/supabase-mock'

vi.mock('../../utils/supabase/admin', () => ({ createAdminClient: vi.fn(), hasSupabaseAdminEnv: vi.fn() }))

import { loadPublicStorefronts } from './storefront'
import { createAdminClient, hasSupabaseAdminEnv } from '../../utils/supabase/admin'

function drive(opts: { storefronts: any[]; pages: any[]; curations?: any[] }) {
  vi.mocked(hasSupabaseAdminEnv).mockReturnValue(true)
  vi.mocked(createAdminClient).mockReturnValue(
    createSupabaseMock((ctx: any) => {
      if (ctx.table === 'storefronts') return { data: opts.storefronts, error: null }
      if (ctx.table === 'pages') return { data: opts.pages, error: null }
      if (ctx.table === 'marketplace_curations') return { data: opts.curations ?? [], error: null }
      return { data: null, error: null }
    }) as any,
  )
}

describe('loadPublicStorefronts - durable Free visibility', () => {
  beforeEach(() => vi.clearAllMocks())

  it('keeps published storefronts discoverable without consulting legacy billing pause state', async () => {
    drive({
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
