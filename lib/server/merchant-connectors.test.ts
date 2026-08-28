import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { decryptSecret, encryptSecret } from './secret-crypto'
import {
  buildConnectorAuthorizationUrl,
  createConnectorState,
  disconnectMerchantConnector,
  exchangeConnectorCode,
  getUsableConnectorCredential,
  readConnectorState,
  resolveWooCommerceSiteOrigin,
  upsertMerchantConnectorConnection,
} from './merchant-connectors'

const KEY = '11'.repeat(32)

describe('merchant connector foundation', () => {
  beforeEach(() => {
    vi.stubEnv('INTEGRATION_SECRET_KEY', KEY)
    vi.stubEnv('CALENDLY_CLIENT_ID', 'calendly-client')
    vi.stubEnv('CALENDLY_CLIENT_SECRET', 'calendly-secret')
    vi.stubEnv('SQUARE_APPLICATION_ID', 'square-app')
    vi.stubEnv('SQUARE_APPLICATION_SECRET', 'square-secret')
    vi.stubEnv('ACUITY_CLIENT_ID', 'acuity-client')
    vi.stubEnv('ACUITY_CLIENT_SECRET', 'acuity-secret')
    vi.stubEnv('GOOGLE_CALENDAR_CLIENT_ID', 'google-client')
    vi.stubEnv('GOOGLE_CALENDAR_CLIENT_SECRET', 'google-secret')
    vi.stubEnv('SERVICEM8_APP_ID', 'servicem8-app')
    vi.stubEnv('SERVICEM8_APP_SECRET', 'servicem8-secret')
    vi.stubEnv('SQUARE_ENVIRONMENT', 'production')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('encrypts a time-bound state that is bound to provider, owner, user, and listing', () => {
    const state = createConnectorState({
      provider: 'square',
      pageId: 'page-1',
      ownerId: 'owner-1',
      userId: 'user-1',
    })
    expect(state).toBeTruthy()
    expect(state).not.toContain('page-1')
    expect(readConnectorState(state!, 'square')).toMatchObject({
      version: 1,
      provider: 'square',
      pageId: 'page-1',
      ownerId: 'owner-1',
      userId: 'user-1',
    })
    expect(readConnectorState(state!, 'google_calendar')).toBeNull()
  })

  it('rejects expired and future-dated state even when it is correctly encrypted', () => {
    const base = {
      version: 1,
      provider: 'square',
      pageId: 'page-1',
      ownerId: 'owner-1',
      userId: 'user-1',
      nonce: 'nonce',
    }
    const expired = encryptSecret(JSON.stringify({ ...base, issuedAt: Date.now() - 11 * 60_000 }))
    const future = encryptSecret(JSON.stringify({ ...base, issuedAt: Date.now() + 60_000 }))
    expect(readConnectorState(expired!, 'square')).toBeNull()
    expect(readConnectorState(future!, 'square')).toBeNull()
  })

  it('builds least-privilege provider authorization URLs with the registered callback', () => {
    const calendlyState = createConnectorState({
      provider: 'calendly',
      pageId: 'page-1',
      ownerId: 'owner-1',
      userId: 'user-1',
    })!
    const calendly = new URL(buildConnectorAuthorizationUrl('calendly', calendlyState)!)
    expect(calendly.origin).toBe('https://auth.calendly.com')
    expect(calendly.pathname).toBe('/oauth/authorize')
    expect(calendly.searchParams.get('client_id')).toBe('calendly-client')
    expect(calendly.searchParams.get('scope')?.split(' ')).toEqual([
      'users:read',
      'event_types:read',
      'availability:read',
      'scheduling_links:write',
      'scheduled_events:write',
    ])
    expect(calendly.searchParams.get('code_challenge_method')).toBe('S256')
    expect(calendly.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(calendly.searchParams.get('state')).toBe(calendlyState)

    const square = new URL(buildConnectorAuthorizationUrl('square', 'state-1')!)
    expect(square.origin).toBe('https://connect.squareup.com')
    expect(square.pathname).toBe('/oauth2/authorize')
    expect(square.searchParams.get('client_id')).toBe('square-app')
    expect(square.searchParams.get('scope')).toContain('APPOINTMENTS_BUSINESS_SETTINGS_READ')
    expect(square.searchParams.get('scope')).not.toContain('WRITE')
    expect(square.searchParams.get('session')).toBe('false')
    expect(square.searchParams.get('redirect_uri')).toBe('https://app.nexez.ai/api/integrations/square/callback')

    const google = new URL(buildConnectorAuthorizationUrl('google_calendar', 'state-2')!)
    expect(google.origin).toBe('https://accounts.google.com')
    expect(google.searchParams.get('scope')).toBe('https://www.googleapis.com/auth/calendar.freebusy')
    expect(google.searchParams.get('access_type')).toBe('offline')
    expect(google.searchParams.get('prompt')).toBe('consent')

    const acuity = new URL(buildConnectorAuthorizationUrl('acuity', 'state-acuity')!)
    expect(acuity.origin).toBe('https://acuityscheduling.com')
    expect(acuity.pathname).toBe('/oauth2/authorize')
    expect(acuity.searchParams.get('scope')).toBe('api-v1')
    expect(acuity.searchParams.get('client_id')).toBe('acuity-client')
    expect(acuity.searchParams.get('redirect_uri')).toBe('https://app.nexez.ai/api/integrations/acuity/callback')

    const servicem8 = new URL(buildConnectorAuthorizationUrl('servicem8', 'state-3')!)
    expect(servicem8.origin).toBe('https://go.servicem8.com')
    expect(servicem8.searchParams.get('scope')?.split(' ')).toEqual(['vendor', 'read_jobs'])
  })

  it('exchanges Calendly authorization with PKCE and preserves the rotating refresh token', async () => {
    const fetchMock = vi.fn(async (_input: string | URL, _init?: RequestInit) => Response.json({
      access_token: 'calendly-access',
      refresh_token: 'calendly-refresh',
      token_type: 'Bearer',
      expires_in: 7200,
      owner: 'https://api.calendly.com/users/user-1',
      scope: 'users:read event_types:read availability:read scheduling_links:write scheduled_events:write',
    }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await exchangeConnectorCode('calendly', 'authorization-code', 'v'.repeat(43))

    expect(result).toMatchObject({
      credential: {
        accessToken: 'calendly-access',
        refreshToken: 'calendly-refresh',
      },
      externalAccountId: 'https://api.calendly.com/users/user-1',
    })
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://auth.calendly.com/oauth/token')
    const body = new URLSearchParams(String(init?.body))
    expect(Object.fromEntries(body)).toMatchObject({
      client_id: 'calendly-client',
      client_secret: 'calendly-secret',
      code: 'authorization-code',
      code_verifier: 'v'.repeat(43),
      grant_type: 'authorization_code',
      redirect_uri: 'https://app.nexez.ai/api/integrations/calendly/callback',
    })
  })

  it('normalizes only public HTTPS WooCommerce origins', () => {
    expect(resolveWooCommerceSiteOrigin('https://shop.example.com/store?x=1')).toBe('https://shop.example.com')
    expect(resolveWooCommerceSiteOrigin('http://shop.example.com')).toBeNull()
    expect(resolveWooCommerceSiteOrigin('https://localhost')).toBeNull()
    expect(resolveWooCommerceSiteOrigin('https://127.0.0.1')).toBeNull()
    expect(resolveWooCommerceSiteOrigin('https://user:pass@shop.example.com')).toBeNull()
  })

  it('stores only ciphertext and records an account-level status without exposing tokens', async () => {
    const calls: Array<{ table: string; values: Record<string, unknown> }> = []
    const admin = {
      from: (table: string) => ({
        upsert: async (values: Record<string, unknown>) => {
          calls.push({ table, values })
          return { error: null }
        },
      }),
    } as any
    const ok = await upsertMerchantConnectorConnection(admin, {
      pageId: 'page-1',
      ownerId: 'owner-1',
      provider: 'google_calendar',
      credential: {
        accessToken: 'secret-access',
        refreshToken: 'secret-refresh',
        tokenType: 'Bearer',
        expiresAt: '2026-09-01T00:00:00.000Z',
      },
      scopes: ['https://www.googleapis.com/auth/calendar.freebusy'],
    })
    expect(ok).toBe(true)
    const stored = calls.find((call) => call.table === 'merchant_connector_connections')!
    expect(JSON.stringify(stored.values)).not.toContain('secret-access')
    expect(JSON.stringify(stored.values)).not.toContain('secret-refresh')
    const plaintext = decryptSecret(String(stored.values.credential_encrypted))
    expect(JSON.parse(plaintext!)).toMatchObject({ accessToken: 'secret-access', refreshToken: 'secret-refresh' })
    expect(calls.find((call) => call.table === 'user_integrations')?.values).toMatchObject({
      user_id: 'owner-1',
      provider: 'google_calendar',
      status: 'connected',
    })
  })

  it('refreshes an expired rotating token server-side and preserves the new refresh token', async () => {
    const expired = encryptSecret(JSON.stringify({
      accessToken: 'old-access',
      refreshToken: 'old-refresh',
      tokenType: 'Bearer',
      expiresAt: '2026-01-01T00:00:00.000Z',
    }))!
    const updates: Record<string, unknown>[] = []
    const row = {
      page_id: 'page-1',
      owner_id: 'owner-1',
      provider: 'servicem8',
      credential_encrypted: expired,
      status: 'connected',
      external_account_id: null,
      granted_scopes: ['read_jobs'],
      capabilities: ['jobs'],
      expires_at: '2026-01-01T00:00:00.000Z',
      last_synced_at: null,
      last_error: null,
      metadata: {},
      updated_at: '2026-01-01T00:00:00.000Z',
    }
    const admin = {
      from: () => ({
        select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row }) }) }) }),
        update: (values: Record<string, unknown>) => ({
          eq: () => ({
            eq: async () => {
              updates.push(values)
              return { error: null }
            },
          }),
        }),
      }),
    } as any
    const fetchMock = vi.fn(async (_input: string, init?: RequestInit) => Response.json({
      access_token: 'new-access',
      refresh_token: 'new-refresh',
      expires_in: 3600,
      token_type: 'bearer',
    }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await getUsableConnectorCredential(admin, 'page-1', 'servicem8')

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.credential).toMatchObject({ accessToken: 'new-access', refreshToken: 'new-refresh' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://go.servicem8.com/oauth/access_token')
    expect(String(init?.body)).toContain('refresh_token=old-refresh')
    expect(String(init?.body)).not.toContain('old-access')
    const written = updates.find((update) => typeof update.credential_encrypted === 'string')!
    expect(JSON.parse(decryptSecret(String(written.credential_encrypted))!)).toMatchObject({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
    })
  })

  it('replaces Calendly single-use refresh tokens before returning renewed access', async () => {
    const row = {
      page_id: 'page-1',
      owner_id: 'owner-1',
      provider: 'calendly',
      credential_encrypted: encryptSecret(JSON.stringify({
        accessToken: 'old-calendly-access',
        refreshToken: 'calendly-refresh-r1',
        tokenType: 'Bearer',
        expiresAt: '2026-01-01T00:00:00.000Z',
      }))!,
      status: 'connected',
      external_account_id: 'https://api.calendly.com/users/user-1',
      granted_scopes: ['users:read', 'event_types:read', 'availability:read'],
      capabilities: ['catalog', 'availability'],
      expires_at: '2026-01-01T00:00:00.000Z',
      last_synced_at: null,
      last_error: null,
      metadata: {},
      updated_at: '2026-01-01T00:00:00.000Z',
    }
    const updates: Record<string, unknown>[] = []
    const admin = {
      from: () => ({
        select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row }) }) }) }),
        update: (values: Record<string, unknown>) => ({
          eq: () => ({
            eq: async () => {
              updates.push(values)
              return { error: null }
            },
          }),
        }),
      }),
    } as any
    const fetchMock = vi.fn(async (_input: string | URL, _init?: RequestInit) => Response.json({
      access_token: 'new-calendly-access',
      refresh_token: 'calendly-refresh-r2',
      expires_in: 7200,
      token_type: 'Bearer',
    }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await getUsableConnectorCredential(admin, 'page-1', 'calendly')

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.credential).toMatchObject({
      accessToken: 'new-calendly-access',
      refreshToken: 'calendly-refresh-r2',
    })
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://auth.calendly.com/oauth/token')
    expect(new URLSearchParams(String(fetchMock.mock.calls[0]?.[1]?.body)).get('refresh_token')).toBe('calendly-refresh-r1')
    const stored = updates.find((update) => typeof update.credential_encrypted === 'string')!
    expect(JSON.parse(decryptSecret(String(stored.credential_encrypted))!)).toMatchObject({
      accessToken: 'new-calendly-access',
      refreshToken: 'calendly-refresh-r2',
    })
  })

  it('keeps a fresh one-hour ServiceM8 token until the five-minute renewal window', async () => {
    const expiresAt = new Date(Date.now() + 45 * 60_000).toISOString()
    const row = {
      page_id: 'page-1',
      owner_id: 'owner-1',
      provider: 'servicem8',
      credential_encrypted: encryptSecret(JSON.stringify({
        accessToken: 'fresh-access',
        refreshToken: 'fresh-refresh',
        tokenType: 'Bearer',
        expiresAt,
      }))!,
      status: 'connected',
      external_account_id: null,
      granted_scopes: ['vendor', 'read_jobs'],
      capabilities: ['job_templates', 'jobs'],
      expires_at: expiresAt,
      last_synced_at: null,
      last_error: null,
      metadata: {},
      updated_at: new Date().toISOString(),
    }
    const admin = {
      from: () => ({
        select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row }) }) }) }),
      }),
    } as any
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const result = await getUsableConnectorCredential(admin, 'page-1', 'servicem8')

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.credential).toMatchObject({ accessToken: 'fresh-access', expiresAt })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('fails closed when a renewed credential cannot be persisted', async () => {
    const row = {
      page_id: 'page-1',
      owner_id: 'owner-1',
      provider: 'servicem8',
      credential_encrypted: encryptSecret(JSON.stringify({
        accessToken: 'old-access',
        refreshToken: 'old-refresh',
        tokenType: 'Bearer',
        expiresAt: '2026-01-01T00:00:00.000Z',
      }))!,
      status: 'connected',
      external_account_id: null,
      granted_scopes: ['read_jobs'],
      capabilities: ['jobs'],
      expires_at: '2026-01-01T00:00:00.000Z',
      last_synced_at: null,
      last_error: null,
      metadata: {},
      updated_at: '2026-01-01T00:00:00.000Z',
    }
    const admin = {
      from: () => ({
        select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row }) }) }) }),
        update: (values: Record<string, unknown>) => ({
          eq: () => ({
            eq: async () => ({ error: values.credential_encrypted ? new Error('write unavailable') : null }),
          }),
        }),
      }),
    } as any
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      access_token: 'new-access',
      refresh_token: 'new-refresh',
      expires_in: 3600,
    })))

    const result = await getUsableConnectorCredential(admin, 'page-1', 'servicem8')

    expect(result).toMatchObject({ ok: false })
    if (result.ok) return
    expect(result.error).toMatch(/renewed access but could not save it/i)
  })

  it('refreshes Square inside the required seven-day cadence instead of waiting for expiry', async () => {
    const expiringInTwentyDays = new Date(Date.now() + 20 * 24 * 60 * 60_000).toISOString()
    const row = {
      page_id: 'page-1',
      owner_id: 'owner-1',
      provider: 'square',
      credential_encrypted: encryptSecret(JSON.stringify({
        accessToken: 'old-square-access',
        refreshToken: 'old-square-refresh',
        tokenType: 'Bearer',
        expiresAt: expiringInTwentyDays,
      }))!,
      status: 'connected',
      external_account_id: 'merchant-1',
      granted_scopes: ['ITEMS_READ'],
      capabilities: ['catalog'],
      expires_at: expiringInTwentyDays,
      last_synced_at: null,
      last_error: null,
      metadata: {},
      updated_at: new Date().toISOString(),
    }
    const admin = {
      from: () => ({
        select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row }) }) }) }),
        update: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }),
      }),
    } as any
    const fetchMock = vi.fn(async (_input: string | URL, _init?: RequestInit) => Response.json({
      access_token: 'new-square-access',
      refresh_token: 'new-square-refresh',
      expires_in: 2_592_000,
      token_type: 'bearer',
    }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await getUsableConnectorCredential(admin, 'page-1', 'square')

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.credential).toMatchObject({ accessToken: 'new-square-access', refreshToken: 'new-square-refresh' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      grant_type: 'refresh_token',
      refresh_token: 'old-square-refresh',
    })
  })

  it('revokes Square with the required Client authorization header and keeps the secret out of the body', async () => {
    const credential = {
      accessToken: 'square-access',
      refreshToken: 'square-refresh',
      tokenType: 'Bearer',
      expiresAt: null,
    }
    const row = {
      page_id: 'page-1', owner_id: 'owner-1', provider: 'square',
      credential_encrypted: encryptSecret(JSON.stringify(credential))!, status: 'connected',
      external_account_id: 'merchant-1', granted_scopes: [], capabilities: [], expires_at: null,
      last_synced_at: null, last_error: null, metadata: {}, updated_at: new Date().toISOString(),
    }
    let merchantSelects = 0
    const userDeletes: string[] = []
    const admin = {
      from: (table: string) => {
        if (table === 'user_integrations') {
          return { delete: () => ({ eq: () => ({ eq: async () => { userDeletes.push(table); return { error: null } } }) }) }
        }
        return {
          select: () => {
            merchantSelects += 1
            const query: any = {
              eq: () => query,
              maybeSingle: async () => ({ data: row }),
              limit: async () => ({ data: [] }),
            }
            return query
          },
          delete: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }),
        }
      },
    } as any
    const fetchMock = vi.fn(async (_input: string | URL, _init?: RequestInit) => Response.json({ success: true }))
    vi.stubGlobal('fetch', fetchMock)

    expect(await disconnectMerchantConnector(admin, 'page-1', 'owner-1', 'square')).toEqual({ ok: true })
    expect(merchantSelects).toBe(2)
    expect(userDeletes).toEqual(['user_integrations'])
    const [, init] = fetchMock.mock.calls[0]!
    expect(init?.headers).toMatchObject({ authorization: 'Client square-secret' })
    expect(String(init?.body)).not.toContain('square-secret')
    expect(JSON.parse(String(init?.body))).toEqual({ client_id: 'square-app', access_token: 'square-access' })
  })

  it('revokes Acuity remotely before deleting the encrypted local connection', async () => {
    const credential = { accessToken: 'acuity-access', refreshToken: null, tokenType: 'Bearer', expiresAt: null }
    const row = {
      page_id: 'page-1', owner_id: 'owner-1', provider: 'acuity',
      credential_encrypted: encryptSecret(JSON.stringify(credential))!, status: 'connected',
      external_account_id: null, granted_scopes: ['api-v1'], capabilities: ['catalog'], expires_at: null,
      last_synced_at: null, last_error: null, metadata: {}, updated_at: new Date().toISOString(),
    }
    const admin = {
      from: (table: string) => {
        if (table === 'user_integrations') {
          return { delete: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }) }
        }
        return {
          select: () => {
            const query: any = {
              eq: () => query,
              maybeSingle: async () => ({ data: row }),
              limit: async () => ({ data: [] }),
            }
            return query
          },
          delete: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }),
        }
      },
    } as any
    const fetchMock = vi.fn(async (_input: string | URL, _init?: RequestInit) => Response.json({ success: true }))
    vi.stubGlobal('fetch', fetchMock)

    expect(await disconnectMerchantConnector(admin, 'page-1', 'owner-1', 'acuity')).toEqual({ ok: true })
    const [url, init] = fetchMock.mock.calls[0]!
    expect(String(url)).toBe('https://acuityscheduling.com/oauth2/disconnect')
    expect(init?.redirect).toBe('error')
    expect(init?.signal).toBeInstanceOf(AbortSignal)
    const body = new URLSearchParams(String(init?.body))
    expect(Object.fromEntries(body)).toEqual({
      access_token: 'acuity-access',
      client_id: 'acuity-client',
      client_secret: 'acuity-secret',
    })
  })

  it('revokes an expired Google connection with the stored refresh token without refreshing first', async () => {
    const credential = {
      accessToken: 'expired-google-access',
      refreshToken: 'google-refresh',
      tokenType: 'Bearer',
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    }
    const row = {
      page_id: 'page-1', owner_id: 'owner-1', provider: 'google_calendar',
      credential_encrypted: encryptSecret(JSON.stringify(credential))!, status: 'connected',
      external_account_id: null, granted_scopes: [], capabilities: [], expires_at: credential.expiresAt,
      last_synced_at: null, last_error: null, metadata: {}, updated_at: new Date().toISOString(),
    }
    const admin = {
      from: (table: string) => {
        if (table === 'user_integrations') {
          return { delete: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }) }
        }
        return {
          select: () => {
            const query: any = {
              eq: () => query,
              maybeSingle: async () => ({ data: row }),
              limit: async () => ({ data: [] }),
            }
            return query
          },
          delete: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }),
        }
      },
    } as any
    const fetchMock = vi.fn(async (_input: string | URL, _init?: RequestInit) => Response.json({ success: true }))
    vi.stubGlobal('fetch', fetchMock)

    expect(await disconnectMerchantConnector(admin, 'page-1', 'owner-1', 'google_calendar')).toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(String(url)).toBe('https://oauth2.googleapis.com/revoke')
    expect(new URLSearchParams(String(init?.body)).get('token')).toBe('google-refresh')
  })

  it('revokes Calendly with the registered client and latest refresh token before local deletion', async () => {
    const credential = {
      accessToken: 'calendly-access',
      refreshToken: 'calendly-refresh-r2',
      tokenType: 'Bearer',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    }
    const row = {
      page_id: 'page-1', owner_id: 'owner-1', provider: 'calendly',
      credential_encrypted: encryptSecret(JSON.stringify(credential))!, status: 'connected',
      external_account_id: 'https://api.calendly.com/users/user-1', granted_scopes: [], capabilities: [], expires_at: credential.expiresAt,
      last_synced_at: null, last_error: null, metadata: {}, updated_at: new Date().toISOString(),
    }
    const admin = {
      from: (table: string) => {
        if (table === 'user_integrations') {
          return { delete: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }) }
        }
        return {
          select: () => {
            const query: any = {
              eq: () => query,
              maybeSingle: async () => ({ data: row }),
              limit: async () => ({ data: [] }),
            }
            return query
          },
          delete: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }),
        }
      },
    } as any
    const fetchMock = vi.fn(async (_input: string | URL, _init?: RequestInit) => Response.json({}))
    vi.stubGlobal('fetch', fetchMock)

    expect(await disconnectMerchantConnector(admin, 'page-1', 'owner-1', 'calendly')).toEqual({ ok: true })

    const [url, init] = fetchMock.mock.calls[0]!
    expect(String(url)).toBe('https://auth.calendly.com/oauth/revoke')
    expect(Object.fromEntries(new URLSearchParams(String(init?.body)))).toEqual({
      client_id: 'calendly-client',
      client_secret: 'calendly-secret',
      token: 'calendly-refresh-r2',
    })
  })
})
