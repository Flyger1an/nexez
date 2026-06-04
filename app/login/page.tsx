import { LoginForm, LoginMode } from '../../components/LoginForm'

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

  return <LoginForm initialMode={initialMode} nextPath={nextPath} />
}
