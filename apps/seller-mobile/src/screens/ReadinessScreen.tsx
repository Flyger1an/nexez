import { useLocalSearchParams, useRouter } from 'expo-router'
import { Check, CheckCircle2, Circle, X } from 'lucide-react-native'
import { Pressable, Text, View } from 'react-native'
import { ErrorState, GroupCard, LoadingState, ReadinessRing, Screen, SectionTitle, StackHeader } from '@/src/components/ui'
import { getReadinessScore, getStructuredSignals, readinessLabel } from '@/src/lib/agent-page'
import { colors, fonts } from '@/src/theme/colors'
import { useListing } from '@/src/hooks/useListings'

export function ReadinessScreen() {
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const { data: page, loading, error, reload } = useListing(id)

  if (loading) return <LoadingState label="Loading readiness" />
  if (error || !page) return <ErrorState message={error || 'Listing not found.'} onRetry={reload} />

  const score = getReadinessScore(page)
  const signals = getStructuredSignals(page)

  return (
    <Screen header={<StackHeader title="Readiness score" onBack={() => router.back()} />}>
      <View style={st.hero}>
        <ReadinessRing score={score} size={120} stroke={9} showOutOf />
        <Text style={st.label}>{readinessLabel(score)}</Text>
      </View>

      <SectionTitle title="Structured signals" />
      {signals.map((sig) => (
        <View key={sig.id} style={st.signalRow}>
          {sig.met ? <CheckCircle2 size={21} color={colors.persimmon} /> : <Circle size={21} color="rgba(255,255,255,0.3)" />}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={st.signalLabel}>{sig.label}</Text>
            <Text style={st.signalUnlocks}>unlocks: {sig.unlocks}</Text>
          </View>
          {sig.met ? (
            <Text style={[st.points, { color: colors.ember }]}>+{sig.points}</Text>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={[st.points, { color: colors.textFaint }]}>{sig.points}</Text>
              <Pressable onPress={() => router.push({ pathname: '/listing/[id]/edit', params: { id } })} style={st.fix}>
                <Text style={st.fixText}>Fix</Text>
              </Pressable>
            </View>
          )}
        </View>
      ))}

      <SectionTitle title="Agent capabilities" />
      <GroupCard>
        {signals.map((sig, i) => (
          <View key={sig.id} style={[st.capRow, i < signals.length - 1 ? st.capDivider : null]}>
            {sig.met ? <Check size={18} color={colors.persimmon} /> : <X size={18} color={colors.danger} />}
            <Text style={st.capLabel}>Agents can {sig.unlocks}</Text>
          </View>
        ))}
      </GroupCard>
    </Screen>
  )
}

const st = {
  hero: { alignItems: 'center' as const, gap: 14, paddingVertical: 8 },
  label: { color: colors.body, fontFamily: fonts.bodySemibold, fontSize: 14, textAlign: 'center' as const },
  signalRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    backgroundColor: colors.group,
    borderWidth: 1,
    borderColor: colors.groupBorder,
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 15,
  },
  signalLabel: { color: colors.body, fontFamily: fonts.bodySemibold, fontSize: 14 },
  signalUnlocks: { color: colors.textTertiary, fontFamily: fonts.body, fontSize: 12, marginTop: 2 },
  points: { fontFamily: fonts.monoMedium, fontSize: 13 },
  fix: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 9, backgroundColor: 'rgba(228,95,56,0.12)', borderWidth: 1, borderColor: colors.ringBorder },
  fixText: { color: colors.emberText, fontFamily: fonts.bodyBold, fontSize: 12 },
  capRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 11, paddingVertical: 12, paddingHorizontal: 16 },
  capDivider: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
  capLabel: { flex: 1, color: colors.body, fontFamily: fonts.bodyMedium, fontSize: 13 },
}
