import { useRouter } from 'expo-router'
import { FileText, Link2, Store } from 'lucide-react-native'
import { useState } from 'react'
import * as WebBrowser from 'expo-web-browser'
import { Pressable, Text, TextInput, View } from 'react-native'
import { AppButton, Screen, StackHeader } from '@/src/components/ui'
import { webPath } from '@/src/lib/api'
import { colors, fonts, radii } from '@/src/theme/colors'

export default function ImporterRoute() {
  const router = useRouter()
  const [url, setUrl] = useState('')
  const openWeb = () => void WebBrowser.openBrowserAsync(webPath('/dashboard/tools'))

  return (
    <Screen header={<StackHeader title="Import a business" onBack={() => router.back()} />}>
      <Text style={st.intro}>Nexez AI reads a source and auto-builds a structured, agent-ready page draft.</Text>

      <View style={st.urlField}>
        <Link2 size={20} color={colors.textTertiary} />
        <TextInput
          value={url}
          onChangeText={setUrl}
          placeholder="Paste your website URL"
          placeholderTextColor={colors.textTertiary}
          autoCapitalize="none"
          keyboardType="url"
          style={st.urlInput}
        />
      </View>
      <AppButton full label="Import from URL" onPress={openWeb} />

      <View style={st.orRow}>
        <View style={st.line} />
        <Text style={st.or}>OR</Text>
        <View style={st.line} />
      </View>

      <View style={st.grid}>
        <Pressable onPress={openWeb} style={st.tile}>
          <FileText size={22} color={colors.persimmonText} />
          <Text style={st.tileLabel}>Upload CSV</Text>
        </Pressable>
        <Pressable onPress={openWeb} style={st.tile}>
          <Store size={22} color={colors.persimmonText} />
          <Text style={st.tileLabel}>Shopify / Square</Text>
        </Pressable>
      </View>
      <Text style={st.note}>Complex imports finish on the web dashboard.</Text>
    </Screen>
  )
}

const st = {
  intro: { color: colors.textSecondary, fontFamily: fonts.body, fontSize: 13, lineHeight: 20 },
  urlField: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.inputBorder, borderRadius: radii.control, paddingHorizontal: 14, height: 50 },
  urlInput: { flex: 1, color: colors.text, fontFamily: fonts.body, fontSize: 14, padding: 0 },
  orRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10 },
  line: { flex: 1, height: 1, backgroundColor: colors.glassBorder },
  or: { color: colors.textFaint, fontFamily: fonts.body, fontSize: 11 },
  grid: { flexDirection: 'row' as const, gap: 12 },
  tile: { flex: 1, backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassBorder, borderRadius: radii.cardSm, padding: 16, gap: 9 },
  tileLabel: { color: colors.body, fontFamily: fonts.bodyBold, fontSize: 13 },
  note: { color: colors.textTertiary, fontFamily: fonts.body, fontSize: 12, marginTop: 4 },
}
