import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSupabaseMock } from '../../test/supabase-mock'

vi.mock('../../utils/supabase/admin', () => ({ createAdminClient: vi.fn(), hasSupabaseAdminEnv: vi.fn() }))

import { loadPublicStorefronts } from './storefront'
import { createAdminClient, hasSupabaseAdminEnv } from '../../utils/supabase/admin'

function drive(opts: { storefronts: any[]; pages: any[]; pausedBilling: any[]; admins: any[]; curations?: any[] }) {
  vi.mocked(hasSupabaseAdminEnv).mockReturnValue(true)
  vi.mocked(createAdminClient).mockReturnValue(
    createSupabaseMock((ctx: any) => {
      if (ctx.table === 'storefronts') return { data: opts.storefronts, error: null }
      if (ctx.table === 'pages') return { data: opts.pages, error: null }
      if (ctx.table === 'marketplace_curations') return { data: opts.curations ?? [], error: null }
      if (ctx.table === 'billing_subscriptions') return { data: opts.pausedBilling, error: null }
      if (ctx.table === 'platform_admins') return { data: opts.admins, error: null }
      return { data: null, error: null }
    }) as any,
  )
}

describe('loadPublicStorefronts — pause gate + platform-admin exemption', () => {
  beforeEach(() => vi.clearAllMocks())

  it('drops a paused non-admin from the directory but KEEPS a paused platform_admin (mirrors private.nz_owner_is_paused)', async () => {
    const expired = new Date(Date.now() - 86_400_000).toISOString()
    drive({
      storefronts: [
        { id: 'sf_admin', handle: 'admin-store', display_name: 'Admin Store', logo_url: null },
        { id: 'sf_paused', handle: 'paused-store', display_name: 'Paused Store', logo_url: null },
        { id: 'sf_active', handle: 'active-store', display_name: 'Active Store', logo_url: null },
      ],
      pages: [
        { id: 'p_admin', storefront_id: 'sf_admin', owner_id: 'admin_owner' },
        { id: 'p_paused', storefront_id: 'sf_paused', owner_id: 'paused_owner' },
        { id: 'p_active', storefront_id: 'sf_active', owner_id: 'active_owner' },
      ],
      // admin_owner (explicit paused) + paused_owner (expired trial) both read as paused;
      // active_owner has no billing row (never paused).
      pausedBilling: [
        { owner_id: 'admin_owner', status: 'paused', trial_ends_at: expired },
        { owner_id: 'paused_owner', status: 'trialing', trial_ends_at: expired },
      ],
      admins: [{ user_id: 'admin_owner' }],
    })

    const handles = (await loadPublicStorefronts()).map((s) => s.handle)

    expect(handles).toContain('active-store') // never paused
    expect(handles).toContain('admin-store') // paused billing row, but platform_admin => exempt
    expect(handles).not.toContain('paused-store') // paused non-admin => dropped from discovery
  })

  it('does not query platform_admins when nobody is paused (no wasted read)', async () => {
    drive({
      storefronts: [{ id: 'sf1', handle: 'store-1', display_name: 'One', logo_url: null }],
      pages: [{ id: 'p1', storefront_id: 'sf1', owner_id: 'o1' }],
      pausedBilling: [], // no paused owners
      admins: [],
    })
    const spy = vi.mocked(createAdminClient)
    const handles = (await loadPublicStorefronts()).map((s) => s.handle)
    expect(handles).toEqual(['store-1'])
    // The admin client's .from was never asked for platform_admins.
    const client = spy.mock.results[0]?.value as { from: ReturnType<typeof vi.fn> }
    const tablesQueried = client.from.mock.calls.map((c: any[]) => c[0])
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
      pausedBilling: [],
      admins: [],
    })

    expect(await loadPublicStorefronts()).toEqual([
      expect.objectContaining({ handle: 'visible-store', listing_count: 1 }),
    ])
  })
})
