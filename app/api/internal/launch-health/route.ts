import { NextResponse } from 'next/server'
import { captureError } from '../../../../lib/observability'
import { buildMachineLaunchHealth } from '../../../../lib/release-certification'
import { getLaunchControlSnapshot } from '../../../../lib/server/launch-control'
import { authorizeReleaseCertificationRequest } from '../../../../lib/server/release-certification-auth'
import { getReleaseDeploymentIdentity } from '../../../../lib/server/release-certification'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(request: Request) {
  if (!authorizeReleaseCertificationRequest(request)) {
    return json({ ok: false, error: 'unauthorized' }, 401)
  }

  try {
    const snapshot = await getLaunchControlSnapshot()
    const health = buildMachineLaunchHealth(snapshot, getReleaseDeploymentIdentity())
    return json(health, health.ok ? 200 : 503)
  } catch (error) {
    captureError(error, { route: '/api/internal/launch-health' })
    return json({ ok: false, error: 'launch_health_unavailable' }, 503)
  }
}

function json(body: unknown, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}
