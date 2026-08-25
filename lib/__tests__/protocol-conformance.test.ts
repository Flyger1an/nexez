import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseAcpPaymentCredential } from '../acp/wire'
import { parseUcpPaymentCredential } from '../ucp/wire'

type Fixture<T> = {
  protocol: string
  version: string
  source: string
  request: T
  handler?: { name: string; id: string }
}

function loadFixture<T>(relativePath: string): Fixture<T> {
  const path = fileURLToPath(new URL(`../../test/protocol-fixtures/${relativePath}`, import.meta.url))
  return JSON.parse(readFileSync(path, 'utf8')) as Fixture<T>
}

describe('versioned protocol credential fixtures', () => {
  it('dispatches the official ACP 2026-04-17 SPT shape without treating it as a PaymentMethod', () => {
    const fixture = loadFixture<{ payment_data: unknown }>('acp/2026-04-17-complete.json')
    expect(fixture.protocol).toBe('acp')
    expect(fixture.version).toBe('2026-04-17')
    expect(fixture.source).toMatch(/^https:\/\/github\.com\/agentic-commerce-protocol\//)

    expect(parseAcpPaymentCredential(fixture.request.payment_data)).toEqual({
      ok: true,
      payment: {
        kind: 'shared_payment_token',
        token: 'spt_123',
        handlerId: 'card_tokenized',
      },
    })
  })

  it('binds the official Google Pay UCP instrument to its declared handler instance', () => {
    const fixture = loadFixture<{ payment: unknown }>('ucp/google-pay-2026-01-23-complete.json')
    expect(fixture.protocol).toBe('ucp-google-pay')
    expect(fixture.version).toBe('2026-01-23')
    expect(fixture.handler?.name).toBe('com.google.pay')

    const parsed = parseUcpPaymentCredential(fixture.request.payment, fixture.handler?.id ?? '')
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) throw new Error('expected Google Pay fixture to parse')
    expect(parsed.payment).toEqual({
      kind: 'google_pay',
      token: '{"signature":"fixture","protocolVersion":"ECv2"}',
      handlerId: fixture.handler?.id,
      credentialType: 'PAYMENT_GATEWAY',
    })
  })
})
