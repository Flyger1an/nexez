import { useRouter } from 'expo-router'
import { FileEdit, MessageCircleQuestion } from 'lucide-react-native'
import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Glass, Screen, StackHeader } from '@/src/components/ui'
import { ListingEditorScreen } from '@/src/screens/ListingEditorScreen'
import { colors, fonts } from '@/src/theme/colors'

// The create fork (intake spec §6/§7), mirroring web /create: "Talk it
// through" (default, hero) routes into the interview; "Build with the form"
// renders the existing guided editor untouched.
export default function CreateListingRoute() {
  const router = useRouter()
  const [mode, setMode] = useState<'fork' | 'form'>('fork')

  if (mode === 'form') return <ListingEditorScreen create />

  return (
    <Screen header={<StackHeader title="New listing" onBack={() => router.back()} />}>
      <Text style={st.lede}>Two ways to get agent-ready. Both land in the same editor, and nothing publishes without you.</Text>

      <Pressable onPress={() => router.push('/intake')} style={({ pressed }) => [pressed ? st.pressed : null]}>
        <Glass tone="card" radius={18} contentStyle={st.option}>
          <View style={[st.icon, { backgroundColor: colors.ringBg, borderColor: colors.ringBorder }]}>
            <MessageCircleQuestion size={22} color={colors.ember} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={st.optionTitle}>Talk it through</Text>
            <Text style={st.optionSub}>
              Nexez reads your site, then interviews you only about the gaps. A conversation, not forty fields.
            </Text>
          </View>
        </Glass>
      </Pressable>

      <Pressable onPress={() => setMode('form')} style={({ pressed }) => [pressed ? st.pressed : null]}>
        <Glass tone="group" radius={18} contentStyle={st.option}>
          <View style={[st.icon, { backgroundColor: colors.neutralBg, borderColor: colors.neutralBorder }]}>
            <FileEdit size={22} color={colors.body} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={st.optionTitle}>Build with the form</Text>
            <Text style={st.optionSub}>The guided editor, with every field in your hands from the start.</Text>
          </View>
        </Glass>
      </Pressable>
    </Screen>
  )
}

const st = StyleSheet.create({
  lede: { color: colors.textSecondary, fontFamily: fonts.body, fontSize: 13, lineHeight: 19, paddingTop: 4 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },
  icon: { width: 44, height: 44, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  optionTitle: { color: colors.text, fontFamily: fonts.bodyBold, fontSize: 15 },
  optionSub: { color: colors.textSecondary, fontFamily: fonts.body, fontSize: 12.5, lineHeight: 18, marginTop: 3 },
  pressed: { opacity: 0.8 },
})
