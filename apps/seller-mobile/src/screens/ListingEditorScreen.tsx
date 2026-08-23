import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useMemo, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { Card, ErrorState, LoadingState, Screen, SegmentedControl, StackHeader, TextField, ToggleRow } from '@/src/components/ui'
import { formatFaqLines, formatOfferLines, getReadinessScore, mergeOfferLines, normalizeSlug, parseFaqLines, parseOfferLines } from '@/src/lib/agent-page'
import { createPage, updatePage } from '@/src/lib/data'
import { listingWriteErrorMessage } from '@/src/lib/listing-write-error'
import { colors, fonts } from '@/src/theme/colors'
import { useListing } from '@/src/hooks/useListings'
import { useSession } from '@/src/hooks/useSession'
import type { AgentPage } from '@/src/types/nexez'

type EditorStep = 'basics' | 'offers' | 'trust' | 'publish'
const STEPS: EditorStep[] = ['basics', 'offers', 'trust', 'publish']

const emptyPage: Partial<AgentPage> = {
  name: '', slug: '', description: '', website_url: '', cta_url: '', cta_label: 'Visit website',
  audience: '', location: '', contact_email: '', industry: '', services: [], products: [], faqs: [], is_published: false,
}

export function ListingEditorScreen({ create = false }: { create?: boolean }) {
  const router = useRouter()
  const { user } = useSession()
  const { id } = useLocalSearchParams<{ id: string }>()
  const listing = useListing(create ? undefined : id)
  const [step, setStep] = useState<EditorStep>('basics')
  const [page, setPage] = useState<Partial<AgentPage>>(emptyPage)
  const [servicesText, setServicesText] = useState('')
  const [productsText, setProductsText] = useState('')
  const [faqsText, setFaqsText] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (create || !listing.data) return
    const next = listing.data
    setPage(next)
    setServicesText(formatOfferLines(next.services))
    setProductsText(formatOfferLines(next.products))
    setFaqsText(formatFaqLines(next.faqs))
  }, [create, listing.data])

  const readiness = useMemo(
    () => getReadinessScore({ ...page, slug: page.slug || normalizeSlug(page.name || ''), services: parseOfferLines(servicesText), products: parseOfferLines(productsText), faqs: parseFaqLines(faqsText) }),
    [faqsText, page, productsText, servicesText],
  )

  if (!create && listing.loading) return <LoadingState label="Loading editor" />
  if (!create && listing.error) return <ErrorState message={listing.error} onRetry={listing.reload} />

  function set<K extends keyof AgentPage>(key: K, value: AgentPage[K]) {
    setPage((prev) => ({ ...prev, [key]: value }))
  }

  async function save() {
    if (!user) return
    setSaving(true)
    setMessage('')
    const payload = {
      ...page,
      slug: page.slug || normalizeSlug(page.name || ''),
      services: mergeOfferLines(servicesText, page.services),
      products: mergeOfferLines(productsText, page.products),
      faqs: parseFaqLines(faqsText),
    }
    try {
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
            <TextField label="Slug" value={page.slug || ''} onChangeText={(v) => set('slug', normalizeSlug(v))} mono />
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
}
