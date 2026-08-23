import { useLocalSearchParams, useRouter } from 'expo-router'
import { CheckCircle2, MinusCircle } from 'lucide-react-native'
import { StyleSheet, Text, View } from 'react-native'
import { BlurView } from 'expo-blur'
import { ErrorState, GroupCard, LoadingState, Screen, SectionTitle, StackHeader } from '@/src/components/ui'
import { getReadinessScore } from '@/src/lib/agent-page'
import { colors, fonts, radii } from '@/src/theme/colors'
import { useListing } from '@/src/hooks/useListings'
import { useInbox } from '@/src/hooks/useInbox'

export default function TrustRoute() {
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const listing = useListing(id)
  const inbox = useInbox()

  if (listing.loading || inbox.loading) return <LoadingState label="Scoring trust" />
  if (listing.error || !listing.data) return <ErrorState message={listing.error || 'Listing not found.'} onRetry={listing.reload} />
  const page = listing.data

  const reviews = (inbox.data?.reviews ?? []).filter((r) => r.page_id === page.id || r.slug === page.slug)
  const orders = (inbox.data?.orders ?? []).filter((o) => o.page_id === page.id || o.slug === page.slug)
  const readiness = getReadinessScore(page)
  const avgRating = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : null
  const paid = orders.length
  const refunded = orders.filter((o) => o.status === 'refunded' || (o.refunded_cents || 0) > 0).length
  const refundRate = paid ? refunded / paid : 0
  const verified = Boolean(page.custom_domain_verified)
  const ratingPct = avgRating != null ? (avgRating / 5) * 100 : readiness
  const score = Math.max(0, Math.min(100, Math.round(0.45 * readiness + 0.3 * ratingPct + 0.15 * (100 - refundRate * 100) + (verified ? 10 : 0))))
  const label = score >= 90 ? 'Strong · agents weigh this heavily at checkout' : score >= 70 ? 'Solid · trusted by most agents' : 'Building · add proof to climb'
  const scoreColor = score >= 90 ? colors.success : score >= 70 ? colors.ember : colors.warning

  const signals: { label: string; value: string; ok: boolean }[] = [
    { label: 'Readiness', value: `${readiness}%`, ok: readiness >= 80 },
    { label: 'Average rating', value: avgRating != null ? `${avgRating.toFixed(1)} ★` : 'No reviews yet', ok: avgRating != null && avgRating >= 4 },
    { label: 'Verified reviews', value: `${reviews.length}`, ok: reviews.length > 0 },
    { label: 'Verified domain', value: verified ? 'Verified' : 'Not set', ok: verified },
    { label: 'Refund rate', value: paid ? `${Math.round(refundRate * 100)}%` : '-', ok: refundRate <= 0.1 },
  ]

  return (
    <Screen header={<StackHeader title="Trust score" onBack={() => router.back()} />}>
      <View style={st.hero}>
        <BlurView intensity={28} tint="dark" style={StyleSheet.absoluteFill} />
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.1)' }]} />
        <View pointerEvents="none" style={st.heroRim} />
        <View style={st.heroContent}>
          <Text style={[st.score, { color: scoreColor }]}>{score}</Text>
          <Text style={st.label}>{label}</Text>
        </View>
      </View>

      <SectionTitle title="Contributing signals" />
      <GroupCard>
        {signals.map((sig, i) => (
          <View key={sig.label} style={[st.row, i < signals.length - 1 ? st.divider : null]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11 }}>
              {sig.ok ? <CheckCircle2 size={18} color={colors.success} /> : <MinusCircle size={18} color={colors.textTertiary} />}
              <Text style={st.rowLabel}>{sig.label}</Text>
            </View>
            <Text style={st.rowValue}>{sig.value}</Text>
          </View>
        ))}
      </GroupCard>
    </Screen>
  )
}

const st = StyleSheet.create({
  hero: { borderRadius: radii.cardLg, borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)', overflow: 'hidden' },
  heroRim: { position: 'absolute', top: 0, left: 0, right: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.22)' },
  heroContent: { padding: 22, alignItems: 'center' },
  score: { fontFamily: fonts.display, fontSize: 48, lineHeight: 50 },
  label: { color: colors.textSecondary, fontFamily: fonts.body, fontSize: 12, marginTop: 8, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 13, paddingHorizontal: 16 },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
  rowLabel: { color: colors.body, fontFamily: fonts.bodySemibold, fontSize: 13 },
  rowValue: { color: colors.textSecondary, fontFamily: fonts.bodySemibold, fontSize: 13 },
})
