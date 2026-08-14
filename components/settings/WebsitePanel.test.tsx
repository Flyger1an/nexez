// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '../../test/dom'
import type { AgentPage } from '../../lib/agent-page'
import { WebsitePanel } from './WebsitePanel'

const PAGE: AgentPage = {
  id: 'page-1',
  name: 'Example Studio',
  slug: 'example-studio',
  description: 'An example listing.',
  website_url: 'https://example.com',
  cta_url: 'https://example.com/book',
  cta_label: 'Book',
  audience: null,
  location: null,
  contact_email: 'hello@example.com',
  products: [],
  services: [],
  faqs: [],
  is_published: true,
}

function contextResponse(overrides: Record<string, unknown> = {}) {
  return new Response(
    JSON.stringify({
      secrets: {},
      plan: 'free',
      agenticCommerce: {
        planAllowsCheckout: false,
        connectReady: false,
        chatgptLive: false,
        googleLive: false,
      },
      ...overrides,
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('WebsitePanel priority emphasis', () => {
  it('keeps website verification as the single emphasized action while ownership is unverified', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => contextResponse()))
    const { container } = render(
      <WebsitePanel pageId={PAGE.id} page={PAGE} onMessage={() => {}} onVerified={() => {}} />,
    )

    await screen.findByRole('button', { name: 'Upgrade to Pro' })

    const verifyAction = screen.getByRole('button', { name: 'Generate verification token' })
    expect(verifyAction).toHaveClass('settings-emphasis-action')
    expect(screen.getByRole('group', { name: 'Recommended next step: verify website ownership' })).toHaveClass(
      'settings-priority-card',
    )
    expect(screen.getByRole('button', { name: 'Upgrade to Pro' })).not.toHaveClass('settings-emphasis-action')
    expect(container.querySelectorAll('.settings-priority-card')).toHaveLength(1)
    expect(container.querySelectorAll('.settings-emphasis-action')).toHaveLength(1)
  })

  it('moves emphasis to the actionable commerce setup after website ownership is verified', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => contextResponse()))
    const verifiedPage: AgentPage = {
      ...PAGE,
      website_verified_at: '2026-08-14T12:00:00.000Z',
      website_verified_method: 'dns',
    }
    const { container } = render(
      <WebsitePanel pageId={verifiedPage.id} page={verifiedPage} onMessage={() => {}} onVerified={() => {}} />,
    )

    const upgrade = await screen.findByRole('button', { name: 'Upgrade to Pro' })

    expect(screen.queryByRole('button', { name: 'Generate verification token' })).not.toBeInTheDocument()
    expect(upgrade).toHaveClass('settings-emphasis-action')
    expect(screen.getByRole('group', { name: 'Recommended next step: enable agentic checkout' })).toHaveClass(
      'settings-priority-card',
    )
    expect(container.querySelector('p[style*="--ready"]')).toHaveTextContent('example.com verified')
    expect(container.querySelectorAll('.settings-priority-card')).toHaveLength(1)
    expect(container.querySelectorAll('.settings-emphasis-action')).toHaveLength(1)
  })

  it('exposes selected verification methods with aria-pressed instead of relying on color', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => contextResponse({ secrets: { website_verification_token: 'token-123' } })))
    render(<WebsitePanel pageId={PAGE.id} page={PAGE} onMessage={() => {}} onVerified={() => {}} />)

    await waitFor(() => expect(screen.getByRole('button', { name: 'Verify now' })).toBeVisible())

    expect(screen.getByRole('button', { name: 'DNS TXT' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'DNS TXT' })).toHaveClass('settings-choice-active')
    expect(screen.getByRole('button', { name: 'Meta tag' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Verify now' })).toHaveClass('settings-emphasis-action')
  })
})
