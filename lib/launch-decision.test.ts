import { describe, expect, it } from 'vitest'
import type { LaunchControlSnapshot } from './launch-control'
import type { ReleaseCertificationRecord, ReleaseDeploymentIdentity } from './release-certification'
import { buildLaunchDecisionEvidence } from './launch-decision'

const deployment: ReleaseDeploymentIdentity = {
  revision: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  deploymentId: 'dpl_123',
  deploymentUrl: 'https://nexez.ai',
  environment: 'production',
}

const certificate: ReleaseCertificationRecord = {
  id: 'release-1',
  status: 'passed',
  source: 'github',
  environment: 'production',
  commitSha: deployment.revision!,
  deployedRevision: deployment.revision,
  deploymentUrl: 'https://nexez.ai',
  workflowUrl: null,
  triggeredBy: 'ci@nexez.ai',
  completedAt: '2026-08-25T00:00:00.000Z',
  launchStatus: 'ready',
  launchScore: 100,
  checkCount: 20,
  requiredCheckCount: 18,
  requiredFailedCount: 0,
}

function snapshot(status: LaunchControlSnapshot['summary']['status'] = 'ready'): LaunchControlSnapshot {
  return {
    generatedAt: '2026-08-25T00:01:00.000Z',
    environment: {
      stripeMode: 'live',
      marketingHost: 'nexez.ai',
      appHost: 'app.nexez.ai',
      agentHost: 'nexez.app',
    },
    configuration: [],
    operations: [],
    certification: [],
    summary: { status, score: status === 'ready' ? 100 : 95, ready: 1, attention: 0, blocked: 0, unknown: 0 },
    metrics: {} as LaunchControlSnapshot['metrics'],
    sources: {} as LaunchControlSnapshot['sources'],
    supportQueue: [],
    incidents: [],
  }
}

describe('buildLaunchDecisionEvidence', () => {
  it('allows a go only for a green snapshot and exact passing production certificate', () => {
    const result = buildLaunchDecisionEvidence({ snapshot: snapshot(), releases: [certificate], deployment })

    expect(result.goEligible).toBe(true)
    expect(result.certificate?.id).toBe('release-1')
    expect(result.blockers).toEqual([])
  })

  it('rejects a certificate for a different production revision', () => {
    const result = buildLaunchDecisionEvidence({
      snapshot: snapshot(),
      releases: [{ ...certificate, commitSha: 'bbbbbbb', deployedRevision: 'bbbbbbb' }],
      deployment,
    })

    expect(result.goEligible).toBe(false)
    expect(result.certificate).toBeNull()
    expect(result.blockers.map((blocker) => blocker.id)).toContain('exact-release-certificate')
  })

  it('keeps optional incidents visible without inventing a required blocker', () => {
    const current = snapshot()
    current.incidents = [{
      id: 'support:1',
      title: 'Urgent support request',
      detail: 'An operator should review it.',
      occurredAt: current.generatedAt,
      status: 'attention',
    }]

    const result = buildLaunchDecisionEvidence({ snapshot: current, releases: [certificate], deployment })

    expect(result.goEligible).toBe(true)
    expect(result.blockers).toEqual([])
  })

  it('blocks go when any required Launch Control check is not ready', () => {
    const current = snapshot('attention')
    current.operations = [{
      id: 'support-delivery',
      label: 'Support delivery',
      detail: 'Email could not be proven.',
      evidence: 'No accepted delivery.',
      status: 'attention',
      required: true,
    }]

    const result = buildLaunchDecisionEvidence({ snapshot: current, releases: [certificate], deployment })

    expect(result.goEligible).toBe(false)
    expect(result.blockers.map((blocker) => blocker.id)).toEqual([
      'support-delivery',
      'launch-control-summary',
    ])
  })
})
