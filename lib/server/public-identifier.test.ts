import { beforeEach, describe, expect, it, vi } from 'vitest'

const refs = vi.hoisted(() => ({ data: null as unknown, error: null as { message: string } | null }))

vi.mock('../../utils/supabase/admin', () => ({
  hasSupabaseAdminEnv: vi.fn(() => true),
  createAdminClient: vi.fn(() => ({
    rpc: vi.fn(async () => ({ data: refs.data, error: refs.error })),
  })),
}))

import {
  getPublicIdentifierAvailability,
  renamedPageArtifactRedirect,
  resolveRenamedPageSlug,
} from './public-identifier'

describe('public identifier server helpers', () => {
  beforeEach(() => {
    refs.data = null
    refs.error = null
  })

  it('maps the service-only availability row', async () => {
    refs.data = [{ available: true, reason: 'owned' }]
    await expect(getPublicIdentifierAvailability({
      namespace: 'page_slug',
      identifier: 'current-listing',
      ownerId: 'owner-1',
      subjectId: 'page-1',
    })).resolves.toEqual({ available: true, reason: 'owned' })
  })

  it('resolves a published listing alias', async () => {
    refs.data = 'current-listing'
    await expect(resolveRenamedPageSlug('old-listing')).resolves.toBe('current-listing')
  })

  it('permanently redirects an artifact while preserving its suffix and query', async () => {
    refs.data = 'current-listing'
    const response = await renamedPageArtifactRedirect(
      new Request('https://nexez.app/old-listing/agent.json?source=test'),
      'old-listing',
    )
    expect(response?.status).toBe(308)
    expect(response?.headers.get('location')).toBe('https://nexez.app/current-listing/agent.json?source=test')
  })
})
