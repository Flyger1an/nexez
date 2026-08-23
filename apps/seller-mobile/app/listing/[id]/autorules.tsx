import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text } from 'react-native'
import { ErrorState, LoadingState, Screen, StackHeader, TextField, ToggleRow } from '@/src/components/ui'
import { useToast } from '@/src/components/Toast'
import { getMyPlanEntitlements, updatePage } from '@/src/lib/data'
import { mobileEntitlementSnapshotExpiresAt } from '@/src/lib/entitlement-snapshot'
import { useListing } from '@/src/hooks/useListings'
import { useSession } from '@/src/hooks/useSession'
import { applyMobileAutoRules, mobileNegotiationAuthoringAllowed } from '@/src/lib/negotiation-entitlements'
import { colors, fonts } from '@/src/theme/colors'
import type { OwnerPlanEntitlements } from '@/src/types/nexez'

export default function AutoRulesRoute() {
  const router = useRouter()
  const toast = useToast()
  const { user } = useSession()
  const { id } = useLocalSearchParams<{ id: string }>()
  const { data: page, loading, error, reload } = useListing(id)
  const [ruleDraft, setRuleDraft] = useState<{
    pageId: string
    on: boolean
    floor: string
  } | null>(null)
  const [accept, setAccept] = useState('')
  const [decline, setDecline] = useState('')
  const [terms, setTerms] = useState('')
  const [saving, setSaving] = useState(false)
  const [entitlementResult, setEntitlementResult] = useState<{
    viewerId: string
    snapshot: OwnerPlanEntitlements | null
    state: 'ready' | 'unavailable'
  } | null>(null)
  const [entitlementNow, setEntitlementNow] = useState(() => Date.now())
  const activeEntitlementResult = entitlementResult?.viewerId === user?.id
    ? entitlementResult
    : null
  const entitlementExpiresAt = mobileEntitlementSnapshotExpiresAt(activeEntitlementResult?.snapshot)

  useEffect(() => {
    let cancelled = false
    const viewerId = user?.id
    if (!viewerId) return () => { cancelled = true }
    getMyPlanEntitlements(viewerId)
      .then((snapshot) => {
        if (cancelled) return
        setEntitlementNow(Date.now())
        setEntitlementResult({ viewerId, snapshot, state: 'ready' })
      })
      .catch(() => {
        if (cancelled) return
        setEntitlementResult({ viewerId, snapshot: null, state: 'unavailable' })
      })
    return () => { cancelled = true }
  }, [user?.id])

  useEffect(() => {
    if (entitlementExpiresAt == null) return
    const timer = setTimeout(
      () => setEntitlementNow(Date.now()),
      Math.max(0, entitlementExpiresAt - Date.now() + 1),
    )
    return () => clearTimeout(timer)
  }, [entitlementExpiresAt])

  if (loading) return <LoadingState label="Loading auto-rules" />
  if (error || !page) return <ErrorState message={error || 'Listing not found.'} onRetry={reload} />
  const current = page
  const offers = [...(current.services ?? []), ...(current.products ?? [])]
  const initialOn = offers.some((offer) => offer.offerType === 'negotiable')
  const initialFloor = offers.find((offer) => offer.rules?.minPrice)?.rules?.minPrice ?? ''
  const activeRuleDraft = ruleDraft?.pageId === current.id ? ruleDraft : null
  const on = activeRuleDraft?.on ?? initialOn
  const floor = activeRuleDraft?.floor ?? initialFloor
  const entitlementState = activeEntitlementResult
    ? activeEntitlementResult.state
    : user?.id
      ? 'loading'
      : 'unavailable'
  const authoringAllowed = entitlementState === 'ready'
    && mobileNegotiationAuthoringAllowed(
      activeEntitlementResult?.snapshot,
      current.owner_id,
      new Date(entitlementNow),
    )

  async function save() {
    setSaving(true)
    try {
      await updatePage(current.id, {
        ...current,
        services: applyMobileAutoRules(current.services, { enabled: on, floor, authoringAllowed }),
        products: applyMobileAutoRules(current.products, { enabled: on, floor, authoringAllowed }),
      })
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
      <ToggleRow
        label="Let Nexez negotiate"
        detail={authoringAllowed
          ? 'Auto-respond to buyer agents 24/7 - never below your floor'
          : entitlementState === 'loading'
            ? 'Checking plan access. Retained rules can still be turned off.'
            : 'Requires Pro. Retained rules can still be turned off and cleared.'}
        value={on}
        disabled={!on && !authoringAllowed}
        onValueChange={(next) => {
          if (next && !authoringAllowed) return
          setRuleDraft({ pageId: current.id, on: next, floor })
        }}
      />
      <TextField
        label="Floor (never go below)"
        value={floor}
        onChangeText={(next) => setRuleDraft({ pageId: current.id, on, floor: next })}
        placeholder="$2,000"
        editable={authoringAllowed}
      />
      <TextField label="Auto-accept at or above" value={accept} onChangeText={setAccept} placeholder="$6,500" editable={authoringAllowed} />
      <TextField label="Auto-decline below" value={decline} onChangeText={setDecline} placeholder="$1,500" editable={authoringAllowed} />
      <TextField label="Default terms" value={terms} onChangeText={setTerms} autoCapitalize="sentences" placeholder="Net-15, 50% deposit…" editable={authoringAllowed} />
      <Text style={st.note}>
        {authoringAllowed
          ? 'The toggle + floor are written to every offer’s rules now and apply on the next buyer-agent offer. Fine-grained accept/decline bands and default terms are managed per-offer on the web dashboard.'
          : 'Paid rule authoring is locked until the listing owner has Pro access. Turning the retained toggle off removes only paid negotiation settings and preserves booking, scope, and other core rules.'}
      </Text>
    </Screen>
  )
}

const st = StyleSheet.create({
  saveBtn: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 11, backgroundColor: colors.ringBg, borderWidth: 1, borderColor: colors.ringBorder },
  saveText: { color: colors.emberText, fontFamily: fonts.bodyBold, fontSize: 13 },
  note: { color: colors.textTertiary, fontFamily: fonts.body, fontSize: 12, lineHeight: 18 },
})
