import { useRouter } from 'expo-router'
import { AlertTriangle, BellOff, CreditCard, MessageSquare, Star } from 'lucide-react-native'
import type { LucideIcon } from 'lucide-react-native'
import { useEffect, useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { ErrorState, Glass, LoadingState, Screen, StackHeader } from '@/src/components/ui'
import { useToast } from '@/src/components/Toast'
import { useInbox } from '@/src/hooks/useInbox'
import { formatCurrency, formatDateTime } from '@/src/lib/format'
import { colors, fonts } from '@/src/theme/colors'

type Notif = { id: string; icon: LucideIcon; tint: string; text: string; time: string; createdAt: string; open: () => void }
const RESOLVED = ['resolved', 'closed', 'refunded', 'completed', 'approved', 'declined']

export default function NotificationsRoute() {
  const router = useRouter()
  const { data, loading, error, reload } = useInbox()
  const toast = useToast()
  const [readAt, setReadAt] = useState('')
  const [clearedAt, setClearedAt] = useState('')

  useEffect(() => {
    AsyncStorage.multiGet(['nexez.notifReadAt', 'nexez.notifClearedAt'])
      .then((kv) => {
        const map = Object.fromEntries(kv) as Record<string, string | null>
        if (map['nexez.notifReadAt']) setReadAt(map['nexez.notifReadAt'] as string)
        if (map['nexez.notifClearedAt']) setClearedAt(map['nexez.notifClearedAt'] as string)
      })
      .catch(() => {})
  }, [])

  function markRead() {
    const t = new Date().toISOString()
    setReadAt(t)
    AsyncStorage.setItem('nexez.notifReadAt', t).catch(() => {})
    toast('Marked all read')
  }
  function clearAll() {
    const t = new Date().toISOString()
    setClearedAt(t)
    AsyncStorage.setItem('nexez.notifClearedAt', t).catch(() => {})
    toast('Notifications cleared')
  }

  const notifs = useMemo<Notif[]>(() => {
    if (!data) return []
    const out: Notif[] = []
    for (const n of data.negotiations.filter((x) => x.status === 'negotiation' || x.status === 'agreement_proposed')) {
      out.push({ id: `n-${n.id}`, icon: MessageSquare, tint: colors.ember, text: `New negotiation · ${n.offer_name || 'offer'} · ${formatCurrency(n.amount_cents, n.currency)}`, time: formatDateTime(n.created_at), createdAt: n.created_at, open: () => router.push({ pathname: '/inbox/negotiations/[id]', params: { id: n.id } }) })
    }
    for (const o of data.orders.filter((x) => x.status === 'paid').slice(0, 6)) {
      out.push({ id: `o-${o.id}`, icon: CreditCard, tint: colors.success, text: `Order paid · ${formatCurrency(o.amount_cents, o.currency)}`, time: formatDateTime(o.created_at), createdAt: o.created_at ?? '', open: () => router.push({ pathname: '/inbox/orders/[id]', params: { id: o.id } }) })
    }
    for (const r of data.reviews.slice(0, 6)) {
      out.push({ id: `r-${r.id}`, icon: Star, tint: colors.steel, text: `New ${r.rating}★ review · ${r.offer_name || r.slug || 'listing'}`, time: formatDateTime(r.created_at), createdAt: r.created_at, open: () => router.push('/inbox') })
    }
    for (const req of data.requests.filter((x) => !RESOLVED.includes(x.status))) {
      out.push({ id: `q-${req.id}`, icon: AlertTriangle, tint: colors.danger, text: `${req.kind === 'refund_request' ? 'Refund requested' : 'Problem reported'} · ${req.buyer_email || 'buyer'}`, time: formatDateTime(req.created_at), createdAt: req.created_at, open: () => router.push('/inbox') })
    }
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 14)
  }, [data, router])

  if (loading) return <LoadingState label="Loading notifications" />
  if (error || !data) return <ErrorState message={error || 'Notifications unavailable.'} onRetry={reload} />

  const visible = notifs.filter((n) => !clearedAt || n.createdAt > clearedAt)

  return (
    <Screen
      header={
        <StackHeader
          title="Notifications"
          onBack={() => router.back()}
          right={
            <View style={{ flexDirection: 'row', gap: 14 }}>
              <Pressable onPress={markRead}>
                <Text style={st.readAll}>Read all</Text>
              </Pressable>
              <Pressable onPress={clearAll}>
                <Text style={st.clear}>Clear</Text>
              </Pressable>
            </View>
          }
        />
      }
    >
      {visible.length ? (
        visible.map((n, i) => {
          const Icon = n.icon
          return (
            <Pressable key={n.id} onPress={n.open} style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]}>
              <Glass tone="card" radius={14} contentStyle={st.row}>
                <View style={[st.iconTile, { backgroundColor: `${n.tint}22` }]}>
                  <Icon size={17} color={n.tint} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={st.text}>{n.text}</Text>
                  <Text style={st.time}>{n.time}</Text>
                </View>
                {!readAt || n.createdAt > readAt ? <View style={st.dot} /> : null}
              </Glass>
            </Pressable>
          )
        })
      ) : (
        <View style={st.empty}>
          <BellOff size={42} color="rgba(255,255,255,0.25)" />
          <Text style={st.emptyTitle}>All caught up</Text>
          <Text style={st.emptySub}>No new notifications</Text>
        </View>
      )}
    </Screen>
  )
}

const st = StyleSheet.create({
  readAll: { color: colors.emberText, fontFamily: fonts.bodyBold, fontSize: 12 },
  clear: { color: colors.textSecondary, fontFamily: fonts.bodyBold, fontSize: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 13, padding: 13 },
  iconTile: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  text: { color: colors.body, fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 18 },
  time: { color: colors.textFaint, fontFamily: fonts.mono, fontSize: 11, marginTop: 3 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.ember },
  empty: { alignItems: 'center', paddingVertical: 64, gap: 6 },
  emptyTitle: { color: colors.body, fontFamily: fonts.bodyExtra, fontSize: 15, marginTop: 8 },
  emptySub: { color: colors.textSecondary, fontFamily: fonts.body, fontSize: 13 },
})
