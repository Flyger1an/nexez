// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TeamInvites } from './TeamInvites'

const refs = vi.hoisted(() => ({
  loadError: false,
  invites: [{
    id: 'invite-1',
    email: 'teammate@example.com',
    role: 'editor',
    status: 'pending',
    created_at: '2026-08-21T00:00:00.000Z',
  }],
}))

vi.mock('../utils/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'owner-1' } } })) },
    from: () => ({
      select: () => {
        const builder = {
          eq: () => builder,
          order: () => builder,
          returns: async () => ({
            data: refs.loadError ? null : refs.invites,
            error: refs.loadError ? { message: 'unavailable' } : null,
          }),
        }
        return builder
      },
    }),
  }),
}))

describe('TeamInvites', () => {
  beforeEach(() => {
    refs.loadError = false
    refs.invites = [{
      id: 'invite-1',
      email: 'teammate@example.com',
      role: 'editor',
      status: 'pending',
      created_at: '2026-08-21T00:00:00.000Z',
    }]
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('updates roles through the authenticated server boundary', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body))
      return new Response(JSON.stringify({
        ok: true,
        invite: { ...refs.invites[0], role: body.role },
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<TeamInvites />)

    const role = await screen.findByRole('combobox', { name: 'Role for teammate@example.com' })
    fireEvent.change(role, { target: { value: 'viewer' } })

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/Role updated to Viewer/))
    expect(fetchMock).toHaveBeenCalledWith('/api/team/invite', expect.objectContaining({ method: 'PATCH' }))
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      id: 'invite-1',
      action: 'role',
      role: 'viewer',
    })
  })

  it('describes listing-side collaborator access without promising owner-only lifecycle authority', async () => {
    vi.stubGlobal('fetch', vi.fn())
    render(<TeamInvites />)

    expect(await screen.findByText(/editors can update listing content and page-scoped configuration under your plan/i)).toBeInTheDocument()
    expect(screen.getByText(/Account and storefront administration, transaction decisions, money movement, negotiation lifecycle, and final approvals remain owner-only/i)).toBeInTheDocument()
    expect(screen.queryByText(/access to your listings and negotiations/i)).not.toBeInTheDocument()
  })

  it('requires confirmation before revoking an invitation', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      invite: { ...refs.invites[0], status: 'revoked' },
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    render(<TeamInvites />)

    fireEvent.click(await screen.findByRole('button', { name: 'Revoke access' }))
    expect(fetchMock).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm revoke' }))

    await waitFor(() => expect(screen.getByText('Access removed')).toBeInTheDocument())
    const revokeRequest = fetchMock.mock.calls[0] as unknown as [RequestInfo | URL, RequestInit]
    expect(JSON.parse(String(revokeRequest[1]?.body))).toEqual({ id: 'invite-1', action: 'revoke' })
  })

  it('keeps downgrade cleanup visible while disabling new invitations and role changes', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      invite: { ...refs.invites[0], status: 'revoked' },
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    render(<TeamInvites collaborationEnabled={false} />)

    expect(await screen.findByText(/Collaboration is inactive/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Invite' })).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Role for teammate@example.com' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Revoke access' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm revoke' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
  })

  it('reports load failures instead of presenting an empty team as fact', async () => {
    refs.loadError = true
    vi.stubGlobal('fetch', vi.fn())
    render(<TeamInvites />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Team access could not be loaded.')
    expect(screen.queryByText('No teammates yet')).not.toBeInTheDocument()
  })
})
