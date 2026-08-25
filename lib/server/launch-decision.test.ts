import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSupabaseMock, type QueryContext } from '../../test/supabase-mock'
import type { LaunchControlSnapshot } from '../launch-control'
import type { ReleaseCertificationRecord } from '../release-certification'

const refs = vi.hoisted(() => ({
  hasAdmin: true,
  operations: [] as QueryContext[],
  snapshotStatus: 'ready' as 'ready' | 'attention',
  releases: [] as ReleaseCertificationRecord[],
}))

const REVISION = 'a'.repeat(40)
const DECISION_ROW = {
  id: 1,
  decision: 'go' as const,
  reason: 'Approved for the monitored launch window.',
  operator_id: 'admin-1',
  operator_email: 'operator@nexez.ai',
  release_certification_id: 'release-1',
  certificate_commit_sha: REVISION,
  production_revision: REVISION,
  snapshot_generated_at: '2026-08-25T00:01:00.000Z',
  launch_status: 'ready' as const,
  launch_score: 100,
  required_blocker_count: 0,
  incident_count: 0,
  created_at: '2026-08-25T00:02:00.000Z',
}

vi.mock('../../utils/supabase/admin', () => ({
  hasSupabaseAdminEnv: () => refs.hasAdmin,
  createAdminClient: () => createSupabaseMock((context) => {
    refs.operations.push(context)
    if (context.table !== 'launch_decisions') return { data: [], error: null }
    if (context.op === 'insert') return { data: DECISION_ROW, error: null }
    return { data: [DECISION_ROW], error: null }
  }),
}))
vi.mock('./launch-control', () => ({
  getLaunchControlSnapshot: vi.fn(async () => launchSnapshot(refs.snapshotStatus)),
}))
vi.mock('./release-certification', () => ({
  getReleaseCertificationHistory: vi.fn(async () => refs.releases),
  getReleaseDeploymentIdentity: vi.fn(() => ({
    revision: REVISION,
    deploymentId: 'dpl_test',
    deploymentUrl: 'https://nexez.ai',
    environment: 'production',
  })),
}))

import { getLaunchDecisionHistory, recordLaunchDecision } from './launch-decision'

describe('launch decision ledger', () => {
  beforeEach(() => {
    refs.hasAdmin = true
    refs.operations = []
    refs.snapshotStatus = 'ready'
    refs.releases = [releaseCertificate()]
  })

  it('derives every launch evidence field on the server before appending a go', async () => {
    await expect(recordLaunchDecision({
      decision: 'go',
      reason: DECISION_ROW.reason,
      idempotencyKey: 'd2000000-0000-4000-8000-000000000001',
      operatorId: 'admin-1',
      operatorEmail: 'operator@nexez.ai',
    })).resolves.toMatchObject({ replayed: false, record: { id: '1', decision: 'go' } })

    const insert = refs.operations.find((operation) => operation.op === 'insert')
    expect(insert?.payload).toMatchObject({
      decision: 'go',
      operator_id: 'admin-1',
      release_certification_id: 'release-1',
      certificate_commit_sha: REVISION,
      production_revision: REVISION,
      launch_status: 'ready',
      launch_score: 100,
      required_blocker_count: 0,
      required_blockers: [],
      incident_count: 0,
    })
  })

  it('refuses go before any database write when current evidence is not ready', async () => {
    refs.snapshotStatus = 'attention'

    await expect(recordLaunchDecision({
      decision: 'go',
      reason: 'Waiting for launch proof.',
      idempotencyKey: 'd2000000-0000-4000-8000-000000000002',
      operatorId: 'admin-1',
      operatorEmail: 'operator@nexez.ai',
    })).rejects.toThrow(/Go is not available/)
    expect(refs.operations).toEqual([])
  })

  it('allows a hold to preserve red evidence without an exact certificate', async () => {
    refs.snapshotStatus = 'attention'
    refs.releases = []

    await recordLaunchDecision({
      decision: 'hold',
      reason: 'Waiting for an exact certificate.',
      idempotencyKey: 'd2000000-0000-4000-8000-000000000003',
      operatorId: 'admin-1',
      operatorEmail: 'operator@nexez.ai',
    })

    const insert = refs.operations.find((operation) => operation.op === 'insert')
    expect(insert?.payload).toMatchObject({
      decision: 'hold',
      release_certification_id: null,
      launch_status: 'attention',
    })
    expect(insert?.payload.required_blocker_count).toBeGreaterThan(0)
  })

  it('returns no history when server credentials are unavailable', async () => {
    refs.hasAdmin = false
    await expect(getLaunchDecisionHistory()).resolves.toEqual([])
    expect(refs.operations).toEqual([])
  })
})

function releaseCertificate(): ReleaseCertificationRecord {
  return {
    id: 'release-1',
    status: 'passed',
    source: 'github',
    environment: 'production',
    commitSha: REVISION,
    deployedRevision: REVISION,
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
}

function launchSnapshot(status: 'ready' | 'attention'): LaunchControlSnapshot {
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
    summary: {
      status,
      score: status === 'ready' ? 100 : 95,
      ready: status === 'ready' ? 1 : 0,
      attention: status === 'attention' ? 1 : 0,
      blocked: 0,
      unknown: 0,
    },
    metrics: {} as LaunchControlSnapshot['metrics'],
    sources: {} as LaunchControlSnapshot['sources'],
    supportQueue: [],
    incidents: [],
  }
}
