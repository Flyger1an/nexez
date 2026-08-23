// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '../test/dom'
import { AICoPilot } from './AICoPilot'

const offer = { name: 'Audit', price: '$99', description: 'Original product copy', url: '' }

function renderCopilot(overrides: Record<string, unknown> = {}) {
  const props = {
    businessName: 'Acme',
    audience: 'Buyers',
    servicesOffers: [],
    productsOffers: [offer],
    onApplyServices: vi.fn(),
    onApplyProducts: vi.fn(),
    onTrackUse: vi.fn(),
    pageId: 'page-1',
    ...overrides,
  }
  render(<AICoPilot {...props} />)
  return props
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('AICoPilot live entitlement boundary', () => {
  it('does not apply a local voice rewrite after a live downgrade', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      error: 'AI optimization is available on the Launch plan and above.',
      code: 'plan_upgrade_required',
    }), { status: 402 })))
    const props = renderCopilot()

    fireEvent.click(screen.getByRole('tab', { name: 'Voice' }))
    fireEvent.click(screen.getByRole('button', { name: 'Apply Voice Rewrite' }))

    expect(await screen.findByText(/Launch plan and above/)).toBeVisible()
    expect(props.onApplyServices).not.toHaveBeenCalled()
    expect(props.onApplyProducts).not.toHaveBeenCalled()
    expect(props.onTrackUse).not.toHaveBeenCalled()
  })

  it('applies a products-only rewrite only after server authorization', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ authorized: true }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const props = renderCopilot()

    fireEvent.click(screen.getByRole('tab', { name: 'Voice' }))
    fireEvent.click(screen.getByRole('button', { name: 'Apply Voice Rewrite' }))

    await waitFor(() => expect(props.onApplyProducts).toHaveBeenCalledOnce())
    expect(fetchMock).toHaveBeenCalledWith('/api/ai/enhance', expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining('"operation":"authorize"'),
    }))
    expect(props.onApplyServices).not.toHaveBeenCalled()
    expect(props.onTrackUse).toHaveBeenCalledOnce()
  })
})
