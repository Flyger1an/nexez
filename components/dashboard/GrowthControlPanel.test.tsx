// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '../../test/dom'
import {
  EMPTY_GROWTH_METRICS,
  summarizeGrowthControl,
  type GrowthControlSnapshot,
} from '../../lib/growth-control'
import { GrowthControlPanel } from './GrowthControlPanel'

function snapshot(): GrowthControlSnapshot {
  const metrics = {
    ...EMPTY_GROWTH_METRICS,
    grantsTotal: 25,
    grantsActive: 23,
    welcomeGrants: 17,
    referralGrants: 8,
    paidConversions: 4,
    invitesTotal: 10,
    invitesPending: 3,
    invitesClaimed: 2,
    invitesQualified: 5,
    invitesDelivered: 9,
    fallbackApplied: 1,
  }
  const campaign = {
    id: '11111111-1111-4111-8111-111111111111',
    key: 'launch-six-month-2026',
    name: 'Six months of Launch',
    status: 'active' as const,
    grantPlanId: 'launch',
    grantDurationDays: 180,
    inviteSlots: 2,
    inviteExpiresDays: 14,
    maxGrants: 1000,
    startsAt: '2026-07-25T00:00:00.000Z',
    signupClosesAt: null,
    enrollmentMode: 'open' as const,
    updatedAt: '2026-07-25T01:00:00.000Z',
  }
  return {
    available: true,
    generatedAt: '2026-07-26T00:00:00.000Z',
    campaign,
    metrics,
    summary: summarizeGrowthControl(campaign, metrics),
    recentEvents: [{
      id: 'event-1',
      type: 'fallback_applied',
      label: 'Free fallback applied',
      detail: 'Account returned to Free with one published listing',
      createdAt: '2026-07-25T23:00:00.000Z',
    }],
    adminEvents: [],
    cohortMembers: [],
    warnings: [],
  }
}

describe('GrowthControlPanel', () => {
  it('renders campaign health and exposes every operational view', () => {
    render(<GrowthControlPanel initialSnapshot={snapshot()} />)

    expect(screen.getByRole('heading', { name: 'Growth Control' })).toBeInTheDocument()
    expect(screen.getByText('Active Launch grants')).toBeInTheDocument()
    expect(screen.getByText('975')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: /Activation funnel/ }))
    expect(screen.getByText('Invitation progression')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: /Private cohort/ }))
    expect(screen.getByText('No businesses are in this cohort. Add the first verified-business candidate from the form.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: /Activity/ }))
    expect(screen.getByText('Free fallback applied')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: 'Controls' }))
    expect(screen.getByLabelText('Operational reason')).toBeInTheDocument()
    expect(screen.getByLabelText('Maximum campaign grants')).toHaveValue(1000)
    expect(screen.getByRole('group', { name: 'Campaign enrollment mode' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Invite-only' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pause campaign' })).toBeInTheDocument()
  })

  it('renders a useful dormant state without inventing campaign data', () => {
    const unavailable: GrowthControlSnapshot = {
      ...snapshot(),
      available: false,
      campaign: null,
      warnings: ['The campaign ledger could not be read.'],
    }
    render(<GrowthControlPanel initialSnapshot={unavailable} />)

    expect(screen.getByText('No seller growth campaign found')).toBeInTheDocument()
    expect(screen.getByText('The campaign ledger could not be read.')).toBeInTheDocument()
  })
})
