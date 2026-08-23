import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSupabaseMock } from '../../test/supabase-mock'
import { encryptSecret } from './secret-crypto'
import {
  activeShopifyInstallMapping,
  beginShopifyMappingChange,
  commitShopifyCatalogSync,
  consumeShopifyLinkToken,
  exchangeShopifySessionToken,
  finishShopifyRelink,
  getInstallByPage,
  getShopifyInstallCredentials,
  getShopifyInstallCredentialsByShop,
  issueShopifyLinkToken,
  isShopifyCatalogOfferForGeneration,
  markUninstalled,
  redactShop,
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
    const operations: string[] = []
    let installUpdate: Record<string, unknown> | null = null
    let pageUpdate: Record<string, unknown> | null = null
    const admin = createSupabaseMock((ctx) => {
      if (ctx.table === 'rpc:nz_begin_shopify_mapping_change') {
        operations.push('begin')
        return {
          data: {
            status: 'begun',
            generation: 5,
            catalogGeneration: 4,
            ownerId: 'old-owner',
            pageId: 'old-page',
          },
          error: null,
        }
      }
      if (ctx.table === 'shopify_installs' && ctx.op === 'select') {
        return {
          data: {
            owner_id: 'old-owner',
            page_id: 'old-page',
            uninstalled_at: '2026-07-01T00:00:00Z',
            mapping_generation: 4,
            catalog_generation: 4,
            mapping_transition_token: null,
          },
          error: null,
        }
      }
      if (ctx.table === 'pages' && ctx.op === 'select') {
        operations.push('read-old-catalog')
        return {
          data: {
            id: 'old-page',
            updated_at: '2026-08-22T00:00:00Z',
            services: [],
            products: [
              { name: 'Old mug', source: 'shopify', metadata: { shopify_shop: 'demo.myshopify.com', shopify_mapping_generation: 4 } },
              { name: 'Newer mug', source: 'shopify', metadata: { shopify_shop: 'demo.myshopify.com', shopify_mapping_generation: 6 } },
            ],
          },
          error: null,
        }
      }
      if (ctx.table === 'pages' && ctx.op === 'update') {
        operations.push('remove-old-catalog')
        pageUpdate = ctx.payload
        return { data: { id: 'old-page' }, error: null }
      }
      if (ctx.table === 'shopify_installs' && ctx.op === 'update') {
        operations.push('finish-transfer')
        installUpdate = ctx.payload
        return { data: { shop_domain: 'demo.myshopify.com' }, error: null }
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

    expect(installUpdate).toMatchObject({
      owner_id: 'new-owner',
      page_id: null,
      linked_at: null,
      last_synced_at: null,
      uninstalled_at: null,
      mapping_generation: 6,
      catalog_generation: null,
      mapping_transition_token: null,
    })
    const stored = installUpdate as Record<string, unknown> | null
    expect(stored?.offline_token_encrypted).not.toBe('access-1')
    expect(stored?.refresh_token_encrypted).not.toBe('refresh-1')
    expect((pageUpdate as any).products.map((offer: any) => offer.name)).toEqual(['Newer mug'])
    expect(operations).toEqual(['begin', 'read-old-catalog', 'remove-old-catalog', 'finish-transfer'])
  })

  it('aborts a reversible owner transfer when exact old-catalog cleanup fails', async () => {
    const rpcNames: string[] = []
    let installFinalized = false
    const admin = createSupabaseMock((ctx) => {
      if (ctx.table === 'rpc:nz_begin_shopify_mapping_change') {
        rpcNames.push('begin')
        return {
          data: {
            status: 'begun',
            generation: 5,
            catalogGeneration: 4,
            ownerId: 'old-owner',
            pageId: 'old-page',
          },
          error: null,
        }
      }
      if (ctx.table === 'rpc:nz_abort_shopify_mapping_change') {
        rpcNames.push('abort')
        return { data: true, error: null }
      }
      if (ctx.table === 'shopify_installs' && ctx.op === 'select') {
        return {
          data: {
            owner_id: 'old-owner',
            page_id: 'old-page',
            uninstalled_at: null,
            mapping_generation: 4,
            catalog_generation: 4,
            mapping_transition_token: null,
          },
          error: null,
        }
      }
      if (ctx.table === 'pages' && ctx.op === 'select') {
        return { data: null, error: { code: '08006' } }
      }
      if (ctx.table === 'shopify_installs' && ctx.op === 'update') installFinalized = true
      return { data: null, error: null }
    })

    await expect(upsertInstall(admin as any, {
      shop: 'demo.myshopify.com',
      ownerId: 'new-owner',
      offlineToken: 'access-1',
      refreshToken: 'refresh-1',
      expiresIn: 3600,
      refreshTokenExpiresIn: 7776000,
    })).rejects.toThrow(/linked listing during Shopify cleanup/i)
    expect(rpcNames).toEqual(['begin', 'abort'])
    expect(installFinalized).toBe(false)
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
            mapping_generation: 4,
            mapping_transition_token: null,
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
        return { data: { shop_domain: 'demo.myshopify.com' }, error: null }
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
        mapping_generation: 2,
        mapping_transition_token: null,
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

  it('refuses stored credentials immediately while any mapping lease is active', async () => {
    const admin = createSupabaseMock(() => ({
      data: {
        shop_domain: 'demo.myshopify.com',
        owner_id: 'owner-1',
        page_id: 'page-1',
        scope: 'read_products',
        uninstalled_at: null,
        mapping_generation: 7,
        mapping_transition_token: '00000000-0000-4000-8000-000000000010',
        offline_token_encrypted: encryptSecret('still-encrypted-access'),
        refresh_token_encrypted: encryptSecret('still-encrypted-refresh'),
        access_token_expires_at: '2099-07-01T00:00:00Z',
        refresh_token_expires_at: '2099-10-01T00:00:00Z',
      },
      error: null,
    }))

    await expect(getShopifyInstallCredentialsByShop(admin as any, 'demo.myshopify.com')).resolves.toBeNull()
  })

  it('resolves active install metadata by exact listing without credential material', async () => {
    const observations: Array<{ eqs: Record<string, unknown>; calls: Array<[string, ...unknown[]]> }> = []
    const install = {
      shop_domain: 'demo.myshopify.com',
      owner_id: 'owner-1',
      page_id: 'page-1',
      scope: 'read_products',
      uninstalled_at: null,
      linked_at: '2026-07-12T00:00:00Z',
    }
    const admin = createSupabaseMock((ctx) => {
      observations.push({ eqs: ctx.eqs, calls: ctx.calls })
      return { data: install, error: null }
    })

    await expect(getInstallByPage(admin as any, 'page-1')).resolves.toEqual(install)
    expect(observations[0]?.eqs).toEqual({ page_id: 'page-1' })
    expect(observations[0]?.calls).toEqual(expect.arrayContaining([
      ['is', 'uninstalled_at', null],
      ['order', 'linked_at', { ascending: false }],
      ['limit', 1],
    ]))
    expect(JSON.stringify(observations[0]?.calls)).not.toContain('offline_token_encrypted')
  })

  it('does not misclassify a failed install metadata read as no OAuth install', async () => {
    const admin = createSupabaseMock(() => ({ data: null, error: { code: '08006' } }))
    await expect(getInstallByPage(admin as any, 'page-1')).rejects.toThrow(/inspect the Shopify installation/i)
  })

  it('exchanges an App Bridge session token for rotating offline credentials', async () => {
    let upserted: Record<string, unknown> | null = null
    const admin = createSupabaseMock((ctx) => {
      if (ctx.op === 'select') return { data: null, error: null }
      if (ctx.op === 'insert') {
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

  it('revokes credentials and removes only the uninstalled shop catalog', async () => {
    const operations: string[] = []
    const installUpdates: Record<string, unknown>[] = []
    let pageUpdate: Record<string, unknown> | null = null
    const admin = createSupabaseMock((ctx) => {
      if (ctx.table === 'rpc:nz_begin_shopify_mapping_change') {
        operations.push('begin')
        return {
          data: {
            status: 'begun',
            generation: 4,
            catalogGeneration: null,
            ownerId: 'owner-1',
            pageId: 'page-1',
          },
          error: null,
        }
      }
      if (ctx.table === 'shopify_installs' && ctx.op === 'update') {
        installUpdates.push(ctx.payload)
        operations.push(ctx.payload?.uninstalled_at ? 'revoke' : 'finish')
        return { data: { shop_domain: 'demo.myshopify.com' }, error: null }
      }
      if (ctx.table === 'pages' && ctx.op === 'select') {
        operations.push('read-catalog')
        return {
          data: {
            id: 'page-1',
            updated_at: '2026-07-13T12:00:00Z',
            services: [{ name: 'Manual service', source: undefined }],
            products: [
              { name: 'Demo mug', source: 'shopify', metadata: { shopify_shop: 'demo.myshopify.com' } },
              { name: 'Legacy import', source: 'shopify' },
              { name: 'Other store tee', source: 'shopify', metadata: { shopify_shop: 'other.myshopify.com' } },
              { name: 'Manual product', source: undefined },
            ],
          },
          error: null,
        }
      }
      if (ctx.table === 'pages' && ctx.op === 'update') {
        operations.push('remove-catalog')
        pageUpdate = ctx.payload
        return { data: { id: 'page-1' }, error: null }
      }
      return { data: null, error: null }
    })

    await markUninstalled(admin as any, 'demo.myshopify.com', '2026-07-13T13:00:00Z')

    expect(installUpdates[0]).toMatchObject({
      uninstalled_at: '2026-07-13T13:00:00Z',
      offline_token_encrypted: null,
      refresh_token_encrypted: null,
      link_token_hash: null,
    })
    expect(installUpdates[0]).not.toHaveProperty('owner_id')
    expect(installUpdates[0]).not.toHaveProperty('page_id')
    expect(installUpdates[1]).toMatchObject({
      mapping_generation: 5,
      catalog_generation: null,
      mapping_transition_token: null,
    })
    expect((pageUpdate as any).services.map((offer: any) => offer.name)).toEqual(['Manual service'])
    expect((pageUpdate as any).products.map((offer: any) => offer.name)).toEqual(['Other store tee', 'Manual product'])
    expect(operations).toEqual(['begin', 'revoke', 'read-catalog', 'remove-catalog', 'finish'])
  })

  it('keeps credentials revoked and the cleanup lease retained when uninstall cleanup fails', async () => {
    const rpcNames: string[] = []
    let revokePayload: Record<string, unknown> | null = null
    const admin = createSupabaseMock((ctx) => {
      if (ctx.table === 'rpc:nz_begin_shopify_mapping_change') {
        rpcNames.push('begin')
        return {
          data: {
            status: 'begun',
            generation: 8,
            catalogGeneration: 7,
            ownerId: 'owner-1',
            pageId: 'page-1',
          },
          error: null,
        }
      }
      if (ctx.table === 'rpc:nz_abort_shopify_mapping_change') {
        rpcNames.push('abort')
        return { data: true, error: null }
      }
      if (ctx.table === 'shopify_installs' && ctx.op === 'update') {
        revokePayload = ctx.payload
        return { data: { shop_domain: 'demo.myshopify.com' }, error: null }
      }
      if (ctx.table === 'pages' && ctx.op === 'select') {
        return { data: null, error: { code: '08006' } }
      }
      return { data: null, error: null }
    })

    await expect(markUninstalled(admin as any, 'demo.myshopify.com', '2026-08-22T01:00:00Z'))
      .rejects.toThrow(/linked listing during Shopify cleanup/i)
    expect(revokePayload).toMatchObject({
      uninstalled_at: '2026-08-22T01:00:00Z',
      offline_token_encrypted: null,
      refresh_token_encrypted: null,
    })
    expect(rpcNames).toEqual(['begin'])
  })

  it('removes residual shop offers before deleting the redacted install', async () => {
    const operations: string[] = []
    const admin = createSupabaseMock((ctx) => {
      if (ctx.table === 'rpc:nz_begin_shopify_mapping_change') {
        operations.push('begin')
        return {
          data: {
            status: 'begun',
            generation: 6,
            catalogGeneration: null,
            ownerId: 'owner-1',
            pageId: 'page-1',
          },
          error: null,
        }
      }
      if (ctx.table === 'shopify_installs' && ctx.op === 'update') {
        operations.push('revoke')
        return { data: { shop_domain: 'demo.myshopify.com' }, error: null }
      }
      if (ctx.table === 'pages' && ctx.op === 'select') {
        operations.push('read-page')
        return {
          data: {
            id: 'page-1',
            updated_at: '2026-07-13T12:00:00Z',
            services: [],
            products: [{ name: 'Demo mug', source: 'shopify', metadata: { shopify_shop: 'demo.myshopify.com' } }],
          },
          error: null,
        }
      }
      if (ctx.table === 'pages' && ctx.op === 'update') {
        operations.push('remove-offers')
        return { data: { id: 'page-1' }, error: null }
      }
      if (ctx.table === 'shopify_installs' && ctx.op === 'delete') {
        operations.push('delete-install')
        return { data: { shop_domain: 'demo.myshopify.com' }, error: null }
      }
      return { data: null, error: null }
    })

    await redactShop(admin as any, 'demo.myshopify.com')
    expect(operations).toEqual(['begin', 'revoke', 'read-page', 'remove-offers', 'delete-install'])
  })

  it('returns an exact lease generation and fails active mapping closed while moving', async () => {
    const admin = createSupabaseMock((ctx) => {
      if (ctx.table === 'rpc:nz_begin_shopify_mapping_change') {
        return {
          data: {
            status: 'begun',
            generation: 8,
            catalogGeneration: 6,
            ownerId: 'owner-1',
            pageId: 'page-1',
          },
          error: null,
        }
      }
      return { data: null, error: null }
    })

    const lease = await beginShopifyMappingChange(admin as any, {
      shop: 'demo.myshopify.com',
      kind: 'relink',
      targetOwnerId: 'owner-1',
      targetPageId: 'page-2',
      token: '00000000-0000-4000-8000-000000000001',
    })

    expect(lease).toMatchObject({ generation: 8, catalogGeneration: 6, pageId: 'page-1' })
    expect(activeShopifyInstallMapping({
      shop_domain: 'demo.myshopify.com',
      owner_id: 'owner-1',
      page_id: 'page-1',
      scope: null,
      uninstalled_at: null,
      mapping_generation: 8,
      mapping_transition_token: lease!.token,
    })).toBeNull()
  })

  it('finishes a relink only under the exact lease and returns the new active generation', async () => {
    let update: Record<string, unknown> | null = null
    let filters: Record<string, unknown> = {}
    const admin = createSupabaseMock((ctx) => {
      if (ctx.table === 'shopify_installs' && ctx.op === 'update') {
        update = ctx.payload
        filters = ctx.eqs
        return {
          data: {
            shop_domain: 'demo.myshopify.com',
            owner_id: 'owner-2',
            page_id: 'page-2',
            scope: 'read_products',
            uninstalled_at: null,
            mapping_generation: 9,
            catalog_generation: null,
            mapping_transition_token: null,
          },
          error: null,
        }
      }
      return { data: null, error: null }
    })
    const lease = {
      shop: 'demo.myshopify.com',
      token: '00000000-0000-4000-8000-000000000002',
      kind: 'relink' as const,
      generation: 8,
      catalogGeneration: 6,
      ownerId: 'owner-1',
      pageId: 'page-1',
    }

    await expect(finishShopifyRelink(admin as any, {
      lease,
      ownerId: 'owner-2',
      pageId: 'page-2',
      at: '2026-08-22T01:00:00Z',
    })).resolves.toEqual({
      shop: 'demo.myshopify.com',
      ownerId: 'owner-2',
      pageId: 'page-2',
      generation: 9,
    })
    expect(filters).toMatchObject({
      shop_domain: 'demo.myshopify.com',
      mapping_generation: 8,
      mapping_transition_token: lease.token,
    })
    expect(update).toMatchObject({
      owner_id: 'owner-2',
      page_id: 'page-2',
      mapping_generation: 9,
      catalog_generation: null,
      mapping_transition_token: null,
    })
  })

  it('atomically reports a stale installed catalog commit without treating it as written', async () => {
    const admin = createSupabaseMock((ctx) => ctx.table === 'rpc:nz_commit_shopify_catalog_sync'
      ? { data: 'mapping_stale', error: null }
      : { data: null, error: null })

    await expect(commitShopifyCatalogSync(admin as any, {
      mapping: { shop: 'demo.myshopify.com', ownerId: 'owner-1', pageId: 'page-1', generation: 7 },
      expectedPageUpdatedAt: '2026-08-22T00:00:00Z',
      services: [],
      products: [],
      syncedAt: '2026-08-22T00:01:00Z',
      clearCatalogSyncState: false,
    })).resolves.toBe('mapping_stale')
  })

  it('fences stale cleanup to its prior catalog generation, including legacy null', () => {
    const current = {
      name: 'Current mug',
      source: 'shopify',
      metadata: { shopify_shop: 'demo.myshopify.com', shopify_mapping_generation: 9 },
    }
    const legacy = {
      name: 'Legacy mug',
      source: 'shopify',
      metadata: { shopify_shop: 'demo.myshopify.com' },
    }

    expect(isShopifyCatalogOfferForGeneration(current as any, 'demo.myshopify.com', 8)).toBe(false)
    expect(isShopifyCatalogOfferForGeneration(current as any, 'demo.myshopify.com', 9)).toBe(true)
    expect(isShopifyCatalogOfferForGeneration(current as any, 'demo.myshopify.com', null)).toBe(false)
    expect(isShopifyCatalogOfferForGeneration(legacy as any, 'demo.myshopify.com', null)).toBe(true)
    expect(isShopifyCatalogOfferForGeneration(legacy as any, 'demo.myshopify.com', 8)).toBe(false)
  })
})
