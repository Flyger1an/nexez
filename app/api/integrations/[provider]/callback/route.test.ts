import { beforeEach, describe, expect, it, vi } from 'vitest'

const { jar, stateRef, gateRef, exchangeRef, saveRef, admin } = vi.hoisted(() => {
  const admin = {
    from: vi.fn(() => ({
      update: vi.fn(() => ({
        eq: vi.fn(() => ({ is: vi.fn(async () => ({ error: null })) })),
      })),
    })),
  }
  return {
    jar: { get: vi.fn(() => ({ value: 'state-1' })), set: vi.fn() },
    stateRef: { value: { provider: 'square', pageId: 'page-1', ownerId: 'owner-1', userId: 'user-1' } as any },
    gateRef: { value: { ok: true, user: { id: 'user-1' }, access: { pageId: 'page-1', ownerId: 'owner-1' }, admin } as any },
    exchangeRef: { value: { credential: { accessToken: 'token' }, externalAccountId: 'merchant-1', scopes: ['ITEMS_READ'] } as any },
    saveRef: { value: true },
    admin,
  }
})

vi.mock('next/headers', () => ({ cookies: vi.fn(async () => jar) }))
vi.mock('../../../../../lib/rate-limit', () => ({ enforceRateLimit: vi.fn(async () => null) }))
vi.mock('../../../../../lib/server/require-page-access', () => ({ requirePageAccess: vi.fn(async () => gateRef.value) }))
vi.mock('../../../../../lib/server/plan', () => ({ ownerAllows: vi.fn(async () => true) }))
vi.mock('../../../../../lib/server/integration-sync', () => ({ syncPageIntegration: vi.fn(async () => ({ ok: true })) }))
vi.mock('../../../../../lib/server/merchant-connectors', () => ({
  connectorStateCookie: vi.fn((provider: string) => `oauth-${provider}`),
  exchangeConnectorCode: vi.fn(async () => exchangeRef.value),
  isOAuthConnectorProvider: vi.fn((provider: string) => ['square', 'acuity', 'google_calendar', 'servicem8'].includes(provider)),
  readConnectorState: vi.fn(() => stateRef.value),
  upsertMerchantConnectorConnection: vi.fn(async () => saveRef.value),
}))

import { GET } from './route'
import { syncPageIntegration } from '../../../../../lib/server/integration-sync'
import { exchangeConnectorCode, upsertMerchantConnectorConnection } from '../../../../../lib/server/merchant-connectors'

const callback = (provider: string, query = 'code=code-1&state=state-1') => GET(
  new Request(`https://app.nexez.ai/api/integrations/${provider}/callback?${query}`),
  { params: Promise.resolve({ provider }) },
)

describe('connector OAuth callback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    jar.get.mockReturnValue({ value: 'state-1' })
    stateRef.value = { provider: 'square', pageId: 'page-1', ownerId: 'owner-1', userId: 'user-1' }
    gateRef.value = { ok: true, user: { id: 'user-1' }, access: { pageId: 'page-1', ownerId: 'owner-1' }, admin }
    exchangeRef.value = { credential: { accessToken: 'token' }, externalAccountId: 'merchant-1', scopes: ['ITEMS_READ'] }
    saveRef.value = true
  })

  it('rejects a callback when URL state and HttpOnly cookie do not match', async () => {
    jar.get.mockReturnValue({ value: 'different' })
    expect((await callback('square')).status).toBe(401)
    expect(exchangeConnectorCode).not.toHaveBeenCalled()
  })

  it('rechecks user and listing ownership after the provider redirect', async () => {
    gateRef.value = { ...gateRef.value, user: { id: 'other-user' } }
    expect((await callback('square')).status).toBe(403)
    expect(upsertMerchantConnectorConnection).not.toHaveBeenCalled()
  })

  it('exchanges, encrypts, stores, and initially syncs Square', async () => {
    const response = await callback('square')
    expect(response.status).toBe(302)
    expect(exchangeConnectorCode).toHaveBeenCalledWith('square', 'code-1')
    expect(upsertMerchantConnectorConnection).toHaveBeenCalledWith(admin, expect.objectContaining({
      pageId: 'page-1',
      ownerId: 'owner-1',
      provider: 'square',
      externalAccountId: 'merchant-1',
      scopes: ['ITEMS_READ'],
    }))
    expect(syncPageIntegration).toHaveBeenCalledWith(admin, 'square', 'page-1')
    expect(response.headers.get('location')).toContain('connection=connected')
    expect(jar.set).toHaveBeenCalledWith('oauth-square', '', expect.objectContaining({
      path: '/api/integrations/square',
      maxAge: 0,
    }))
  })

  it('sets primary as a safe Google default and does not run an offer sync', async () => {
    stateRef.value = { ...stateRef.value, provider: 'google_calendar' }
    const response = await callback('google_calendar')
    expect(response.status).toBe(302)
    expect(admin.from).toHaveBeenCalledWith('pages')
    expect(syncPageIntegration).not.toHaveBeenCalled()
  })

  it('stores and initially syncs an Acuity OAuth connection', async () => {
    stateRef.value = { ...stateRef.value, provider: 'acuity' }
    exchangeRef.value = { credential: { accessToken: 'acuity-token' }, externalAccountId: null, scopes: ['api-v1'] }
    const response = await callback('acuity')
    expect(response.status).toBe(302)
    expect(exchangeConnectorCode).toHaveBeenCalledWith('acuity', 'code-1')
    expect(syncPageIntegration).toHaveBeenCalledWith(admin, 'acuity', 'page-1')
  })

  it('does not store anything when the provider declines consent', async () => {
    const response = await callback('square', 'error=access_denied&state=state-1')
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toContain('connection=cancelled')
    expect(exchangeConnectorCode).not.toHaveBeenCalled()
    expect(upsertMerchantConnectorConnection).not.toHaveBeenCalled()
  })
})
