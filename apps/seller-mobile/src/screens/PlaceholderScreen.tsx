import { useRouter } from 'expo-router'
import { ExternalLink } from 'lucide-react-native'
import * as WebBrowser from 'expo-web-browser'
import { AppButton, Card, Header, Screen } from '@/src/components/ui'
import { webPath } from '@/src/lib/api'

export function PlaceholderScreen({
  title,
  detail,
  webHref,
}: {
  title: string
  detail: string
  webHref?: string
}) {
  const router = useRouter()

  return (
    <Screen>
      <Header eyebrow="Nexez Seller Hub" title={title} subtitle={detail} />
      <Card>
        {webHref ? (
          <AppButton label="Open web handoff" icon={ExternalLink} onPress={() => void WebBrowser.openBrowserAsync(webPath(webHref))} />
        ) : null}
        <AppButton label="Back" variant="secondary" onPress={() => router.back()} />
      </Card>
    </Screen>
  )
}
