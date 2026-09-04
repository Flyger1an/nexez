import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('../site', () => ({ appUrl: (path: string) => `https://app.nexez.ai${path}` }))

import { ensureShopifySalesChannel } from './shopify-channel'

function adminMock(writeData: { shop_domain: string } | null = { shop_domain: 'demo.myshopify.com' }) {
  const update = vi.fn(() => {
    const query: any = {}
    query.eq = vi.fn(() => query)
    query.is = vi.fn(() => query)
    query.select = vi.fn(() => query)
    query.maybeSingle = vi.fn(async () => ({ data: writeData, error: null }))
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
      { data: { channelCreate: { channel: {
        id: 'gid://shopify/Channel/1',
        handle: 'nexez-page1',
        accountId: 'page-1',
        accountName: 'Demo catalog',
        specificationHandle: 'nexez-us',
      }, userErrors: [] } } },
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
      accountId: 'page-1',
      accountName: 'Demo catalog',
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
    expect(bodies.slice(2, 6).every((body) => body.query.includes('$uri: String!'))).toBe(true)
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

  it('verifies a stored connection instead of trusting the database id', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({
      data: {
        channel: {
          id: 'gid://shopify/Channel/1',
          handle: 'nexez-page1',
          accountId: 'page-1',
          accountName: 'Demo catalog',
          specificationHandle: 'nexez-us',
        },
      },
    }))
    vi.stubGlobal('fetch', fetchMock)
    const admin = adminMock()

    const result = await ensureShopifySalesChannel(
      admin.client,
      {
        shop_domain: 'demo.myshopify.com',
        owner_id: 'owner-1',
        page_id: 'page-1',
        scope: null,
        uninstalled_at: null,
        channel_id: 'gid://shopify/Channel/1',
        channel_handle: 'nexez-page1',
      },
      { shop: 'demo.myshopify.com', accessToken: 'secret-token' },
      { pageId: 'page-1', accountName: 'Demo catalog', startFullSync: false },
    )

    expect(result).toMatchObject({ id: 'gid://shopify/Channel/1', handle: 'nexez-page1' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).query).toContain('channel(id: $id)')
  })

  it('repairs a stored channel after the Shopify store is relinked to another listing', async () => {
    const responses = [
      { data: { channel: {
        id: 'gid://shopify/Channel/1',
        handle: 'nexez-oldpage',
        accountId: 'old-page',
        accountName: 'Old catalog',
        specificationHandle: 'nexez-us',
      } } },
      { data: { channelByHandle: null } },
      { data: { channelUpdate: { channel: {
        id: 'gid://shopify/Channel/1',
        handle: 'nexez-page1',
        accountId: 'page-1',
        accountName: 'Demo catalog',
        specificationHandle: 'nexez-us',
      }, userErrors: [] } } },
      ...Array.from({ length: 4 }, (_, index) => ({
        data: { webhookSubscriptionCreate: {
          webhookSubscription: { id: `gid://shopify/WebhookSubscription/${index}`, topic: 'TOPIC', uri: 'https://app.nexez.ai/api/webhooks/shopify' },
          userErrors: [],
        } },
      })),
      { data: { channelFullSync: { fullSyncTraceInfo: [], userErrors: [] } } },
    ]
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => Response.json(responses.shift()))
    vi.stubGlobal('fetch', fetchMock)
    const admin = adminMock()

    const result = await ensureShopifySalesChannel(
      admin.client,
      {
        shop_domain: 'demo.myshopify.com',
        owner_id: 'owner-1',
        page_id: 'page-1',
        scope: null,
        uninstalled_at: null,
        channel_id: 'gid://shopify/Channel/1',
        channel_handle: 'nexez-oldpage',
      },
      { shop: 'demo.myshopify.com', accessToken: 'secret-token' },
      { pageId: 'page-1', accountName: 'Demo catalog', startFullSync: false },
    )

    expect(result).toMatchObject({
      id: 'gid://shopify/Channel/1',
      handle: 'nexez-page1',
      accountId: 'page-1',
      accountName: 'Demo catalog',
    })
    expect(fetchMock).toHaveBeenCalledTimes(8)
    const updateBody = JSON.parse(String(fetchMock.mock.calls[2][1]?.body))
    expect(updateBody.variables).toMatchObject({
      id: 'gid://shopify/Channel/1',
      input: {
        handle: 'nexez-page1',
        accountId: 'page-1',
        accountName: 'Demo catalog',
        specificationHandle: 'nexez-us',
      },
    })
  })

  it('does not save verified channel metadata after the listing mapping changes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json({
      data: {
        channel: {
          id: 'gid://shopify/Channel/1',
          handle: 'nexez-page1',
          accountId: 'page-1',
          accountName: 'Demo catalog',
          specificationHandle: 'nexez-us',
        },
      },
    })))
    const admin = adminMock(null)

    await expect(ensureShopifySalesChannel(
      admin.client,
      {
        shop_domain: 'demo.myshopify.com',
        owner_id: 'owner-1',
        page_id: 'page-1',
        scope: null,
        uninstalled_at: null,
        mapping_generation: 7,
        channel_id: 'gid://shopify/Channel/1',
        channel_handle: 'nexez-page1',
      },
      { shop: 'demo.myshopify.com', accessToken: 'secret-token' },
      { pageId: 'page-1', accountName: 'Demo catalog', startFullSync: false },
    )).rejects.toThrow('listing connection changed')
  })
})
