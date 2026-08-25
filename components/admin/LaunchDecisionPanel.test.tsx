// @vitest-environment jsdom
import { render, screen } from '../../test/dom'
import { describe, expect, it, vi } from 'vitest'
import { LaunchDecisionPanel } from './LaunchDecisionPanel'

vi.mock('../../app/admin/launch/actions', () => ({
  recordLaunchDecisionAction: vi.fn(),
}))

describe('LaunchDecisionPanel', () => {
  it('enables go only when exact current evidence is eligible', () => {
    render(<LaunchDecisionPanel
      goEligible
      productionRevision={'a'.repeat(40)}
      certificateStatus="Passed"
      blockers={[]}
      decisions={[]}
      initialToken="d2000000-0000-4000-8000-000000000001"
      snapshotGeneratedAt="2026-08-25T00:01:00.000Z"
      launchScore={100}
      incidentCount={0}
    />)

    expect(screen.getByRole('button', { name: 'Record go' })).toBeEnabled()
    expect(screen.getByText('Eligible to record go')).toBeInTheDocument()
    expect(screen.getByText(/does not deploy, roll back, change supply, or charge anyone/i)).toBeInTheDocument()
  })

  it('disables go, keeps hold available, and names every blocker', () => {
    render(<LaunchDecisionPanel
      goEligible={false}
      productionRevision={'a'.repeat(40)}
      certificateStatus="Unavailable"
      blockers={[{
        id: 'deployment:exact-release-certificate',
        label: 'Certificate for the production revision',
      }]}
      decisions={[]}
      initialToken="d2000000-0000-4000-8000-000000000002"
      snapshotGeneratedAt="2026-08-25T00:01:00.000Z"
      launchScore={95}
      incidentCount={1}
    />)

    expect(screen.getByRole('button', { name: 'Record go' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Record hold' })).toBeEnabled()
    expect(screen.getByText(/Certificate for the production revision/)).toBeInTheDocument()
  })

  it('does not label a failed exact certificate as passed', () => {
    render(<LaunchDecisionPanel
      goEligible={false}
      productionRevision={'a'.repeat(40)}
      certificateStatus="Not passed"
      blockers={[]}
      decisions={[]}
      initialToken="d2000000-0000-4000-8000-000000000003"
      snapshotGeneratedAt="2026-08-25T00:01:00.000Z"
      launchScore={100}
      incidentCount={0}
    />)

    expect(screen.getByText('Not passed')).toBeInTheDocument()
    expect(screen.queryByText('Passed')).not.toBeInTheDocument()
  })
})
