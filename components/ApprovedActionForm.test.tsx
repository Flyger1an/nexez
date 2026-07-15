// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '../test/dom'
import { ApprovedActionForm } from './ApprovedActionForm'

function response(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

afterEach(() => vi.unstubAllGlobals())

describe('ApprovedActionForm', () => {
  it('keeps the native action contract while enhancing submit with approval and idempotency', async () => {
    const navigate = vi.fn()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ approvalTokenRequired: true, approvalToken: 'v1.payload.signature' }))
      .mockResolvedValueOnce(response({ url: 'https://checkout.example.com/session' }))
      .mockResolvedValueOnce(response({ approvalTokenRequired: true, approvalToken: 'v1.payload.signature-2' }))
      .mockResolvedValueOnce(response({ url: 'https://checkout.example.com/session' }))
    vi.stubGlobal('fetch', fetchMock)

    render(
      <ApprovedActionForm action="/api/checkout" onNavigate={navigate}>
        <input name="slug" value="acme" readOnly />
        <input name="offer" value="services-0" readOnly />
        <button type="submit">Confirm and continue</button>
      </ApprovedActionForm>,
    )

    const form = screen.getByRole('button', { name: 'Confirm and continue' }).closest('form')
    expect(form).toHaveAttribute('action', '/api/checkout')
    expect(form).toHaveAttribute('method', 'post')
    fireEvent.click(screen.getByRole('button', { name: 'Confirm and continue' }))

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('https://checkout.example.com/session'))
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const liveBody = JSON.parse(String(fetchMock.mock.calls[1][1]?.body))
    expect(liveBody).toMatchObject({
      slug: 'acme',
      offer: 'services-0',
      dryRun: false,
      approvalToken: 'v1.payload.signature',
    })
    const firstIdempotencyKey = new Headers(fetchMock.mock.calls[1][1]?.headers).get('idempotency-key')
    expect(firstIdempotencyKey).toMatch(/^nexez-action:/)

    // A retry after an uncertain client result reuses the same key, allowing the
    // server to replay its first response instead of creating a second action.
    fireEvent.click(screen.getByRole('button', { name: 'Confirm and continue' }))
    await waitFor(() => expect(navigate).toHaveBeenCalledTimes(2))
    expect(new Headers(fetchMock.mock.calls[3][1]?.headers).get('idempotency-key')).toBe(firstIdempotencyKey)
  })

  it('shows a useful inline error and never executes when validation fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ error: 'This offer is unavailable.' }, 404))
    vi.stubGlobal('fetch', fetchMock)

    render(
      <ApprovedActionForm action="/api/negotiations">
        <input name="slug" value="missing" readOnly />
        <input name="offer" value="services-0" readOnly />
        <button type="submit">Send proposal</button>
      </ApprovedActionForm>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Send proposal' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('This offer is unavailable.')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('returns to the checkout page explanation when no payment destination exists', async () => {
    const navigate = vi.fn()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ approvalToken: 'v1.payload.signature' }))
      .mockResolvedValueOnce(response({
        error: 'Checkout is not configured for this offer.',
        url: '/checkout/acme?offer=services-0&missing_checkout=1',
      }, 409))
    vi.stubGlobal('fetch', fetchMock)

    render(
      <ApprovedActionForm action="/api/checkout" onNavigate={navigate}>
        <input name="slug" value="acme" readOnly />
        <input name="offer" value="services-0" readOnly />
        <button type="submit">Continue</button>
      </ApprovedActionForm>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/checkout/acme?offer=services-0&missing_checkout=1'))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
