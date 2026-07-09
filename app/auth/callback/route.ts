import { NextResponse, after } from 'next/server'
import { createClient } from '../../../utils/supabase/server'
import { cookies } from 'next/headers'
import { safeNextPath } from '../../../lib/safe-redirect'
import { sendOnceSystemEmail } from '../../../lib/server/system-email'
import { buildWelcomeEmail } from '../../../lib/email'
import { ensureTrialSeeded } from '../../../lib/server/trial'

// A user counts as "new" (gets the welcome) only if their account was created very
// recently - so an existing user signing in again never gets a backfill blast, and
// the send-once ledger keeps it to exactly one even if signup + first login coincide.
const WELCOME_WINDOW_MS = 24 * 60 * 60 * 1000

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  // Guard against open redirect: only allow a same-origin relative path.
  const next = safeNextPath(requestUrl.searchParams.get('next'))

  // OAuth provider error / consent-cancel: Google -> Supabase forwards `error`
  // (e.g. access_denied) with NO code. Without this, we'd silently redirect an
  // unauthenticated user onward and they'd bounce to a blank login form. Surface
  // it the same way the expired-link branch below does, so LoginForm shows a message.
  if (!code && requestUrl.searchParams.get('error')) {
    const loginUrl = new URL('/login', requestUrl.origin)
    loginUrl.searchParams.set('error', 'auth_callback')
    if (next && next !== '/') loginUrl.searchParams.set('next', next)
    return NextResponse.redirect(loginUrl)
  }

  if (code) {
    const cookieStore = await cookies()
    const supabase = createClient(cookieStore, requestUrl.host)
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      // Expired / already-used confirmation or magic link: don't silently drop the
      // user on a blank login form - bounce to /login with a flag the form surfaces.
      const loginUrl = new URL('/login', requestUrl.origin)
      loginUrl.searchParams.set('error', 'auth_callback')
      if (next && next !== '/') loginUrl.searchParams.set('next', next)
      return NextResponse.redirect(loginUrl)
    }

    // Welcome the user once, on their first sign-in. Deferred so it never blocks the
    // redirect; send-once-guarded so repeat logins don't re-fire. Gated on a recent
    // created_at so existing users aren't welcomed on their next login.
    const { data: { user } } = await supabase.auth.getUser()
    const createdMs = user?.created_at ? Date.parse(user.created_at) : NaN
    const isNew = Boolean(user?.id) && Number.isFinite(createdMs) && Date.now() - createdMs < WELCOME_WINDOW_MS

    // Seed the no-card trial for a brand-new confirmed account BEFORE redirecting, so the
    // email-confirmation signup path shows the trial on its FIRST dashboard load (not a
    // one-render "Free" flash from the layout-seed racing the page read). Awaited - a single
    // fast idempotent insert, Pro by default. The dashboard layout backstop still covers any
    // other path. Existing users (created > 24h) are never auto-trialed here.
    if (isNew && user) {
      await ensureTrialSeeded(user.id, user.user_metadata?.plan)
    }

    if (isNew && user?.email) {
      const createUrl = new URL('/create', requestUrl.origin).toString()
      const name = (user.user_metadata?.full_name as string | undefined) || (user.user_metadata?.name as string | undefined) || null
      const to = user.email
      const ownerId = user.id
      after(async () => {
        await sendOnceSystemEmail({ ownerId, kind: 'welcome', to, build: () => buildWelcomeEmail({ name, createUrl }) })
      })
    }
  }

  return NextResponse.redirect(new URL(next, requestUrl.origin))
}
