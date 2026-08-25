import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requirePlatformAdmin: vi.fn(),
  recordUpdate: vi.fn(),
  recordAssignment: vi.fn(),
  sendReply: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('../../../lib/server/admin-access', () => ({ requirePlatformAdmin: mocks.requirePlatformAdmin }))
vi.mock('../../../lib/server/support-operations', () => ({
  SUPPORT_STATUSES: ['open', 'in_review', 'waiting_on_user', 'resolved', 'closed'],
  recordSupportTicketUpdate: mocks.recordUpdate,
  recordSupportTicketAssignment: mocks.recordAssignment,
  sendAdminSupportReply: mocks.sendReply,
}))

import {
  assignSupportTicketAction,
  sendSupportReplyAction,
  updateSupportTicketAction,
} from './actions'

const TICKET_ID = '10000000-0000-4000-8000-000000000001'
const ADMIN_ID = '20000000-0000-4000-8000-000000000001'
const ASSIGNEE_ID = '30000000-0000-4000-8000-000000000001'
const TOKEN = '40000000-0000-4000-8000-000000000001'

describe('admin support actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePlatformAdmin.mockResolvedValue({ id: ADMIN_ID })
    mocks.recordUpdate.mockResolvedValue(undefined)
    mocks.recordAssignment.mockResolvedValue(undefined)
    mocks.sendReply.mockResolvedValue({ messageId: 'message-1', emailId: 'email-1' })
  })

  it('rechecks admin access and delegates a validated status update', async () => {
    const form = new FormData()
    form.set('status', 'in_review')
    form.set('note', '  Reproducing the issue.  ')

    await expect(updateSupportTicketAction(TICKET_ID, { ok: false, message: '' }, form)).resolves.toEqual({
      ok: true,
      message: 'Support request updated.',
    })
    expect(mocks.requirePlatformAdmin).toHaveBeenCalledWith(`/admin/support/${TICKET_ID}`)
    expect(mocks.recordUpdate).toHaveBeenCalledWith({
      ticketId: TICKET_ID,
      actorId: ADMIN_ID,
      status: 'in_review',
      note: 'Reproducing the issue.',
    })
  })

  it('rejects an invalid assignment before the database operation', async () => {
    const form = new FormData()
    form.set('assignedTo', 'not-a-user-id')

    await expect(assignSupportTicketAction(TICKET_ID, { ok: false, message: '' }, form)).resolves.toEqual({
      ok: false,
      message: 'Choose a valid support operator.',
    })
    expect(mocks.recordAssignment).not.toHaveBeenCalled()
  })

  it('records an audited operator assignment', async () => {
    const form = new FormData()
    form.set('assignedTo', ASSIGNEE_ID)

    await expect(assignSupportTicketAction(TICKET_ID, { ok: false, message: '' }, form)).resolves.toEqual({
      ok: true,
      message: 'Support request assigned.',
    })
    expect(mocks.recordAssignment).toHaveBeenCalledWith({
      ticketId: TICKET_ID,
      actorId: ADMIN_ID,
      assignedTo: ASSIGNEE_ID,
    })
  })

  it('sends a trimmed reply with a validated idempotency token', async () => {
    const form = new FormData()
    form.set('body', '  We found the issue and are checking it now.  ')
    form.set('idempotencyToken', TOKEN)

    await expect(sendSupportReplyAction(TICKET_ID, { ok: false, message: '' }, form)).resolves.toEqual({
      ok: true,
      message: 'Reply accepted by the email provider.',
      completedToken: TOKEN,
    })
    expect(mocks.sendReply).toHaveBeenCalledWith({
      ticketId: TICKET_ID,
      actorId: ADMIN_ID,
      body: 'We found the issue and are checking it now.',
      idempotencyToken: TOKEN,
    })
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/support/requests/${TICKET_ID}`)
  })

  it('does not send a reply with an invalid submission token', async () => {
    const form = new FormData()
    form.set('body', 'We found the issue.')
    form.set('idempotencyToken', 'bad-token')

    await expect(sendSupportReplyAction(TICKET_ID, { ok: false, message: '' }, form)).resolves.toEqual({
      ok: false,
      message: 'Refresh this page before sending the reply.',
    })
    expect(mocks.sendReply).not.toHaveBeenCalled()
  })
})
