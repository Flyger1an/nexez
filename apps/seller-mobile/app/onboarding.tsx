import { useRouter } from 'expo-router'
import { BarChart3, Bot, Layers, ShieldCheck } from 'lucide-react-native'
import type { LucideIcon } from 'lucide-react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { StyleSheet, Text, View } from 'react-native'
import { AppButton, AvatarChip, Glass, Screen } from '@/src/components/ui'
import { useSession } from '@/src/hooks/useSession'
import { colors, fonts } from '@/src/theme/colors'

const POINTS: Array<{ icon: LucideIcon; title: string; sub: string }> = [
  { icon: Layers, title: 'Agent-ready listings', sub: 'Create and publish clean pages agents can read and transact.' },
  { icon: Bot, title: 'See agent discovery', sub: 'Track AI traffic, top buyer agents, and conversions in real time.' },
  { icon: BarChart3, title: 'Close deals on the go', sub: 'Accept, counter, and refund negotiations + orders from your phone.' },
  { icon: ShieldCheck, title: 'Readiness & trust', sub: 'Fix what holds agents back and watch your trust score climb.' },
]

export default function OnboardingRoute() {
  const router = useRouter()
  const { session } = useSession()

  // Onboarding now lands in the intake interview (spec §7): a signed-in seller
  // goes straight into the conversation; a new visitor signs in first and picks
  // it up from the create fork. Getting started is a conversation, not a form.
  async function start() {
    await AsyncStorage.setItem('nexez.onboarded', '1').catch(() => {})
    router.replace(session ? '/intake' : '/login')
  }

  return (
    <Screen>
      <View style={st.head}>
        <AvatarChip initial="N" size={54} />
        <Text style={st.eyebrow}>Nexez Seller Hub</Text>
        <Text style={st.title}>Your AI-commerce command center</Text>
        <Text style={st.subtitle}>Manage listings, agent discovery, negotiations, orders, and readiness - from anywhere.</Text>
      </View>

      <View style={{ gap: 12 }}>
        {POINTS.map((p) => {
          const Icon = p.icon
          return (
            <Glass key={p.title} tone="group" radius={16} contentStyle={st.row}>
              <View style={st.iconTile}>
                <Icon size={20} color={colors.ember} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={st.rowTitle}>{p.title}</Text>
                <Text style={st.rowSub}>{p.sub}</Text>
              </View>
            </Glass>
          )
        })}
      </View>

      <AppButton full label="Get started" onPress={start} />
    </Screen>
  )
}

const st = StyleSheet.create({
  head: { gap: 8, paddingTop: 12, paddingBottom: 4 },
  eyebrow: { color: colors.ember, fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 8 },
  title: { color: colors.text, fontFamily: fonts.display, fontSize: 28, letterSpacing: -0.4, lineHeight: 32 },
  subtitle: { color: colors.textSecondary, fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 13, padding: 14 },
  iconTile: { width: 38, height: 38, borderRadius: 11, backgroundColor: 'rgba(228,95,56,0.12)', alignItems: 'center', justifyContent: 'center' },
  rowTitle: { color: colors.text, fontFamily: fonts.bodyBold, fontSize: 14 },
  rowSub: { color: colors.textSecondary, fontFamily: fonts.body, fontSize: 12, lineHeight: 17, marginTop: 2 },
})
