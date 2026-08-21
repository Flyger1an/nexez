// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '../test/dom'
import { PasskeySettings } from './PasskeySettings'

const { auth } = vi.hoisted(() => ({
  auth: {
    registerPasskey: vi.fn(),
    passkey: {
      list: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}))

vi.mock('../utils/supabase/client', () => ({
  createClient: () => ({ auth }),
}))

const existingPasskey = {
  id: 'pk-1',
  friendly_name: 'Work Mac',
  created_at: '2026-08-01T12:00:00.000Z',
  last_used_at: '2026-08-19T12:00:00.000Z',
}

function enableWebAuthn() {
  Object.defineProperty(window, 'PublicKeyCredential', {
    configurable: true,
    value: class PublicKeyCredential {},
  })
  Object.defineProperty(navigator, 'credentials', {
    configurable: true,
    value: { create: vi.fn(), get: vi.fn() },
  })
}

describe('PasskeySettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    enableWebAuthn()
    auth.passkey.list.mockResolvedValue({ data: [existingPasskey], error: null })
    auth.registerPasskey.mockResolvedValue({ data: null, error: null })
    auth.passkey.update.mockResolvedValue({ data: null, error: null })
    auth.passkey.delete.mockResolvedValue({ data: null, error: null })
  })

  it('lists registered passkeys and their usage state', async () => {
    render(<PasskeySettings />)

    expect(await screen.findByText('Work Mac')).toBeVisible()
    expect(screen.getByText(/Last used/)).toBeVisible()
    expect(auth.passkey.list).toHaveBeenCalledOnce()
  })

  it('registers a passkey and adds it to the list', async () => {
    auth.passkey.list.mockResolvedValue({ data: [], error: null })
    auth.registerPasskey.mockResolvedValue({
      data: { id: 'pk-2', friendly_name: 'iCloud Keychain', created_at: '2026-08-20T12:00:00.000Z' },
      error: null,
    })
    render(<PasskeySettings />)

    const addButton = await screen.findByRole('button', { name: 'Add passkey' })
    fireEvent.click(addButton)

    expect(await screen.findByText('iCloud Keychain')).toBeVisible()
    expect(auth.registerPasskey).toHaveBeenCalledOnce()
    expect(screen.getByRole('status')).toHaveTextContent('Passkey added')
  })

  it('renames an existing passkey', async () => {
    auth.passkey.update.mockResolvedValue({ data: { ...existingPasskey, friendly_name: 'Travel key' }, error: null })
    render(<PasskeySettings />)
    await screen.findByText('Work Mac')

    fireEvent.click(screen.getByRole('button', { name: 'Rename' }))
    fireEvent.change(screen.getByLabelText('Passkey name'), { target: { value: 'Travel key' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(auth.passkey.update).toHaveBeenCalledWith({ passkeyId: 'pk-1', friendlyName: 'Travel key' }),
    )
    expect(await screen.findByText('Travel key')).toBeVisible()
  })

  it('requires inline confirmation before removing a passkey', async () => {
    render(<PasskeySettings />)
    await screen.findByText('Work Mac')

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    expect(screen.getByText('Remove this passkey?')).toBeVisible()
    expect(auth.passkey.delete).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(auth.passkey.delete).toHaveBeenCalledWith({ passkeyId: 'pk-1' }))
    await waitFor(() => expect(screen.queryByText('Work Mac')).toBeNull())
  })
})
