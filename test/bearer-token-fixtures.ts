import crypto from 'node:crypto'
import { vi } from 'vitest'

// Test-only helpers for the two buyer bearer tokens. The plaintext columns were
// dropped, so production code recovers a token by decrypting `*_encrypted`. A
// fixture that only supplies a plaintext value therefore resolves to null and the
// assertion fails somewhere unhelpful (a permalink quietly falls back to /orders).
//
// Stub the key, then build fixture ciphertext with the same payload format
// lib/server/secret-crypto.ts produces.

/** A fixed, obviously-fake 32-byte key. Never a real one. */
export const TEST_INTEGRATION_SECRET_KEY = Buffer.alloc(32, 7).toString('hex')

/** Point secret-crypto at the test key for the current test file. */
export function stubBearerTokenKey() {
  vi.stubEnv('INTEGRATION_SECRET_KEY', TEST_INTEGRATION_SECRET_KEY)
}

/** Ciphertext for `value`, readable by decryptSecret once the key is stubbed. */
export function encryptForTest(value: string): string {
  const key = Buffer.from(TEST_INTEGRATION_SECRET_KEY, 'hex')
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const enc = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return `v1.${iv.toString('base64')}.${enc.toString('base64')}.${cipher.getAuthTag().toString('base64')}`
}
