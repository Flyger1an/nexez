// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SupportRequesterReply } from './SupportRequesterReply'

const refresh = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}))

describe('SupportRequesterReply', () => {
  afterEach(() => {
    cleanup()
    refresh.mockReset()
    vi.unstubAllGlobals()
  })

  it('sends a tracked portal reply and refreshes the conversation', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      messageId: 'message-1',
      notificationStatus: 'sent',
    }), { status: 201, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    render(
      <SupportRequesterReply
        ticketId="ticket-1"
        initialMessageId="client-message-1"
        closed={false}
      />,
    )

    fireEvent.change(screen.getByRole('textbox', { name: 'Reply to support' }), {
      target: { value: 'The checkout error is still happening.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send reply' }))

    expect(await screen.findByText('Reply sent to Nexez Support.')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/support/tickets/ticket-1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        body: 'The checkout error is still happening.',
        clientMessageId: 'client-message-1',
      }),
    })
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce())
    expect(screen.getByRole('textbox', { name: 'Reply to support' })).toHaveValue('')
  })

  it('does not expose a reply form for closed requests', () => {
    render(
      <SupportRequesterReply
        ticketId="ticket-1"
        initialMessageId="client-message-1"
        closed
      />,
    )

    expect(screen.getByText('This request is closed')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Reply to support' })).not.toBeInTheDocument()
  })
})
