// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '../../test/dom'
import { DomainConnectionPanel, type DomainConnectionStatus } from './DomainConnectionPanel'

const STATUS: DomainConnectionStatus = {
  state: 'pending_dns',
  label: 'Pending DNS',
  detail: 'Point your DNS at the host.',
  providerConfigured: true,
  ownershipVerified: false,
  verificationMethod: 'cname',
  legacyTxtBlocksCname: false,
  requiredRecords: [],
  routingRecords: [],
}

function setup(overrides: Partial<React.ComponentProps<typeof DomainConnectionPanel>> = {}) {
  const onAction = vi.fn()
  const onMessage = vi.fn()
  const props = {
    customDomain: 'agents.acme.com',
    publicUrl: 'https://nexez.app/acme',
    status: STATUS,
    domainVerified: false,
    busy: false,
    attachIsNext: false,
    onAction,
    onMessage,
    ...overrides,
  }
  render(<DomainConnectionPanel {...props} />)
  return { onAction, onMessage }
}

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe('DomainConnectionPanel', () => {
  it('renders nothing until a domain is entered', () => {
    const { container } = render(
      <DomainConnectionPanel
        customDomain=""
        publicUrl="https://nexez.app/acme"
        status={null}
        domainVerified={false}
        busy={false}
        attachIsNext={false}
        onAction={vi.fn()}
        onMessage={vi.fn()}
      />,
    )
    expect(container.textContent).toBe('')
  })

  it('delegates both provider actions upward rather than fetching itself', () => {
    const { onAction } = setup()
    fireEvent.click(screen.getByText('Attach & detect DNS'))
    expect(onAction).toHaveBeenCalledWith('attach')
    fireEvent.click(screen.getByText('Check status'))
    expect(onAction).toHaveBeenCalledWith('status')
  })

  it('disables both actions while one is in flight', () => {
    setup({ busy: true })
    expect((screen.getByText('Working…') as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByText('Check status') as HTMLButtonElement).disabled).toBe(true)
  })

  it('shows the provider detail it was given', () => {
    setup()
    expect(screen.getByText('Point your DNS at the host.')).toBeTruthy()
  })

  it('falls back to a verifying state from the page-derived verified flag', () => {
    // With no provider status yet, a domain already verified out-of-band should not
    // read as "Pending DNS".
    setup({ status: null, domainVerified: true })
    expect(screen.getAllByText('Verifying').length).toBeGreaterThan(0)
  })

  it('lists routing records on the apex/TXT path', () => {
    // The CNAME path's records render in the page's DNS instructions, above this
    // card; only the apex path surfaces them here.
    setup({
      status: {
        ...STATUS,
        verificationMethod: 'txt',
        routingRecords: [{ type: 'A', name: 'acme.com', value: '76.76.21.21' }],
      },
    })
    expect(screen.getByText(/76\.76\.21\.21/)).toBeTruthy()
  })

  it('does not duplicate the CNAME records the page already shows', () => {
    setup({
      status: { ...STATUS, verificationMethod: 'cname', routingRecords: [{ type: 'CNAME', name: 'agents', value: 'cname.nexez.app' }] },
    })
    expect(screen.queryByText(/cname\.nexez\.app/)).toBeNull()
  })

  describe('crawlability, which this panel owns outright', () => {
    it('probes the custom domain rather than the platform URL', async () => {
      const fetchMock = vi.fn(
        async (_input: RequestInfo | URL, _init?: RequestInit) =>
          new Response(JSON.stringify({ score: 92, url: 'https://agents.acme.com', checks: [] })),
      )
      vi.stubGlobal('fetch', fetchMock)
      const { onMessage } = setup()
      fireEvent.click(screen.getByText('Test agent crawlability'))

      await waitFor(() => expect(onMessage).toHaveBeenCalledWith('Agent crawlability score: 92/100'))
      const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
      expect(body.url).toBe('https://agents.acme.com')
    })

    it('renders the returned checks', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () =>
          new Response(
            JSON.stringify({
              score: 70,
              url: 'https://agents.acme.com',
              checks: [{ id: 'a', label: 'agent.json reachable', status: 'pass', detail: '200 OK' }],
            }),
          ),
        ),
      )
      setup()
      fireEvent.click(screen.getByText('Test agent crawlability'))
      await waitFor(() => expect(screen.getByText('agent.json reachable')).toBeTruthy())
    })

    it('surfaces a failure and re-enables the button', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'nope' }), { status: 500 })))
      const { onMessage } = setup()
      fireEvent.click(screen.getByText('Test agent crawlability'))

      await waitFor(() => expect(onMessage).toHaveBeenCalledWith('nope'))
      await waitFor(() =>
        expect((screen.getByText('Test agent crawlability') as HTMLButtonElement).disabled).toBe(false),
      )
    })

    it('does not throw when the network drops mid-probe', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
      const { onMessage } = setup()
      fireEvent.click(screen.getByText('Test agent crawlability'))
      await waitFor(() => expect(onMessage).toHaveBeenCalledWith(expect.stringMatching(/offline/)))
    })
  })
})
