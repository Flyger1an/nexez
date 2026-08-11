import { NextResponse } from 'next/server'
import { enforceRateLimit } from '../../../../lib/rate-limit'
import {
  authorizeStudyRequest,
  runStudyScanBatch,
  seedStudyTargets,
  STUDY_METROS,
  STUDY_VERTICAL_FILTERS,
  type StudyVertical,
} from '../../../../lib/server/agent-readiness-study'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../../utils/supabase/admin'
import { captureError } from '../../../../lib/observability'

// One batch = up to 10 polite scans (page + bounded probes each) at concurrency 3.
export const maxDuration = 60

/**
 * Internal batch runner for the agent-readiness study. Bearer-token gated
 * against the service-role-only study_control table (sha256 at rest, rotate or
 * revoke by updating the row; no env or deploy change needed). Fail closed:
 * no configured control row means every request is rejected. Responses carry
 * counts only, never domains.
 */
export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, 'study-runner', 6, 60_000)
  if (limited) return limited

  if (!(await authorizeStudyRequest(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { action?: string; cohort?: string; metroKey?: string; vertical?: string; cap?: number; batchSize?: number }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const cohort = (body.cohort || '').trim()
  if (!cohort || cohort.length > 80) {
    return NextResponse.json({ error: 'A cohort label is required' }, { status: 400 })
  }

  try {
    if (body.action === 'seed') {
      const vertical = body.vertical as StudyVertical
      if (!body.metroKey || !STUDY_METROS[body.metroKey]) {
        return NextResponse.json({ error: 'Unknown metroKey' }, { status: 400 })
      }
      if (!vertical || !(vertical in STUDY_VERTICAL_FILTERS)) {
        return NextResponse.json({ error: 'Unknown vertical' }, { status: 400 })
      }
      const result = await seedStudyTargets({ cohort, metroKey: body.metroKey, vertical, cap: body.cap })
      return NextResponse.json(result, { status: result.ok ? 200 : 502 })
    }

    if (body.action === 'scan') {
      const result = await runStudyScanBatch({ cohort, batchSize: body.batchSize })
      return NextResponse.json(result, { status: result.ok ? 200 : 502 })
    }

    if (body.action === 'status') {
      if (!hasSupabaseAdminEnv()) {
        return NextResponse.json({ error: 'Admin env not configured' }, { status: 503 })
      }
      const admin = createAdminClient()
      const countTargets = async (status?: string) => {
        let query = admin.from('study_targets').select('id', { count: 'exact', head: true }).eq('cohort', cohort)
        if (status) query = query.eq('status', status)
        const { count } = await query
        return count ?? 0
      }
      const { count: resultCount } = await admin
        .from('scan_results')
        .select('id', { count: 'exact', head: true })
        .eq('source', 'study')
        .eq('study_cohort', cohort)
      const [total, pending, done, errors, robotsExcluded] = await Promise.all([
        countTargets(),
        countTargets('pending'),
        countTargets('done'),
        countTargets('error'),
        countTargets('robots_excluded'),
      ])
      return NextResponse.json({
        ok: true,
        cohort,
        targets: { total, pending, done, errors, robotsExcluded },
        persistedResults: resultCount ?? 0,
      })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (error) {
    captureError(error, { route: 'agent-readiness-study' })
    return NextResponse.json({ error: 'Study runner failed' }, { status: 500 })
  }
}
