import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { encryptSecret, decryptSecret, hasSecretCryptoKey } from './secret-crypto'

const KEY_HEX = 'a'.repeat(64) // 32 bytes of 0xaa

describe('secret-crypto', () => {
  afterEach(() => vi.unstubAllEnvs())

  describe('with a configured key', () => {
    beforeEach(() => vi.stubEnv('INTEGRATION_SECRET_KEY', KEY_HEX))

    it('round-trips a secret (ciphertext differs from plaintext + per-call IV)', () => {
      const enc1 = encryptSecret('cal_pat_abc123')
      const enc2 = encryptSecret('cal_pat_abc123')
      expect(enc1).toBeTruthy()
      expect(enc1).not.toContain('cal_pat_abc123')
      expect(enc1).not.toBe(enc2) // random IV → distinct ciphertexts
      expect(decryptSecret(enc1)).toBe('cal_pat_abc123')
      expect(decryptSecret(enc2)).toBe('cal_pat_abc123')
    })

    it('hasSecretCryptoKey is true; empty input encrypts to null', () => {
      expect(hasSecretCryptoKey()).toBe(true)
      expect(encryptSecret('')).toBeNull()
    })

    it('decrypt returns null on tamper / malformed / wrong version', () => {
      const enc = encryptSecret('tok')!
      const [v, iv, ct, tag] = enc.split('.')
      expect(decryptSecret(`${v}.${iv}.${ct}.${Buffer.from('nope').toString('base64')}`)).toBeNull() // bad tag
      expect(decryptSecret('v1.only.three')).toBeNull()
      expect(decryptSecret(`v2.${iv}.${ct}.${tag}`)).toBeNull()
      expect(decryptSecret(null)).toBeNull()
    })

    it('accepts a base64 key too', () => {
      vi.stubEnv('INTEGRATION_SECRET_KEY', Buffer.alloc(32, 7).toString('base64'))
      const enc = encryptSecret('x')
      expect(decryptSecret(enc)).toBe('x')
    })
  })

  describe('without a key (dormant)', () => {
    it('encrypt/decrypt return null and hasSecretCryptoKey is false', () => {
      expect(hasSecretCryptoKey()).toBe(false)
      expect(encryptSecret('tok')).toBeNull()
      expect(decryptSecret('v1.a.b.c')).toBeNull()
    })

    it('an invalid key length is treated as no key', () => {
      vi.stubEnv('INTEGRATION_SECRET_KEY', 'tooshort')
      expect(hasSecretCryptoKey()).toBe(false)
      expect(encryptSecret('tok')).toBeNull()
    })
  })
})
