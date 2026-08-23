import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { enforceRateLimit } from '../../../../../lib/rate-limit'
import { ownerAllows } from '../../../../../lib/server/plan'
import { resolvePageAccess } from '../../../../../lib/server/page-access'
import {
  entitlementAllocationRetryBody,
  entitlementAllocationRetryInit,
  isEntitlementAllocationRetry,
} from '../../../../../lib/entitlement-allocation-error'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../../../utils/supabase/admin'
import { createClient } from '../../../../../utils/supabase/server'

type Approval = {
  id: string
  approver: string
  status: 'pending' | 'approved' | 'rejected'
  note?: string
  ts: string
}

type Collaboration = {
  approvals?: Approval[]
  [key: string]: unknown
}

const MAX_APPROVALS = 100

/**
 * Authoritative mutation boundary for per-listing team approvals. The browser
 * sends only an action; this route resolves the page owner, re-checks the live
 * owner entitlement, and constructs the next JSON value from the database row.
 * Retained history can always be cleared by the owner after a downgrade, while
 * starting or advancing the premium workflow requires Pro at execution time.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const limited = await enforceRateLimit(request, 'team-approval', 30, 60_000)
  if (limited) return limited

  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!hasSupabaseAdminEnv()) return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })

  const { id: pageId } = await context.params
  const access = await resolvePageAccess({
    pageId,
    userId: user.id,
    userEmail: user.email,
    userEmailConfirmedAt: user.email_confirmed_at,
    requireEditor: true,
  })
  if (!access) {
    return NextResponse.json({ error: 'You do not have edit access to this listing.' }, { status: 403 })
  }

  const body = (await request.json().catch(() => ({}))) as { action?: unknown; note?: unknown }
  const action = body.action === 'request' || body.action === 'approve_all' || body.action === 'clear'
    ? body.action
    : null
  if (!action) return NextResponse.json({ error: 'Unsupported approval action.' }, { status: 400 })
  if ((action === 'approve_all' || action === 'clear') && access.role !== 'owner') {
    return NextResponse.json({ error: 'Only the listing owner can manage approval decisions.' }, { status: 403 })
  }

  const admin = createAdminClient()
  if (action !== 'clear' && !(await ownerAllows(admin, access.ownerId, 'teamCollaboration'))) {
    return NextResponse.json(
      {
        error: 'Team approvals are available on the Pro plan and above.',
        code: 'plan_upgrade_required',
        upgrade: 'pro',
      },
      { status: 402 },
    )
  }

  const { data: row, error: readError } = await admin
    .from('pages')
    .select('id, team_collaboration, updated_at')
    .eq('id', access.pageId)
    .maybeSingle<{ id: string; team_collaboration: Collaboration | null; updated_at: string }>()
  if (readError) return NextResponse.json({ error: 'Approval history could not be loaded.' }, { status: 500 })
  if (!row) return NextResponse.json({ error: 'Listing not found.' }, { status: 404 })

  const current = row.team_collaboration && typeof row.team_collaboration === 'object'
    ? row.team_collaboration
    : {}
  const approvals = Array.isArray(current.approvals) ? current.approvals : []
  let nextApprovals: Approval[]

  if (action === 'request') {
    if (approvals.length >= MAX_APPROVALS) {
      return NextResponse.json(
        { error: 'Approval history is full. Clear old history before requesting another review.' },
        { status: 409 },
      )
    }
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, 160) : ''
    nextApprovals = [
      ...approvals,
      {
        id: crypto.randomUUID(),
        approver: access.role,
        status: 'pending',
        note: note || 'Listing changes ready for review',
        ts: new Date().toISOString(),
      },
    ]
  } else if (action === 'approve_all') {
    nextApprovals = approvals.map((approval) => (
      approval.status === 'pending' ? { ...approval, status: 'approved' as const } : approval
    ))
  } else {
    nextApprovals = []
  }

  const next: Collaboration = { ...current, approvals: nextApprovals }
  const { data: saved, error: saveError } = await admin
    .from('pages')
    .update({ team_collaboration: next })
    .eq('id', row.id)
    .eq('updated_at', row.updated_at)
    .select('team_collaboration')
    .maybeSingle<{ team_collaboration: Collaboration }>()

  if (saveError) {
    if (isEntitlementAllocationRetry(saveError)) {
      return NextResponse.json(entitlementAllocationRetryBody, entitlementAllocationRetryInit)
    }
    if (saveError.code === '23514' || /team collaboration|pro plan/i.test(saveError.message || '')) {
      return NextResponse.json(
        { error: 'Team approvals are available on the Pro plan and above.', code: 'plan_upgrade_required', upgrade: 'pro' },
        { status: 402 },
      )
    }
    return NextResponse.json({ error: 'Approval history could not be updated.' }, { status: 500 })
  }
  if (!saved) {
    return NextResponse.json(
      { error: 'The listing changed while this approval was being updated. Reload and try again.', code: 'approval_conflict' },
      { status: 409 },
    )
  }

  return NextResponse.json({ ok: true, teamCollaboration: saved.team_collaboration })
}
