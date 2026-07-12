import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSupabaseMock } from '../../test/supabase-mock'
import { encryptSecret } from './secret-crypto'
import { getShopifyInstallCredentials, upsertInstall } from './shopify-install'

const KEY = '11'.repeat(32)

beforeEach(() => {
  vi.stubEnv('INTEGRATION_SECRET_KEY', KEY)
  vi.stubEnv('SHOPIFY_API_KEY', 'client-id')
  vi.stubEnv('SHOPIFY_API_SECRET', 'client-secret')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('Shopify install token lifecycle', () => {
  it('forces an explicit relink when a previously uninstalled shop is installed again', async () => {
    let upserted: Record<string, unknown> | null = null
    const admin = createSupabaseMock((ctx) => {
      if (ctx.op === 'select') {
        return { data: { owner_id: 'old-owner', page_id: 'old-page', uninstalled_at: '2026-07-01T00:00:00Z' }, error: null }
      }
      if (ctx.op === 'upsert') {
        upserted = ctx.payload
        return { data: null, error: null }
      }
      return { data: null, error: null }
    })

    await upsertInstall(admin as any, {
      shop: 'demo.myshopify.com',
      ownerId: 'new-owner',
      offlineToken: 'access-1',
      refreshToken: 'refresh-1',
      expiresIn: 3600,
      refreshTokenExpiresIn: 7776000,
      scope: 'read_products',
    })

    expect(upserted).toMatchObject({
      owner_id: 'new-owner',
      page_id: null,
      linked_at: null,
      last_synced_at: null,
      uninstalled_at: null,
    })
    expect(upserted?.offline_token_encrypted).not.toBe('access-1')
    expect(upserted?.refresh_token_encrypted).not.toBe('refresh-1')
  })

  it('refreshes an expiring offline token and persists the rotated pair', async () => {
    let updated: Record<string, unknown> | null = null
    const admin = createSupabaseMock((ctx) => {
      if (ctx.op === 'select') {
        return {
          data: {
            shop_domain: 'demo.myshopify.com',
            owner_id: 'owner-1',
            page_id: 'page-1',
            scope: 'read_products',
            uninstalled_at: null,
            linked_at: '2026-07-12T00:00:00Z',
            last_synced_at: null,
            offline_token_encrypted: encryptSecret('expired-access'),
            refresh_token_encrypted: encryptSecret('refresh-1'),
            access_token_expires_at: '2026-07-01T00:00:00Z',
            refresh_token_expires_at: '2026-10-01T00:00:00Z',
          },
          error: null,
        }
      }
      if (ctx.op === 'update') {
        updated = ctx.payload
        return { data: null, error: null }
      }
      return { data: null, error: null }
    })
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        access_token: 'access-2',
        refresh_token: 'refresh-2',
        expires_in: 3600,
        refresh_token_expires_in: 7776000,
        scope: 'read_products,write_app_proxy',
      }),
    })))

    const credentials = await getShopifyInstallCredentials(admin as any, 'page-1')
    expect(credentials).toEqual({ shop: 'demo.myshopify.com', accessToken: 'access-2' })
    expect(String(vi.mocked(fetch).mock.calls[0][1]?.body)).toContain('grant_type=refresh_token')
    expect(updated).toMatchObject({ scope: 'read_products,write_app_proxy' })
    expect(updated?.offline_token_encrypted).not.toBe('access-2')
    expect(updated?.refresh_token_encrypted).not.toBe('refresh-2')
  })
})
