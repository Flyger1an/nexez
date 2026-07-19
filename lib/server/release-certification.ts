import 'server-only'

import type { LaunchControlSnapshot } from '../launch-control'
import type {
  ReleaseCertificationDecision,
  ReleaseCertificationRecord,
  ReleaseCertificationSubmission,
  ReleaseDeploymentIdentity,
} from '../release-certification'
import { createAdminClient, hasSupabaseAdminEnv } from '../../utils/supabase/admin'

type ReleaseCertificationRow = {
  id: string
  status: ReleaseCertificationRecord['status']
  source: ReleaseCertificationRecord['source']
  environment: string
  commit_sha: string
  deployed_revision: string | null
  deployment_url: string
  workflow_url: string | null
  triggered_by: string | null
  completed_at: string
  launch_status: ReleaseCertificationRecord['launchStatus']
  launch_score: number
  check_count: number
  required_check_count: number
  required_failed_count: number
}

const RELEASE_HISTORY_SELECT = [
  'id',
  'status',
  'source',
  'environment',
  'commit_sha',
  'deployed_revision',
  'deployment_url',
  'workflow_url',
  'triggered_by',
  'completed_at',
  'launch_status',
  'launch_score',
  'check_count',
  'required_check_count',
  'required_failed_count',
].join(',')

export function getReleaseDeploymentIdentity(): ReleaseDeploymentIdentity {
  const deploymentHost = process.env.VERCEL_URL?.trim() || ''
  return {
    revision: normalizeSha(process.env.VERCEL_GIT_COMMIT_SHA),
    deploymentId: cleanOptional(process.env.VERCEL_DEPLOYMENT_ID, 180),
    deploymentUrl: deploymentHost ? `https://${deploymentHost}` : null,
    environment: cleanOptional(process.env.VERCEL_TARGET_ENV || process.env.VERCEL_ENV, 40),
  }
}

export async function persistReleaseCertification(
  submission: ReleaseCertificationSubmission,
  snapshot: LaunchControlSnapshot,
  decision: ReleaseCertificationDecision,
  deployment: ReleaseDeploymentIdentity,
): Promise<{ record: ReleaseCertificationRecord; replayed: boolean }> {
  if (!hasSupabaseAdminEnv()) throw new Error('Supabase service role is not configured')

  const admin = createAdminClient()
  const launchChecks = [...snapshot.configuration, ...snapshot.operations, ...snapshot.certification]
  const requiredCheckCount = decision.requiredProbeCount
    + launchChecks.filter((check) => check.required).length
    + 2 // production environment + deployed revision

  const payload = {
    schema_version: submission.schemaVersion,
    idempotency_key: submission.idempotencyKey,
    source: submission.source,
    environment: submission.environment,
    commit_sha: submission.commitSha,
    deployed_revision: deployment.revision,
    deployment_id: deployment.deploymentId,
    deployment_url: submission.deploymentUrl,
    workflow_url: submission.workflowUrl ?? null,
    triggered_by: submission.triggeredBy ?? null,
    status: decision.status,
    started_at: submission.startedAt,
    completed_at: submission.completedAt,
    snapshot_generated_at: snapshot.generatedAt,
    launch_status: snapshot.summary.status,
    launch_score: snapshot.summary.score,
    check_count: submission.checks.length + launchChecks.length + 2,
    required_check_count: requiredCheckCount,
    required_failed_count: decision.requiredFailureCount,
    checks: submission.checks,
    launch_summary: {
      ...snapshot.summary,
      requiredFailures: decision.launchFailures,
      incidentCount: snapshot.incidents.length,
      sourceAvailability: snapshot.sources,
    },
  }

  const { data, error } = await admin
    .from('release_certifications')
    .insert(payload)
    .select(RELEASE_HISTORY_SELECT)
    .single<ReleaseCertificationRow>()

  if (!error && data) return { record: mapReleaseRow(data), replayed: false }

  if (error?.code === '23505') {
    const { data: replay, error: replayError } = await admin
      .from('release_certifications')
      .select(RELEASE_HISTORY_SELECT)
      .eq('idempotency_key', submission.idempotencyKey)
      .single<ReleaseCertificationRow>()
    if (!replayError && replay) return { record: mapReleaseRow(replay), replayed: true }
    throw new Error(replayError?.message || 'Release certification replay could not be read')
  }

  throw new Error(error?.message || 'Release certification could not be recorded')
}

export async function getReleaseCertificationHistory(limit = 8): Promise<ReleaseCertificationRecord[]> {
  if (!hasSupabaseAdminEnv()) return []
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('release_certifications')
    .select(RELEASE_HISTORY_SELECT)
    .order('completed_at', { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 25))
    .returns<ReleaseCertificationRow[]>()

  if (error) {
    console.warn('[release-certification] history unavailable:', error.message)
    return []
  }
  return (data ?? []).map(mapReleaseRow)
}

function mapReleaseRow(row: ReleaseCertificationRow): ReleaseCertificationRecord {
  return {
    id: row.id,
    status: row.status,
    source: row.source,
    environment: row.environment,
    commitSha: row.commit_sha,
    deployedRevision: row.deployed_revision,
    deploymentUrl: row.deployment_url,
    workflowUrl: row.workflow_url,
    triggeredBy: row.triggered_by,
    completedAt: row.completed_at,
    launchStatus: row.launch_status,
    launchScore: Number(row.launch_score),
    checkCount: Number(row.check_count),
    requiredCheckCount: Number(row.required_check_count),
    requiredFailedCount: Number(row.required_failed_count),
  }
}

function normalizeSha(value: string | undefined): string | null {
  const normalized = value?.trim().toLowerCase() || ''
  return /^[0-9a-f]{7,64}$/.test(normalized) ? normalized : null
}

function cleanOptional(value: string | undefined, maxLength: number): string | null {
  const cleaned = value?.trim().slice(0, maxLength) || ''
  return cleaned || null
}
