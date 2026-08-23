import { useEffect, useState } from 'react'
import { useRouter } from 'expo-router'
import { Calendar, CalendarDays, CreditCard, Globe, Lock, ShoppingBag, Square } from 'lucide-react-native'
import type { LucideIcon } from 'lucide-react-native'
import * as WebBrowser from 'expo-web-browser'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { ErrorState, LoadingState, Screen, StackHeader } from '@/src/components/ui'
import { useBilling } from '@/src/hooks/useBilling'
import { useSession } from '@/src/hooks/useSession'
import { webPath } from '@/src/lib/api'
import {
  buildMobileIntegrationRows,
  mobileIntegrationDestination,
  type MobileIntegrationId,
} from '@/src/lib/integration-contract'
import { mobileEntitlementSnapshotExpiresAt } from '@/src/lib/entitlement-snapshot'
import { colors, fonts, radii } from '@/src/theme/colors'

const INTEGRATION_ICONS: Record<MobileIntegrationId, LucideIcon> = {
  'stripe-payouts': CreditCard,
  'stripe-catalog': ShoppingBag,
  calendly: Calendar,
  'google-calendar': CalendarDays,
  'shopify-app': ShoppingBag,
  'shopify-admin': ShoppingBag,
  square: Square,
  acuity: CalendarDays,
  'website-importer': Globe,
}

export function IntegrationsScreen() {
  const router = useRouter()
  const { user } = useSession()
  const { data, loading, error, reload } = useBilling()
  const [entitlementNow, setEntitlementNow] = useState(() => Date.now())
  const entitlementExpiresAt = mobileEntitlementSnapshotExpiresAt(data?.entitlements)

  useEffect(() => {
    if (entitlementExpiresAt == null) return
    const remaining = entitlementExpiresAt - Date.now()
    const timer = setTimeout(() => setEntitlementNow(Date.now()), Math.max(0, remaining + 1))
    return () => clearTimeout(timer)
  }, [entitlementExpiresAt])

  if (loading) return <LoadingState label="Loading integrations" />
  if (error) return <ErrorState message={error} onRetry={reload} />

  const rows = buildMobileIntegrationRows({
    ownerId: user?.id,
    entitlements: data?.entitlements,
    billing: data?.billing,
    now: new Date(entitlementNow),
  })

  return (
    <Screen header={<StackHeader title="Integrations" onBack={() => router.back()} />}>
      {rows.map((row) => {
        const Icon = INTEGRATION_ICONS[row.id]
        return (
          <View key={row.id} style={st.card}>
            <View style={st.row}>
              <View style={st.iconTile}>
                <Icon size={21} color={colors.emberTint} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={st.name}>{row.name}</Text>
                <Text style={st.desc}>{row.description}</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${row.actionLabel} ${row.name}`}
                onPress={() => void WebBrowser.openBrowserAsync(webPath(mobileIntegrationDestination(row)))}
                style={[st.connectBtn, row.ready ? st.readyBtn : null, row.locked ? st.lockedBtn : null]}
              >
                {row.locked ? <Lock size={12} color={colors.emberText} /> : null}
                <Text style={[st.connectText, row.ready ? st.readyText : null]}>{row.actionLabel}</Text>
              </Pressable>
            </View>
          </View>
        )
      })}
      <Text style={st.note}>
        Stripe payout setup and the installed Shopify App Store connector are available on every plan. Manually entered
        catalog and scheduling credentials require Pro or higher and are managed on the web dashboard.
      </Text>
    </Screen>
  )
}

const st = StyleSheet.create({
  card: { backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassBorder, borderRadius: radii.cardSm, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 13, padding: 14 },
  iconTile: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.neutralBg, alignItems: 'center', justifyContent: 'center' },
  name: { color: colors.text, fontFamily: fonts.bodyBold, fontSize: 14 },
  desc: { color: colors.textSecondary, fontFamily: fonts.body, fontSize: 12, marginTop: 2 },
  connectBtn: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 13, paddingVertical: 7, borderRadius: 10, backgroundColor: colors.ringBg, borderWidth: 1, borderColor: colors.ringBorder },
  readyBtn: { backgroundColor: 'rgba(111,214,160,0.16)', borderColor: 'rgba(111,214,160,0.35)' },
  lockedBtn: { backgroundColor: colors.ringBg, borderColor: colors.ringBorder },
  connectText: { color: colors.emberText, fontFamily: fonts.bodyBold, fontSize: 12 },
  readyText: { color: colors.success },
  note: { color: colors.textTertiary, fontFamily: fonts.body, fontSize: 12, lineHeight: 18, marginTop: 4 },
})
