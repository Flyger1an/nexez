import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('../site', () => ({ appUrl: (path: string) => `https://app.nexez.ai${path}` }))

import { ensureShopifySalesChannel } from './shopify-channel'

function adminMock() {
  const update = vi.fn(() => {
    const query: any = {}
    query.eq = vi.fn(() => query)
    query.is = vi.fn(async () => ({ error: null }))
    return query
  })
  return {
    client: { from: vi.fn(() => ({ update })) } as any,
    update,
  }
}

describe('ensureShopifySalesChannel', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('creates a channel, subscribes to contextual feeds, and starts a full sync', async () => {
    const responses = [
      { data: { channelByHandle: null } },
      { data: { channelCreate: { channel: { id: 'gid://shopify/Channel/1', handle: 'nexez-page1' }, userErrors: [] } } },
      ...Array.from({ length: 4 }, (_, index) => ({
        data: {
          webhookSubscriptionCreate: {
            webhookSubscription: { id: `gid://shopify/WebhookSubscription/${index}`, topic: 'TOPIC', uri: 'https://app.nexez.ai/api/webhooks/shopify' },
            userErrors: [],
          },
        },
      })),
      { data: { channelFullSync: { fullSyncTraceInfo: [], userErrors: [] } } },
    ]
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => Response.json(responses.shift()))
    vi.stubGlobal('fetch', fetchMock)
    const admin = adminMock()

    const result = await ensureShopifySalesChannel(
      admin.client,
      { shop_domain: 'demo.myshopify.com', owner_id: 'owner-1', page_id: 'page-1', scope: null, uninstalled_at: null },
      { shop: 'demo.myshopify.com', accessToken: 'secret-token' },
      { pageId: 'page-1', accountName: 'Demo catalog' },
    )

    expect(result).toMatchObject({
      id: 'gid://shopify/Channel/1',
      handle: 'nexez-page1',
      specificationHandle: 'nexez-us',
    })
    expect(fetchMock).toHaveBeenCalledTimes(7)
    const bodies = fetchMock.mock.calls.map((call) => JSON.parse(String(call[1]?.body)))
    expect(bodies[1].variables.input).toMatchObject({
      specificationHandle: 'nexez-us',
      accountId: 'page-1',
      accountName: 'Demo catalog',
    })
    expect(bodies.slice(2, 6).map((body) => body.variables.topic)).toEqual([
      'PRODUCT_FEEDS_FULL_SYNC',
      'PRODUCT_FEEDS_FULL_SYNC_FINISH',
      'PRODUCT_FEEDS_INCREMENTAL_SYNC',
      'PRODUCT_FEEDS_UPDATE',
    ])
    expect(bodies[6].variables.channelId).toBe('gid://shopify/Channel/1')
    expect(admin.update).toHaveBeenCalledWith(expect.objectContaining({
      channel_id: 'gid://shopify/Channel/1',
      channel_specification_handle: 'nexez-us',
    }))
  })

  it('surfaces channel creation user errors', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(Response.json({ data: { channelByHandle: null } }))
      .mockResolvedValueOnce(Response.json({
        data: {
          channelCreate: {
            channel: null,
            userErrors: [{ message: 'The channel config extension is not deployed.' }],
          },
        },
      })))
    const admin = adminMock()

    await expect(ensureShopifySalesChannel(
      admin.client,
      { shop_domain: 'demo.myshopify.com', owner_id: 'owner-1', page_id: 'page-1', scope: null, uninstalled_at: null },
      { shop: 'demo.myshopify.com', accessToken: 'secret-token' },
      { pageId: 'page-1', accountName: 'Demo catalog' },
    )).rejects.toThrow('channel config extension is not deployed')
  })
})
