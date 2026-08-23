import { useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { StyleSheet, Switch, Text, View } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { ErrorState, GroupCard, LoadingState, Screen, StackHeader } from '@/src/components/ui'
import { useToast } from '@/src/components/Toast'
import {
  getSellerNotificationPreferences,
  updateSellerNotificationPreferences,
  type SellerNotificationPreferencePatch,
  type SellerNotificationPreferences,
} from '@/src/lib/api'
import {
  normalizeSellerNotificationPreferences,
  sellerNotificationPatchFromLegacyStorage,
} from '@/src/lib/seller-notification-preferences'
import { colors, fonts } from '@/src/theme/colors'

const ROWS = [
  {
    category: 'transactions',
    label: 'Transactions and money state',
    detail: 'Payments, escrow, captures, refunds, disputes, and confirmed orders.',
    required: true,
  },
  {
    category: 'negotiations',
    label: 'Negotiations',
    detail: 'New proposals, buyer responses, and agreement activity.',
    required: false,
  },
  {
    category: 'integrations',
    label: 'Integration health',
    detail: 'Connection failures, recovery, and catalog synchronization issues.',
    required: false,
  },
  {
    category: 'reviews',
    label: 'Reviews',
    detail: 'New verified reviews and moderation updates.',
    required: false,
  },
  {
    category: 'marketing',
    label: 'Growth and product updates',
    detail: 'Readiness changes, traffic signals, and useful Nexez product updates.',
    required: false,
  },
] as const

const LEGACY_STORE_KEY = 'nexez.notifPrefs'
type MutableCategory = keyof SellerNotificationPreferencePatch

export default function NotificationSettingsRoute() {
  const router = useRouter()
  const toast = useToast()
  const [preferences, setPreferences] = useState<SellerNotificationPreferences | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState<MutableCategory | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let active = true

    async function load() {
      setLoading(true)
      setError('')
      try {
        const server = await getSellerNotificationPreferences()
        if (typeof server.configured !== 'boolean') {
          throw new Error('The server returned an invalid notification preference state.')
        }
        let next = normalizeSellerNotificationPreferences(server.preferences)
        if (!next) throw new Error('The server returned invalid notification preferences.')

        if (!server.configured) {
          const legacy = sellerNotificationPatchFromLegacyStorage(await AsyncStorage.getItem(LEGACY_STORE_KEY))
          if (legacy) {
            const migrated = await updateSellerNotificationPreferences(legacy)
            next = normalizeSellerNotificationPreferences(migrated.preferences)
            if (!next) throw new Error('The server returned invalid notification preferences.')
            void AsyncStorage.removeItem(LEGACY_STORE_KEY).catch(() => {})
          }
        }

        if (active) setPreferences(next)
      } catch (loadError) {
        if (active) {
          setPreferences(null)
          setError(loadError instanceof Error ? loadError.message : 'Notification preferences are unavailable.')
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    void load()
    return () => {
      active = false
    }
  }, [reloadKey])

  async function toggle(category: MutableCategory, enabled: boolean) {
    if (!preferences || saving) return
    const previous = preferences
    setSaving(category)
    setPreferences({ ...preferences, [category]: enabled })

    try {
      const response = await updateSellerNotificationPreferences({ [category]: enabled })
      const next = normalizeSellerNotificationPreferences(response.preferences)
      if (!next) throw new Error('The server returned invalid notification preferences.')
      setPreferences(next)
      toast(enabled ? 'Notification on across your devices' : 'Notification off across your devices')
    } catch (saveError) {
      setPreferences(previous)
      toast(saveError instanceof Error ? saveError.message : 'Could not save notification preferences.')
    } finally {
      setSaving(null)
    }
  }

  if (loading) return <LoadingState label="Loading notification settings" />
  if (error || !preferences) {
    return <ErrorState message={error || 'Notification preferences are unavailable.'} onRetry={() => setReloadKey((value) => value + 1)} />
  }

  return (
    <Screen header={<StackHeader title="Notification settings" onBack={() => router.back()} />}>
      <Text style={st.intro}>These account settings follow you across web and mobile.</Text>
      <GroupCard>
        {ROWS.map((row, index) => {
          const enabled = preferences[row.category]
          return (
            <View key={row.category} style={[st.row, index < ROWS.length - 1 ? st.divider : null]}>
              <View style={st.copy}>
                <View style={st.titleLine}>
                  <Text style={st.label}>{row.label}</Text>
                  {row.required ? <Text style={st.required}>REQUIRED</Text> : null}
                </View>
                <Text style={st.detail}>{row.detail}</Text>
              </View>
              <Switch
                accessibilityLabel={`${row.label}: ${enabled ? 'on' : 'off'}`}
                disabled={row.required || Boolean(saving)}
                value={enabled}
                onValueChange={(value) => {
                  if (!row.required) void toggle(row.category, value)
                }}
                trackColor={{ false: 'rgba(255,255,255,0.15)', true: colors.ember }}
                thumbColor={colors.white}
                ios_backgroundColor="rgba(255,255,255,0.15)"
              />
            </View>
          )
        })}
      </GroupCard>
      <Text style={st.note}>
        Money-state notices cannot be muted because they can change fulfillment, refund, dispute, and payout obligations. Device push permissions still control whether your phone can display an alert.
      </Text>
      {saving ? <Text style={st.saving}>Saving across devices...</Text> : null}
    </Screen>
  )
}

const st = StyleSheet.create({
  intro: { color: colors.textSecondary, fontFamily: fonts.body, fontSize: 12, lineHeight: 18 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16, minHeight: 76 },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
  copy: { flex: 1, minWidth: 0 },
  titleLine: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 7 },
  label: { color: colors.body, fontFamily: fonts.bodySemibold, fontSize: 14 },
  required: { color: colors.success, fontFamily: fonts.monoMedium, fontSize: 9, letterSpacing: 0.8 },
  detail: { color: colors.textSecondary, fontFamily: fonts.body, fontSize: 11, lineHeight: 17, marginTop: 4 },
  note: { color: colors.textTertiary, fontFamily: fonts.body, fontSize: 12, lineHeight: 18 },
  saving: { color: colors.emberText, fontFamily: fonts.bodySemibold, fontSize: 12 },
})
