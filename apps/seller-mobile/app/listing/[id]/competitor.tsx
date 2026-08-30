import { useLocalSearchParams, useRouter } from 'expo-router'
import { ExternalLink } from 'lucide-react-native'
import * as WebBrowser from 'expo-web-browser'
import { Text, View } from 'react-native'
import { AppButton, Badge, Card, ErrorState, LoadingState, Screen, StackHeader } from '@/src/components/ui'
import { webPath } from '@/src/lib/api'
import { buildPortfolioReadinessComparison } from '@/src/lib/portfolio-readiness'
import { COMPETITOR_ANALYSIS_WEB_HANDOFF } from '@/src/lib/web-handoffs'
import { colors, fonts, radii, readinessColor } from '@/src/theme/colors'
import { useListings } from '@/src/hooks/useListings'

export default function CompetitorRoute() {
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const { data: pages, loading, error, reload } = useListings()

  if (loading) return <LoadingState label="Comparing portfolio readiness" />
  if (error || !pages) return <ErrorState message={error || 'Comparison unavailable.'} onRetry={reload} />

  const comparison = buildPortfolioReadinessComparison(pages, id)

  return (
    <Screen header={<StackHeader title="Portfolio readiness" onBack={() => router.back()} />}>
      <Card>
        <Text style={st.scopeTitle}>What this compares</Text>
        <Text style={st.intro}>
          This view ranks agent readiness only across listings you own. It does not use external competitor or market data.
        </Text>
        <AppButton
          full
          label="Analyze a competitor on web"
          icon={ExternalLink}
          variant="secondary"
          onPress={() => void WebBrowser.openBrowserAsync(webPath(COMPETITOR_ANALYSIS_WEB_HANDOFF))}
        />
      </Card>

      {!comparison ? (
        <Card>
          <Text style={st.scopeTitle}>Owner portfolio only</Text>
          <Text style={st.intro}>
            This listing is not in the signed-in owner portfolio. Shared-listing comparison and team management remain on the web dashboard.
          </Text>
        </Card>
      ) : comparison.rows.map((row) => {
        const tone = row.relation === 'selected'
          ? 'info'
          : row.relation === 'higher'
            ? 'gold'
            : row.relation === 'same'
              ? 'muted'
              : 'success'
        const tag = row.relation === 'selected'
          ? 'Selected'
          : row.relation === 'higher'
            ? 'Higher readiness'
            : row.relation === 'same'
              ? 'Same readiness'
              : 'Lower readiness'
        return (
          <View key={row.id} style={[st.row, row.relation === 'selected' ? st.rowSelected : null]}>
            <View style={st.rowHead}>
              <Text style={st.name} numberOfLines={1}>
                {row.name}
              </Text>
              <Badge tone={tone}>{tag}</Badge>
            </View>
            <View style={st.barRow}>
              <View style={st.track}>
                <View style={{ height: 8, width: `${row.score}%`, backgroundColor: readinessColor(row.score), borderRadius: 4 }} />
              </View>
              <Text style={st.score}>{row.score}</Text>
              <Text style={st.meta}>{row.offerCount} {row.offerCount === 1 ? 'offer' : 'offers'}</Text>
            </View>
          </View>
        )
      })}
    </Screen>
  )
}

const st = {
  scopeTitle: { color: colors.text, fontFamily: fonts.bodyBold, fontSize: 14 },
  intro: { color: colors.textSecondary, fontFamily: fonts.body, fontSize: 12, lineHeight: 18 },
  row: { backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassBorder, borderRadius: radii.cardSm, padding: 14, gap: 9 },
  rowSelected: { borderColor: 'rgba(228,95,56,0.4)', backgroundColor: 'rgba(228,95,56,0.07)' },
  rowHead: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, gap: 10 },
  name: { flex: 1, color: colors.text, fontFamily: fonts.bodyBold, fontSize: 14 },
  barRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10 },
  track: { flex: 1, height: 8, backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 4, overflow: 'hidden' as const },
  score: { fontFamily: fonts.display, fontSize: 14, color: colors.body },
  meta: { fontFamily: fonts.mono, fontSize: 10, color: colors.textTertiary, minWidth: 54, textAlign: 'right' as const },
}
