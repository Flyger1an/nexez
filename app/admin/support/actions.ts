'use server'

import { revalidatePath } from 'next/cache'
import { requirePlatformAdmin } from '../../../lib/server/admin-access'
import {
  recordSupportTicketUpdate,
  SUPPORT_STATUSES,
  type SupportStatus,
} from '../../../lib/server/support-operations'

export type SupportActionState = { ok: boolean; message: string }

export async function updateSupportTicketAction(
  ticketId: string,
  _previousState: SupportActionState,
  formData: FormData,
): Promise<SupportActionState> {
  const admin = await requirePlatformAdmin(`/admin/support/${ticketId}`)
  const status = String(formData.get('status') ?? '')
  const note = String(formData.get('note') ?? '').trim()

  if (!SUPPORT_STATUSES.includes(status as SupportStatus)) {
    return { ok: false, message: 'Choose a valid support status.' }
  }
  if (note.length > 2_000) {
    return { ok: false, message: 'Operator notes must be 2,000 characters or fewer.' }
  }

  try {
    await recordSupportTicketUpdate({
      ticketId,
      actorId: admin.id,
      status: status as SupportStatus,
      note: note || null,
    })
    revalidatePath('/admin/support')
    revalidatePath(`/admin/support/${ticketId}`)
    return { ok: true, message: 'Support request updated.' }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Could not update the support request.',
    }
  }
}
