import { useLocalSearchParams, useRouter } from 'expo-router'
import { ExternalLink, RefreshCcw } from 'lucide-react-native'
import * as WebBrowser from 'expo-web-browser'
import { useState } from 'react'
import { Alert, Text, TextInput, View } from 'react-native'
import { AppButton, Badge, Card, ErrorState, LoadingState, Screen, StackHeader } from '@/src/components/ui'
import { useInbox } from '@/src/hooks/useInbox'
import { useToast } from '@/src/components/Toast'
import { refundOrder, type DealActionResult } from '@/src/lib/api'
import { resolveOrderRequest } from '@/src/lib/data'
import { formatCurrency, formatDateTime } from '@/src/lib/format'
import { webPath } from '@/src/lib/api'
import { colors, fonts, radii } from '@/src/theme/colors'

export default function OrderDetailRoute() {
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const { data, loading, error, reload } = useInbox()
  const toast = useToast()
  const [showForm, setShowForm] = useState(false)
  const [amountText, setAmountText] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  if (loading) return <LoadingState label="Loading order" />
  if (error || !data) return <ErrorState message={error || 'Order unavailable.'} onRetry={reload} />
  const item = data.orders.find((row) => row.id === id)
  if (!item) return <ErrorState message="Order not found." />

  const amountNum = Number(amountText)
  const amountValid = amountText.trim() === '' || (Number.isFinite(amountNum) && amountNum > 0)
  const refundable = item.status === 'paid'
  // A pending buyer-initiated refund request for this order (from the buyer order portal).
  const refundReq = data.requests.find(
    (r) => r.order_kind === 'checkout' && r.order_id === item.id && r.kind === 'refund_request' && (r.status === 'open' || r.status === 'acknowledged'),
  )

  async function approveRefund() {
    setBusy(true)
    setMsg('')
    try {
      const r: DealActionResult = await refundOrder({ orderId: item!.id })
      if (r?.error) { setMsg(r.error); return }
      if (refundReq) await resolveOrderRequest(refundReq.id, 'resolved').catch(() => {})
      toast('Refund approved', 'success')
      await reload()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Refund failed.')
    } finally {
      setBusy(false)
    }
  }

  async function denyRefund() {
    if (!refundReq) return
    setBusy(true)
    setMsg('')
    try {
      await resolveOrderRequest(refundReq.id, 'declined')
      toast('Refund request denied')
      await reload()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not update the request.')
    } finally {
      setBusy(false)
    }
  }

  async function run() {
    setBusy(true)
    setMsg('')
    try {
      const r: DealActionResult = await refundOrder({ orderId: item!.id, amount: amountText.trim() ? amountNum : undefined })
      if (r?.error) setMsg(r.error)
      else {
        setShowForm(false)
        setAmountText('')
        toast('Refund issued', 'success')
        await reload()
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Refund failed.')
    } finally {
      setBusy(false)
    }
  }

  function confirmRefund() {
    Alert.alert(
      'Issue refund?',
      amountText.trim() ? `Refund ${amountText} to the buyer (Nexez commission returned too).` : 'Refund the full remaining amount to the buyer.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Refund', style: 'destructive', onPress: () => void run() },
      ],
    )
  }

  return (
    <Screen header={<StackHeader title={item.offer_name || item.slug || 'Order'} onBack={() => router.back()} />}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Badge tone={item.status === 'paid' ? 'success' : item.status === 'disputed' ? 'danger' : item.status === 'refunded' ? 'muted' : 'warn'}>{item.status.replace(/_/g, ' ')}</Badge>
        <Text style={{ fontFamily: fonts.mono, fontSize: 12, color: colors.textTertiary }}>
          #{item.id.slice(-6).toUpperCase()} · {formatDateTime(item.created_at)}
        </Text>
      </View>

      <Card>
        <Text style={{ color: colors.text, fontFamily: fonts.display, fontSize: 24 }}>{formatCurrency(item.amount_cents, item.currency)}</Text>
        <Text style={{ color: colors.body, fontFamily: fonts.body }}>{item.buyer_name || item.buyer_email || 'Buyer identity unavailable'}</Text>
        {item.refunded_cents ? <Text style={{ color: colors.warning, fontFamily: fonts.bodySemibold, fontSize: 13 }}>{formatCurrency(item.refunded_cents, item.currency)} refunded</Text> : null}
      </Card>

      <Card>
        <Text style={st.tlLabel}>Payment timeline</Text>
        {[
          { label: 'Order placed', done: true },
          { label: 'Payment received', done: ['paid', 'refunded', 'disputed'].includes(item.status) || (item.refunded_cents || 0) > 0 },
          ...(item.status === 'refunded' || (item.refunded_cents || 0) > 0 ? [{ label: 'Refunded', done: true }] : item.status === 'disputed' ? [{ label: 'Disputed', done: true }] : []),
        ].map((t, i, arr) => (
          <View key={i} style={st.tlRow}>
            <View style={st.tlRail}>
              <View style={[st.tlDot, { backgroundColor: t.done ? colors.ember : 'rgba(255,255,255,0.2)' }]} />
              {i < arr.length - 1 ? <View style={st.tlLine} /> : null}
            </View>
            <Text style={st.tlText}>{t.label}</Text>
          </View>
        ))}
      </Card>

      {msg ? <Text style={st.msg}>{msg}</Text> : null}

      {refundReq ? (
        <Card>
          <Text style={st.reqLabel}>Buyer requested a refund</Text>
          {refundReq.message ? <Text style={st.reqMsg}>{refundReq.message}</Text> : null}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <AppButton
                full
                label="Approve refund"
                icon={RefreshCcw}
                variant="danger"
                disabled={busy}
                onPress={() => Alert.alert('Approve refund?', 'Refund the full amount to the buyer and resolve the request.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Approve', style: 'destructive', onPress: () => void approveRefund() }])}
              />
            </View>
            <AppButton label="Deny" variant="secondary" disabled={busy} onPress={() => void denyRefund()} />
          </View>
        </Card>
      ) : refundable ? (
        <Card>
          {showForm ? (
            <View style={{ gap: 10 }}>
              <Text style={st.formLabel}>Refund amount ({(item.currency || 'usd').toUpperCase()}) — blank = full remainder</Text>
              <TextInput value={amountText} onChangeText={setAmountText} keyboardType="decimal-pad" placeholder="Full remainder" placeholderTextColor={colors.textTertiary} style={st.input} />
              <AppButton full label={busy ? 'Refunding…' : 'Issue refund'} icon={RefreshCcw} variant="danger" disabled={busy || !amountValid} onPress={confirmRefund} />
            </View>
          ) : (
            <AppButton full label="Refund order" icon={RefreshCcw} variant="secondary" disabled={busy} onPress={() => { setShowForm(true); setMsg('') }} />
          )}
        </Card>
      ) : (
        <Card>
          <Text style={st.terminal}>Only a paid order can be refunded in app. Open Finance on web for full payment history.</Text>
        </Card>
      )}

      <AppButton label="Open Finance on web" icon={ExternalLink} variant="ghost" onPress={() => void WebBrowser.openBrowserAsync(webPath('/dashboard/finance'))} />
    </Screen>
  )
}

const st = {
  msg: { color: colors.warning, fontFamily: fonts.body, fontSize: 13 },
  reqLabel: { color: colors.danger, fontFamily: fonts.bodyBold, fontSize: 13 },
  reqMsg: { color: colors.body, fontFamily: fonts.body, fontSize: 13, lineHeight: 19 },
  terminal: { color: colors.textSecondary, fontFamily: fonts.body, fontSize: 13, lineHeight: 19 },
  tlLabel: { color: colors.label, fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase' as const, marginBottom: 4 },
  tlRow: { flexDirection: 'row' as const, gap: 12 },
  tlRail: { alignItems: 'center' as const },
  tlDot: { width: 12, height: 12, borderRadius: 6, marginTop: 2 },
  tlLine: { flex: 1, width: 2, backgroundColor: 'rgba(255,255,255,0.1)', marginVertical: 2 },
  tlText: { flex: 1, color: colors.body, fontFamily: fonts.bodySemibold, fontSize: 13, paddingBottom: 14 },
  formLabel: { color: colors.textSecondary, fontFamily: fonts.bodySemibold, fontSize: 12 },
  input: { minHeight: 46, borderRadius: radii.input, borderWidth: 1, borderColor: colors.inputBorder, backgroundColor: colors.inputBg, color: colors.text, paddingHorizontal: 14, fontFamily: fonts.body, fontSize: 15 },
}
