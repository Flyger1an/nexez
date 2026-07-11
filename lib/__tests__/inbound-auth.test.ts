import { describe, expect, it } from 'vitest'
import crypto from 'node:crypto'
import {
  authorizeInboundRequest,
  verifyBearerToken,
  verifySignedPayload,
  readBearerToken,
  readIdempotencyKey,
} from '../commerce/inbound-auth'

const SECRET = 'sk_test_shared_secret'
const NOW_MS = 1_700_000_000_000
const NOW_SEC = Math.floor(NOW_MS / 1000)

function sign(secret: string, timestamp: number | string, body: string): string {
  return crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')
}

function req(headers: Record<string, string> = {}): Request {
  return new Request('https://nexez.app/api/acp/checkout_sessions', { method: 'POST', headers })
}

describe('verifyBearerToken', () => {
  it('accepts the exact secret, rejects mismatch/empty', () => {
    expect(verifyBearerToken(SECRET, SECRET)).toBe(true)
    expect(verifyBearerToken('wrong', SECRET)).toBe(false)
    expect(verifyBearerToken('', SECRET)).toBe(false)
    expect(verifyBearerToken(SECRET, '')).toBe(false)
    expect(verifyBearerToken(SECRET, null)).toBe(false)
  })
})

describe('readBearerToken', () => {
  it('parses a Bearer header case-insensitively', () => {
    expect(readBearerToken(req({ authorization: `Bearer ${SECRET}` }))).toBe(SECRET)
    expect(readBearerToken(req({ authorization: `bearer ${SECRET}` }))).toBe(SECRET)
    expect(readBearerToken(req({}))).toBeNull()
    expect(readBearerToken(req({ authorization: SECRET }))).toBeNull() // no scheme
  })
})

describe('verifySignedPayload', () => {
  const body = '{"amount":120000}'

  it('accepts a fresh, correctly-signed payload', () => {
    const sig = sign(SECRET, NOW_SEC, body)
    expect(verifySignedPayload(body, { timestamp: String(NOW_SEC), signature: sig }, SECRET, { nowMs: NOW_MS })).toBe(true)
  })

  it('rejects a tampered body', () => {
    const sig = sign(SECRET, NOW_SEC, body)
    expect(verifySignedPayload('{"amount":1}', { timestamp: String(NOW_SEC), signature: sig }, SECRET, { nowMs: NOW_MS })).toBe(false)
  })

  it('rejects a stale timestamp (replay) beyond tolerance', () => {
    const oldTs = NOW_SEC - 3600
    const sig = sign(SECRET, oldTs, body)
    expect(verifySignedPayload(body, { timestamp: String(oldTs), signature: sig }, SECRET, { nowMs: NOW_MS })).toBe(false)
  })

  it('rejects a future-dated timestamp beyond tolerance', () => {
    const futureTs = NOW_SEC + 3600
    const sig = sign(SECRET, futureTs, body)
    expect(verifySignedPayload(body, { timestamp: String(futureTs), signature: sig }, SECRET, { nowMs: NOW_MS })).toBe(false)
  })

  it('accepts within the tolerance window', () => {
    const ts = NOW_SEC - 120
    const sig = sign(SECRET, ts, body)
    expect(verifySignedPayload(body, { timestamp: String(ts), signature: sig }, SECRET, { nowMs: NOW_MS })).toBe(true)
  })

  it('rejects a wrong-secret signature, missing parts, non-numeric timestamp', () => {
    expect(verifySignedPayload(body, { timestamp: String(NOW_SEC), signature: sign('other', NOW_SEC, body) }, SECRET, { nowMs: NOW_MS })).toBe(false)
    expect(verifySignedPayload(body, { timestamp: String(NOW_SEC), signature: null }, SECRET, { nowMs: NOW_MS })).toBe(false)
    expect(verifySignedPayload(body, { timestamp: 'abc', signature: sign(SECRET, 'abc', body) }, SECRET, { nowMs: NOW_MS })).toBe(false)
    expect(verifySignedPayload(body, { timestamp: String(NOW_SEC), signature: sign(SECRET, NOW_SEC, body) }, null, { nowMs: NOW_MS })).toBe(false)
  })
})

describe('authorizeInboundRequest — fail closed', () => {
  const body = '{"x":1}'

  it('rejects when no secret is configured (dormant surface)', () => {
    const res = authorizeInboundRequest(req({ authorization: `Bearer ${SECRET}` }), body, { secret: null })
    expect(res).toEqual({ ok: false, status: 401, reason: 'inbound_auth_not_configured' })
  })

  it('accepts a valid bearer token', () => {
    const res = authorizeInboundRequest(req({ authorization: `Bearer ${SECRET}` }), body, { secret: SECRET })
    expect(res).toEqual({ ok: true })
  })

  it('accepts a valid signature', () => {
    const sig = sign(SECRET, NOW_SEC, body)
    const res = authorizeInboundRequest(
      req({ 'x-nexez-timestamp': String(NOW_SEC), 'x-nexez-signature': sig }),
      body,
      { secret: SECRET, nowMs: NOW_MS },
    )
    expect(res).toEqual({ ok: true })
  })

  it('rejects when neither credential is valid', () => {
    const res = authorizeInboundRequest(req({ authorization: 'Bearer nope' }), body, { secret: SECRET })
    expect(res).toEqual({ ok: false, status: 401, reason: 'inbound_auth_failed' })
  })

  it('mode "signature" ignores a valid bearer; mode "bearer" ignores a valid signature', () => {
    const bearerReq = req({ authorization: `Bearer ${SECRET}` })
    expect(authorizeInboundRequest(bearerReq, body, { secret: SECRET, mode: 'signature' })).toMatchObject({ ok: false })

    const sig = sign(SECRET, NOW_SEC, body)
    const sigReq = req({ 'x-nexez-timestamp': String(NOW_SEC), 'x-nexez-signature': sig })
    expect(authorizeInboundRequest(sigReq, body, { secret: SECRET, mode: 'bearer', nowMs: NOW_MS })).toMatchObject({ ok: false })
  })

  it('supports custom signature/timestamp header names', () => {
    const sig = sign(SECRET, NOW_SEC, body)
    const res = authorizeInboundRequest(
      req({ 'openai-timestamp': String(NOW_SEC), 'openai-signature': sig }),
      body,
      { secret: SECRET, nowMs: NOW_MS, signatureHeader: 'openai-signature', timestampHeader: 'openai-timestamp' },
    )
    expect(res).toEqual({ ok: true })
  })
})

describe('readIdempotencyKey', () => {
  it('accepts a valid key, rejects malformed/oversized/empty', () => {
    expect(readIdempotencyKey(req({ 'idempotency-key': 'ord_abc-123.4~5' }))).toBe('ord_abc-123.4~5')
    expect(readIdempotencyKey(req({ 'idempotency-key': '  key1  ' }))).toBe('key1') // trimmed
    expect(readIdempotencyKey(req({}))).toBeNull()
    expect(readIdempotencyKey(req({ 'idempotency-key': '' }))).toBeNull()
    expect(readIdempotencyKey(req({ 'idempotency-key': 'has space' }))).toBeNull()
    expect(readIdempotencyKey(req({ 'idempotency-key': 'x'.repeat(256) }))).toBeNull()
  })
})
