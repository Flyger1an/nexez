import { useLocalSearchParams, useRouter } from 'expo-router'
import { Text, View } from 'react-native'
import { Badge, ErrorState, LoadingState, Screen, StackHeader } from '@/src/components/ui'
import { getOfferCount, getReadinessScore } from '@/src/lib/agent-page'
import { colors, fonts, radii, readinessColor } from '@/src/theme/colors'
import { useListings } from '@/src/hooks/useListings'

export default function CompetitorRoute() {
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const { data: pages, loading, error, reload } = useListings()

  if (loading) return <LoadingState label="Ranking readiness" />
  if (error || !pages) return <ErrorState message={error || 'Comparison unavailable.'} onRetry={reload} />

  const ranked = [...pages].sort((a, b) => getReadinessScore(b) - getReadinessScore(a))
  const youScore = getReadinessScore(pages.find((p) => p.id === id) ?? pages[0])

  return (
    <Screen header={<StackHeader title="How agents compare you" onBack={() => router.back()} />}>
      <Text style={st.intro}>Agent-readiness ranking across your surface. Agents weigh structure + transactability when they choose who to transact with.</Text>
      {ranked.map((page) => {
        const score = getReadinessScore(page)
        const you = page.id === id
        const tone = you ? 'info' : score > youScore ? 'gold' : 'success'
        const tag = you ? 'You' : score > youScore ? 'Outranks you' : 'You lead'
        return (
          <View key={page.id} style={[st.row, you ? st.rowYou : null]}>
            <View style={st.rowHead}>
              <Text style={st.name} numberOfLines={1}>
                {page.name}
              </Text>
              <Badge tone={tone}>{tag}</Badge>
            </View>
            <View style={st.barRow}>
              <View style={st.track}>
                <View style={{ height: 8, width: `${score}%`, backgroundColor: readinessColor(score), borderRadius: 4 }} />
              </View>
              <Text style={st.score}>{score}</Text>
              <Text style={st.meta}>{getOfferCount(page)} off</Text>
            </View>
          </View>
        )
      })}
    </Screen>
  )
}

const st = {
  intro: { color: colors.textSecondary, fontFamily: fonts.body, fontSize: 12, lineHeight: 18 },
  row: { backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassBorder, borderRadius: radii.cardSm, padding: 14, gap: 9 },
  rowYou: { borderColor: 'rgba(228,95,56,0.4)', backgroundColor: 'rgba(228,95,56,0.07)' },
  rowHead: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, gap: 10 },
  name: { flex: 1, color: colors.text, fontFamily: fonts.bodyBold, fontSize: 14 },
  barRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10 },
  track: { flex: 1, height: 8, backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 4, overflow: 'hidden' as const },
  score: { fontFamily: fonts.display, fontSize: 14, color: colors.body },
  meta: { fontFamily: fonts.mono, fontSize: 12, color: colors.textTertiary, width: 40, textAlign: 'right' as const },
}
