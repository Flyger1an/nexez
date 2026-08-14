// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '../../test/dom'
import { OutboundWebhooksPanel, type OutboundEndpoint, type OutboundTestResult } from './OutboundWebhooksPanel'

function setup(overrides: Partial<React.ComponentProps<typeof OutboundWebhooksPanel>> = {}) {
  const setEndpoints = vi.fn()
  const setTestResults = vi.fn()
  const upsertSecrets = vi.fn(async () => ({ error: null }))
  const onMessage = vi.fn()
  const onPersisted = vi.fn()
  const props = {
    slug: 'acme',
    pageId: 'page-1',
    endpoints: [] as OutboundEndpoint[],
    setEndpoints,
    testResults: {} as Record<string, OutboundTestResult>,
    setTestResults,
    recentFires: [] as any[],
    upsertSecrets,
    onMessage,
    onPersisted,
    ...overrides,
  }
  render(<OutboundWebhooksPanel {...props} />)
  return { setEndpoints, setTestResults, upsertSecrets, onMessage, onPersisted }
}

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe('OutboundWebhooksPanel', () => {
  it('renders the configured endpoints', () => {
    setup({ endpoints: [{ url: 'https://hooks.example.com/a' }, { url: 'https://hooks.example.com/b' }] })
    expect(screen.getAllByTestId('outbound-webhook-row')).toHaveLength(2)
  })

  it('renders no rows when nothing is configured', () => {
    setup()
    expect(screen.queryAllByTestId('outbound-webhook-row')).toHaveLength(0)
  })

  it('persists through upsertSecrets rather than writing page_secrets directly', async () => {
    // page_secrets is owner-RLS'd; a collaborator can only write it via the route.
    const endpoints = [{ url: 'https://hooks.example.com/a' }]
    const { upsertSecrets, onPersisted } = setup({ endpoints })
    fireEvent.click(screen.getByRole('button', { name: /Save \d+ Webhook URL/i }))
    await waitFor(() => expect(upsertSecrets).toHaveBeenCalledWith({ outbound_webhooks: endpoints }))
    await waitFor(() => expect(onPersisted).toHaveBeenCalledWith(endpoints))
  })

  it('does not mirror onto the listing when the save fails', async () => {
    const upsertSecrets = vi.fn(async () => ({ error: { message: 'nope' } }))
    const { onPersisted, onMessage } = setup({
      endpoints: [{ url: 'https://hooks.example.com/a' }],
      upsertSecrets,
    })
    fireEvent.click(screen.getByRole('button', { name: /Save \d+ Webhook URL/i }))
    await waitFor(() => expect(onMessage).toHaveBeenCalledWith('nope'))
    expect(onPersisted).not.toHaveBeenCalled()
  })

  it('no-ops the save before the listing exists', async () => {
    const { upsertSecrets } = setup({ pageId: undefined, endpoints: [{ url: 'https://hooks.example.com/a' }] })
    fireEvent.click(screen.getByRole('button', { name: /Save \d+ Webhook URL/i }))
    await waitFor(() => expect(upsertSecrets).not.toHaveBeenCalled())
  })

  it('surfaces a test result per endpoint', () => {
    setup({
      endpoints: [{ url: 'https://hooks.example.com/a' }],
      testResults: { 'https://hooks.example.com/a': { state: 'failure', message: 'connection refused' } },
    })
    expect(screen.getByTestId('outbound-test-result').textContent).toMatch(/connection refused/)
  })

  it('sends the listing pageId with a test fire, not the slug', async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ ok: true })),
    )
    vi.stubGlobal('fetch', fetchMock)
    setup({ endpoints: [{ url: 'https://hooks.example.com/a', secret: 's3cret' }] })
    fireEvent.click(screen.getByRole('button', { name: 'Send Test' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    expect(body.pageId).toBe('page-1')
    expect(body.secret).toBe('s3cret')
  })
})
