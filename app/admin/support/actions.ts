'use server'

import { revalidatePath } from 'next/cache'
import { requirePlatformAdmin } from '../../../lib/server/admin-access'
import {
  recordSupportTicketAssignment,
  recordSupportTicketUpdate,
  sendAdminSupportReply,
  SUPPORT_STATUSES,
  type SupportStatus,
} from '../../../lib/server/support-operations'

export type SupportActionState = { ok: boolean; message: string }
export type SupportReplyActionState = SupportActionState & { completedToken?: string }

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

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

export async function assignSupportTicketAction(
  ticketId: string,
  _previousState: SupportActionState,
  formData: FormData,
): Promise<SupportActionState> {
  const admin = await requirePlatformAdmin(`/admin/support/${ticketId}`)
  const assignedTo = String(formData.get('assignedTo') ?? '').trim()

  if (assignedTo && !UUID_PATTERN.test(assignedTo)) {
    return { ok: false, message: 'Choose a valid support operator.' }
  }

  try {
    await recordSupportTicketAssignment({
      ticketId,
      actorId: admin.id,
      assignedTo: assignedTo || null,
    })
    revalidatePath('/admin/support')
    revalidatePath(`/admin/support/${ticketId}`)
    return { ok: true, message: assignedTo ? 'Support request assigned.' : 'Support request unassigned.' }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Could not assign the support request.',
    }
  }
}

export async function sendSupportReplyAction(
  ticketId: string,
  _previousState: SupportReplyActionState,
  formData: FormData,
): Promise<SupportReplyActionState> {
  const admin = await requirePlatformAdmin(`/admin/support/${ticketId}`)
  const body = String(formData.get('body') ?? '').trim()
  const idempotencyToken = String(formData.get('idempotencyToken') ?? '').trim()

  if (!body) return { ok: false, message: 'Write a reply before sending.' }
  if (body.length > 10_000) return { ok: false, message: 'Replies must be 10,000 characters or fewer.' }
  if (!UUID_PATTERN.test(idempotencyToken)) {
    return { ok: false, message: 'Refresh this page before sending the reply.' }
  }

  try {
    await sendAdminSupportReply({ ticketId, actorId: admin.id, body, idempotencyToken })
    revalidatePath('/admin/support')
    revalidatePath(`/admin/support/${ticketId}`)
    revalidatePath(`/support/requests/${ticketId}`)
    return { ok: true, message: 'Reply accepted by the email provider.', completedToken: idempotencyToken }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Could not send the support reply.',
    }
  }
}
