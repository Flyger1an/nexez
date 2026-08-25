import type { LaunchControlSnapshot, LaunchStatus } from './launch-control'
import type {
  ReleaseCertificationRecord,
  ReleaseDeploymentIdentity,
  ReleaseLaunchFailure,
} from './release-certification'

export type LaunchDecision = 'go' | 'hold'

export type LaunchDecisionRecord = {
  id: string
  decision: LaunchDecision
  reason: string
  operatorId: string | null
  operatorEmail: string
  releaseCertificationId: string | null
  certificateCommitSha: string | null
  productionRevision: string | null
  snapshotGeneratedAt: string
  launchStatus: LaunchStatus
  launchScore: number
  requiredBlockerCount: number
  incidentCount: number
  createdAt: string
}

export type LaunchDecisionEvidence = {
  goEligible: boolean
  certificate: ReleaseCertificationRecord | null
  deployment: ReleaseDeploymentIdentity
  blockers: ReleaseLaunchFailure[]
}

export function buildLaunchDecisionEvidence(input: {
  snapshot: LaunchControlSnapshot
  releases: ReleaseCertificationRecord[]
  deployment: ReleaseDeploymentIdentity
}): LaunchDecisionEvidence {
  const blockers: ReleaseLaunchFailure[] = [
    ...requiredLaunchBlockers(input.snapshot),
  ]

  if (input.snapshot.summary.status !== 'ready') {
    blockers.push({
      area: 'deployment',
      id: 'launch-control-summary',
      label: 'Launch Control readiness',
      status: input.snapshot.summary.status,
    })
  }

  if (input.deployment.environment !== 'production') {
    blockers.push({
      area: 'deployment',
      id: 'production-environment',
      label: 'Production environment',
      status: 'fail',
    })
  }

  if (!input.deployment.revision) {
    blockers.push({
      area: 'deployment',
      id: 'production-revision',
      label: 'Production revision',
      status: 'fail',
    })
  }

  const certificate = input.deployment.revision
    ? input.releases.find((release) => (
      release.environment === 'production'
      && release.deployedRevision === input.deployment.revision
      && release.commitSha === input.deployment.revision
    )) ?? null
    : null

  if (!certificate) {
    blockers.push({
      area: 'deployment',
      id: 'exact-release-certificate',
      label: 'Certificate for the production revision',
      status: 'fail',
    })
  } else if (
    certificate.status !== 'passed'
    || certificate.launchStatus !== 'ready'
    || certificate.requiredFailedCount !== 0
  ) {
    blockers.push({
      area: 'deployment',
      id: 'release-certificate-verdict',
      label: 'Passing production certificate',
      status: 'fail',
    })
  }

  return {
    goEligible: blockers.length === 0,
    certificate,
    deployment: input.deployment,
    blockers: uniqueBlockers(blockers),
  }
}

function requiredLaunchBlockers(snapshot: LaunchControlSnapshot): ReleaseLaunchFailure[] {
  return [
    ...snapshot.configuration.map((check) => ({ area: 'configuration' as const, check })),
    ...snapshot.operations.map((check) => ({ area: 'operations' as const, check })),
    ...snapshot.certification.map((check) => ({ area: 'certification' as const, check })),
  ]
    .filter(({ check }) => check.required && check.status !== 'ready')
    .map(({ area, check }) => ({
      area,
      id: check.id,
      label: check.label,
      status: check.status,
    }))
}

function uniqueBlockers(blockers: ReleaseLaunchFailure[]): ReleaseLaunchFailure[] {
  const seen = new Set<string>()
  return blockers.filter((blocker) => {
    const key = `${blocker.area}:${blocker.id}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
