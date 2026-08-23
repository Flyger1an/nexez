// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '../../test/dom'
import { CompetitorCompare } from './CompetitorCompare'

const analysis = {
  url: 'https://existing.example',
  normalizedUrl: 'https://existing.example',
  analyzedAt: '2026-08-21T00:00:00.000Z',
  scores: { overall: 61, parseability: 65, structuredDataQuality: 50, clarityAndIntent: 68 },
  missing: ['No agent.json'],
  strengths: ['Clear contact path'],
  weaknesses: ['No agent document'],
  recommendations: ['Publish agent.json'],
  provenance: {
    analysis: 'deterministic_with_llm' as const,
    cache: { hit: false, scope: 'process' as const, ttlHours: 48 as const },
    fetch: 'respectful_public_web' as const,
  },
  signals: {
    hasJsonLd: false,
    jsonLdCount: 0,
    hasLlmsTxt: false,
    hasAgentJson: false,
    offerCount: 1,
    headingCount: 3,
    hasContact: true,
    textLength: 1200,
    priceMentions: 1,
  },
}

const run = {
  id: '123e4567-e89b-42d3-a456-426614174000',
  kind: 'competitor_benchmark',
  targetUrl: analysis.url,
  targetHost: 'existing.example',
  comparedPageId: null,
  comparedPageSlug: null,
  result: analysis,
  evidence: {},
  createdAt: analysis.analyzedAt,
}

describe('CompetitorCompare research workspace', () => {
  let deleteCalls = 0
  let postedBody: any = null

  beforeEach(() => {
    deleteCalls = 0
    postedBody = null
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/research-runs') && init?.method === 'DELETE') {
        deleteCalls += 1
        return new Response(JSON.stringify({ removed: true }), { status: 200 })
      }
      if (url.includes('/research-runs')) {
        return new Response(JSON.stringify({ runs: [run] }), { status: 200 })
      }
      if (url.includes('/analyze-competitor')) {
        postedBody = JSON.parse(String(init?.body || '{}'))
        return new Response(JSON.stringify({ success: true, analysis, markdown: '# report', savedRun: run }), { status: 200 })
      }
      throw new Error(`Unexpected fetch: ${url}`)
    }))
  })

  it('keeps signed-out visitors locked and does not fetch private history', () => {
    render(<CompetitorCompare isLoggedIn={false} myPages={[]} currentPlan="free" />)
    expect(screen.getByText(/Sign in to unlock/)).toBeInTheDocument()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('gates new analysis below Launch while preserving saved-report replay and removal', async () => {
    render(<CompetitorCompare isLoggedIn myPages={[]} currentPlan="free" />)

    expect(screen.queryByRole('button', { name: 'Analyze competitor' })).not.toBeInTheDocument()
    expect(screen.getByText('New competitor analyses')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Upgrade to Launch/ })).toBeInTheDocument()

    expect(await screen.findByText('existing.example')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Open report' }))
    expect(await screen.findByText('Overall agent trust')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'MD' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'JSON' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Remove saved report for existing.example' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove report' }))
    await waitFor(() => expect(deleteCalls).toBe(1))
  })

  it('replays saved research and requires a second action before deletion', async () => {
    render(<CompetitorCompare isLoggedIn myPages={[]} currentPlan="launch" />)
    expect(await screen.findByText('existing.example')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Open report' }))
    expect(await screen.findByText(/Loaded saved benchmark/)).toBeInTheDocument()
    expect(screen.getByText('Overall agent trust')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Remove saved report for existing.example' }))
    expect(screen.getByRole('button', { name: 'Remove report' })).toBeInTheDocument()
    expect(deleteCalls).toBe(0)
    fireEvent.click(screen.getByRole('button', { name: 'Keep' }))
    expect(screen.queryByRole('button', { name: 'Remove report' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Remove saved report for existing.example' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove report' }))
    await waitFor(() => expect(deleteCalls).toBe(1))
    expect(await screen.findByText('Saved benchmark removed.')).toBeInTheDocument()
  })

  it('keeps saving off by default and sends opt-in explicitly', async () => {
    render(<CompetitorCompare isLoggedIn myPages={[]} currentPlan="launch" />)
    await screen.findByText('existing.example')
    const save = screen.getByRole('checkbox', { name: /Save privately after analysis/ })
    expect(save).not.toBeChecked()
    fireEvent.click(save)
    fireEvent.change(screen.getByPlaceholderText(/competitor\.com/), { target: { value: 'https://new.example' } })
    fireEvent.click(screen.getByRole('button', { name: 'Analyze competitor' }))

    await waitFor(() => expect(postedBody).toMatchObject({ url: 'https://new.example', save: true }))
    expect(await screen.findByText(/saved to your private research history/i)).toBeInTheDocument()
  })

  it('keeps private history failures distinct from an empty archive and can retry', async () => {
    let historyCalls = 0
    vi.stubGlobal('fetch', vi.fn(async () => {
      historyCalls += 1
      return historyCalls === 1
        ? new Response(JSON.stringify({ error: 'temporary' }), { status: 503 })
        : new Response(JSON.stringify({ runs: [run] }), { status: 200 })
    }))

    render(<CompetitorCompare isLoggedIn myPages={[]} currentPlan="launch" />)
    expect(await screen.findByText('Saved competitor benchmarks could not be loaded.')).toBeInTheDocument()
    expect(screen.queryByText(/start a private comparison archive/i)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('existing.example')).toBeInTheDocument()
    expect(historyCalls).toBe(2)
  })
})
