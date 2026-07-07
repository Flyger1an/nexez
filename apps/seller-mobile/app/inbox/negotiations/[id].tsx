import { useLocalSearchParams, useRouter } from 'expo-router'
import { Check, ExternalLink, Gavel, RefreshCcw, Reply, X } from 'lucide-react-native'
import * as WebBrowser from 'expo-web-browser'
import { useState } from 'react'
import { Alert, Pressable, Text, TextInput, View } from 'react-native'
import { AppButton, Badge, Card, ErrorState, LoadingState, Screen, StackHeader } from '@/src/components/ui'
import { useToast } from '@/src/components/Toast'
import { useInbox } from '@/src/hooks/useInbox'
import { useListings } from '@/src/hooks/useListings'
import { useAsyncData } from '@/src/hooks/useAsyncData'
import { getNegotiationMessages } from '@/src/lib/data'
import { escrowAction, transitionNegotiation, type DealActionResult } from '@/src/lib/api'
import { formatCurrency, formatDateTime } from '@/src/lib/format'
import { webPath } from '@/src/lib/api'
import { colors, fonts, radii } from '@/src/theme/colors'

export default function NegotiationDetailRoute() {
  const router = useRouter()
  const toast = useToast()
  const { id } = useLocalSearchParams<{ id: string }>()
  const { data, loading, error, reload } = useInbox()
  const thread = useAsyncData(() => getNegotiationMessages(id), [id])
  const listings = useListings()
  const [mode, setMode] = useState<null | 'counter' | 'refund'>(null)
  const [amountText, setAmountText] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  if (loading) return <LoadingState label="Loading negotiation" />
  if (error || !data) return <ErrorState message={error || 'Negotiation unavailable.'} onRetry={reload} />
  const item = data.negotiations.find((row) => row.id === id)
  if (!item) return <ErrorState message="Negotiation not found." />

  const negotiationId = item.id
  const status = item.status
  const awaitingApproval = item.settlement_state === 'awaiting_approval'
  const terminal = ['declined', 'expired', 'refunded', 'disputed'].includes(status)

  // Resolve "your floor" from the matching offer's rules (set via Auto-rules).
  const page = listings.data?.find((p) => p.id === item.page_id)
  const offers = page ? [...(page.services ?? []), ...(page.products ?? [])] : []
  const floor = (offers.find((o) => o.name === item.offer_name && o.rules?.minPrice) || offers.find((o) => o.rules?.minPrice))?.rules?.minPrice

  async function run(fn: () => Promise<DealActionResult>) {
    setBusy(true)
    setMsg('')
    try {
      const r = await fn()
      if (r?.error) setMsg(r.error)
      else {
        setMode(null)
        setAmountText('')
        setNote('')
        toast('Negotiation updated', 'success')
        await reload()
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Action failed.')
    } finally {
      setBusy(false)
    }
  }

  function confirmThen(title: string, message: string, fn: () => Promise<DealActionResult>) {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Confirm', style: 'destructive', onPress: () => void run(fn) },
    ])
  }

  const amountNum = Number(amountText)
  const amountValid = amountText.trim() === '' || (Number.isFinite(amountNum) && amountNum > 0)

  return (
    <Screen header={<StackHeader title={item.offer_name || 'Negotiation'} onBack={() => router.back()} />}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Badge tone={status === 'complete' ? 'success' : terminal ? 'muted' : status === 'negotiation' ? 'warn' : 'info'}>{status.replace(/_/g, ' ')}</Badge>
        <Text style={{ fontFamily: fonts.mono, fontSize: 12, color: colors.textTertiary }}>
          /{item.slug} · {formatDateTime(item.created_at)}
        </Text>
      </View>

      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <View>
            <Text style={st.tinyLabel}>Their offer</Text>
            <Text style={{ color: colors.ember, fontFamily: fonts.display, fontSize: 28 }}>{formatCurrency(item.amount_cents, item.currency)}</Text>
          </View>
          {floor ? (
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={st.tinyLabel}>Your floor</Text>
              <Text style={{ color: colors.body, fontFamily: fonts.display, fontSize: 18 }}>{String(floor).startsWith('$') ? floor : `$${floor}`}</Text>
            </View>
          ) : null}
        </View>
        <Text style={{ color: colors.body, fontFamily: fonts.body, lineHeight: 20 }}>{item.buyer_query || item.buyer_agent || 'No buyer query provided.'}</Text>
        {item.refunded_cents ? <Text style={{ color: colors.warning, fontFamily: fonts.bodySemibold, fontSize: 13 }}>{formatCurrency(item.refunded_cents, item.currency)} refunded</Text> : null}
      </Card>

      {!terminal && item.page_id ? (
        <Pressable onPress={() => router.push({ pathname: '/listing/[id]/autorules', params: { id: item.page_id as string } })} style={st.autoBanner}>
          <Gavel size={18} color={colors.steelLight} />
          <Text style={st.autoText}>Let Nexez auto-counter offers</Text>
          <Text style={st.autoEdit}>Edit rules →</Text>
        </Pressable>
      ) : null}

      {thread.data && thread.data.length ? (
        <Card>
          <Text style={st.threadLabel}>Conversation</Text>
          {thread.data.map((m) => {
            const mine = m.role === 'seller_owner'
            const who = m.role === 'buyer' ? 'Buyer agent' : m.role === 'seller_llm' ? 'Nexez' : 'You'
            return (
              <View key={m.id} style={[st.bubbleRow, { alignItems: mine ? 'flex-end' : 'flex-start' }]}>
                <View style={[st.bubble, mine ? st.bubbleMine : st.bubbleTheirs]}>
                  <Text style={st.bubbleWho}>{who}</Text>
                  <Text style={st.bubbleText}>{msgText(m.content)}</Text>
                  <Text style={st.bubbleTime}>{formatDateTime(m.created_at)}</Text>
                </View>
              </View>
            )
          })}
        </Card>
      ) : null}

      {msg ? <Text style={st.msg}>{msg}</Text> : null}

      {/* Status-aware in-app actions (each money/state change is server-guarded + confirmed). */}
      {terminal ? (
        <Card>
          <Text style={st.terminal}>This deal is {status}. No further action is available.</Text>
        </Card>
      ) : (
        <Card>
          {status === 'negotiation' || status === 'agreement_proposed' ? (
            <>
              {awaitingApproval ? (
                <AppButton full label="Approve agreement" icon={Check} disabled={busy} onPress={() => confirmThen('Approve agreement?', 'Unlocks the buyer’s payment link so they can fund the deal.', () => escrowAction({ negotiationId, action: 'approve' }))} />
              ) : (
                <AppButton full label="Accept & propose" icon={Check} disabled={busy} onPress={() => confirmThen('Accept and propose agreement?', 'Moves the deal to agreement so the buyer can pay.', () => transitionNegotiation({ negotiationId, ownerMessage: { action: 'accept', reasoning: 'Accepted from mobile' } }))} />
              )}
              {mode === 'counter' ? (
                <View style={st.form}>
                  <Text style={st.formLabel}>Counter amount ({(item.currency || 'usd').toUpperCase()})</Text>
                  <TextInput value={amountText} onChangeText={setAmountText} keyboardType="decimal-pad" placeholder="e.g. 2500" placeholderTextColor={colors.textTertiary} style={st.input} />
                  <TextInput value={note} onChangeText={setNote} placeholder="Note to buyer (optional)" placeholderTextColor={colors.textTertiary} style={[st.input, { minHeight: 64, textAlignVertical: 'top' }]} multiline />
                  <AppButton
                    full
                    label={busy ? 'Sending…' : 'Send counter'}
                    icon={Reply}
                    variant="secondary"
                    disabled={busy || !amountText.trim() || !amountValid}
                    onPress={() =>
                      void run(() =>
                        transitionNegotiation({
                          negotiationId,
                          amountCents: Math.round(amountNum * 100),
                          ownerMessage: { action: 'counter', reasoning: note.trim() || 'Counter-offer from mobile', proposed_price: Math.round(amountNum * 100) },
                        }),
                      )
                    }
                  />
                </View>
              ) : (
                <AppButton full label="Counter" icon={Reply} variant="secondary" disabled={busy} onPress={() => { setMode('counter'); setMsg('') }} />
              )}
              <AppButton full label="Decline" icon={X} variant="danger" disabled={busy} onPress={() => confirmThen('Decline this proposal?', 'This declines the deal and cannot be undone.', () => transitionNegotiation({ negotiationId, ownerMessage: { action: 'reject', reasoning: 'Declined from mobile' } }))} />
            </>
          ) : null}

          {status === 'held' ? (
            <>
              <AppButton full label="Capture funds" icon={Check} disabled={busy} onPress={() => confirmThen('Capture held funds?', 'Charges the buyer’s held authorization and completes the deal.', () => escrowAction({ negotiationId, action: 'capture' }))} />
              <AppButton full label="Cancel & release hold" icon={X} variant="danger" disabled={busy} onPress={() => confirmThen('Release the hold?', 'Declines the deal and releases the buyer’s authorization.', () => escrowAction({ negotiationId, action: 'cancel' }))} />
            </>
          ) : null}

          {status === 'complete' ? (
            mode === 'refund' ? (
              <View style={st.form}>
                <Text style={st.formLabel}>Refund amount ({(item.currency || 'usd').toUpperCase()}) - blank = full remainder</Text>
                <TextInput value={amountText} onChangeText={setAmountText} keyboardType="decimal-pad" placeholder="Full remainder" placeholderTextColor={colors.textTertiary} style={st.input} />
                <AppButton
                  full
                  label={busy ? 'Refunding…' : 'Issue refund'}
                  icon={RefreshCcw}
                  variant="danger"
                  disabled={busy || !amountValid}
                  onPress={() =>
                    confirmThen('Issue refund?', amountText.trim() ? `Refund ${amountText} to the buyer (commission returned too).` : 'Refund the full remaining amount to the buyer.', () =>
                      escrowAction({ negotiationId, action: 'refund', amount: amountText.trim() ? amountNum : undefined }),
                    )
                  }
                />
              </View>
            ) : (
              <AppButton full label="Refund payment" icon={RefreshCcw} variant="secondary" disabled={busy} onPress={() => { setMode('refund'); setMsg('') }} />
            )
          ) : null}
        </Card>
      )}

      <AppButton label="View full timeline on web" icon={ExternalLink} variant="ghost" onPress={() => void WebBrowser.openBrowserAsync(webPath(`/dashboard/negotiations/${item.id}`))} />
    </Screen>
  )
}

function msgText(content: Record<string, unknown> | null): string {
  if (!content) return 'Message'
  const c = content as Record<string, unknown>
  const pick = (k: string) => (typeof c[k] === 'string' ? (c[k] as string) : '')
  return pick('message') || pick('reasoning') || pick('query') || pick('text') || (c.proposed_price != null ? `Proposed ${String(c.proposed_price)}` : '') || 'Message'
}

const st = {
  autoBanner: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, backgroundColor: 'rgba(124,147,196,0.08)', borderWidth: 1, borderColor: 'rgba(124,147,196,0.22)', borderRadius: 13, paddingHorizontal: 13, paddingVertical: 11 },
  autoText: { flex: 1, color: colors.body, fontFamily: fonts.bodySemibold, fontSize: 12 },
  autoEdit: { color: colors.steelLight, fontFamily: fonts.bodyBold, fontSize: 12 },
  tinyLabel: { color: colors.textTertiary, fontFamily: fonts.bodyBold, fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase' as const, marginBottom: 4 },
  threadLabel: { color: colors.label, fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase' as const, marginBottom: 4 },
  bubbleRow: { width: '100%' as const, marginTop: 4 },
  bubble: { maxWidth: '88%' as const, borderRadius: 14, paddingHorizontal: 13, paddingVertical: 10 },
  bubbleMine: { backgroundColor: 'rgba(228,95,56,0.12)', borderWidth: 1, borderColor: 'rgba(228,95,56,0.3)' },
  bubbleTheirs: { backgroundColor: colors.raised, borderWidth: 1, borderColor: colors.glassBorder },
  bubbleWho: { color: colors.textTertiary, fontFamily: fonts.bodyBold, fontSize: 10, letterSpacing: 0.4, textTransform: 'uppercase' as const, marginBottom: 4 },
  bubbleText: { color: colors.body, fontFamily: fonts.body, fontSize: 13, lineHeight: 19 },
  bubbleTime: { color: colors.textFaint, fontFamily: fonts.mono, fontSize: 10, marginTop: 5 },
  msg: { color: colors.warning, fontFamily: fonts.body, fontSize: 13 },
  terminal: { color: colors.textSecondary, fontFamily: fonts.body, fontSize: 13, lineHeight: 19 },
  form: { gap: 10 },
  formLabel: { color: colors.textSecondary, fontFamily: fonts.bodySemibold, fontSize: 12 },
  input: { minHeight: 46, borderRadius: radii.input, borderWidth: 1, borderColor: colors.inputBorder, backgroundColor: colors.inputBg, color: colors.text, paddingHorizontal: 14, fontFamily: fonts.body, fontSize: 15 },
}
