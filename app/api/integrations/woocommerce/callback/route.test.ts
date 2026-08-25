import { beforeEach, describe, expect, it, vi } from 'vitest'

const { stateRef, saveRef, pageRef, admin } = vi.hoisted(() => {
  const pageRef = { value: { id: 'page-1', owner_id: 'owner-1' } as any }
  const admin = {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: pageRef.value })) })),
      })),
    })),
  }
  return {
    stateRef: { value: { provider: 'woocommerce', pageId: 'page-1', ownerId: 'owner-1', userId: 'user-1', siteUrl: 'https://shop.example.com' } as any },
    saveRef: { value: true },
    pageRef,
    admin,
  }
})

vi.mock('../../../../../utils/supabase/admin', () => ({ createAdminClient: vi.fn(() => admin) }))
vi.mock('../../../../../lib/rate-limit', () => ({ enforceRateLimit: vi.fn(async () => null) }))
vi.mock('../../../../../lib/server/plan', () => ({ ownerAllows: vi.fn(async () => true) }))
vi.mock('../../../../../lib/server/integration-sync', () => ({ syncPageIntegration: vi.fn(async () => ({ ok: true })) }))
vi.mock('../../../../../lib/server/merchant-connectors', () => ({
  merchantConnectorStorageConfigured: vi.fn(() => true),
  readConnectorState: vi.fn(() => stateRef.value),
  resolvedWooCommerceSiteError: vi.fn(async () => null),
  resolveWooCommerceSiteOrigin: vi.fn(() => 'https://shop.example.com'),
  upsertMerchantConnectorConnection: vi.fn(async () => saveRef.value),
}))

import { POST } from './route'
import { ownerAllows } from '../../../../../lib/server/plan'
import { syncPageIntegration } from '../../../../../lib/server/integration-sync'
import { upsertMerchantConnectorConnection } from '../../../../../lib/server/merchant-connectors'

const callback = (body: Record<string, unknown>) => POST(new Request('https://app.nexez.ai/api/integrations/woocommerce/callback', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
}))

describe('WooCommerce application authorization callback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stateRef.value = { provider: 'woocommerce', pageId: 'page-1', ownerId: 'owner-1', userId: 'user-1', siteUrl: 'https://shop.example.com' }
    pageRef.value = { id: 'page-1', owner_id: 'owner-1' }
    saveRef.value = true
    vi.mocked(ownerAllows).mockResolvedValue(true)
  })

  it('rejects invalid state before accepting API keys', async () => {
    stateRef.value = null
    const response = await callback({ user_id: 'bad', consumer_key: 'ck', consumer_secret: 'cs', key_permissions: 'read' })
    expect(response.status).toBe(401)
    expect(upsertMerchantConnectorConnection).not.toHaveBeenCalled()
  })

  it('requires read permission and the original listing owner', async () => {
    expect((await callback({ user_id: 'state', consumer_key: 'ck', consumer_secret: 'cs', key_permissions: 'write' })).status).toBe(400)
    pageRef.value = { id: 'page-1', owner_id: 'different-owner' }
    expect((await callback({ user_id: 'state', consumer_key: 'ck', consumer_secret: 'cs', key_permissions: 'read' })).status).toBe(409)
  })

  it('rechecks the owner plan at callback time', async () => {
    vi.mocked(ownerAllows).mockResolvedValue(false)
    const response = await callback({ user_id: 'state', consumer_key: 'ck', consumer_secret: 'cs', key_permissions: 'read' })
    expect(response.status).toBe(402)
    expect(upsertMerchantConnectorConnection).not.toHaveBeenCalled()
  })

  it('stores the read-only key encrypted and starts the first catalog and order sync', async () => {
    const response = await callback({ user_id: 'state', consumer_key: 'ck_live', consumer_secret: 'cs_live', key_permissions: 'read' })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, synced: true })
    expect(upsertMerchantConnectorConnection).toHaveBeenCalledWith(admin, expect.objectContaining({
      pageId: 'page-1',
      ownerId: 'owner-1',
      provider: 'woocommerce',
      credential: { siteUrl: 'https://shop.example.com', consumerKey: 'ck_live', consumerSecret: 'cs_live' },
      scopes: ['read'],
    }))
    expect(syncPageIntegration).toHaveBeenCalledWith(admin, 'woocommerce', 'page-1')
  })
})
