import 'server-only'

import type { LaunchControlSnapshot } from '../launch-control'
import {
  buildLaunchDecisionEvidence,
  type LaunchDecision,
  type LaunchDecisionRecord,
} from '../launch-decision'
import { createAdminClient, hasSupabaseAdminEnv } from '../../utils/supabase/admin'
import { getLaunchControlSnapshot } from './launch-control'
import {
  getReleaseCertificationHistory,
  getReleaseDeploymentIdentity,
} from './release-certification'

type LaunchDecisionRow = {
  id: number | string
  decision: LaunchDecision
  reason: string
  operator_id: string | null
  operator_email: string
  release_certification_id: string | null
  certificate_commit_sha: string | null
  production_revision: string | null
  snapshot_generated_at: string
  launch_status: LaunchDecisionRecord['launchStatus']
  launch_score: number
  required_blocker_count: number
  incident_count: number
  created_at: string
}

const LAUNCH_DECISION_SELECT = [
  'id',
  'decision',
  'reason',
  'operator_id',
  'operator_email',
  'release_certification_id',
  'certificate_commit_sha',
  'production_revision',
  'snapshot_generated_at',
  'launch_status',
  'launch_score',
  'required_blocker_count',
  'incident_count',
  'created_at',
].join(',')

export async function getLaunchDecisionHistory(limit = 8): Promise<LaunchDecisionRecord[]> {
  if (!hasSupabaseAdminEnv()) return []
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('launch_decisions')
    .select(LAUNCH_DECISION_SELECT)
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 25))
    .returns<LaunchDecisionRow[]>()

  if (error) {
    console.warn('[launch-decision] history unavailable:', error.message)
    return []
  }
  return (data ?? []).map(mapLaunchDecisionRow)
}

export async function recordLaunchDecision(input: {
  decision: LaunchDecision
  reason: string
  idempotencyKey: string
  operatorId: string
  operatorEmail: string
}): Promise<{ record: LaunchDecisionRecord; replayed: boolean }> {
  if (!hasSupabaseAdminEnv()) throw new Error('Launch decision storage is unavailable.')

  const [snapshot, releases] = await Promise.all([
    getLaunchControlSnapshot(),
    getReleaseCertificationHistory(25),
  ])
  const evidence = buildLaunchDecisionEvidence({
    snapshot,
    releases,
    deployment: getReleaseDeploymentIdentity(),
  })

  if (input.decision === 'go' && !evidence.goEligible) {
    throw new Error('Go is not available. Refresh Launch Control and clear every required blocker first.')
  }

  const payload = buildLaunchDecisionPayload(input, snapshot, evidence)
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('launch_decisions')
    .insert(payload)
    .select(LAUNCH_DECISION_SELECT)
    .single<LaunchDecisionRow>()

  if (!error && data) return { record: mapLaunchDecisionRow(data), replayed: false }

  if (error?.code === '23505') {
    const { data: replay, error: replayError } = await admin
      .from('launch_decisions')
      .select(LAUNCH_DECISION_SELECT)
      .eq('idempotency_key', input.idempotencyKey)
      .single<LaunchDecisionRow>()
    if (replayError || !replay) {
      throw new Error(replayError?.message || 'The prior launch decision could not be read.')
    }
    if (
      replay.operator_id !== input.operatorId
      || replay.decision !== input.decision
      || replay.reason !== input.reason
    ) {
      throw new Error('Refresh Launch Control before recording another decision.')
    }
    return { record: mapLaunchDecisionRow(replay), replayed: true }
  }

  throw new Error(error?.message || 'The launch decision could not be recorded.')
}

function buildLaunchDecisionPayload(
  input: {
    decision: LaunchDecision
    reason: string
    idempotencyKey: string
    operatorId: string
    operatorEmail: string
  },
  snapshot: LaunchControlSnapshot,
  evidence: ReturnType<typeof buildLaunchDecisionEvidence>,
) {
  return {
    schema_version: 1,
    idempotency_key: input.idempotencyKey,
    decision: input.decision,
    reason: input.reason,
    operator_id: input.operatorId,
    operator_email: input.operatorEmail,
    release_certification_id: evidence.certificate?.id ?? null,
    certificate_commit_sha: evidence.certificate?.commitSha ?? null,
    production_revision: evidence.deployment.revision,
    snapshot_generated_at: snapshot.generatedAt,
    launch_status: snapshot.summary.status,
    launch_score: snapshot.summary.score,
    required_blocker_count: evidence.blockers.length,
    required_blockers: evidence.blockers,
    incident_count: snapshot.incidents.length,
  }
}

function mapLaunchDecisionRow(row: LaunchDecisionRow): LaunchDecisionRecord {
  return {
    id: String(row.id),
    decision: row.decision,
    reason: row.reason,
    operatorId: row.operator_id,
    operatorEmail: row.operator_email,
    releaseCertificationId: row.release_certification_id,
    certificateCommitSha: row.certificate_commit_sha,
    productionRevision: row.production_revision,
    snapshotGeneratedAt: row.snapshot_generated_at,
    launchStatus: row.launch_status,
    launchScore: Number(row.launch_score),
    requiredBlockerCount: Number(row.required_blocker_count),
    incidentCount: Number(row.incident_count),
    createdAt: row.created_at,
  }
}
