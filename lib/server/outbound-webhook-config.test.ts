import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  outboundWebhooksForClient,
  outboundWebhooksForDelivery,
  protectOutboundWebhookSecret,
  sealOutboundWebhooks,
} from './outbound-webhook-config'

const KEY = '22'.repeat(32)

describe('outbound webhook configuration', () => {
  beforeEach(() => vi.stubEnv('INTEGRATION_SECRET_KEY', KEY))
  afterEach(() => vi.unstubAllEnvs())

  it('encrypts new secrets and returns only presence metadata to clients', () => {
    const sealed = sealOutboundWebhooks(
      [{ url: 'https://hooks.zapier.com/hooks/catch/1/abc', secret: 'merchant-secret' }],
      [],
    )
    expect(sealed.ok).toBe(true)
    if (!sealed.ok) return
    expect(sealed.value[0].secret).not.toBe('merchant-secret')
    expect(outboundWebhooksForClient(sealed.value)).toEqual([
      { url: 'https://hooks.zapier.com/hooks/catch/1/abc', hasSecret: true },
    ])
    expect(outboundWebhooksForDelivery(sealed.value)).toEqual([
      { url: 'https://hooks.zapier.com/hooks/catch/1/abc', secret: 'merchant-secret' },
    ])
  })

  it('preserves and upgrades a legacy plaintext secret without returning it', () => {
    const existing = [{ url: 'https://hooks.example.com/a', secret: 'legacy-secret' }]
    const sealed = sealOutboundWebhooks([{ url: 'https://hooks.example.com/a', hasSecret: true }], existing)
    expect(sealed.ok).toBe(true)
    if (!sealed.ok) return
    expect(sealed.value[0].secret).not.toBe('legacy-secret')
    expect(outboundWebhooksForDelivery(sealed.value)[0].secret).toBe('legacy-secret')
  })

  it('rejects private, non-HTTPS, oversized, and unencryptable inputs', () => {
    expect(sealOutboundWebhooks([{ url: 'http://example.com' }], [])).toMatchObject({ ok: false })
    expect(sealOutboundWebhooks([{ url: 'https://localhost/a' }], [])).toMatchObject({ ok: false })
    expect(sealOutboundWebhooks(Array.from({ length: 11 }, (_, index) => ({ url: `https://e${index}.example.com` })), [])).toMatchObject({ ok: false })
    vi.stubEnv('INTEGRATION_SECRET_KEY', '')
    expect(protectOutboundWebhookSecret('secret')).toBeNull()
  })
})
