import { beforeEach, describe, expect, it, vi } from 'vitest'

const { jar, gateRef, helperRef } = vi.hoisted(() => ({
  jar: { set: vi.fn() },
  gateRef: {
    value: {
      ok: true,
      user: { id: 'user-1' },
      access: { pageId: 'page-1', ownerId: 'owner-1' },
      admin: {},
    } as any,
  },
  helperRef: {
    managed: true,
    oauth: true,
    storage: true,
    configured: true,
    siteUrl: 'https://shop.example.com' as string | null,
    siteError: null as string | null,
    state: 'encrypted-state' as string | null,
    authorizationUrl: 'https://provider.example/authorize?state=encrypted-state' as string | null,
  },
}))

vi.mock('next/headers', () => ({ cookies: vi.fn(async () => jar) }))
vi.mock('../../../../../lib/rate-limit', () => ({ enforceRateLimit: vi.fn(async () => null) }))
vi.mock('../../../../../lib/server/require-page-access', () => ({ requirePageAccess: vi.fn(async () => gateRef.value) }))
vi.mock('../../../../../lib/server/plan', () => ({ ownerAllows: vi.fn(async () => true) }))
vi.mock('../../../../../lib/server/merchant-connectors', () => ({
  buildConnectorAuthorizationUrl: vi.fn(() => helperRef.authorizationUrl),
  connectorOAuthConfigured: vi.fn(() => helperRef.configured),
  connectorStateCookie: vi.fn((provider: string) => `oauth-${provider}`),
  createConnectorState: vi.fn(() => helperRef.state),
  isManagedConnectorProvider: vi.fn(() => helperRef.managed),
  isOAuthConnectorProvider: vi.fn(() => helperRef.oauth),
  merchantConnectorStorageConfigured: vi.fn(() => helperRef.storage),
  resolvedWooCommerceSiteError: vi.fn(async () => helperRef.siteError),
  resolveWooCommerceSiteOrigin: vi.fn(() => helperRef.siteUrl),
}))

import { GET } from './route'
import { ownerAllows } from '../../../../../lib/server/plan'
import { createConnectorState } from '../../../../../lib/server/merchant-connectors'

const request = (provider: string, query = 'pageId=page-1') => GET(
  new Request(`https://app.nexez.ai/api/integrations/${provider}/connect?${query}`),
  { params: Promise.resolve({ provider }) },
)

describe('connector authorization start', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    gateRef.value = {
      ok: true,
      user: { id: 'user-1' },
      access: { pageId: 'page-1', ownerId: 'owner-1' },
      admin: {},
    }
    Object.assign(helperRef, {
      managed: true,
      oauth: true,
      storage: true,
      configured: true,
      siteUrl: 'https://shop.example.com',
      siteError: null,
      state: 'encrypted-state',
      authorizationUrl: 'https://provider.example/authorize?state=encrypted-state',
    })
    vi.mocked(ownerAllows).mockResolvedValue(true)
  })

  it('rejects unknown providers before authorization', async () => {
    helperRef.managed = false
    expect((await request('unknown')).status).toBe(404)
  })

  it('requires a listing and the listing owner integration entitlement', async () => {
    expect((await request('square', '')).status).toBe(400)
    vi.mocked(ownerAllows).mockResolvedValue(false)
    expect((await request('square')).status).toBe(402)
  })

  it('binds OAuth state to user, owner, listing, and an HttpOnly provider path', async () => {
    const response = await request('square')
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe(helperRef.authorizationUrl)
    expect(createConnectorState).toHaveBeenCalledWith({
      provider: 'square',
      pageId: 'page-1',
      ownerId: 'owner-1',
      userId: 'user-1',
    })
    expect(jar.set).toHaveBeenCalledWith('oauth-square', 'encrypted-state', expect.objectContaining({
      httpOnly: true,
      sameSite: 'lax',
      path: '/api/integrations/square',
      maxAge: 600,
    }))
  })

  it('builds the official WooCommerce application authorization contract', async () => {
    helperRef.oauth = false
    const response = await request('woocommerce', 'pageId=page-1&siteUrl=https%3A%2F%2Fshop.example.com')
    expect(response.status).toBe(302)
    const location = new URL(response.headers.get('location') || '')
    expect(location.toString()).toMatch(/^https:\/\/shop\.example\.com\/wc-auth\/v1\/authorize/)
    expect(location.searchParams.get('app_name')).toBe('Nexez')
    expect(location.searchParams.get('scope')).toBe('read')
    expect(location.searchParams.get('user_id')).toBe('encrypted-state')
    expect(location.searchParams.get('callback_url')).toBe('https://app.nexez.ai/api/integrations/woocommerce/callback')
    expect(location.searchParams.get('return_url')).toContain('/dashboard/page-1/settings')
  })

  it('blocks an unsafe WooCommerce store before redirecting the merchant', async () => {
    helperRef.oauth = false
    helperRef.siteUrl = null
    const response = await request('woocommerce', 'pageId=page-1&siteUrl=http%3A%2F%2Flocalhost')
    expect(response.status).toBe(400)
    expect(jar.set).not.toHaveBeenCalled()
  })
})
