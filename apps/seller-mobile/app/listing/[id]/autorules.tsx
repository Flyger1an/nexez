import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text } from 'react-native'
import { ErrorState, LoadingState, Screen, StackHeader, TextField, ToggleRow } from '@/src/components/ui'
import { useToast } from '@/src/components/Toast'
import { updatePage } from '@/src/lib/data'
import { useListing } from '@/src/hooks/useListings'
import { colors, fonts } from '@/src/theme/colors'
import type { OfferItem } from '@/src/types/nexez'

export default function AutoRulesRoute() {
  const router = useRouter()
  const toast = useToast()
  const { id } = useLocalSearchParams<{ id: string }>()
  const { data: page, loading, error, reload } = useListing(id)
  const [on, setOn] = useState(false)
  const [floor, setFloor] = useState('')
  const [accept, setAccept] = useState('')
  const [decline, setDecline] = useState('')
  const [terms, setTerms] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!page) return
    const offers = [...(page.services ?? []), ...(page.products ?? [])]
    setOn(offers.some((o) => o.offerType === 'negotiable'))
    setFloor(offers.find((o) => o.rules?.minPrice)?.rules?.minPrice ?? '')
  }, [page])

  if (loading) return <LoadingState label="Loading auto-rules" />
  if (error || !page) return <ErrorState message={error || 'Listing not found.'} onRetry={reload} />
  const current = page

  // Apply the listing-level toggle + floor to every offer's negotiation rules.
  // evaluateProposal (server) honors offerType + rules.minPrice + rules.autoAccept.
  function applyRules(items: OfferItem[] | null | undefined): OfferItem[] {
    return (items ?? []).map((o) => ({
      ...o,
      offerType: on ? 'negotiable' : 'fixed',
      rules: { ...o.rules, minPrice: floor.trim() || undefined, autoAccept: on },
    }))
  }

  async function save() {
    setSaving(true)
    try {
      await updatePage(current.id, { ...current, services: applyRules(current.services), products: applyRules(current.products) })
      toast('Auto-rules saved', 'success')
      router.back()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not save auto-rules', 'danger')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Screen
      header={
        <StackHeader
          title="Negotiation auto-rules"
          onBack={() => router.back()}
          right={
            <Pressable onPress={save} disabled={saving} style={[st.saveBtn, saving ? { opacity: 0.6 } : null]}>
              <Text style={st.saveText}>{saving ? 'Saving…' : 'Save'}</Text>
            </Pressable>
          }
        />
      }
    >
      <ToggleRow label="Let Nexez negotiate" detail="Auto-respond to buyer agents 24/7 — never below your floor" value={on} onValueChange={setOn} />
      <TextField label="Floor (never go below)" value={floor} onChangeText={setFloor} placeholder="$2,000" />
      <TextField label="Auto-accept at or above" value={accept} onChangeText={setAccept} placeholder="$6,500" />
      <TextField label="Auto-decline below" value={decline} onChangeText={setDecline} placeholder="$1,500" />
      <TextField label="Default terms" value={terms} onChangeText={setTerms} autoCapitalize="sentences" placeholder="Net-15, 50% deposit…" />
      <Text style={st.note}>
        The toggle + floor are written to every offer’s rules now and apply on the next buyer-agent offer. Fine-grained accept/decline bands and default terms are managed per-offer on the web dashboard.
      </Text>
    </Screen>
  )
}

const st = StyleSheet.create({
  saveBtn: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 11, backgroundColor: colors.ringBg, borderWidth: 1, borderColor: colors.ringBorder },
  saveText: { color: colors.emberText, fontFamily: fonts.bodyBold, fontSize: 13 },
  note: { color: colors.textTertiary, fontFamily: fonts.body, fontSize: 12, lineHeight: 18 },
})
