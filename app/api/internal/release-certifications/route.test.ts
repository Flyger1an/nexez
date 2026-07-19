import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LaunchControlSnapshot } from '../../../../lib/launch-control'

const refs = vi.hoisted(() => ({ status: 'ready' as 'ready' | 'attention' }))
const persist = vi.hoisted(() => vi.fn(async (...args: unknown[]) => {
  const submission = args[0] as { commitSha: string; checks: unknown[]; completedAt: string }
  const snapshot = args[1] as { summary: { status: string; score: number } }
  const decision = args[2] as { status: 'passed' | 'failed'; requiredProbeCount: number; requiredFailureCount: number }
  return {
    replayed: false,
    record: {
      id: 'release-1',
      status: decision.status,
      source: 'github',
      environment: 'production',
      commitSha: submission.commitSha,
      deployedRevision: 'a'.repeat(40),
      deploymentUrl: 'https://app.nexez.ai',
      workflowUrl: 'https://github.com/Flyger1an/nexez/actions/runs/1',
      triggeredBy: 'ci',
      completedAt: submission.completedAt,
      launchStatus: snapshot.summary.status,
      launchScore: snapshot.summary.score,
      checkCount: submission.checks.length,
      requiredCheckCount: decision.requiredProbeCount,
      requiredFailedCount: decision.requiredFailureCount,
    },
  }
}))
const captureError = vi.hoisted(() => vi.fn())
const captureEvent = vi.hoisted(() => vi.fn())

vi.mock('../../../../lib/observability', () => ({ captureError, captureEvent }))
vi.mock('../../../../lib/server/launch-control', () => ({
  getLaunchControlSnapshot: vi.fn(async () => launchSnapshot(refs.status)),
}))
vi.mock('../../../../lib/server/release-certification', () => ({
  getReleaseDeploymentIdentity: vi.fn(() => ({
    revision: 'a'.repeat(40),
    deploymentId: 'dpl_test',
    deploymentUrl: 'https://nexez-test.vercel.app',
    environment: 'production',
  })),
  persistReleaseCertification: persist,
}))

import { POST } from './route'

const SECRET = 'r'.repeat(32)

describe('POST /api/internal/release-certifications', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('NEXEZ_RELEASE_CERT_SECRET', SECRET)
    refs.status = 'ready'
  })

  it('rejects an unsigned release record before collecting operational data', async () => {
    const response = await POST(new Request('https://app.nexez.ai/api/internal/release-certifications', {
      method: 'POST',
      body: JSON.stringify(validSubmission()),
    }))
    expect(response.status).toBe(401)
    expect(persist).not.toHaveBeenCalled()
  })

  it('returns 400 for malformed JSON', async () => {
    const response = await POST(request('{'))
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: 'invalid_json' })
  })

  it('persists a passing record when the probes, snapshot, and revision agree', async () => {
    const response = await POST(request(JSON.stringify(validSubmission())))
    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({ ok: true, status: 'passed', recordId: 'release-1' })
    expect(persist).toHaveBeenCalledWith(
      expect.objectContaining({ commitSha: 'a'.repeat(40) }),
      expect.anything(),
      expect.objectContaining({ status: 'passed', requiredFailureCount: 0 }),
      expect.objectContaining({ environment: 'production' }),
    )
  })

  it('records and returns a failed verdict instead of hiding a Launch Control warning', async () => {
    refs.status = 'attention'
    const response = await POST(request(JSON.stringify(validSubmission())))
    expect(response.status).toBe(201)
    const body = await response.json()
    expect(body).toMatchObject({ ok: false, status: 'failed' })
    expect(body.failures.launch).toEqual([
      expect.objectContaining({ id: 'commerce', status: 'attention' }),
    ])
    expect(persist).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ status: 'failed', requiredFailureCount: 1 }),
      expect.anything(),
    )
  })
})

function request(body: string) {
  return new Request('https://app.nexez.ai/api/internal/release-certifications', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SECRET}`,
      'Content-Type': 'application/json',
    },
    body,
  })
}

function validSubmission() {
  return {
    schemaVersion: 1,
    idempotencyKey: 'github-123-1',
    source: 'github',
    environment: 'production',
    commitSha: 'a'.repeat(40),
    deploymentUrl: 'https://app.nexez.ai',
    workflowUrl: 'https://github.com/Flyger1an/nexez/actions/runs/1',
    repository: 'Flyger1an/nexez',
    triggeredBy: 'ci',
    startedAt: '2026-07-18T12:00:00.000Z',
    completedAt: '2026-07-18T12:01:00.000Z',
    checks: [{
      id: 'public-hosts',
      label: 'Public hosts',
      status: 'pass',
      required: true,
      durationMs: 100,
    }],
  }
}

function launchSnapshot(status: 'ready' | 'attention'): LaunchControlSnapshot {
  return {
    generatedAt: '2026-07-18T12:00:30.000Z',
    configuration: [],
    operations: [],
    certification: [{
      id: 'commerce',
      label: 'Commerce',
      detail: 'detail',
      evidence: 'evidence',
      status,
      required: true,
    }],
    summary: {
      status,
      score: status === 'ready' ? 100 : 55,
      ready: status === 'ready' ? 1 : 0,
      attention: status === 'attention' ? 1 : 0,
      blocked: 0,
      unknown: 0,
    },
    incidents: [],
    sources: {},
  } as unknown as LaunchControlSnapshot
}
