// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { render, screen } from '../../test/dom'
import type { CommerceSupplyWorkflowSnapshot } from '../../lib/commerce-supply-workflow'
import { CommerceSupplyWorkflowPanel } from './CommerceSupplyWorkflowPanel'

describe('CommerceSupplyWorkflowPanel', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('reveals the deterministic brief and persists an explained transition', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('crypto', { randomUUID: () => '22222222-2222-4222-8222-222222222222' })
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      campaign: {
        referenceId: 'events.private-chef',
        referenceDomain: 'events-hospitality',
        status: 'sourcing',
        decisionReason: 'Recruit two qualified operators',
        createdBy: 'admin-1',
        updatedBy: 'admin-1',
        createdAt: '2026-08-21T00:00:00.000Z',
        updatedAt: '2026-08-21T00:00:00.000Z',
      },
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    render(<CommerceSupplyWorkflowPanel initialSnapshot={snapshot()} coverageGaps={0} />)
    await user.click(screen.getByRole('button', { name: /open recruitment brief/i }))

    expect(screen.getByText('Verify before certification')).toBeInTheDocument()
    expect(screen.getByText(/does not prove location/i)).toBeInTheDocument()
    await user.type(screen.getByLabelText('Operator reason'), 'Recruit two qualified operators')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(fetchMock).toHaveBeenCalledWith('/api/admin/commerce-supply-campaign', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({
        referenceId: 'events.private-chef',
        status: 'sourcing',
        reason: 'Recruit two qualified operators',
        idempotencyKey: '22222222-2222-4222-8222-222222222222',
      }),
    }))
    expect(await screen.findByText('Sourcing')).toBeInTheDocument()
  })

  it('renders certified supply as derived and removes manual status controls', async () => {
    const user = userEvent.setup()
    const live = snapshot()
    live.items[0].status = 'live'
    live.items[0].certifiedSupply = [{
      pageId: '11111111-1111-4111-8111-111111111111',
      pageName: 'Chef Co',
      pageSlug: 'chef-co',
      offerName: 'Private Chef',
    }]

    render(<CommerceSupplyWorkflowPanel initialSnapshot={live} coverageGaps={0} />)
    expect(screen.getByText('Certified supply live')).toBeInTheDocument()
    expect(screen.getByText(/does not prove.*availability/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /open recruitment brief/i }))
    expect(screen.queryByLabelText('Operator reason')).not.toBeInTheDocument()
  })

  it('reuses the exact idempotency key when a committed response may have been lost', async () => {
    const user = userEvent.setup()
    const randomUUID = vi.fn(() => '33333333-3333-4333-8333-333333333333')
    vi.stubGlobal('crypto', { randomUUID })
    const campaign = {
      referenceId: 'events.private-chef',
      referenceDomain: 'events-hospitality',
      status: 'sourcing',
      decisionReason: 'Start qualified outreach',
      createdBy: 'admin-1',
      updatedBy: 'admin-1',
      createdAt: '2026-08-21T00:00:00.000Z',
      updatedAt: '2026-08-21T00:00:00.000Z',
    }
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, campaign }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }))
    vi.stubGlobal('fetch', fetchMock)

    render(<CommerceSupplyWorkflowPanel initialSnapshot={snapshot()} coverageGaps={0} />)
    await user.click(screen.getByRole('button', { name: /open recruitment brief/i }))
    await user.type(screen.getByLabelText('Operator reason'), 'Start qualified outreach')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to fetch')

    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Sourcing')).toBeInTheDocument()
    expect(randomUUID).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(fetchMock.mock.calls[1]?.[1]?.body)
  })

  it('keeps aggregate gaps outside the campaign workflow', () => {
    render(<CommerceSupplyWorkflowPanel initialSnapshot={snapshot()} coverageGaps={2} />)
    expect(screen.getByText(/2 unmapped requests remain aggregate-only/i)).toBeInTheDocument()
  })

  it('labels launch coverage as inventory planning without formatting zeroes as demand', () => {
    const coverage = snapshot()
    coverage.demandAvailable = false
    coverage.items[0] = {
      ...coverage.items[0],
      basis: 'launch-coverage',
      basisLabel: 'Launch coverage',
      observed: 0,
      live: 0,
      related: 0,
      reference: 0,
      unresolved: 0,
    }

    render(<CommerceSupplyWorkflowPanel initialSnapshot={coverage} coverageGaps={0} />)

    expect(screen.getByText(/inventory planning, not evidence of buyer demand/i)).toBeInTheDocument()
    expect(screen.getByText('Launch coverage')).toBeInTheDocument()
    expect(screen.getByText(/no buyer demand inferred/i)).toBeInTheDocument()
    expect(screen.queryByText(/0 unresolved/i)).not.toBeInTheDocument()
  })

  it('retains aggregate evidence counts for observed demand', () => {
    render(<CommerceSupplyWorkflowPanel initialSnapshot={snapshot()} coverageGaps={0} />)

    expect(screen.getByText('Observed demand')).toBeInTheDocument()
    expect(screen.getByText(/4 unresolved · 3 reference only · 1 related · 0 live/i)).toBeInTheDocument()
  })

  it('disables campaign controls when marketplace certification cannot be verified', async () => {
    const user = userEvent.setup()
    const unavailable = snapshot()
    unavailable.verificationAvailable = false

    render(<CommerceSupplyWorkflowPanel initialSnapshot={unavailable} coverageGaps={0} />)
    expect(screen.getByText(/campaign controls are disabled/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /open recruitment brief/i }))
    expect(screen.getByLabelText('Next state')).toBeDisabled()
    expect(screen.getByLabelText('Operator reason')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })
})

function snapshot(): CommerceSupplyWorkflowSnapshot {
  return {
    generatedAt: '2026-08-21T00:00:00.000Z',
    available: true,
    demandAvailable: true,
    verificationAvailable: true,
    items: [{
      rank: 1,
      referenceId: 'events.private-chef',
      title: 'Private Chef',
      domain: 'events-hospitality',
      lifecycle: 'active-template',
      lifecycleLabel: 'Active template',
      basis: 'observed-demand',
      basisLabel: 'Observed demand',
      action: 'recruit-exact-supply',
      actionLabel: 'Recruit exact supply',
      rationale: 'Reference behavior was required.',
      observed: 4,
      live: 0,
      related: 1,
      reference: 3,
      unresolved: 4,
      campaign: null,
      status: 'new',
      certifiedSupply: [],
      brief: {
        objective: 'Recruit a real Private Chef merchant.',
        merchantProfile: 'On-location custom menu service.',
        verificationQuestions: ['What service area do you cover?'],
        capabilityTags: ['QUOTE_REQUIRED', 'CUSTOM_INTAKE'],
        successBoundary: 'Certification does not prove location, availability, price, or request fit.',
      },
    }],
  }
}
