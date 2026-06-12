import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { LoginForm, LoginMode } from '../../components/LoginForm'
import { createClient } from '../../utils/supabase/server'
import { safeNextPath } from '../../lib/safe-redirect'

type LoginPageProps = {
  searchParams?: Promise<{
    mode?: string | string[]
    next?: string | string[]
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

  // Already signed in? Don't show a login form — go straight to the app. The
  // marketing surface (nexez.ai) is a different registrable domain, so it can't
  // see the nexez.app session cookie and its nav always shows "Sign in"; this makes
  // that button bounce an authenticated user back into their dashboard instead of a
  // confusing form that looks like they were logged out. (Password reset still
  // renders, since that can legitimately run while a stale session exists.)
  if (initialMode !== 'reset') {
    const supabase = createClient(await cookies())
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (user) redirect(safeNextPath(nextPath))
  }

  return <LoginForm initialMode={initialMode} nextPath={nextPath} />
}
