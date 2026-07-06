import { useLocalSearchParams, useRouter } from 'expo-router'
import { BarChart3, ExternalLink, Gauge, Send, Shield, ShoppingBag } from 'lucide-react-native'
import * as WebBrowser from 'expo-web-browser'
import { Pressable, Text, View } from 'react-native'
import { Badge, Card, ErrorState, LoadingState, ReadinessRing, Screen, SectionTitle, StackHeader } from '@/src/components/ui'
import { publicPageUrl } from '@/src/lib/config'
import { getOfferCount, getReadinessScore } from '@/src/lib/agent-page'
import { colors, fonts, radii } from '@/src/theme/colors'
import { useListing, useListingSignals } from '@/src/hooks/useListings'

const ACTION_TILES = [
  { key: 'readiness', label: 'Readiness', icon: Gauge, tone: colors.ember },
  { key: 'simulator', label: 'Simulator', icon: Send, tone: colors.steel },
  { key: 'offers', label: 'Offers', icon: ShoppingBag, tone: colors.ember },
  { key: 'competitor', label: 'Compare', icon: BarChart3, tone: colors.steel },
  { key: 'trust', label: 'Trust', icon: Shield, tone: colors.ember },
  { key: 'preview', label: 'Preview', icon: ExternalLink, tone: colors.steel },
] as const

export function ListingDetailScreen() {
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const { data: page, loading, error, reload } = useListing(id)
  const signals = useListingSignals(page)

  if (loading) return <LoadingState label="Loading listing" />
  if (error) return <ErrorState message={error} onRetry={reload} />
  if (!page) return <ErrorState message="Listing not found." />

  const readiness = getReadinessScore(page)
  const ai = signals.data?.agentVisits ?? 0
  const human = signals.data?.humanVisits ?? 0
  const traffic = ai + human
  const sharePct = traffic ? Math.round((ai / traffic) * 100) : 0
  const offers = [...(page.services ?? []), ...(page.products ?? [])]

  function goTile(key: string) {
    if (key === 'preview') return void WebBrowser.openBrowserAsync(publicPageUrl(page!.slug))
    if (key === 'readiness') return router.push({ pathname: '/listing/[id]/readiness', params: { id: page!.id } })
    if (key === 'simulator') return router.push({ pathname: '/listing/[id]/simulator', params: { id: page!.id } })
    if (key === 'competitor') return router.push({ pathname: '/listing/[id]/competitor', params: { id: page!.id } })
    if (key === 'trust') return router.push({ pathname: '/listing/[id]/trust', params: { id: page!.id } })
    return router.push({ pathname: '/listing/[id]/offers', params: { id: page!.id } })
  }

  return (
    <Screen
      header={
        <StackHeader
          title={page.name}
          onBack={() => router.back()}
          right={
            <Pressable onPress={() => router.push({ pathname: '/listing/[id]/edit', params: { id: page.id } })} style={st.editBtn}>
              <Text style={st.editText}>Edit</Text>
            </Pressable>
          }
        />
      }
    >
      <View style={st.idRow}>
        <Badge tone={page.is_published ? 'success' : 'muted'}>{page.is_published ? 'Published' : 'Draft'}</Badge>
        <Text style={st.url}>nexez.app/{page.slug}</Text>
        {page.is_published ? (
          <View style={st.okChip}>
            <Text style={st.okText}>200 OK</Text>
          </View>
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Card style={st.ringCard}>
          <ReadinessRing score={readiness} size={74} />
          <Text style={st.ringLabel}>Readiness</Text>
        </Card>
        <Card style={{ flex: 1.4 }}>
          <Text style={st.eyebrow}>Agent traffic · 7d</Text>
          <Text style={st.bigNum}>{ai.toLocaleString()}</Text>
          <Text style={st.share}>{sharePct}% from AI agents</Text>
          <View style={st.shareTrack}>
            <View style={{ width: `${sharePct}%`, height: 7, backgroundColor: colors.persimmon, borderRadius: 4 }} />
          </View>
        </Card>
      </View>

      <Card>
        <Text style={st.eyebrow}>Business</Text>
        <Text style={st.desc}>{page.description || 'No description yet.'}</Text>
        <InfoRow label="Industry" value={page.industry || '—'} />
        <InfoRow label="Location" value={page.location || '—'} />
        <InfoRow label="Website" value={page.website_url || '—'} mono />
        <View style={st.chips}>
          <EndpointChip>JSON-LD</EndpointChip>
          <EndpointChip>llms.txt</EndpointChip>
          <EndpointChip>agent.json</EndpointChip>
          {page.mcp_enabled ? <EndpointChip gold>MCP</EndpointChip> : null}
        </View>
      </Card>

      <Pressable onPress={() => router.push({ pathname: '/listing/[id]/offers', params: { id: page.id } })}>
        <Card>
          <View style={st.offersHead}>
            <SectionTitle title={`Offers · ${getOfferCount(page)}`} />
            <Text style={st.manage}>Manage →</Text>
          </View>
          {offers.length ? (
            offers.slice(0, 4).map((o, i) => (
              <View key={`${o.name}-${i}`} style={[st.offerRow, i < Math.min(offers.length, 4) - 1 ? st.offerDivider : null]}>
                <Text style={st.offerName} numberOfLines={1}>
                  {o.name}
                </Text>
                <Text style={st.offerPrice}>{o.price || '—'}</Text>
              </View>
            ))
          ) : (
            <Text style={st.desc}>No offers yet. Add products or services agents can quote.</Text>
          )}
        </Card>
      </Pressable>

      <View style={st.grid}>
        {ACTION_TILES.map((tile) => {
          const Icon = tile.icon
          return (
            <Pressable key={tile.key} onPress={() => goTile(tile.key)} style={st.tile}>
              <Icon size={22} color={tile.tone} />
              <Text style={st.tileLabel}>{tile.label}</Text>
            </Pressable>
          )
        })}
      </View>
    </Screen>
  )
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={st.infoRow}>
      <Text style={st.infoLabel}>{label}</Text>
      <Text style={[st.infoValue, mono ? { fontFamily: fonts.mono, fontSize: 12 } : null]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  )
}

function EndpointChip({ children, gold }: { children: React.ReactNode; gold?: boolean }) {
  return (
    <View style={[st.endpointChip, { backgroundColor: gold ? 'rgba(233,162,59,0.16)' : 'rgba(255,106,51,0.14)' }]}>
      <Text style={{ fontFamily: fonts.mono, fontSize: 11, color: gold ? colors.goldLight : colors.persimmonText }}>{children}</Text>
    </View>
  )
}

const st = {
  editBtn: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 11, backgroundColor: colors.ringBg, borderWidth: 1, borderColor: colors.ringBorder },
  editText: { color: colors.persimmonLight, fontFamily: fonts.bodyBold, fontSize: 13 },
  idRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, flexWrap: 'wrap' as const },
  url: { color: colors.textSecondary, fontFamily: fonts.mono, fontSize: 12 },
  okChip: { backgroundColor: 'rgba(255,106,51,0.14)', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  okText: { color: colors.persimmon, fontFamily: fonts.mono, fontSize: 11 },
  ringCard: { flex: 1, alignItems: 'center' as const, gap: 8 },
  ringLabel: { color: colors.textTertiary, fontFamily: fonts.bodySemibold, fontSize: 11 },
  eyebrow: { color: colors.label, fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase' as const },
  bigNum: { color: colors.text, fontFamily: fonts.display, fontSize: 26, marginTop: 6 },
  share: { color: colors.persimmon, fontFamily: fonts.bodySemibold, fontSize: 12, marginBottom: 10 },
  shareTrack: { height: 7, backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 4, overflow: 'hidden' as const },
  desc: { color: colors.textSecondary, fontFamily: fonts.body, fontSize: 13, lineHeight: 20 },
  infoRow: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, gap: 12 },
  infoLabel: { color: colors.textTertiary, fontFamily: fonts.body, fontSize: 13 },
  infoValue: { flex: 1, textAlign: 'right' as const, color: colors.body, fontFamily: fonts.bodySemibold, fontSize: 13 },
  chips: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 6, marginTop: 6 },
  endpointChip: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 7 },
  offersHead: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const },
  manage: { color: colors.persimmon, fontFamily: fonts.bodyBold, fontSize: 12 },
  offerRow: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, paddingVertical: 9 },
  offerDivider: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
  offerName: { flex: 1, color: colors.body, fontFamily: fonts.bodySemibold, fontSize: 13 },
  offerPrice: { color: colors.text, fontFamily: fonts.display, fontSize: 14 },
  grid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 12 },
  tile: {
    width: '47%' as const,
    flexGrow: 1,
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radii.cardSm,
    padding: 15,
    gap: 9,
  },
  tileLabel: { color: colors.body, fontFamily: fonts.bodyBold, fontSize: 13 },
}
