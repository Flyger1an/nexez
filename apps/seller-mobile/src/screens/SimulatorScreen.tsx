import { useLocalSearchParams, useRouter } from 'expo-router'
import { Send, ShieldCheck } from 'lucide-react-native'
import { useState } from 'react'
import { Pressable, Text, TextInput, View } from 'react-native'
import { AppButton, Card, ErrorState, LoadingState, Screen, StackHeader } from '@/src/components/ui'
import { runSimulation } from '@/src/lib/api'
import { colors, fonts, radii } from '@/src/theme/colors'
import { useListing } from '@/src/hooks/useListings'
import type { SimulationResult } from '@/src/types/nexez'

const PROMPTS = [
  'What does this business offer and what does it cost?',
  'Can an agent book or buy right now?',
  'Is this a good fit for a scaling startup?',
  'What are the terms, delivery, and refund policy?',
]

export function SimulatorScreen() {
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const { data: page, loading, error, reload } = useListing(id)
  const [query, setQuery] = useState(PROMPTS[0])
  const [result, setResult] = useState<SimulationResult | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  if (loading) return <LoadingState label="Loading simulator" />
  if (error || !page) return <ErrorState message={error || 'Listing not found.'} onRetry={reload} />
  const current = page

  async function run() {
    setBusy(true)
    setMessage('')
    try {
      setResult(await runSimulation({ slug: current.slug, query }))
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Simulation failed.')
    } finally {
      setBusy(false)
    }
  }

  const conf = result?.confidence
  const confLabel = conf != null ? `${conf >= 0.8 ? 'High' : conf >= 0.5 ? 'Medium' : 'Low'} · ${conf.toFixed(2)}` : 'Response ready'

  return (
    <Screen header={<StackHeader title="Agent simulator" onBack={() => router.back()} />}>
      <Text style={st.intro}>
        Run a buyer-style query against <Text style={st.introStrong}>{current.name}</Text> exactly as an AI agent would see it.
      </Text>

      <View style={st.chips}>
        {PROMPTS.map((p) => (
          <Pressable key={p} onPress={() => { setQuery(p); setResult(null) }} style={st.chip}>
            <Text style={st.chipText} numberOfLines={1}>
              {p.length > 38 ? `${p.slice(0, 36)}…` : p}
            </Text>
          </Pressable>
        ))}
      </View>

      <Card>
        <TextInput
          value={query}
          onChangeText={setQuery}
          multiline
          placeholder="Ask anything a buyer agent might ask…"
          placeholderTextColor={colors.textTertiary}
          style={st.textarea}
        />
      </Card>
      {message ? <Text style={st.error}>{message}</Text> : null}
      <AppButton full label={busy ? 'Running…' : 'Run simulation'} icon={Send} disabled={busy} onPress={run} />

      {result ? (
        <>
          <View style={st.confRow}>
            <ShieldCheck size={18} color={colors.persimmon} />
            <Text style={st.confText}>Confidence: {confLabel}</Text>
          </View>

          <View style={[st.block, { backgroundColor: 'rgba(233,162,59,0.08)', borderColor: 'rgba(233,162,59,0.22)' }]}>
            <Text style={[st.blockLabel, { color: colors.goldLight }]}>Agent answer</Text>
            <Text style={st.answer}>{result.naturalLanguage || 'No answer returned.'}</Text>
          </View>

          <View style={st.block}>
            <Text style={st.blockLabel}>Parsed structured data</Text>
            <Text style={st.json}>{JSON.stringify(result.schema ?? {}, null, 2).slice(0, 1800)}</Text>
          </View>

          {result.recommendations?.length ? (
            <View style={[st.block, { backgroundColor: 'rgba(255,210,122,0.07)', borderColor: 'rgba(255,210,122,0.22)' }]}>
              <Text style={[st.blockLabel, { color: colors.warning }]}>Suggested fixes</Text>
              {result.recommendations.slice(0, 5).map((r, i) => (
                <Text key={i} style={st.fix}>
                  • {r}
                </Text>
              ))}
            </View>
          ) : null}
        </>
      ) : null}
    </Screen>
  )
}

const st = {
  intro: { color: colors.textSecondary, fontFamily: fonts.body, fontSize: 13, lineHeight: 19 },
  introStrong: { color: colors.body, fontFamily: fonts.bodyBold },
  chips: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.glassBorder },
  chipText: { color: colors.textSecondary, fontFamily: fonts.body, fontSize: 12, maxWidth: 240 },
  textarea: { minHeight: 64, color: colors.text, fontFamily: fonts.body, fontSize: 15, lineHeight: 21, textAlignVertical: 'top' as const, padding: 0 },
  error: { color: colors.warning, fontFamily: fonts.body, fontSize: 13 },
  confRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, marginTop: 4 },
  confText: { color: colors.persimmon, fontFamily: fonts.bodyBold, fontSize: 12 },
  block: { backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassBorder, borderRadius: radii.cardSm, padding: 15, gap: 8 },
  blockLabel: { color: colors.label, fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase' as const },
  answer: { color: colors.body, fontFamily: fonts.body, fontSize: 14, lineHeight: 21 },
  json: { color: colors.persimmonText, fontFamily: fonts.mono, fontSize: 11.5, lineHeight: 18 },
  fix: { color: colors.textSecondary, fontFamily: fonts.body, fontSize: 13, lineHeight: 20 },
}
