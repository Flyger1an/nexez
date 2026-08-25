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

  it('groups plain-language negotiation fields into canonical requested terms', async () => {
    const navigate = vi.fn()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ approvalTokenRequired: true, approvalToken: 'v1.terms.signature' }))
      .mockResolvedValueOnce(response({ statusUrl: 'https://nexez.test/api/negotiations/status?id=n1&token=t1' }))
    vi.stubGlobal('fetch', fetchMock)

    render(
      <ApprovedActionForm action="/api/negotiations" onNavigate={navigate}>
        <input name="slug" value="acme" readOnly />
        <input name="offer" value="services-0" readOnly />
        <input name="requestedTerms.scope" value="Logo design" readOnly />
        <input name="requestedTerms.revisionCount" value="2" readOnly />
        <input name="requestedTerms.projectWeeks" value="4" readOnly />
        <button type="submit">Send proposal</button>
      </ApprovedActionForm>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Send proposal' }))
    await waitFor(() => expect(navigate).toHaveBeenCalled())

    const dryRunBody = JSON.parse(String(fetchMock.mock.calls[0][1]?.body))
    expect(dryRunBody.requestedTerms).toEqual({
      scope: 'Logo design',
      revisionCount: 2,
      projectWeeks: 4,
    })
    const liveBody = JSON.parse(String(fetchMock.mock.calls[1][1]?.body))
    expect(liveBody.requestedTerms).toEqual(dryRunBody.requestedTerms)
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

  it('submits canonical typed offer configuration to the resource checkout action', async () => {
    const navigate = vi.fn()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ approvalTokenRequired: true, approvalToken: 'v1.resource.signature' }))
      .mockResolvedValueOnce(response({ url: 'https://checkout.example.com/resource-session' }))
    vi.stubGlobal('fetch', fetchMock)

    render(
      <ApprovedActionForm action="/api/reservable-resources/checkout" onNavigate={navigate}>
        <input name="slug" value="dinner" readOnly />
        <input name="offer" value="services-0" readOnly />
        <input name="offerConfiguration.quantity.guest_count" value="12" readOnly />
        <input name="offerConfiguration.boolean.outdoor" value="false" readOnly />
        <input name="offerConfiguration.multi-select.add_ons" value="wine" readOnly />
        <input name="offerConfiguration.multi-select.add_ons" value="dessert" readOnly />
        <button type="submit">Hold and continue</button>
      </ApprovedActionForm>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Hold and continue' }))
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('https://checkout.example.com/resource-session'))

    const dryRunBody = JSON.parse(String(fetchMock.mock.calls[0][1]?.body))
    expect(dryRunBody.offerConfiguration).toEqual({
      guest_count: 12,
      outdoor: false,
      add_ons: ['wine', 'dessert'],
    })
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('idempotency-key')).toMatch(/^nexez-action:/)
  })

  it('preserves the staged settlement action through approval-bound enhancement', async () => {
    const navigate = vi.fn()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ approvalTokenRequired: true, approvalToken: 'v1.staged.signature' }))
      .mockResolvedValueOnce(response({ url: 'https://checkout.example.com/staged-session' }))
    vi.stubGlobal('fetch', fetchMock)

    render(
      <ApprovedActionForm action="/api/staged-settlements/checkout" onNavigate={navigate}>
        <input name="slug" value="project" readOnly />
        <input name="offer" value="services-0" readOnly />
        <button type="submit">Review first stage</button>
      </ApprovedActionForm>,
    )

    const form = screen.getByRole('button', { name: 'Review first stage' }).closest('form')
    expect(form).toHaveAttribute('action', '/api/staged-settlements/checkout')
    fireEvent.click(screen.getByRole('button', { name: 'Review first stage' }))

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('https://checkout.example.com/staged-session'))
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/staged-settlements/checkout')
    expect(fetchMock.mock.calls[1][0]).toBe('/api/staged-settlements/checkout')
  })
})
