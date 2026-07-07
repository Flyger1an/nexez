// Seller intake interview — mobile client (intake spec §7). A THIN client of
// the same threads API the web /create fork uses: it renders agent turns +
// cards and posts owner turns (free text, or structured quick-answers from the
// gap chips, which work with or without a server-side LLM). No gap logic on
// device. Sessions are resumable across devices — start here on the couch,
// finish in the web builder.
import { useRouter } from 'expo-router'
import { ArrowRight, CircleCheck, Globe2, MessageCircleQuestion, Send, Sparkles } from 'lucide-react-native'
import { useEffect, useRef, useState } from 'react'
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { AppButton, Glass, LoadingState, ReadinessRing, Screen, StackHeader } from '@/src/components/ui'
import {
  commitIntakeSession,
  getIntakeSession,
  listIntakeSessions,
  sendIntakeTurn,
  startIntakeSession,
} from '@/src/lib/api'
import { colors, fonts, radii } from '@/src/theme/colors'
import type { IntakeCard, IntakeGap, IntakeGapAnswer, IntakeSessionState } from '@/src/types/intake'

type ChatMessage = {
  id: string
  role: 'owner' | 'agent'
  content: string
  cards?: IntakeCard[]
}

type SetupPhase = 'loading' | 'setup' | 'starting' | 'chat'

export function IntakeInterviewScreen() {
  const router = useRouter()
  const [phase, setPhase] = useState<SetupPhase>('loading')
  // Which start path is in flight — so only ITS button shows the loading label.
  const [startingVia, setStartingVia] = useState<'url' | 'scratch' | 'resume' | null>(null)
  const [sourceUrl, setSourceUrl] = useState('')
  const [setupError, setSetupError] = useState('')
  const [resumableId, setResumableId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const sessionIdRef = useRef<string | null>(null)
  const scrollRef = useRef<ScrollView>(null)
  const idRef = useRef(0)

  // Android + edge-to-edge (RN 0.85 default): the window neither resizes nor
  // does KeyboardAvoidingView pad, so a bottom composer vanishes under the
  // keyboard (found in the Android pass). Track the keyboard height and pad
  // the chat container manually; iOS keeps the standard KAV behavior.
  const [kbHeight, setKbHeight] = useState(0)
  useEffect(() => {
    if (Platform.OS !== 'android') return
    const show = Keyboard.addListener('keyboardDidShow', (e) => setKbHeight(e.endCoordinates?.height ?? 0))
    const hide = Keyboard.addListener('keyboardDidHide', () => setKbHeight(0))
    return () => {
      show.remove()
      hide.remove()
    }
  }, [])

  const nextId = () => `m-${++idRef.current}`

  useEffect(() => {
    listIntakeSessions()
      .then((json) => {
        setResumableId(json.sessions?.[0]?.id ?? null)
        setPhase('setup')
      })
      .catch(() => setPhase('setup'))
  }, [])

  function openingMessages(state: IntakeSessionState): ChatMessage[] {
    const extraction = state.extractions[0]
    const cards: IntakeCard[] = []
    if (extraction) {
      cards.push({
        type: 'source_ingested',
        sourceId: extraction.sourceId,
        label: state.sources.find((s) => s.id === extraction.sourceId)?.label || 'your site',
        offers: extraction.offers.length,
        confidence: extraction.confidence,
      })
    }
    if (state.gaps.length > 0) cards.push({ type: 'gap_batch', gaps: state.gaps.slice(0, 3) })
    const intro = extraction
      ? `I read what your site already says — ${extraction.offers.length} offer${extraction.offers.length === 1 ? '' : 's'} came through. I will only ask about what is missing.`
      : 'We are starting fresh. A few focused questions and your draft will be ready to review — answer, skip, or bail to the editor any time.'
    return [{ id: nextId(), role: 'agent', content: intro, cards }]
  }

  function transcriptMessages(state: IntakeSessionState): ChatMessage[] {
    const replay: ChatMessage[] = state.messages.map((m) => ({ id: m.id, role: m.role, content: m.content }))
    if (state.gaps.length > 0) {
      replay.push({
        id: nextId(),
        role: 'agent',
        content: 'Picking up where we left off:',
        cards: [{ type: 'gap_batch', gaps: state.gaps.slice(0, 3) }],
      })
    }
    return replay.length ? replay : openingMessages(state)
  }

  async function start(body: { source_url?: string }) {
    setPhase('starting')
    setStartingVia(body.source_url ? 'url' : 'scratch')
    setSetupError('')
    try {
      const json = await startIntakeSession(body)
      sessionIdRef.current = json.id
      setMessages(openingMessages(json.state))
      setPhase('chat')
    } catch (error) {
      setSetupError(error instanceof Error ? error.message : 'Could not start the interview.')
      setPhase('setup')
    } finally {
      setStartingVia(null)
    }
  }

  async function resume(id: string) {
    setPhase('starting')
    setStartingVia('resume')
    setSetupError('')
    try {
      const json = await getIntakeSession(id)
      sessionIdRef.current = json.id
      setMessages(transcriptMessages(json.state))
      setPhase('chat')
    } catch (error) {
      setSetupError(error instanceof Error ? error.message : 'Could not resume the interview.')
      setPhase('setup')
    } finally {
      setStartingVia(null)
    }
  }

  async function runTurn(payload: { content?: string; answers?: IntakeGapAnswer[] }, ownerEcho?: string) {
    if (busy || !sessionIdRef.current) return
    setBusy(true)
    if (ownerEcho) setMessages((current) => [...current, { id: nextId(), role: 'owner', content: ownerEcho }])
    try {
      const json = await sendIntakeTurn(sessionIdRef.current, payload)
      setMessages((current) => [...current, { id: nextId(), role: 'agent', content: json.message, cards: json.cards }])
    } catch (error) {
      setMessages((current) => [
        ...current,
        { id: nextId(), role: 'agent', content: error instanceof Error ? error.message : 'The interview hit a snag — try again.' },
      ])
    } finally {
      setBusy(false)
    }
  }

  async function commit() {
    if (busy || !sessionIdRef.current) return
    setBusy(true)
    try {
      const json = await commitIntakeSession(sessionIdRef.current)
      // The mobile handoff lands on the app's own listing editor.
      router.replace(`/listing/${json.pageId}`)
    } catch (error) {
      setMessages((current) => [
        ...current,
        { id: nextId(), role: 'agent', content: error instanceof Error ? error.message : 'Could not open your draft.' },
      ])
      setBusy(false)
    }
  }

  function send() {
    const text = input.trim()
    if (!text) return
    setInput('')
    void runTurn({ content: text }, text)
  }

  if (phase === 'loading') return <LoadingState label="Opening the interview" />

  if (phase !== 'chat') {
    return (
      <Screen header={<StackHeader title="Talk it through" onBack={() => router.back()} />}>
        <View style={st.setupHead}>
          <View style={st.setupIcon}>
            <Sparkles size={22} color={colors.ember} />
          </View>
          <Text style={st.setupTitle}>Interview, not paperwork</Text>
          <Text style={st.setupSub}>
            Nexez reads what already exists — your site, your listings — and only asks about the gaps. Your answers
            become a draft you review before anything publishes.
          </Text>
        </View>

        {resumableId ? (
          <Pressable onPress={() => resume(resumableId)} disabled={phase === 'starting'} style={({ pressed }) => [st.resumeRow, pressed ? st.pressed : null]}>
            <Text style={st.resumeText}>Resume your interview in progress</Text>
            <ArrowRight size={16} color={colors.success} />
          </Pressable>
        ) : null}

        <Glass tone="group" radius={16} contentStyle={st.urlCard}>
          <TextInput
            value={sourceUrl}
            onChangeText={setSourceUrl}
            autoCapitalize="none"
            keyboardType="url"
            placeholder="https://yourbusiness.com"
            placeholderTextColor={colors.textTertiary}
            style={st.urlInput}
          />
          <AppButton
            full
            icon={Globe2}
            label={startingVia === 'url' ? 'Reading your site…' : 'Start with my site'}
            disabled={phase === 'starting' || !sourceUrl.trim()}
            onPress={() => start({ source_url: sourceUrl.trim() })}
          />
        </Glass>
        <AppButton full variant="secondary" label="Start from scratch" disabled={phase === 'starting'} onPress={() => start({})} />
        {setupError ? <Text style={st.error}>{setupError}</Text> : null}
      </Screen>
    )
  }

  return (
    <Screen scroll={false} header={<StackHeader title="Nexez intake" onBack={() => router.back()} />}>
      <KeyboardAvoidingView
        style={{ flex: 1, paddingBottom: Platform.OS === 'android' ? kbHeight : 0 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={st.thread}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
          showsVerticalScrollIndicator={false}
        >
          {messages.map((message) => (
            <View key={message.id} style={message.role === 'owner' ? st.ownerRow : st.agentRow}>
              <View style={message.role === 'owner' ? st.ownerBubble : st.agentBubble}>
                {message.role === 'agent' ? (
                  <View style={st.agentChip}>
                    <MessageCircleQuestion size={13} color={colors.ember} />
                    <Text style={st.agentChipText}>Nexez intake</Text>
                  </View>
                ) : null}
                <Text style={message.role === 'owner' ? st.ownerText : st.agentText}>{message.content}</Text>
              </View>
              {message.cards?.map((card, index) => (
                <IntakeCardView
                  key={`${message.id}-card-${index}`}
                  card={card}
                  busy={busy}
                  onAnswer={(answer, echo) => void runTurn({ answers: [answer] }, echo)}
                  onCommit={() => void commit()}
                />
              ))}
            </View>
          ))}
          {busy ? <Text style={st.thinking}>Thinking…</Text> : null}
        </ScrollView>

        <View style={st.composer}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder='Answer, ask, or say "skip"…'
            placeholderTextColor={colors.textTertiary}
            style={st.composerInput}
            multiline
            editable={!busy}
          />
          <Pressable onPress={send} disabled={busy || !input.trim()} accessibilityLabel="Send" style={({ pressed }) => [st.sendBtn, busy || !input.trim() ? st.disabled : pressed ? st.pressed : null]}>
            <Send size={18} color={colors.onBrand} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  )
}

// ---------------------------------------------------------------------------
// Cards — presentation only; every tap posts a structured answer or commits.

function IntakeCardView({
  card,
  busy,
  onAnswer,
  onCommit,
}: {
  card: IntakeCard
  busy: boolean
  onAnswer: (answer: IntakeGapAnswer, echo: string) => void
  onCommit: () => void
}) {
  if (card.type === 'source_ingested') {
    return (
      <Glass style={st.cardStretch} tone="group" radius={16} contentStyle={st.sourceCard}>
        <View style={st.sourceIcon}>
          <Globe2 size={18} color={colors.success} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={st.cardTitle} numberOfLines={1}>Read {card.label}</Text>
          <Text style={st.cardSub}>
            {card.offers} offer{card.offers === 1 ? '' : 's'} imported
            {typeof card.confidence === 'number' ? ` · ${Math.round(card.confidence * 100)}% confidence` : ''}
          </Text>
        </View>
      </Glass>
    )
  }

  if (card.type === 'gap_batch') {
    return (
      <Glass style={st.cardStretch} tone="group" radius={16} contentStyle={st.gapCard}>
        {card.gaps.map((gap) => (
          <GapRow key={gap.id} gap={gap} busy={busy} onAnswer={onAnswer} />
        ))}
      </Glass>
    )
  }

  if (card.type === 'draft_summary') {
    const offers = card.draft.services.length + card.draft.products.length
    return (
      <Glass style={st.cardStretch} tone="group" radius={16} contentStyle={st.summaryCard}>
        <ReadinessRing score={card.readiness} size={62} stroke={6} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={st.cardTitle} numberOfLines={1}>{card.draft.name || 'Your draft'}</Text>
          <Text style={st.cardSub}>
            {offers} offer{offers === 1 ? '' : 's'} · {card.draft.faqs.length} FAQ{card.draft.faqs.length === 1 ? '' : 's'}
            {card.draft.industry ? ` · ${card.draft.industry}` : ''}
          </Text>
          {card.handoffEligible ? (
            <Pressable onPress={onCommit} disabled={busy} style={({ pressed }) => [st.commitBtn, busy ? st.disabled : pressed ? st.pressed : null]}>
              <Text style={st.commitText}>Review in the editor</Text>
              <ArrowRight size={14} color={colors.emberText} />
            </Pressable>
          ) : null}
        </View>
      </Glass>
    )
  }

  // handoff
  return (
    <Glass style={st.cardStretch} tone="group" radius={16} contentStyle={st.summaryCard}>
      <View style={st.sourceIcon}>
        <CircleCheck size={18} color={colors.success} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={st.cardTitle}>Your draft is ready</Text>
        <Text style={st.cardSub}>Review everything in the editor — publishing stays in your hands.</Text>
        <Pressable onPress={onCommit} disabled={busy} style={({ pressed }) => [st.commitBtn, busy ? st.disabled : pressed ? st.pressed : null]}>
          <Text style={st.commitText}>Open the editor</Text>
          <ArrowRight size={14} color={colors.emberText} />
        </Pressable>
      </View>
    </Glass>
  )
}

function GapRow({ gap, busy, onAnswer }: { gap: IntakeGap; busy: boolean; onAnswer: (answer: IntakeGapAnswer, echo: string) => void }) {
  const chips: Array<{ label: string; answer: IntakeGapAnswer }> = []
  if (gap.field === 'offerType' && gap.offerKey) {
    chips.push(
      { label: 'Fixed price', answer: { gapId: gap.id, answer: 'Fixed price', fields: [{ target: 'offer', offerKey: gap.offerKey, field: 'offerType', value: 'fixed' }] } },
      { label: 'Open to offers', answer: { gapId: gap.id, answer: 'Open to offers', fields: [{ target: 'offer', offerKey: gap.offerKey, field: 'offerType', value: 'negotiable' }] } },
    )
  }
  chips.push({ label: 'Skip', answer: { gapId: gap.id, answer: 'skip', skipped: true } })

  return (
    <View style={st.gapRow}>
      <View style={st.gapHead}>
        <View style={[st.gapDot, { backgroundColor: gap.kind === 'blocking' ? colors.warning : colors.textFaint }]} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={st.gapQuestion}>{gap.question}</Text>
          <Text style={st.gapWhy}>{gap.why}</Text>
        </View>
      </View>
      <View style={st.chipRow}>
        {chips.map((chip) => (
          <Pressable
            key={chip.label}
            onPress={() => onAnswer(chip.answer, `${chip.label}${chip.label === 'Skip' ? ` — ${gap.question}` : ''}`)}
            disabled={busy}
            style={({ pressed }) => [st.chip, busy ? st.disabled : pressed ? st.pressed : null]}
          >
            <Text style={st.chipText}>{chip.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  )
}

const st = StyleSheet.create({
  cardStretch: { alignSelf: 'stretch' },
  // setup
  setupHead: { gap: 8, paddingTop: 8 },
  setupIcon: { width: 44, height: 44, borderRadius: 13, backgroundColor: colors.ringBg, borderWidth: 1, borderColor: colors.ringBorder, alignItems: 'center', justifyContent: 'center' },
  setupTitle: { color: colors.text, fontFamily: fonts.display, fontSize: 24, letterSpacing: -0.3, marginTop: 6 },
  setupSub: { color: colors.textSecondary, fontFamily: fonts.body, fontSize: 13, lineHeight: 19 },
  resumeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(111,214,160,0.09)', borderWidth: 1, borderColor: 'rgba(111,214,160,0.3)', borderRadius: radii.cardSm, paddingHorizontal: 14, paddingVertical: 13 },
  resumeText: { color: colors.body, fontFamily: fonts.bodySemibold, fontSize: 13 },
  urlCard: { padding: 12, gap: 10 },
  urlInput: { color: colors.text, fontFamily: fonts.body, fontSize: 14, paddingHorizontal: 6, paddingVertical: 8 },
  error: { color: colors.danger, fontFamily: fonts.body, fontSize: 12 },

  // thread
  thread: { gap: 12, paddingBottom: 16, paddingTop: 4 },
  ownerRow: { alignItems: 'flex-end', gap: 8 },
  agentRow: { alignItems: 'flex-start', gap: 8, alignSelf: 'stretch' },
  ownerBubble: { maxWidth: '86%', backgroundColor: colors.raised, borderWidth: 1, borderColor: colors.raisedBorder, borderRadius: 18, borderBottomRightRadius: 6, paddingHorizontal: 14, paddingVertical: 10 },
  agentBubble: { maxWidth: '92%', backgroundColor: colors.group, borderWidth: 1, borderColor: colors.groupBorder, borderRadius: 18, borderBottomLeftRadius: 6, paddingHorizontal: 14, paddingVertical: 10 },
  agentChip: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 },
  agentChipText: { color: colors.emberTint, fontFamily: fonts.bodyBold, fontSize: 11 },
  ownerText: { color: colors.text, fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  agentText: { color: colors.body, fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  thinking: { color: colors.textTertiary, fontFamily: fonts.body, fontSize: 12, paddingLeft: 4 },

  // composer
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingTop: 10, paddingBottom: 8 },
  composerInput: { flex: 1, minHeight: 44, maxHeight: 110, color: colors.text, fontFamily: fonts.body, fontSize: 14, backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.inputBorder, borderRadius: radii.input, paddingHorizontal: 13, paddingVertical: 11 },
  sendBtn: { width: 44, height: 44, borderRadius: radii.input, backgroundColor: colors.ember, alignItems: 'center', justifyContent: 'center' },

  // cards
  sourceCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13 },
  sourceIcon: { width: 36, height: 36, borderRadius: 11, backgroundColor: 'rgba(111,214,160,0.12)', alignItems: 'center', justifyContent: 'center' },
  cardTitle: { color: colors.text, fontFamily: fonts.bodyBold, fontSize: 14 },
  cardSub: { color: colors.textSecondary, fontFamily: fonts.body, fontSize: 12, lineHeight: 17, marginTop: 2 },
  gapCard: { padding: 13, gap: 14 },
  gapRow: { gap: 8 },
  gapHead: { flexDirection: 'row', gap: 9 },
  gapDot: { width: 6, height: 6, borderRadius: 3, marginTop: 6 },
  gapQuestion: { color: colors.text, fontFamily: fonts.bodySemibold, fontSize: 13.5, lineHeight: 19 },
  gapWhy: { color: colors.textTertiary, fontFamily: fonts.body, fontSize: 11.5, lineHeight: 16, marginTop: 2 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, paddingLeft: 15 },
  chip: { borderWidth: 1, borderColor: colors.neutralBorder, backgroundColor: colors.neutralBg, borderRadius: radii.pill, paddingHorizontal: 12, paddingVertical: 7 },
  chipText: { color: colors.body, fontFamily: fonts.bodyMedium, fontSize: 12 },
  summaryCard: { flexDirection: 'row', alignItems: 'center', gap: 13, padding: 13 },
  commitBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 9, backgroundColor: colors.ringBg, borderWidth: 1, borderColor: colors.ringBorder, borderRadius: radii.pillSm, paddingHorizontal: 12, paddingVertical: 8 },
  commitText: { color: colors.emberText, fontFamily: fonts.bodyBold, fontSize: 12 },

  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.45 },
})
