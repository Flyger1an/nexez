import { Redirect } from 'expo-router'
import { useEffect, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { LoadingState } from '@/src/components/ui'
import { useSession } from '@/src/hooks/useSession'

export default function IndexRoute() {
  const { loading, session } = useSession()
  const [onboarded, setOnboarded] = useState<boolean | null>(null)

  useEffect(() => {
    AsyncStorage.getItem('nexez.onboarded')
      .then((v) => setOnboarded(Boolean(v)))
      .catch(() => setOnboarded(true))
  }, [])

  if (loading || onboarded === null) return <LoadingState label="Opening Seller Hub" />
  if (session) return <Redirect href="/overview" />
  if (!onboarded) return <Redirect href="/onboarding" />
  return <Redirect href="/login" />
}
