import { cookies, headers } from 'next/headers'
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

  // Already signed in? Don't show a login form. Shared .nexez.ai cookies let
  // nexez.ai and app.nexez.ai agree on auth state, while nexez.app stays focused
  // on public agent pages.
  if (initialMode !== 'reset') {
    const host = (await headers()).get('host')
    const supabase = createClient(await cookies(), host)
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (user) redirect(safeNextPath(nextPath))
  }

  return <LoginForm initialMode={initialMode} nextPath={nextPath} />
}
