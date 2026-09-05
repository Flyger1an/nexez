import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSupabaseMock } from '../../../../test/supabase-mock'
const refs = vi.hoisted(() => ({ page: null as any, sign: vi.fn() }))
vi.mock('../../../../utils/supabase/admin', () => ({
  hasSupabaseAdminEnv: () => true,
  createAdminClient: () => Object.assign(createSupabaseMock(() => ({ data: refs.page })), {
    storage: { from: () => ({ createSignedUrl: refs.sign }) },
  }),
}))
import { GET } from './route'
const request = () => new Request('https://audit.invalid/api/credentials/view?slug=owned-page&id=doc-1')
describe('credential signing authority', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    refs.page = { id: 'page-1', owner_id: 'owner-1', is_published: true,
      verification_details: { docs_provided: [{ id: 'doc-1', file_path: 'owner-1/page-1/doc-1.pdf', status: 'verified', public: true }] } }
    refs.sign.mockResolvedValue({ data: { signedUrl: 'https://storage.invalid/signed' }, error: null })
  })
  it('signs only the bound public document with a noncacheable redirect', async () => {
    const response = await GET(request())
    expect(response.status).toBe(307)
    expect(refs.sign).toHaveBeenCalledWith('owner-1/page-1/doc-1.pdf', 600)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
  })
  it.each(['other-owner/page-1/doc-1.pdf', 'owner-1/other-page/doc-1.pdf',
    'owner-1/page-1/other-document.pdf', 'owner-1/page-1/doc-1.pdf/../../private.pdf',
    'owner-1/page-1/doc-1.%2fprivate', 'owner-1/page-1/doc-1.pdf?download=other'])('rejects forged path %s before signing', async (path) => {
    refs.page.verification_details.docs_provided[0].file_path = path
    expect((await GET(request())).status).toBe(404)
    expect(refs.sign).not.toHaveBeenCalled()
  })
  it.each(['unpublished', 'private', 'unverified'])('rejects a %s document', async (state) => {
    if (state === 'unpublished') refs.page.is_published = false
    if (state === 'private') refs.page.verification_details.docs_provided[0].public = false
    if (state === 'unverified') refs.page.verification_details.docs_provided[0].status = 'pending'
    expect((await GET(request())).status).toBe(404)
    expect(refs.sign).not.toHaveBeenCalled()
  })
})
