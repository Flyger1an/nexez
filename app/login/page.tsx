import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { LoginForm, LoginMode } from '../../components/LoginForm'
import { SignInForm } from '../../components/SignInForm'
import { AdminLoginForm } from '../../components/admin/AdminLoginForm'
import { createClient } from '../../utils/supabase/server'
import { safeNextPath } from '../../lib/safe-redirect'
import { isAdminHost } from '../../lib/site'
import { isPlatformAdmin } from '../../lib/server/plan'

type LoginPageProps = {
  searchParams?: Promise<{
    mode?: string | string[]
    next?: string | string[]
    error?: string | string[]
  }>
}

function firstValue(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value
}

function toLoginMode(value?: string): LoginMode {
  return value === 'signup' || value === 'reset' ? value : 'signin'
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams
  const initialMode = toLoginMode(firstValue(params?.mode))
  const nextPath = firstValue(params?.next)
  const host = (await headers()).get('host')

  if (isAdminHost(host)) {
    const supabase = createClient(await cookies(), host)
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (user && await isPlatformAdmin(supabase, user.id)) {
      redirect(safeNextPath(nextPath, '/admin'))
    }
    const accessError = firstValue(params?.error)
    return (
      <AdminLoginForm
        nextPath={safeNextPath(nextPath, '/admin')}
        clearExistingSession={Boolean(user)}
        initialError={accessError === 'admin_access' || user ? 'This account does not have platform-admin access.' : undefined}
      />
    )
  }

  // Already signed in? Don't show a login form. Shared .nexez.ai cookies let
  // nexez.ai and app.nexez.ai agree on auth state, while nexez.app stays focused
  // on public agent pages.
  if (initialMode !== 'reset') {
    const supabase = createClient(await cookies(), host)
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (user) redirect(safeNextPath(nextPath))
  }

  // Every new signup goes through onboarding so Free or a paid trial is an explicit
  // choice. A direct /login?mode=signup link (or LoginForm's "Create an account")
  // lands on /onboard, carrying any `next`.
  if (initialMode === 'signup') {
    const safe = safeNextPath(nextPath, '')
    redirect(safe ? `/onboard?next=${encodeURIComponent(safe)}` : '/onboard')
  }

  // Signin gets its own screen: one form, one primary action, alternates ranked
  // below it. Reset still belongs to LoginForm, and signup redirected to
  // /onboard above, so LoginForm only ever sees reset here.
  if (initialMode === 'signin') {
    return <SignInForm nextPath={nextPath} />
  }

  return <LoginForm initialMode={initialMode} nextPath={nextPath} />
}
