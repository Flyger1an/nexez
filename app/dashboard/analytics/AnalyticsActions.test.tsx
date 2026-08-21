// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '../../../test/dom'
import AnalyticsActions from './AnalyticsActions'
import type { AgentPage } from '../../../lib/agent-page'

const page = {
  id: 'page-1',
  owner_id: 'owner-1',
  name: 'Acme',
  slug: 'acme',
  services: [],
  products: [],
  faqs: [],
  is_published: true,
} as unknown as AgentPage

describe('AnalyticsActions', () => {
  afterEach(() => vi.restoreAllMocks())

  it('prints the real report view instead of opening a synthetic JSON popup', () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    render(<AnalyticsActions selectedPage={page} />)
    fireEvent.click(screen.getByRole('button', { name: /print analytics report/i }))
    expect(print).toHaveBeenCalledOnce()
  })

  it('renders trust-report success and failure states inline', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ score: 82, report: 'Strong evidence.' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Rate limited.' }), {
        status: 429,
        headers: { 'content-type': 'application/json' },
      }))
    render(<AnalyticsActions selectedPage={page} />)
    const button = screen.getByRole('button', { name: /generate llm trust insights/i })

    fireEvent.click(button)
    expect(await screen.findByText('Trust score 82/100')).toBeInTheDocument()
    expect(screen.getByText('Strong evidence.')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenLastCalledWith('/api/trust-report', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ page, pageId: 'page-1' }),
    }))

    fireEvent.click(button)
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Rate limited.'))
  })
})
