// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '../test/dom'
import { CredentialsManager } from './CredentialsManager'
import type { CredentialRecord } from '../lib/agent-page'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('CredentialsManager', () => {
  it('describes pending and automated-review states without promising every upload is reviewed', () => {
    const pending: CredentialRecord = {
      id: 'credential-1',
      name: 'license.pdf',
      status: 'pending',
      public: false,
      verdict: { reason: 'Upgrade to Launch for automated review.' },
    }

    render(<CredentialsManager pageId="page-1" docs={[pending]} onChange={vi.fn()} />)

    expect(screen.getByText('Credentials / licenses')).toBeInTheDocument()
    expect(screen.getByText('Pending review')).toBeInTheDocument()
    expect(screen.getByText(/Automated review .* is available on Launch and above/i)).toBeInTheDocument()
    expect(screen.queryByText(/uploaded & reviewed/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Each upload receives an automated document review/i)).not.toBeInTheDocument()
  })

  it('labels the in-flight operation as an upload and appends the returned pending record', async () => {
    let finishRequest: ((response: Response) => void) | undefined
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => {
      finishRequest = resolve
    }))
    vi.stubGlobal('fetch', fetchMock)
    const onChange = vi.fn()
    const { container } = render(<CredentialsManager pageId="page-1" docs={[]} onChange={onChange} />)
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement

    fireEvent.change(fileInput, {
      target: { files: [new File(['license'], 'license.pdf', { type: 'application/pdf' })] },
    })

    expect(screen.getByRole('button', { name: 'Uploading…' })).toBeDisabled()
    expect(fetchMock).toHaveBeenCalledWith('/api/credentials', expect.objectContaining({ method: 'POST' }))

    const pending: CredentialRecord = {
      id: 'credential-2',
      name: 'license.pdf',
      status: 'pending',
      public: false,
    }
    finishRequest?.(new Response(JSON.stringify({ credential: pending }), {
      status: 201,
      headers: { 'content-type': 'application/json' },
    }))

    await waitFor(() => expect(onChange).toHaveBeenCalledWith([pending]))
    expect(screen.getByRole('button', { name: 'Upload credential' })).toBeEnabled()
  })
})
