import { describe, it, expect, vi, beforeEach } from 'vitest'

const refs = vi.hoisted(() => ({
  hasAdmin: true,
  hasKey: true,
  upsertArg: null as any,
  row: null as { calendly_pat_encrypted: string | null } | null,
}))

vi.mock('../../utils/supabase/admin', () => ({
  hasSupabaseAdminEnv: () => refs.hasAdmin,
  createAdminClient: () => ({
    from: () => ({
      upsert: (arg: any) => {
        refs.upsertArg = arg
        return Promise.resolve({ error: null })
      },
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: refs.row }) }) }),
    }),
  }),
}))
vi.mock('./secret-crypto', () => ({
  hasSecretCryptoKey: () => refs.hasKey,
  encryptSecret: (v: string) => (refs.hasKey && v ? `enc:${v}` : null),
  decryptSecret: (v: string | null) => (refs.hasKey && v?.startsWith('enc:') ? v.slice(4) : null),
}))

import { saveCalendlyPat, getCalendlyPat, hasCalendlyPat, integrationCredentialsConfigured } from './page-integration-credentials'

beforeEach(() => {
  refs.hasAdmin = true
  refs.hasKey = true
  refs.upsertArg = null
  refs.row = null
})

describe('page-integration-credentials', () => {
  it('integrationCredentialsConfigured needs BOTH admin env and a crypto key', () => {
    expect(integrationCredentialsConfigured()).toBe(true)
    refs.hasKey = false
    expect(integrationCredentialsConfigured()).toBe(false)
    refs.hasKey = true
    refs.hasAdmin = false
    expect(integrationCredentialsConfigured()).toBe(false)
  })

  it('saveCalendlyPat persists via the encrypt helper, in the ciphertext column only', async () => {
    expect(await saveCalendlyPat('p1', 'o1', 'cal_raw')).toBe('saved')
    expect(refs.upsertArg.calendly_pat_encrypted).toBe('enc:cal_raw') // went through encryptSecret
    expect('calendly_pat' in refs.upsertArg).toBe(false) // no raw-token column ever written
    expect(refs.upsertArg).toMatchObject({ page_id: 'p1', owner_id: 'o1' })
  })

  it('an empty pat clears the stored token', async () => {
    expect(await saveCalendlyPat('p1', 'o1', '   ')).toBe('cleared')
    expect(refs.upsertArg.calendly_pat_encrypted).toBeNull()
  })

  it('saveCalendlyPat is unconfigured without a crypto key (never stores plaintext)', async () => {
    refs.hasKey = false
    expect(await saveCalendlyPat('p1', 'o1', 'cal_raw')).toBe('unconfigured')
  })

  it('getCalendlyPat decrypts the stored ciphertext (the only raw-token materialization)', async () => {
    refs.row = { calendly_pat_encrypted: 'enc:cal_raw' }
    expect(await getCalendlyPat('p1')).toBe('cal_raw')
  })

  it('getCalendlyPat is null with no row / no key', async () => {
    refs.row = null
    expect(await getCalendlyPat('p1')).toBeNull()
    refs.row = { calendly_pat_encrypted: 'enc:cal_raw' }
    refs.hasKey = false
    expect(await getCalendlyPat('p1')).toBeNull()
  })

  it('hasCalendlyPat reflects ciphertext presence (boolean only)', async () => {
    refs.row = { calendly_pat_encrypted: 'enc:cal_raw' }
    expect(await hasCalendlyPat('p1')).toBe(true)
    refs.row = { calendly_pat_encrypted: null }
    expect(await hasCalendlyPat('p1')).toBe(false)
  })
})
