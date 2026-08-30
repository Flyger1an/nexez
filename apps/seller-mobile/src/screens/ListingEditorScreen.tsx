import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { Card, ErrorState, LoadingState, Screen, SegmentedControl, StackHeader, TextField, ToggleRow } from '@/src/components/ui'
import { formatFaqLines, formatOfferLines, getReadinessScore, mergeOfferLines, normalizeSlug, parseFaqLines, parseOfferLines } from '@/src/lib/agent-page'
import { checkPageSlugAvailability, type PublicIdentifierAvailabilityResponse } from '@/src/lib/api'
import { createPage, updatePage } from '@/src/lib/data'
import { listingWriteErrorMessage } from '@/src/lib/listing-write-error'
import { normalizePublicIdentifier, PublicIdentifierRequestGuard, validatePublicIdentifier } from '@/src/lib/public-identifier'
import { colors, fonts } from '@/src/theme/colors'
import { useListing } from '@/src/hooks/useListings'
import { useSession } from '@/src/hooks/useSession'
import type { AgentPage } from '@/src/types/nexez'

type EditorStep = 'basics' | 'offers' | 'trust' | 'publish'
const STEPS: EditorStep[] = ['basics', 'offers', 'trust', 'publish']

type SlugAvailabilityState =
  | { kind: 'result'; value: string; result: PublicIdentifierAvailabilityResponse }
  | { kind: 'error'; value: string; message: string }

const emptyPage: Partial<AgentPage> = {
  name: '', slug: '', description: '', website_url: '', cta_url: '', cta_label: 'Visit website',
  audience: '', location: '', contact_email: '', industry: '', services: [], products: [], faqs: [], is_published: false,
}

export function ListingEditorScreen({ create = false }: { create?: boolean }) {
  const { id } = useLocalSearchParams<{ id: string }>()
  const listing = useListing(create ? undefined : id)

  if (!create && listing.loading) return <LoadingState label="Loading editor" />
  if (!create && (listing.error || !listing.data)) {
    return <ErrorState message={listing.error || 'Listing not found.'} onRetry={listing.reload} />
  }

  const initialPage = create ? { ...emptyPage } : listing.data!
  return <ListingEditorForm key={create ? 'new' : initialPage.id} create={create} id={id} initialPage={initialPage} />
}

function ListingEditorForm({
  create,
  id,
  initialPage,
}: {
  create: boolean
  id: string
  initialPage: Partial<AgentPage>
}) {
  const router = useRouter()
  const { user } = useSession()
  const [step, setStep] = useState<EditorStep>('basics')
  const [page, setPage] = useState<Partial<AgentPage>>(initialPage)
  const [servicesText, setServicesText] = useState(() => formatOfferLines(initialPage.services))
  const [productsText, setProductsText] = useState(() => formatOfferLines(initialPage.products))
  const [faqsText, setFaqsText] = useState(() => formatFaqLines(initialPage.faqs))
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [slugAvailability, setSlugAvailability] = useState<SlugAvailabilityState | null>(null)
  const slugRequestGuard = useRef(new PublicIdentifierRequestGuard())
  const currentSlug = typeof initialPage.slug === 'string' ? initialPage.slug : null
  const effectiveSlug = page.slug || normalizePublicIdentifier(page.name || '')
  const slugValidation = useMemo(
    () => validatePublicIdentifier(effectiveSlug, { current: currentSlug }),
    [currentSlug, effectiveSlug],
  )
  const displayedSlugAvailability = !effectiveSlug
    ? { kind: 'idle' as const }
    : !slugValidation.ok
      ? { kind: 'invalid' as const, message: slugValidation.message }
      : slugAvailability?.value === slugValidation.value
        ? slugAvailability
        : { kind: 'checking' as const, value: slugValidation.value }

  const readiness = useMemo(
    () => getReadinessScore({ ...page, slug: page.slug || normalizeSlug(page.name || ''), services: parseOfferLines(servicesText), products: parseOfferLines(productsText), faqs: parseFaqLines(faqsText) }),
    [faqsText, page, productsText, servicesText],
  )

  useEffect(() => {
    const requestGuard = slugRequestGuard.current
    requestGuard.invalidate()
    if (!effectiveSlug || !slugValidation.ok) return

    const requestId = requestGuard.begin()
    const timer = setTimeout(() => {
      void checkPageSlugAvailability({
        value: slugValidation.value,
        subjectId: create ? null : id,
      }).then((result) => {
        if (requestGuard.accepts(requestId)) {
          setSlugAvailability({ kind: 'result', value: slugValidation.value, result })
        }
      }).catch(() => {
        if (requestGuard.accepts(requestId)) {
          setSlugAvailability({
            kind: 'error',
            value: slugValidation.value,
            message: 'Could not verify this public name. Check your connection and try again.',
          })
        }
      })
    }, 350)

    return () => {
      clearTimeout(timer)
      if (requestGuard.accepts(requestId)) requestGuard.invalidate()
    }
  }, [create, effectiveSlug, id, slugValidation])

  function set<K extends keyof AgentPage>(key: K, value: AgentPage[K]) {
    setPage((prev) => ({ ...prev, [key]: value }))
  }

  async function save() {
    if (!user) return
    const validation = validatePublicIdentifier(effectiveSlug, { current: currentSlug })
    if (!validation.ok) {
      setStep('basics')
      setMessage(validation.message)
      return
    }
    setSaving(true)
    setMessage('')
    try {
      const availability = await checkPageSlugAvailability({
        value: validation.value,
        subjectId: create ? null : id,
      })
      setSlugAvailability({ kind: 'result', value: availability.value, result: availability })
      if (!availability.available) {
        setStep('basics')
        setMessage(availability.message)
        return
      }
      const payload = {
        ...page,
        slug: validation.value,
        services: mergeOfferLines(servicesText, page.services),
        products: mergeOfferLines(productsText, page.products),
        faqs: parseFaqLines(faqsText),
      }
      const saved = create ? await createPage(user.id, payload) : await updatePage(id, payload)
      router.replace({ pathname: '/listing/[id]', params: { id: saved.id } })
    } catch (err) {
      setMessage(listingWriteErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const stepIndex = STEPS.indexOf(step)

  return (
    <Screen
      header={
        <StackHeader
          title={create ? 'New listing' : page.name || 'Edit listing'}
          onBack={() => router.back()}
          right={
            <Pressable onPress={save} disabled={saving} style={[st.saveBtn, saving ? { opacity: 0.6 } : null]}>
              <Text style={st.saveText}>{saving ? 'Saving…' : 'Save'}</Text>
            </Pressable>
          }
        />
      }
    >
      <View style={st.rail}>
        {STEPS.map((_, i) => (
          <View key={i} style={[st.railBar, { backgroundColor: i <= stepIndex ? colors.persimmon : 'rgba(255,255,255,0.12)' }]} />
        ))}
      </View>
      <Text style={st.readiness}>{readiness}% agent-ready</Text>

      <SegmentedControl
        value={step}
        onChange={setStep}
        options={[
          { label: 'Basics', value: 'basics' },
          { label: 'Offers', value: 'offers' },
          { label: 'Trust', value: 'trust' },
          { label: 'Publish', value: 'publish' },
        ]}
      />

      <Card>
        {step === 'basics' ? (
          <>
            <TextField label="Business name" value={page.name || ''} onChangeText={(v) => set('name', v)} autoCapitalize="words" />
            <TextField
              label="Public name"
              value={page.slug || ''}
              onChangeText={(value) => {
                setMessage('')
                set('slug', normalizePublicIdentifier(value))
              }}
              placeholder={normalizePublicIdentifier(page.name || '') || 'your-business'}
              mono
            />
            {displayedSlugAvailability.kind === 'checking' ? (
              <Text style={st.availabilityMuted}>Checking {displayedSlugAvailability.value}…</Text>
            ) : null}
            {displayedSlugAvailability.kind === 'invalid' || displayedSlugAvailability.kind === 'error' ? (
              <Text style={st.availabilityError}>{displayedSlugAvailability.message}</Text>
            ) : null}
            {displayedSlugAvailability.kind === 'result' ? (
              <>
                <Text style={displayedSlugAvailability.result.available ? st.availabilitySuccess : st.availabilityError}>
                  {displayedSlugAvailability.result.message}
                </Text>
                {!displayedSlugAvailability.result.available && displayedSlugAvailability.result.suggestions.length > 0 ? (
                  <View style={st.suggestions}>
                    {displayedSlugAvailability.result.suggestions.map((suggestion) => (
                      <Pressable
                        key={suggestion}
                        onPress={() => {
                          setMessage('')
                          set('slug', suggestion)
                        }}
                        style={st.suggestion}
                      >
                        <Text style={st.suggestionText}>{suggestion}</Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
              </>
            ) : null}
            <TextField label="Description" value={page.description || ''} onChangeText={(v) => set('description', v)} multiline autoCapitalize="sentences" />
            <TextField label="Industry" value={page.industry || ''} onChangeText={(v) => set('industry', v)} autoCapitalize="words" />
          </>
        ) : null}
        {step === 'offers' ? (
          <>
            <TextField label="Services" value={servicesText} onChangeText={setServicesText} multiline placeholder="Name | Price | Description | URL" />
            <TextField label="Products" value={productsText} onChangeText={setProductsText} multiline placeholder="Name | Price | Description | URL" />
          </>
        ) : null}
        {step === 'trust' ? (
          <>
            <TextField label="Website" value={page.website_url || ''} onChangeText={(v) => set('website_url', v)} keyboardType="url" mono />
            <TextField label="Location" value={page.location || ''} onChangeText={(v) => set('location', v)} autoCapitalize="words" />
            <TextField label="Contact email" value={page.contact_email || ''} onChangeText={(v) => set('contact_email', v)} keyboardType="email-address" />
            <TextField label="FAQs" value={faqsText} onChangeText={setFaqsText} multiline placeholder="Question | Answer" />
          </>
        ) : null}
        {step === 'publish' ? (
          <>
            <TextField label="Action / checkout URL" value={page.cta_url || ''} onChangeText={(v) => set('cta_url', v)} keyboardType="url" mono />
            <TextField label="Action label" value={page.cta_label || ''} onChangeText={(v) => set('cta_label', v)} autoCapitalize="words" />
            <TextField label="Best-fit buyer" value={page.audience || ''} onChangeText={(v) => set('audience', v)} multiline autoCapitalize="sentences" />
            <ToggleRow label="Published" detail="Visible to AI agents & buyers" value={Boolean(page.is_published)} onValueChange={(v) => set('is_published', v)} />
          </>
        ) : null}
        {message ? <Text style={st.error}>{message}</Text> : null}
      </Card>
    </Screen>
  )
}

const st = {
  saveBtn: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 11, backgroundColor: colors.ringBg, borderWidth: 1, borderColor: colors.ringBorder },
  saveText: { color: colors.persimmonLight, fontFamily: fonts.bodyBold, fontSize: 13 },
  rail: { flexDirection: 'row' as const, gap: 6 },
  railBar: { flex: 1, height: 4, borderRadius: 2 },
  readiness: { color: colors.persimmon, fontFamily: fonts.bodyBold, fontSize: 12, marginTop: -6 },
  error: { color: colors.warning, fontFamily: fonts.body, fontSize: 13 },
  availabilityMuted: { color: colors.textTertiary, fontFamily: fonts.body, fontSize: 12, marginTop: -8 },
  availabilitySuccess: { color: colors.success, fontFamily: fonts.bodySemibold, fontSize: 12, marginTop: -8 },
  availabilityError: { color: colors.warning, fontFamily: fonts.body, fontSize: 12, marginTop: -8 },
  suggestions: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8, marginTop: -2 },
  suggestion: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 9, borderWidth: 1, borderColor: colors.ringBorder, backgroundColor: colors.ringBg },
  suggestionText: { color: colors.persimmonLight, fontFamily: fonts.mono, fontSize: 12 },
}
