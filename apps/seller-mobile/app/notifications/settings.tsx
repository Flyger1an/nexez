import { useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { StyleSheet, Switch, Text, View } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { GroupCard, Screen, StackHeader } from '@/src/components/ui'
import { useToast } from '@/src/components/Toast'
import { colors, fonts } from '@/src/theme/colors'

const EVENTS = [
  { key: 'negotiation', label: 'New negotiation' },
  { key: 'accepted', label: 'Buyer accepted a proposal' },
  { key: 'payment', label: 'Payment received' },
  { key: 'review', label: 'New review' },
  { key: 'readiness', label: 'Readiness dropped' },
  { key: 'integration', label: 'Integration failed' },
  { key: 'spike', label: 'Agent traffic spike' },
]
const STORE_KEY = 'nexez.notifPrefs'

export default function NotificationSettingsRoute() {
  const router = useRouter()
  const toast = useToast()
  const [on, setOn] = useState<Record<string, boolean>>(() => Object.fromEntries(EVENTS.map((e) => [e.key, true])))

  // Persist per-event preferences on-device so they survive restarts.
  useEffect(() => {
    AsyncStorage.getItem(STORE_KEY)
      .then((v) => {
        if (v) setOn((prev) => ({ ...prev, ...(JSON.parse(v) as Record<string, boolean>) }))
      })
      .catch(() => {})
  }, [])

  function toggle(key: string, value: boolean) {
    setOn((prev) => {
      const next = { ...prev, [key]: value }
      AsyncStorage.setItem(STORE_KEY, JSON.stringify(next)).catch(() => {})
      return next
    })
    toast(value ? 'Notification on' : 'Notification off')
  }

  return (
    <Screen header={<StackHeader title="Notification settings" onBack={() => router.back()} />}>
      <Text style={st.intro}>Choose which seller events push to your phone.</Text>
      <GroupCard>
        {EVENTS.map((e, i) => (
          <View key={e.key} style={[st.row, i < EVENTS.length - 1 ? st.divider : null]}>
            <Text style={st.label}>{e.label}</Text>
            <Switch value={on[e.key]} onValueChange={(v) => toggle(e.key, v)} trackColor={{ false: 'rgba(255,255,255,0.15)', true: colors.ember }} thumbColor={colors.white} ios_backgroundColor="rgba(255,255,255,0.15)" />
          </View>
        ))}
      </GroupCard>
      <Text style={st.note}>Saved on this device. Delivery also depends on your device push permission (Settings → Push notifications).</Text>
    </Screen>
  )
}

const st = StyleSheet.create({
  intro: { color: colors.textSecondary, fontFamily: fonts.body, fontSize: 12, lineHeight: 18 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 13, paddingHorizontal: 16, minHeight: 56 },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
  label: { flex: 1, color: colors.body, fontFamily: fonts.bodySemibold, fontSize: 14 },
  note: { color: colors.textTertiary, fontFamily: fonts.body, fontSize: 12, lineHeight: 18 },
})
