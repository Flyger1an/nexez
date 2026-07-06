import { useRouter } from 'expo-router'
import { AlertTriangle, Calendar, CalendarDays, CreditCard, Globe, ShoppingBag, Square } from 'lucide-react-native'
import type { LucideIcon } from 'lucide-react-native'
import * as WebBrowser from 'expo-web-browser'
import { useEffect, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { ErrorState, LoadingState, Screen, StackHeader } from '@/src/components/ui'
import { useToast } from '@/src/components/Toast'
import { useBilling } from '@/src/hooks/useBilling'
import { webPath } from '@/src/lib/api'
import { colors, fonts, radii } from '@/src/theme/colors'

type Row = { name: string; desc: string; icon: LucideIcon; connected: boolean; demoFail?: boolean }

export function IntegrationsScreen() {
  const router = useRouter()
  const toast = useToast()
  const { data, loading, error, reload } = useBilling()
  const [connecting, setConnecting] = useState<string | null>(null)
  const [errored, setErrored] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  if (loading) return <LoadingState label="Loading integrations" />
  if (error) return <ErrorState message={error} onRetry={reload} />

  const stripeConnected = Boolean(data?.billing?.stripe_connect_charges_enabled)
  const rows: Row[] = [
    { name: 'Stripe', desc: 'Payments & payouts', icon: CreditCard, connected: stripeConnected },
    { name: 'Calendly', desc: 'Booking links', icon: Calendar, connected: false },
    { name: 'Google Calendar', desc: 'Availability sync', icon: CalendarDays, connected: false },
    { name: 'Shopify', desc: 'Product catalog import', icon: ShoppingBag, connected: false, demoFail: true },
    { name: 'Square', desc: 'POS & inventory', icon: Square, connected: false },
    { name: 'Website importer', desc: 'Auto-build from your site', icon: Globe, connected: false },
  ]

  const openWeb = () => void WebBrowser.openBrowserAsync(webPath('/dashboard/integrations'))

  function connect(row: Row) {
    if (!row.demoFail) return openWeb()
    setErrored(null)
    setConnecting(row.name)
    timer.current = setTimeout(() => {
      setConnecting(null)
      setErrored(row.name)
      toast('Shopify connection failed', 'danger')
    }, 900)
  }

  return (
    <Screen header={<StackHeader title="Integrations" onBack={() => router.back()} />}>
      {rows.map((row) => {
        const Icon = row.icon
        const isConnecting = connecting === row.name
        const isErrored = errored === row.name
        return (
          <View key={row.name} style={[st.card, isErrored ? st.cardErrored : null]}>
            <View style={st.row}>
              <View style={st.iconTile}>
                <Icon size={21} color={colors.emberTint} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={st.name}>{row.name}</Text>
                <Text style={st.desc}>{row.desc}</Text>
              </View>
              {row.connected ? (
                <Text style={st.connected}>Connected</Text>
              ) : isConnecting ? (
                <Text style={st.connecting}>Connecting…</Text>
              ) : (
                <Pressable onPress={() => connect(row)} style={[st.connectBtn, isErrored ? st.retryBtn : null]}>
                  <Text style={st.connectText}>{isErrored ? 'Retry' : 'Connect'}</Text>
                </Pressable>
              )}
            </View>
            {isErrored ? (
              <View style={st.errorRow}>
                <AlertTriangle size={15} color={colors.danger} />
                <Text style={st.errorText}>Couldn’t reach Shopify — check your store URL, or finish setup on the web dashboard.</Text>
              </View>
            ) : null}
          </View>
        )
      })}
      <Text style={st.note}>Connect and manage OAuth integrations on the web dashboard.</Text>
    </Screen>
  )
}

const st = StyleSheet.create({
  card: { backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassBorder, borderRadius: radii.cardSm, overflow: 'hidden' },
  cardErrored: { borderColor: 'rgba(255,140,130,0.4)' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 13, padding: 14 },
  iconTile: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.neutralBg, alignItems: 'center', justifyContent: 'center' },
  name: { color: colors.text, fontFamily: fonts.bodyBold, fontSize: 14 },
  desc: { color: colors.textSecondary, fontFamily: fonts.body, fontSize: 12, marginTop: 2 },
  connected: { paddingHorizontal: 13, paddingVertical: 7, borderRadius: 10, backgroundColor: 'rgba(111,214,160,0.16)', color: colors.success, fontFamily: fonts.bodyBold, fontSize: 12, overflow: 'hidden' },
  connecting: { paddingHorizontal: 13, paddingVertical: 7, color: colors.textSecondary, fontFamily: fonts.bodyBold, fontSize: 12 },
  connectBtn: { paddingHorizontal: 13, paddingVertical: 7, borderRadius: 10, backgroundColor: colors.ringBg, borderWidth: 1, borderColor: colors.ringBorder },
  retryBtn: { backgroundColor: 'rgba(255,140,130,0.12)', borderColor: 'rgba(255,140,130,0.5)' },
  connectText: { color: colors.emberText, fontFamily: fonts.bodyBold, fontSize: 12 },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 11, borderTopWidth: 1, borderTopColor: 'rgba(255,140,130,0.2)', backgroundColor: 'rgba(255,140,130,0.07)' },
  errorText: { flex: 1, color: colors.danger, fontFamily: fonts.bodyMedium, fontSize: 12, lineHeight: 17 },
  note: { color: colors.textTertiary, fontFamily: fonts.body, fontSize: 12, lineHeight: 18, marginTop: 4 },
})
