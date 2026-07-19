import { NextResponse } from 'next/server'
import { z } from 'zod'
import { captureError, captureEvent } from '../../../../lib/observability'
import { buildReleaseCertificationDecision } from '../../../../lib/release-certification'
import { getLaunchControlSnapshot } from '../../../../lib/server/launch-control'
import { authorizeReleaseCertificationRequest } from '../../../../lib/server/release-certification-auth'
import {
  getReleaseDeploymentIdentity,
  persistReleaseCertification,
} from '../../../../lib/server/release-certification'

export const maxDuration = 30

const MAX_BODY_BYTES = 64 * 1024
const SHA_RE = /^[0-9a-f]{7,64}$/

const probeSchema = z.object({
  id: z.string().min(1).max(80).regex(/^[a-z0-9][a-z0-9._-]*$/),
  label: z.string().min(1).max(120),
  status: z.enum(['pass', 'fail', 'skip']),
  required: z.boolean(),
  durationMs: z.number().int().min(0).max(600_000),
  detail: z.string().max(300).optional(),
}).strict()

const submissionSchema = z.object({
  schemaVersion: z.literal(1),
  idempotencyKey: z.string().min(1).max(160).regex(/^[A-Za-z0-9._:-]+$/),
  source: z.enum(['github', 'manual', 'local']),
  environment: z.literal('production'),
  commitSha: z.string().transform((value) => value.trim().toLowerCase()).pipe(z.string().regex(SHA_RE)),
  deploymentUrl: z.string().max(2048).refine(isAllowedDeploymentUrl, 'Unsupported deployment URL'),
  workflowUrl: z.string().max(2048).refine(isAllowedWorkflowUrl, 'Unsupported workflow URL').optional(),
  repository: z.string().max(180).regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/).optional(),
  triggeredBy: z.string().min(1).max(120).optional(),
  startedAt: z.string().refine(isTimestamp, 'Invalid start timestamp'),
  completedAt: z.string().refine(isTimestamp, 'Invalid completion timestamp'),
  checks: z.array(probeSchema).min(1).max(60),
}).strict().refine(
  (value) => Date.parse(value.completedAt) >= Date.parse(value.startedAt),
  { message: 'Completion must not precede start', path: ['completedAt'] },
)

export async function POST(request: Request) {
  if (!authorizeReleaseCertificationRequest(request)) {
    return json({ ok: false, error: 'unauthorized' }, 401)
  }

  const contentLength = Number(request.headers.get('content-length') || 0)
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return json({ ok: false, error: 'payload_too_large' }, 413)
  }

  let rawBody = ''
  try {
    rawBody = await request.text()
  } catch {
    return json({ ok: false, error: 'invalid_body' }, 400)
  }
  if (Buffer.byteLength(rawBody, 'utf8') > MAX_BODY_BYTES) {
    return json({ ok: false, error: 'payload_too_large' }, 413)
  }

  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(rawBody)
  } catch {
    return json({ ok: false, error: 'invalid_json' }, 400)
  }

  const parsed = submissionSchema.safeParse(parsedJson)
  if (!parsed.success) {
    return json({
      ok: false,
      error: 'invalid_release_evidence',
      issues: parsed.error.issues.slice(0, 8).map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    }, 400)
  }

  try {
    const snapshot = await getLaunchControlSnapshot()
    const deployment = getReleaseDeploymentIdentity()
    const decision = buildReleaseCertificationDecision(
      snapshot,
      parsed.data.checks,
      parsed.data.commitSha,
      deployment,
    )
    const { record, replayed } = await persistReleaseCertification(
      parsed.data,
      snapshot,
      decision,
      deployment,
    )

    captureEvent('release.certification.completed', {
      recordId: record.id,
      status: record.status,
      commitSha: record.commitSha.slice(0, 12),
      launchScore: record.launchScore,
      requiredFailedCount: record.requiredFailedCount,
      replayed,
    })

    return json({
      ok: record.status === 'passed',
      status: record.status,
      recordId: record.id,
      replayed,
      launch: {
        status: snapshot.summary.status,
        score: snapshot.summary.score,
      },
      failures: {
        probes: decision.requiredProbeFailures.map((probe) => ({ id: probe.id, status: probe.status })),
        launch: decision.launchFailures,
      },
    }, replayed ? 200 : 201)
  } catch (error) {
    captureError(error, { route: '/api/internal/release-certifications' })
    return json({ ok: false, error: 'release_certification_unavailable' }, 503)
  }
}

function isTimestamp(value: string) {
  return Number.isFinite(Date.parse(value))
}

function isAllowedDeploymentUrl(value: string) {
  const url = safeUrl(value)
  if (!url || url.protocol !== 'https:') return false
  const host = url.hostname.toLowerCase()
  return host === 'nexez.ai'
    || host.endsWith('.nexez.ai')
    || host === 'nexez.app'
    || host.endsWith('.nexez.app')
    || host.endsWith('.vercel.app')
}

function isAllowedWorkflowUrl(value: string) {
  const url = safeUrl(value)
  return Boolean(url && url.protocol === 'https:' && url.hostname.toLowerCase() === 'github.com')
}

function safeUrl(value: string) {
  try {
    return new URL(value)
  } catch {
    return null
  }
}

function json(body: unknown, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}
