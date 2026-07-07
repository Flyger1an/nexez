import { useRouter } from 'expo-router'
import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { Badge, EmptyState, ErrorState, Header, LoadingState, Screen, SegmentedControl } from '@/src/components/ui'
import { formatCurrency, formatDateTime } from '@/src/lib/format'
import { colors, fonts, radii } from '@/src/theme/colors'
import { useInbox } from '@/src/hooks/useInbox'
import type { Tone } from '@/src/components/ui'

type InboxTab = 'negotiations' | 'orders' | 'reviews' | 'requests'

const RESOLVED = ['resolved', 'closed', 'refunded', 'completed', 'approved', 'declined']

function negTone(status: string): Tone {
  if (status === 'complete') return 'success'
  if (status === 'disputed' || status === 'refunded') return 'danger'
  if (status === 'declined' || status === 'expired') return 'muted'
  if (status === 'negotiation') return 'warn'
  return 'info'
}
function orderTone(status: string): Tone {
  if (status === 'paid') return 'success'
  if (status === 'disputed') return 'danger'
  if (status.includes('refund')) return 'warn'
  return 'muted'
}

export function InboxScreen({ initialTab = 'negotiations' }: { initialTab?: InboxTab }) {
  const router = useRouter()
  const [tab, setTab] = useState<InboxTab>(initialTab)
  const { data, loading, refreshing, error, reload, refresh } = useInbox()

  if (loading) return <LoadingState label="Loading inbox" />
  if (error || !data) return <ErrorState message={error || 'Inbox unavailable.'} onRetry={reload} />

  const openReq = data.requests.filter((r) => !RESOLVED.includes(r.status)).length

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Header title="Inbox" />
      <SegmentedControl
        value={tab}
        onChange={setTab}
        options={[
          { label: 'Deals', value: 'negotiations' },
          { label: 'Orders', value: 'orders' },
          { label: 'Reviews', value: 'reviews' },
          { label: openReq ? `Requests·${openReq}` : 'Requests', value: 'requests' },
        ]}
      />

      {tab === 'negotiations' ? (
        data.negotiations.length ? (
          data.negotiations.map((n) => (
            <View key={n.id} style={s.card}>
              <View style={s.head}>
                <Badge tone={negTone(n.status)}>{n.status.replace(/_/g, ' ')}</Badge>
                <Text style={s.mono}>{formatDateTime(n.created_at)}</Text>
              </View>
              <Text style={s.query} numberOfLines={3}>
                {n.buyer_query || n.offer_name || 'Buyer proposal'}
              </Text>
              <View style={s.metaRow}>
                <Text style={s.meta} numberOfLines={1}>
                  {n.buyer_email || n.buyer_agent || 'Buyer'} · /{n.slug}
                </Text>
                <Text style={s.amount}>{formatCurrency(n.amount_cents, n.currency)}</Text>
              </View>
              {/* Action shortcuts only while the deal is actually actionable —
                  the same status vocabulary the detail screen gates on. A
                  declined/complete/held deal gets a single View affordance. */}
              {n.status === 'negotiation' || n.status === 'agreement_proposed' ? (
                <View style={s.actions}>
                  <Pressable onPress={() => router.push({ pathname: '/inbox/negotiations/[id]', params: { id: n.id } })} style={[s.actBtn, s.actPrimary, { flex: 1 }]}>
                    <Text style={[s.actText, { color: colors.persimmonLight }]}>Accept</Text>
                  </Pressable>
                  <Pressable onPress={() => router.push({ pathname: '/inbox/negotiations/[id]', params: { id: n.id } })} style={[s.actBtn, { flex: 1 }]}>
                    <Text style={s.actText}>Counter</Text>
                  </Pressable>
                  <Pressable onPress={() => router.push({ pathname: '/inbox/negotiations/[id]', params: { id: n.id } })} style={s.actBtn}>
                    <Text style={[s.actText, { color: colors.textSecondary }]}>Decline</Text>
                  </Pressable>
                </View>
              ) : (
                <View style={s.actions}>
                  <Pressable onPress={() => router.push({ pathname: '/inbox/negotiations/[id]', params: { id: n.id } })} style={[s.actBtn, { flex: 1 }]}>
                    <Text style={s.actText}>{n.status === 'held' ? 'Review hold' : 'View deal'}</Text>
                  </Pressable>
                </View>
              )}
            </View>
          ))
        ) : (
          <EmptyState title="No negotiations" detail="Agent proposals and counter-offers land here." />
        )
      ) : null}

      {tab === 'orders' ? (
        data.orders.length ? (
          data.orders.map((o) => (
            <Pressable key={o.id} onPress={() => router.push({ pathname: '/inbox/orders/[id]', params: { id: o.id } })} style={s.card}>
              <View style={s.head}>
                <Text style={[s.mono, { color: colors.body }]}>#{o.id.slice(-6).toUpperCase()}</Text>
                <Badge tone={orderTone(o.status)}>{o.status.replace(/_/g, ' ')}</Badge>
              </View>
              <View style={s.metaRow}>
                <Text style={s.meta} numberOfLines={1}>
                  {o.buyer_name || o.buyer_email || 'Buyer'} · {o.offer_name || o.slug || 'Order'}
                </Text>
                <Text style={[s.amount, { color: colors.text }]}>{formatCurrency(o.amount_cents, o.currency)}</Text>
              </View>
            </Pressable>
          ))
        ) : (
          <EmptyState title="No direct orders" detail="Stripe-backed checkout orders appear after payment webhooks persist them." />
        )
      ) : null}

      {tab === 'reviews' ? (
        data.reviews.length ? (
          data.reviews.map((r) => (
            <View key={r.id} style={s.card}>
              <View style={s.head}>
                <Text style={s.stars}>{'★★★★★'.slice(0, Math.max(0, Math.min(5, r.rating)))}</Text>
                <Badge tone={r.rating >= 4 ? 'success' : r.rating <= 2 ? 'danger' : 'warn'}>{r.status || 'published'}</Badge>
              </View>
              {r.title ? <Text style={s.reviewTitle}>{r.title}</Text> : null}
              {r.body ? (
                <Text style={s.reviewBody} numberOfLines={3}>
                  {r.body}
                </Text>
              ) : null}
              <Text style={s.reviewMeta}>
                {r.offer_name || r.slug || 'Listing'} · {formatDateTime(r.created_at)}
              </Text>
            </View>
          ))
        ) : (
          <EmptyState title="No reviews yet" detail="Verified buyer reviews appear here after order portal submission." />
        )
      ) : null}

      {tab === 'requests' ? (
        data.requests.length ? (
          data.requests.map((req) => {
            const resolved = RESOLVED.includes(req.status)
            const refund = req.kind === 'refund_request'
            return (
              <View key={req.id} style={s.card}>
                <View style={s.head}>
                  <Text style={s.reviewTitle}>{refund ? 'Refund request' : 'Problem report'}</Text>
                  <Badge tone={resolved ? 'muted' : 'warn'}>{req.status.replace(/_/g, ' ')}</Badge>
                </View>
                {req.message ? (
                  <Text style={s.reviewBody} numberOfLines={3}>
                    {req.message}
                  </Text>
                ) : null}
                <Text style={s.reviewMeta}>
                  {req.buyer_email || 'Buyer'} · {formatDateTime(req.created_at)}
                </Text>
              </View>
            )
          })
        ) : (
          <EmptyState title="No buyer requests" detail="Refund requests and problem reports from the buyer order portal surface here for action." />
        )
      ) : null}
    </Screen>
  )
}

const s = {
  card: { backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassBorder, borderRadius: radii.cardSm, padding: 15, gap: 8 },
  head: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const },
  mono: { fontFamily: fonts.mono, fontSize: 11, color: colors.textFaint },
  query: { color: colors.body, fontFamily: fonts.bodySemibold, fontSize: 14, lineHeight: 20 },
  metaRow: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, gap: 10 },
  meta: { flex: 1, color: colors.textSecondary, fontFamily: fonts.body, fontSize: 12 },
  amount: { fontFamily: fonts.display, fontSize: 17, color: colors.persimmon },
  actions: { flexDirection: 'row' as const, gap: 8, marginTop: 4 },
  actBtn: { paddingVertical: 9, paddingHorizontal: 12, borderRadius: 10, backgroundColor: colors.neutralBg, alignItems: 'center' as const, justifyContent: 'center' as const },
  actPrimary: { backgroundColor: colors.ringBg, borderWidth: 1, borderColor: colors.ringBorder },
  actText: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.body },
  stars: { color: colors.warning, fontSize: 14, letterSpacing: 1 },
  reviewTitle: { color: colors.text, fontFamily: fonts.bodyBold, fontSize: 14 },
  reviewBody: { color: colors.textSecondary, fontFamily: fonts.body, fontSize: 13, lineHeight: 19 },
  reviewMeta: { color: colors.textTertiary, fontFamily: fonts.body, fontSize: 11 },
}
