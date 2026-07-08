import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  configured: true,
  pat: 'pat' as string | null,
  cancelOk: true,
  cancelCalls: [] as Array<{ pat: string; uuid: string; reason?: string }>,
}))

vi.mock('./calendly-write', () => ({
  cancelCalendlyEvent: vi.fn(async (pat: string, uuid: string, reason?: string) => {
    h.cancelCalls.push({ pat, uuid, reason })
    return h.cancelOk
  }),
  // Real regex behavior matters here — reuse a faithful implementation.
  calendlyEventUuid: (uri: string | null | undefined) =>
    uri?.match(/scheduled_events\/([A-Za-z0-9-]{16,})(?:\/|$|\?)/)?.[1] ?? null,
}))
vi.mock('./page-integration-credentials', () => ({
  integrationCredentialsConfigured: () => h.configured,
  getCalendlyPat: async () => h.pat,
}))
vi.mock('../observability', () => ({ captureEvent: vi.fn() }))

import { cancelCalendlyForRefund } from './calendly-cancel-on-refund'

const EVENT_URI = 'https://api.calendly.com/scheduled_events/AbC123dEf456GhI7'

function adminMock() {
  const updates: any[] = []
  const admin = {
    from: () => ({
      update: (payload: any) => {
        updates.push(payload)
        return { eq: () => ({ is: () => Promise.resolve({ error: null }) }) }
      },
    }),
  }
  return { admin: admin as any, updates }
}

const neg = (over: Record<string, any> = {}) => ({
  id: 'neg-1',
  page_id: 'pg-1',
  calendly_event_uri: EVENT_URI,
  calendly_cancelled_at: null,
  ...over,
})

describe('cancelCalendlyForRefund', () => {
  beforeEach(() => {
    h.configured = true
    h.pat = 'pat'
    h.cancelOk = true
    h.cancelCalls = []
  })

  it('cancels the linked event and stamps calendly_cancelled_at on success', async () => {
    const { admin, updates } = adminMock()
    const out = await cancelCalendlyForRefund(admin, neg())
    expect(out).toEqual({ cancelled: true })
    expect(h.cancelCalls).toHaveLength(1)
    expect(h.cancelCalls[0]!.uuid).toBe('AbC123dEf456GhI7')
    expect(updates).toHaveLength(1)
    expect(updates[0].calendly_cancelled_at).toBeTruthy()
  })

  it('dormant when the credential store is not configured (no key)', async () => {
    h.configured = false
    const { admin } = adminMock()
    expect(await cancelCalendlyForRefund(admin, neg())).toEqual({ cancelled: false, reason: 'not_configured' })
    expect(h.cancelCalls).toHaveLength(0)
  })

  it('no-ops when there is no linked event or no page', async () => {
    const { admin } = adminMock()
    expect(await cancelCalendlyForRefund(admin, neg({ calendly_event_uri: null }))).toEqual({ cancelled: false, reason: 'no_event' })
    expect(await cancelCalendlyForRefund(admin, neg({ page_id: null }))).toEqual({ cancelled: false, reason: 'no_page' })
  })

  it('idempotent: skips when already cancelled', async () => {
    const { admin } = adminMock()
    expect(await cancelCalendlyForRefund(admin, neg({ calendly_cancelled_at: '2026-07-08T00:00:00Z' }))).toEqual({ cancelled: false, reason: 'already_cancelled' })
    expect(h.cancelCalls).toHaveLength(0)
  })

  it('bad event URI → no API call, reason bad_uri', async () => {
    const { admin } = adminMock()
    expect(await cancelCalendlyForRefund(admin, neg({ calendly_event_uri: 'https://calendly.com/acme/intro' }))).toEqual({ cancelled: false, reason: 'bad_uri' })
    expect(h.cancelCalls).toHaveLength(0)
  })

  it('no PAT (page disconnected) → reason no_pat', async () => {
    h.pat = null
    const { admin } = adminMock()
    expect(await cancelCalendlyForRefund(admin, neg())).toEqual({ cancelled: false, reason: 'no_pat' })
  })

  it('leaves the row unstamped (retryable) when Calendly rejects the cancel', async () => {
    h.cancelOk = false
    const { admin, updates } = adminMock()
    expect(await cancelCalendlyForRefund(admin, neg())).toEqual({ cancelled: false, reason: 'calendly_failed' })
    expect(updates).toHaveLength(0) // NOT stamped → a later event can retry
  })
})
