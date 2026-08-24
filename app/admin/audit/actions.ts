'use server'

import { revalidatePath } from 'next/cache'
import { requirePlatformAdmin } from '../../../lib/server/admin-access'
import { grantPlatformAdminAccess } from '../../../lib/server/admin-governance'

export type AdminGrantActionState = { ok: boolean; message: string }

export async function grantPlatformAdminAction(
  _previousState: AdminGrantActionState,
  formData: FormData,
): Promise<AdminGrantActionState> {
  const actor = await requirePlatformAdmin('/admin/audit')
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const note = String(formData.get('note') ?? '').trim()

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 320) {
    return { ok: false, message: 'Enter the email for an existing Nexez account.' }
  }
  if (note.length > 500) {
    return { ok: false, message: 'Access notes must be 500 characters or fewer.' }
  }

  try {
    await grantPlatformAdminAccess({ actorId: actor.id, email, note: note || null })
    revalidatePath('/admin/audit')
    return { ok: true, message: `Admin access granted to ${email}.` }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Could not grant platform-admin access.',
    }
  }
}
