import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Card, ErrorState, LoadingState, Screen, StackHeader, TextField, ToggleRow } from '@/src/components/ui'
import { useToast } from '@/src/components/Toast'
import { getMyPlanEntitlements, updatePage } from '@/src/lib/data'
import { mobileEntitlementSnapshotExpiresAt } from '@/src/lib/entitlement-snapshot'
import { useListing } from '@/src/hooks/useListings'
import { useSession } from '@/src/hooks/useSession'
import { mobileNegotiationAuthoringAllowed } from '@/src/lib/negotiation-entitlements'
import {
  applyMobileNegotiationRuleDraft,
  mobileNegotiationRuleDraft,
  type MobileNegotiationRuleDraft,
} from '@/src/lib/negotiation-rules'
import { colors, fonts } from '@/src/theme/colors'
import type { AgentPage, OfferItem, OwnerPlanEntitlements } from '@/src/types/nexez'

type OfferKind = 'services' | 'products'

type OfferRuleRow = {
  key: string
  kind: OfferKind
  index: number
  offer: OfferItem
}

type RuleDraftState = {
  pageId: string
  drafts: Record<string, MobileNegotiationRuleDraft>
}

function offerRuleRows(page: AgentPage): OfferRuleRow[] {
  return (['services', 'products'] as const).flatMap((kind) =>
    (page[kind] ?? []).map((offer, index) => ({
      key: `${kind}:${index}`,
      kind,
      index,
      offer,
    })),
  )
}

export default function AutoRulesRoute() {
  const router = useRouter()
  const toast = useToast()
  const { user } = useSession()
  const { id } = useLocalSearchParams<{ id: string }>()
  const { data: page, loading, error, reload } = useListing(id)
  const [ruleDraftState, setRuleDraftState] = useState<RuleDraftState | null>(null)
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

  if (loading) return <LoadingState label="Loading negotiation rules" />
  if (error || !page) return <ErrorState message={error || 'Listing not found.'} onRetry={reload} />

  const current = page
  const rows = offerRuleRows(current)
  const initialDrafts = Object.fromEntries(
    rows.map((row) => [row.key, mobileNegotiationRuleDraft(row.offer)]),
  )
  const drafts = ruleDraftState?.pageId === current.id
    ? { ...initialDrafts, ...ruleDraftState.drafts }
    : initialDrafts
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

  function updateDraft(key: string, patch: Partial<MobileNegotiationRuleDraft>) {
    const existing = drafts[key]
    if (!existing) return
    setRuleDraftState({
      pageId: current.id,
      drafts: {
        ...drafts,
        [key]: { ...existing, ...patch },
      },
    })
  }

  function applyOffers(kind: OfferKind): OfferItem[] {
    return (current[kind] ?? []).map((offer, index) => {
      const key = `${kind}:${index}`
      const result = applyMobileNegotiationRuleDraft(
        offer,
        drafts[key] ?? mobileNegotiationRuleDraft(offer),
        authoringAllowed,
      )
      if (!result.ok) throw new Error(`${offer.name || 'Offer'}: ${result.message}`)
      return result.offer
    })
  }

  async function save() {
    setSaving(true)
    try {
      const services = applyOffers('services')
      const products = applyOffers('products')
      await updatePage(current.id, { ...current, services, products })
      toast('Negotiation rules saved', 'success')
      router.back()
    } catch (saveError) {
      toast(saveError instanceof Error ? saveError.message : 'Could not save negotiation rules', 'danger')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Screen
      header={
        <StackHeader
          title="Negotiation rules"
          onBack={() => router.back()}
          right={
            <Pressable onPress={save} disabled={saving || rows.length === 0} style={[st.saveBtn, saving || rows.length === 0 ? st.disabled : null]}>
              <Text style={st.saveText}>{saving ? 'Saving…' : 'Save'}</Text>
            </Pressable>
          }
        />
      }
    >
      <Text style={st.intro}>
        Rules are configured per offer and evaluated by the same platform engine used on the web. Existing booking,
        settlement, integration, and future rule fields are preserved.
      </Text>

      {rows.length === 0 ? (
        <Card>
          <Text style={st.emptyTitle}>Add an offer first</Text>
          <Text style={st.note}>Products and services need to exist before negotiation rules can be configured.</Text>
        </Card>
      ) : rows.map((row) => {
        const draft = drafts[row.key]
        if (!draft) return null
        const paidFieldsEditable = authoringAllowed && draft.enabled
        const retainedAndPaused = draft.enabled && !authoringAllowed

        return (
          <Card key={row.key}>
            <View style={st.offerHeader}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={st.kind}>{row.kind === 'services' ? 'Service' : 'Product'}</Text>
                <Text style={st.offerName} numberOfLines={2}>{row.offer.name || `Offer ${row.index + 1}`}</Text>
              </View>
              {row.offer.price ? <Text style={st.price}>{row.offer.price}</Text> : null}
            </View>

            <ToggleRow
              label="Open to negotiation"
              detail={authoringAllowed
                ? 'Buyer-agent proposals are checked against this offer’s rules.'
                : retainedAndPaused
                  ? 'Retained on this listing, but paid automation is paused for the current plan.'
                  : entitlementState === 'loading'
                    ? 'Checking plan access.'
                    : 'Requires Pro or higher.'}
              value={draft.enabled}
              disabled={!draft.enabled && !authoringAllowed}
              onValueChange={(enabled) => {
                if (enabled && !authoringAllowed) return
                updateDraft(row.key, {
                  enabled,
                  enabledChanged: enabled !== draft.initialEnabled,
                })
              }}
            />

            <Text style={st.sectionLabel}>Private pricing and automation</Text>
            <TextField
              label="Minimum acceptable price"
              value={draft.minPrice}
              onChangeText={(minPrice) => updateDraft(row.key, { minPrice })}
              placeholder="$800"
              keyboardType="decimal-pad"
              editable={paidFieldsEditable}
            />
            <View style={st.twoColumn}>
              <View style={st.column}>
                <TextField
                  label="Maximum discount (%)"
                  value={draft.maxDiscountPercent}
                  onChangeText={(maxDiscountPercent) => updateDraft(row.key, { maxDiscountPercent })}
                  placeholder="10"
                  keyboardType="decimal-pad"
                  editable={paidFieldsEditable}
                />
              </View>
              <View style={st.column}>
                <TextField
                  label="Auto-accept range (%)"
                  value={draft.autoAcceptWithinPercent}
                  onChangeText={(autoAcceptWithinPercent) => updateDraft(row.key, { autoAcceptWithinPercent })}
                  placeholder="5"
                  keyboardType="decimal-pad"
                  editable={paidFieldsEditable}
                />
              </View>
            </View>
            <ToggleRow
              label="Auto-accept matching proposals"
              detail="Advance only when every configured price and term rule passes."
              value={draft.autoAccept}
              disabled={!paidFieldsEditable}
              onValueChange={(autoAccept) => updateDraft(row.key, { autoAccept })}
            />
            <ToggleRow
              label="Automatic counter"
              detail="Counter outside-price proposals at the lowest allowed price."
              value={draft.autoCounter}
              disabled={!paidFieldsEditable}
              onValueChange={(autoCounter) => updateDraft(row.key, { autoCounter })}
            />

            <Text style={st.sectionLabel}>Included offer terms</Text>
            <TextField
              label="Included scope"
              value={draft.includedScope}
              onChangeText={(includedScope) => updateDraft(row.key, { includedScope })}
              placeholder="Logo design, brand guide"
              autoCapitalize="sentences"
              multiline
            />
            <TextField
              label="Excluded scope"
              value={draft.excludedScope}
              onChangeText={(excludedScope) => updateDraft(row.key, { excludedScope })}
              placeholder="Website development, source files"
              autoCapitalize="sentences"
              multiline
            />
            <View style={st.twoColumn}>
              <View style={st.column}>
                <TextField
                  label="Included revisions"
                  value={draft.maxRevisions}
                  onChangeText={(maxRevisions) => updateDraft(row.key, { maxRevisions })}
                  placeholder="2"
                  keyboardType="number-pad"
                />
              </View>
              <View style={st.column}>
                <TextField
                  label="Maximum project weeks"
                  value={draft.maxProjectWeeks}
                  onChangeText={(maxProjectWeeks) => updateDraft(row.key, { maxProjectWeeks })}
                  placeholder="4"
                  keyboardType="number-pad"
                />
              </View>
            </View>

            <Text style={st.note}>
              Scope, revision, and project-length terms remain editable on every plan. Private pricing automation requires Pro.
            </Text>
          </Card>
        )
      })}
    </Screen>
  )
}

const st = StyleSheet.create({
  saveBtn: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 11, backgroundColor: colors.ringBg, borderWidth: 1, borderColor: colors.ringBorder },
  disabled: { opacity: 0.5 },
  saveText: { color: colors.emberText, fontFamily: fonts.bodyBold, fontSize: 13 },
  intro: { color: colors.textSecondary, fontFamily: fonts.body, fontSize: 13, lineHeight: 20 },
  offerHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  kind: { color: colors.emberTint, fontFamily: fonts.mono, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 },
  offerName: { color: colors.text, fontFamily: fonts.bodyBold, fontSize: 16, marginTop: 3 },
  price: { color: colors.body, fontFamily: fonts.display, fontSize: 16 },
  sectionLabel: { color: colors.emberTint, fontFamily: fonts.bodyBold, fontSize: 12, marginTop: 4 },
  twoColumn: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  column: { flex: 1, minWidth: 0 },
  emptyTitle: { color: colors.text, fontFamily: fonts.bodyBold, fontSize: 15 },
  note: { color: colors.textTertiary, fontFamily: fonts.body, fontSize: 12, lineHeight: 18 },
})
