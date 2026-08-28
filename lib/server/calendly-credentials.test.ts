import { beforeEach, describe, expect, it, vi } from 'vitest'

const refs = vi.hoisted(() => ({
  row: null as { status: 'connected' | 'attention' | 'revoked' } | null,
  usable: { ok: false, error: 'Not connected' } as any,
  personalToken: 'legacy-personal-token' as string | null,
}))

vi.mock('./merchant-connectors', () => ({
  getMerchantConnectorRow: vi.fn(async () => refs.row),
  getUsableConnectorCredential: vi.fn(async () => refs.usable),
}))
vi.mock('./page-integration-credentials', () => ({
  getCalendlyPat: vi.fn(async () => refs.personalToken),
}))

import { getCalendlyCredential } from './calendly-credentials'
import { getCalendlyPat } from './page-integration-credentials'

describe('getCalendlyCredential', () => {
  beforeEach(() => {
    refs.row = null
    refs.usable = { ok: false, error: 'Not connected' }
    refs.personalToken = 'legacy-personal-token'
    vi.clearAllMocks()
  })

  it('uses managed OAuth without reading a retained personal token', async () => {
    refs.row = { status: 'connected' }
    refs.usable = {
      ok: true,
      credential: { accessToken: 'oauth-access', refreshToken: 'refresh', tokenType: 'Bearer', expiresAt: null },
      row: refs.row,
    }

    await expect(getCalendlyCredential({} as any, 'page-1')).resolves.toEqual({
      accessToken: 'oauth-access',
      source: 'oauth',
    })
    expect(getCalendlyPat).not.toHaveBeenCalled()
  })

  it('does not hide a broken active OAuth connection behind an older personal token', async () => {
    refs.row = { status: 'attention' }

    await expect(getCalendlyCredential({} as any, 'page-1')).resolves.toBeNull()
    expect(getCalendlyPat).not.toHaveBeenCalled()
  })

  it('keeps legacy personal tokens working when no active managed connection exists', async () => {
    await expect(getCalendlyCredential({} as any, 'page-1')).resolves.toEqual({
      accessToken: 'legacy-personal-token',
      source: 'personal_token',
    })

    refs.row = { status: 'revoked' }
    await expect(getCalendlyCredential({} as any, 'page-1')).resolves.toEqual({
      accessToken: 'legacy-personal-token',
      source: 'personal_token',
    })
  })
})
