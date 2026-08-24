import { beforeEach, describe, expect, it, vi } from 'vitest'

const requireAdmin = vi.hoisted(() => vi.fn())
const grantAccess = vi.hoisted(() => vi.fn())
const revalidatePath = vi.hoisted(() => vi.fn())

vi.mock('next/cache', () => ({ revalidatePath }))
vi.mock('../../../lib/server/admin-access', () => ({ requirePlatformAdmin: requireAdmin }))
vi.mock('../../../lib/server/admin-governance', () => ({ grantPlatformAdminAccess: grantAccess }))

import { grantPlatformAdminAction } from './actions'

describe('grantPlatformAdminAction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireAdmin.mockResolvedValue({ id: 'admin-1' })
    grantAccess.mockResolvedValue('admin-2')
  })

  it('re-checks the acting admin and grants a normalized existing account', async () => {
    const formData = new FormData()
    formData.set('email', ' New.Admin@Nexez.AI ')
    formData.set('note', 'Support lead')

    await expect(grantPlatformAdminAction({ ok: false, message: '' }, formData)).resolves.toEqual({
      ok: true,
      message: 'Admin access granted to new.admin@nexez.ai.',
    })
    expect(requireAdmin).toHaveBeenCalledWith('/admin/audit')
    expect(grantAccess).toHaveBeenCalledWith({
      actorId: 'admin-1',
      email: 'new.admin@nexez.ai',
      note: 'Support lead',
    })
    expect(revalidatePath).toHaveBeenCalledWith('/admin/audit')
  })

  it('rejects invalid input without calling the grant operation', async () => {
    const formData = new FormData()
    formData.set('email', 'not-an-email')

    await expect(grantPlatformAdminAction({ ok: false, message: '' }, formData)).resolves.toEqual({
      ok: false,
      message: 'Enter the email for an existing Nexez account.',
    })
    expect(requireAdmin).toHaveBeenCalledOnce()
    expect(grantAccess).not.toHaveBeenCalled()
  })

  it('surfaces a protected database rejection without revalidating', async () => {
    grantAccess.mockRejectedValue(new Error('That account already has platform-admin access.'))
    const formData = new FormData()
    formData.set('email', 'current@nexez.ai')

    await expect(grantPlatformAdminAction({ ok: false, message: '' }, formData)).resolves.toEqual({
      ok: false,
      message: 'That account already has platform-admin access.',
    })
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})
