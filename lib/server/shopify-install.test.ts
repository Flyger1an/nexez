import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSupabaseMock } from '../../test/supabase-mock'
import { encryptSecret } from './secret-crypto'
import {
  consumeShopifyLinkToken,
  exchangeShopifySessionToken,
  getShopifyInstallCredentials,
  getShopifyInstallCredentialsByShop,
  issueShopifyLinkToken,
  upsertInstall,
} from './shopify-install'

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
    const stored = upserted as Record<string, unknown> | null
    expect(stored?.offline_token_encrypted).not.toBe('access-1')
    expect(stored?.refresh_token_encrypted).not.toBe('refresh-1')
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
    const rotated = updated as Record<string, unknown> | null
    expect(rotated?.offline_token_encrypted).not.toBe('access-2')
    expect(rotated?.refresh_token_encrypted).not.toBe('refresh-2')
  })

  it('resolves a fresh credential by exact shop for webhook-triggered syncs', async () => {
    const admin = createSupabaseMock(() => ({
      data: {
        shop_domain: 'second.myshopify.com',
        owner_id: 'owner-1',
        page_id: 'page-1',
        scope: 'read_products',
        uninstalled_at: null,
        linked_at: '2026-07-12T00:00:00Z',
        last_synced_at: null,
        offline_token_encrypted: encryptSecret('shop-specific-access'),
        refresh_token_encrypted: encryptSecret('refresh-1'),
        access_token_expires_at: '2099-07-01T00:00:00Z',
        refresh_token_expires_at: '2099-10-01T00:00:00Z',
      },
      error: null,
    }))

    await expect(getShopifyInstallCredentialsByShop(admin as any, 'second.myshopify.com')).resolves.toEqual({
      shop: 'second.myshopify.com',
      accessToken: 'shop-specific-access',
    })
  })

  it('exchanges an App Bridge session token for rotating offline credentials', async () => {
    let upserted: Record<string, unknown> | null = null
    const admin = createSupabaseMock((ctx) => {
      if (ctx.op === 'select') return { data: null, error: null }
      if (ctx.op === 'upsert') {
        upserted = ctx.payload
        return { data: null, error: null }
      }
      return { data: null, error: null }
    })
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        access_token: 'embedded-access',
        refresh_token: 'embedded-refresh',
        expires_in: 3600,
        refresh_token_expires_in: 7776000,
        scope: 'read_products,write_app_proxy',
      }),
    })))

    await exchangeShopifySessionToken(admin as any, 'demo.myshopify.com', 'short-lived-id-token')

    const request = vi.mocked(fetch).mock.calls[0]
    expect(request[0]).toBe('https://demo.myshopify.com/admin/oauth/access_token')
    const body = String(request[1]?.body)
    expect(body).toContain('grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Atoken-exchange')
    expect(body).toContain('requested_token_type=urn%3Ashopify%3Aparams%3Aoauth%3Atoken-type%3Aoffline-access-token')
    expect(body).toContain('subject_token=short-lived-id-token')
    expect(upserted).toMatchObject({ shop_domain: 'demo.myshopify.com', scope: 'read_products,write_app_proxy' })
  })

  it('stores only a link-token digest and consumes the credential once', async () => {
    let storedHash = ''
    let consumed = false
    const admin = createSupabaseMock((ctx) => {
      if (ctx.op === 'select') {
        return {
          data: storedHash && !consumed
            ? { shop_domain: 'demo.myshopify.com', link_token_expires_at: '2099-01-01T00:00:00Z' }
            : null,
          error: null,
        }
      }
      if (ctx.op === 'update' && ctx.payload?.link_token_hash) {
        storedHash = String(ctx.payload.link_token_hash)
        return { data: { shop_domain: 'demo.myshopify.com' }, error: null }
      }
      if (ctx.op === 'update' && ctx.payload?.link_token_hash === null) {
        consumed = true
        return { data: { shop_domain: 'demo.myshopify.com' }, error: null }
      }
      return { data: null, error: null }
    })

    const token = await issueShopifyLinkToken(admin as any, 'demo.myshopify.com')
    expect(token).toMatch(/^[A-Za-z0-9_-]{40,64}$/)
    expect(storedHash).toMatch(/^[a-f0-9]{64}$/)
    expect(storedHash).not.toBe(token)
    await expect(consumeShopifyLinkToken(admin as any, token)).resolves.toBe('demo.myshopify.com')
    await expect(consumeShopifyLinkToken(admin as any, token)).resolves.toBeNull()
  })
})
