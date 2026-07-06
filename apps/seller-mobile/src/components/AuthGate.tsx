import { Redirect } from 'expo-router'
import { LoadingState } from './ui'
import { useSession } from '@/src/hooks/useSession'

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { loading, session } = useSession()

  if (loading) return <LoadingState label="Checking session" />
  if (!session) return <Redirect href="/login" />

  return children
}
