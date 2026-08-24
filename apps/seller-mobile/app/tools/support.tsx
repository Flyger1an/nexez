import { useRouter } from 'expo-router'
import { BookOpen, Mail, MessageCircle } from 'lucide-react-native'
import * as WebBrowser from 'expo-web-browser'
import { Linking } from 'react-native'
import { GroupCard, GroupRow, Screen, StackHeader } from '@/src/components/ui'
import { webPath } from '@/src/lib/api'
import { NEXEZ_SUPPORT_EMAIL, NEXEZ_SUPPORT_MAILTO } from '@/src/lib/support-contact'

export default function SupportRoute() {
  const router = useRouter()
  return (
    <Screen header={<StackHeader title="Help & support" onBack={() => router.back()} />}>
      <GroupCard>
        <GroupRow icon={MessageCircle} title="Chat with Nexez AI" detail="Get instant answers" onPress={() => void WebBrowser.openBrowserAsync(webPath('/support'))} />
        <GroupRow icon={BookOpen} iconTone="gold" title="Documentation" detail="Guides & API reference" onPress={() => void WebBrowser.openBrowserAsync(webPath('/docs'))} />
        <GroupRow icon={Mail} iconTone="muted" title="Email support" detail={NEXEZ_SUPPORT_EMAIL} onPress={() => void Linking.openURL(NEXEZ_SUPPORT_MAILTO)} last />
      </GroupCard>
    </Screen>
  )
}
