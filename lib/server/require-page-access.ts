import 'server-only'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '../../utils/supabase/server'
import { createAdminClient, hasSupabaseAdminEnv } from '../../utils/supabase/admin'
import { resolvePageAccess, type PageAccess } from './page-access'

/**
 * The three-step preamble every page-scoped route was hand-rolling: authenticate
 * the caller, confirm the service-role client is available, then authorize
 * against the page via resolvePageAccess.
 *
 * Hand-rolling it 12 times meant a route that forgot `hasSupabaseAdminEnv()` or
 * passed the caller's id where the OWNER's was required was a silent security
 * bug rather than a compile error. Here the only way to reach a handler's body
 * is to hold a `PageAccessGrant`, which can only be produced by passing all
 * three checks.
 *
 * This is a guard, not a higher-order wrapper. Route handlers here need to run
 * work BEFORE authorization (rate limiting, body parsing) and, in the
 * custom-domain case, need the admin client to discover which page is even
 * being addressed. A HOF that owned the whole request could not express that,
 * so `pageId` accepts a resolver that receives the admin client instead.
 */

export type AuthedUser = {
  id: string
  email?: string | null
  email_confirmed_at?: string | null
}

type AdminClient = ReturnType<typeof createAdminClient>

export type PageAccessGrant = {
  ok: true
  user: AuthedUser
  access: PageAccess
  admin: AdminClient
}

export type PageAccessDenial = { ok: false; response: NextResponse }

export type PageAccessResult = PageAccessGrant | PageAccessDenial

/**
 * Resolve the page id being addressed. A plain string covers the common cases
 * (route param, request body). The function form runs AFTER the admin client
 * exists, for routes that must look the page up themselves; returning a
 * NextResponse from it denies the request with that exact response, and
 * returning null/empty denies with the standard 403.
 *
 * ⚠️ The resolver receives a SERVICE-ROLE client and runs BEFORE any
 * authorization decision has been made. Use it to identify which page is being
 * addressed, and for nothing else. Never return owner data from it, never echo
 * a row it read into an error message, and never let it write. The caller is
 * authenticated at that point but has NOT yet been shown to have any access to
 * the page it names.
 */
export type PageIdSource =
  | string
  | null
  | undefined
  | ((admin: AdminClient) => Promise<string | NextResponse | null | undefined>)

export type RequirePageAccessOptions = {
  pageId: PageIdSource
  /** Reject viewers. Every current caller is a write/feature action, so this defaults ON. */
  requireEditor?: boolean
  /** Per-route copy for the 503, which merchants see. */
  unavailableMessage?: string
  /** Per-route copy for the 403, for routes that say "listing" rather than "page". */
  denyMessage?: string
  /** Forwarded to the session client so cookie options match the request host. */
  host?: string | null
}

const DENY_403 = 'You do not have edit access to this page.'

export async function requirePageAccess(options: RequirePageAccessOptions): Promise<PageAccessResult> {
  const {
    pageId,
    requireEditor = true,
    unavailableMessage = 'Service unavailable',
    denyMessage = DENY_403,
    host,
  } = options

  const cookieStore = await cookies()
  const supabase = createClient(cookieStore, host)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { ok: false, response: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) }
  }

  // Every owner-scoped read and write below runs service-role: a collaborator's
  // session client cannot see the owner's rows under RLS, so resolvePageAccess is
  // the only authorization there is.
  if (!hasSupabaseAdminEnv()) {
    return { ok: false, response: NextResponse.json({ error: unavailableMessage }, { status: 503 }) }
  }
  const admin = createAdminClient()

  let resolvedPageId: string | null | undefined
  if (typeof pageId === 'function') {
    const resolved = await pageId(admin)
    // The resolver owns its own failure copy (e.g. "no page uses this domain").
    if (resolved instanceof NextResponse) return { ok: false, response: resolved }
    resolvedPageId = resolved
  } else {
    resolvedPageId = pageId
  }

  const access = await resolvePageAccess({
    pageId: resolvedPageId,
    userId: user.id,
    userEmail: user.email,
    userEmailConfirmedAt: user.email_confirmed_at,
    requireEditor,
  })

  if (!access) {
    return { ok: false, response: NextResponse.json({ error: denyMessage }, { status: 403 }) }
  }

  return { ok: true, user, access, admin }
}
