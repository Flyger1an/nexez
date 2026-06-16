'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertCircle,
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  Globe2,
  HelpCircle,
  Loader2,
  Sparkles,
  Wand2,
  X,
} from 'lucide-react'
import {
  getReadinessScore,
  getReadinessCriteria,
  normalizeSlug,
  OfferItem,
  formatFaqLines,
  parseFaqLines,
  parseOfferLines,
  formatOfferLines,
} from '../../lib/agent-page'
import {
  enhanceDescriptionForAgents,
  generateAgentSummary,
  generateStrongFaqs,
  optimizeAllOffersForAgents,
  rewriteOfferForAgents,
} from '../../lib/ai-optimize'
import { AICoPilot } from '../../components/AICoPilot'
import { parseAgentCsv, sampleAgentCsv } from '../../lib/csv-import'
import { NEXEZ_INDUSTRIES, getIndustrySuggestions } from '../../lib/industry-catalog'
import { createClient } from '../../utils/supabase/client'
import { VisualOfferBuilder } from '../../components/VisualOfferBuilder'
import { ErrorBoundary } from '../../components/ErrorBoundary'
import { ReadinessChecklist } from '../../components/ReadinessChecklist'
import { AGENT_RUNTIME_HOST, agentRuntimeUrl, appUrl } from '../../lib/site'
import { getCreatePageTemplate } from '../../lib/create-page-templates'
import { isPublishLimitError, publishErrorMessage } from '../../lib/publish-error'

type GuidedImportReview = {
  suggestedPage?: {
    name?: string
    description?: string
    website_url?: string
    services?: string
    industry?: string | null
    logo_url?: string | null
    audience?: string | null
    location?: string | null
    cta_url?: string | null
    cta_label?: string | null
    faqs?: Array<{ question: string; answer: string }>
  }
  structuredOffers?: OfferItem[]
  pagesAnalyzed?: number
  confidence?: number
  reviewNotes?: string[]
  sources?: Array<{ url: string; label: string; type: string; method: string }>
  clarifyingQuestions?: Array<{ id: string; field: string; question: string; why: string }>
  readiness?: { score: number; strengths: string[]; gaps: string[] }
  aiStatus?: {
    configured: boolean
    attempted: boolean
    used: boolean
    status: 'deterministic' | 'structured_ai' | 'offer_ai' | 'fallback' | 'failed'
    provider: string
    model: string
    reason: string
    latencyMs?: number
    httpStatus?: number
  }
  aiAssisted?: boolean
  message?: string
}

export default function CreatePage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [description, setDescription] = useState('')
  const [websiteUrl, setWebsiteUrl] = useState('')
  const [ctaUrl, setCtaUrl] = useState('')
  const [ctaLabel, setCtaLabel] = useState('Visit website')
  const [audience, setAudience] = useState('')
  const [location, setLocation] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [industry, setIndustry] = useState('')
  const [logoUrl, setLogoUrl] = useState('')
  const [products, setProducts] = useState('')
  const [services, setServices] = useState('')
  const [faqs, setFaqs] = useState('')

  // Phase 1 A: Primary rich OfferItem[] state (mirrors editor). Direct structuredOffers from importer populates cards.
  const [servicesOffers, setServicesOffers] = useState<OfferItem[]>([])
  const [productsOffers, setProductsOffers] = useState<OfferItem[]>([])

  const [loading, setLoading] = useState(false)
  const [publishedSlug, setPublishedSlug] = useState('')
  const [needsAuth, setNeedsAuth] = useState(false)
  const [importMessage, setImportMessage] = useState('')
  const [publishError, setPublishError] = useState('')
  // When publishing hits the plan's page limit, offer to save the built page as a
  // draft inline (instead of a native confirm) so the build-first funnel survives.
  const [draftOffer, setDraftOffer] = useState(false)
  const [importUrl, setImportUrl] = useState('')
  const [guidedBuyer, setGuidedBuyer] = useState('')
  const [guidedGoal, setGuidedGoal] = useState('Book appointments')
  const [guidedFocus, setGuidedFocus] = useState('')
  const [guidedNotes, setGuidedNotes] = useState('')
  const [guidedReview, setGuidedReview] = useState<GuidedImportReview | null>(null)
  const [selectedImportOffers, setSelectedImportOffers] = useState<Record<string, boolean>>({})
  const [guidedAnswers, setGuidedAnswers] = useState<Record<string, string>>({})
  const [showAllGuidedOffers, setShowAllGuidedOffers] = useState(false)
  const [guidedImporting, setGuidedImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [stripeImportOpen, setStripeImportOpen] = useState(false)
  const [stripeInput, setStripeInput] = useState('')
  const [stripeImporting, setStripeImporting] = useState(false)

  // Calendly integration state
  const [calendlyImportOpen, setCalendlyImportOpen] = useState(false)
  const [calendlyToken, setCalendlyToken] = useState('')
  const [calendlyImporting, setCalendlyImporting] = useState(false)

  const previewSlug = useMemo(() => normalizeSlug(slug || name), [name, slug])
  const sampleCsvHref = useMemo(() => `data:text/csv;charset=utf-8,${encodeURIComponent(sampleAgentCsv)}`, [])
  // Prefer rich arrays (Phase 1 A) for builder + submit; fall back to text for compat
  const parsedProducts = useMemo(() => (productsOffers.length ? productsOffers : parseOfferLines(products)), [productsOffers, products])
  const parsedServices = useMemo(() => (servicesOffers.length ? servicesOffers : parseOfferLines(services)), [servicesOffers, services])
  const parsedFaqs = useMemo(() => parseFaqLines(faqs), [faqs])
  const readinessInput = useMemo(
    () => ({
      name,
      slug: previewSlug,
      description,
      website_url: websiteUrl,
      cta_url: ctaUrl || websiteUrl,
      audience,
      industry,
      location,
      contact_email: contactEmail,
      products: parsedProducts,
      services: parsedServices,
      faqs: parsedFaqs,
      is_published: true,
    }),
    [name, previewSlug, description, websiteUrl, ctaUrl, audience, industry, location, contactEmail, parsedProducts, parsedServices, parsedFaqs],
  )
  const score = getReadinessScore(readinessInput)
  const readinessCriteria = useMemo(() => getReadinessCriteria(readinessInput), [readinessInput])
  const selectedGuidedOfferCount = useMemo(() => {
    if (!guidedReview?.structuredOffers?.length) return 0
    return guidedReview.structuredOffers.filter((offer, index) => selectedImportOffers[offerImportKey(offer, index)]).length
  }, [guidedReview, selectedImportOffers])
  const guidedOfferRows = useMemo(() => {
    const offers = guidedReview?.structuredOffers ?? []
    const visibleOffers = showAllGuidedOffers ? offers : offers.slice(0, 8)
    return visibleOffers.map((offer, index) => ({ offer, index }))
  }, [guidedReview, showAllGuidedOffers])
  const hiddenGuidedOfferCount = Math.max(0, (guidedReview?.structuredOffers?.length ?? 0) - guidedOfferRows.length)
  const answeredGuidedQuestions = useMemo(() => {
    return (guidedReview?.clarifyingQuestions || [])
      .map((item) => ({
        id: item.id,
        field: item.field,
        question: item.question,
        answer: (guidedAnswers[item.id] || '').trim(),
      }))
      .filter((item) => item.answer)
  }, [guidedReview, guidedAnswers])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const template = getCreatePageTemplate(params.get('template'))

    if (template) {
      setName(template.name)
      setSlug(template.slug)
      setDescription(template.description)
      setAudience(template.audience)
      setIndustry(template.industry)
      setCtaLabel(template.ctaLabel)
      setServicesOffers(template.servicesOffers)
      setServices(formatOfferLines(template.servicesOffers))
      setFaqs(formatFaqLines(template.faqs))
      setImportMessage(template.notice)
      setStep(1)
    }

    if (params.get('import') === 'csv') {
      setStep(2)
      setImportMessage('Upload CSV import.')
    }

    // Handle import from Tools page
    if (params.get('imported') === 'true') {
      const saved = sessionStorage.getItem('nexez_imported_page')
      const structured = sessionStorage.getItem('nexez_imported_structured')

      if (saved) {
        try {
          const imported = JSON.parse(saved)
          if (imported.name) setName(imported.name)
          if (imported.description) setDescription(imported.description)
          if (imported.website_url) setWebsiteUrl(imported.website_url)
          if (imported.logo_url) setLogoUrl(imported.logo_url)
          if (imported.services) setServices(imported.services)

          if (structured) {
            const offers: OfferItem[] = JSON.parse(structured)
            // Phase 1 A: Direct rich population from importer (no text roundtrip loss for cards)
            setServicesOffers(offers)
            // Keep text layer in sync for advanced view + any legacy paths
            setServices(formatOfferLines(offers))
          }

          setImportMessage('Import loaded. Review below.')
          setStep(1)
          // Clean up storage
          sessionStorage.removeItem('nexez_imported_page')
          sessionStorage.removeItem('nexez_imported_structured')
        } catch (e) {
          console.error('Failed to load imported data')
        }
      }
    }

    // Restore an in-progress page saved before a sign-in prompt (so a visitor's
    // work survives the round-trip to /login and back).
    const pending = sessionStorage.getItem('nexez_pending_page')
    if (pending) {
      try {
        const d = JSON.parse(pending)
        if (d.name) setName(d.name)
        if (d.slug) setSlug(d.slug)
        if (d.description) setDescription(d.description)
        if (d.websiteUrl) setWebsiteUrl(d.websiteUrl)
        if (d.ctaUrl) setCtaUrl(d.ctaUrl)
        if (d.ctaLabel) setCtaLabel(d.ctaLabel)
        if (d.audience) setAudience(d.audience)
        if (d.location) setLocation(d.location)
        if (d.contactEmail) setContactEmail(d.contactEmail)
        if (d.industry) setIndustry(d.industry)
        if (d.logoUrl) setLogoUrl(d.logoUrl)
        if (d.services) setServices(d.services)
        if (d.products) setProducts(d.products)
        if (d.faqs) setFaqs(d.faqs)
        if (Array.isArray(d.servicesOffers)) setServicesOffers(d.servicesOffers)
        if (Array.isArray(d.productsOffers)) setProductsOffers(d.productsOffers)
      } catch {
        // ignore malformed draft
      }
      sessionStorage.removeItem('nexez_pending_page')
    }
  }, [])

  const handleSubmit = async ({ asDraft = false }: { asDraft?: boolean } = {}) => {
    setLoading(true)
    setPublishError('')
    setDraftOffer(false)
    // Drafts aren't public, so they skip the optimistic public tab.
    const publicPageTab = asDraft ? null : openPendingPublicPageTab()

    const supabase = createClient()
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      closePendingPublicPageTab(publicPageTab)
      // Visitor built a page but isn't signed in — preserve their work and
      // prompt them to create an account / sign in before it goes live.
      try {
        sessionStorage.setItem(
          'nexez_pending_page',
          JSON.stringify({
            name, slug, description, websiteUrl, ctaUrl, ctaLabel, audience, location, contactEmail, industry,
            logoUrl,
            services, products, faqs, servicesOffers, productsOffers,
          }),
        )
      } catch {
        // sessionStorage unavailable — proceed to prompt anyway
      }
      setNeedsAuth(true)
      setLoading(false)
      return
    }

    const cleanSlug = normalizeSlug(slug || name)
    const insertPage = (isPublished: boolean) =>
      supabase.from('pages').insert({
        owner_id: user.id,
        name,
        slug: cleanSlug,
        description,
        website_url: websiteUrl,
        cta_url: ctaUrl || websiteUrl,
        cta_label: ctaLabel || 'Visit website',
        audience,
        location,
        contact_email: contactEmail,
        industry,                    // NEW: Industry selection for better templates & copy
        products: parsedProducts,
        services: parsedServices,
        faqs: parsedFaqs,
        is_published: isPublished,
        branding: logoUrl ? { logo_url: logoUrl } : {},
      }).select('id, slug').single()

    const { data: createdPage, error } = await insertPage(!asDraft)

    setLoading(false)

    // A Free owner at their published-page limit (DB trigger) would otherwise lose
    // the page they just built. Keep the build-first funnel intact: surface the limit
    // inline with a "Save as draft" action (re-runs this as a draft) instead of a
    // native confirm. Drafts can't hit the limit, so this is publish-only.
    if (!asDraft && error && isPublishLimitError(error)) {
      closePendingPublicPageTab(publicPageTab)
      setPublishError(publishErrorMessage(error))
      setDraftOffer(true)
      return
    }

    if (error) {
      closePendingPublicPageTab(publicPageTab)
      const isSlugTaken = (error as { code?: string }).code === '23505' || /duplicate|unique|already exists/i.test(error.message)
      setPublishError(
        isSlugTaken
          ? `The link “/${cleanSlug}” is already taken. Try a different page name or edit the slug, then publish again.`
          : `Couldn’t publish your page: ${error.message}. Your work is saved — try again.`,
      )
      return
    }

    const createdSlug = createdPage?.slug || cleanSlug

    if (asDraft) {
      // Drafts aren't publicly visible — straight to the editor to finish or publish.
      if (createdPage?.id) {
        router.push(`/dashboard/${createdPage.id}?created=1&draft=1`)
      }
      return
    }

    sendPublicPageTab(publicPageTab, `/${createdSlug}`)

    if (createdPage?.id) {
      router.push(`/dashboard/${createdPage.id}?created=1&public=${encodeURIComponent(createdSlug)}`)
      return
    }

    setPublishedSlug(createdSlug)
  }

  async function runGuidedImport(options?: {
    refine?: boolean
    clarifyingAnswers?: Array<{ id?: string; field?: string; question: string; answer: string }>
  }) {
    if (!importUrl.trim()) {
      setImportMessage('Paste a public business URL to start guided import.')
      return
    }

    const isRefine = Boolean(options?.refine)
    setGuidedImporting(true)
    setGuidedReview(null)
    setShowAllGuidedOffers(false)
    if (!isRefine) setGuidedAnswers({})
    setImportMessage(isRefine ? 'Refining draft with your answers...' : 'Analyzing website and preparing a draft...')

    try {
      const res = await fetch('/api/tools/import-site', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: importUrl.trim(),
          industry,
          targetBuyer: guidedBuyer,
          desiredAction: guidedGoal,
          offerFocus: guidedFocus,
          notes: guidedNotes,
          location,
          clarifyingAnswers: options?.clarifyingAnswers || null,
        }),
      })
      const data = await res.json()

      if (!res.ok || !data.suggestedPage) {
        setImportMessage(data.error || 'Could not analyze that site. Try a services or pricing page, or enter offers manually.')
        return
      }

      const offers = (data.structuredOffers || []) as OfferItem[]
      const selected = offers.reduce<Record<string, boolean>>((acc, offer, index) => {
        acc[offerImportKey(offer, index)] = true
        return acc
      }, {})

      setGuidedReview(data)
      setSelectedImportOffers(selected)
      setGuidedAnswers({})
      setImportMessage(isRefine
        ? `Refined draft ready. ${offers.length} offer${offers.length === 1 ? '' : 's'} found.`
        : `Found ${offers.length} offer${offers.length === 1 ? '' : 's'}. Review the draft, then apply it to the builder.`)
    } catch (error: any) {
      setImportMessage(error?.message || 'Network error during guided import.')
    } finally {
      setGuidedImporting(false)
    }
  }

  function refineGuidedImport() {
    if (!answeredGuidedQuestions.length) {
      setImportMessage('Answer at least one question to refine the draft.')
      return
    }
    runGuidedImport({ refine: true, clarifyingAnswers: answeredGuidedQuestions })
  }

  function applyGuidedImport() {
    if (!guidedReview?.suggestedPage) return

    const page = guidedReview.suggestedPage
    const keptOffers = (guidedReview.structuredOffers || []).filter((offer, index) => (
      selectedImportOffers[offerImportKey(offer, index)]
    ))

    if (page.name) {
      setName(page.name)
      if (!slug) setSlug(normalizeSlug(page.name))
    }
    if (page.description) setDescription(page.description)
    if (page.website_url) setWebsiteUrl(page.website_url)
    if (page.cta_url) setCtaUrl(page.cta_url)
    if (page.cta_label) setCtaLabel(page.cta_label)
    if (page.logo_url) setLogoUrl(page.logo_url)
    if (page.industry && !industry) setIndustry(page.industry)
    if (page.audience) setAudience(page.audience)
    if (page.location) setLocation(page.location)
    if (page.faqs?.length) {
      setFaqs(page.faqs.map((faq) => `${faq.question} | ${faq.answer}`).join('\n'))
    }

    if (keptOffers.length > 0) {
      setServicesOffers(keptOffers)
      setServices(formatOfferLines(keptOffers))
    } else if (page.services) {
      setServices(page.services)
      setServicesOffers(parseOfferLines(page.services))
    }

    if (step < 2) setStep(2)
    setImportMessage(`Guided import applied. ${keptOffers.length} offer${keptOffers.length === 1 ? ' is' : 's are'} ready in the Visual Builder.`)
  }

  function aiFill() {
    const businessName = name || 'This business'
    const buyer = audience || 'customers'
    const actionUrl = ctaUrl || websiteUrl || 'https://example.com/book'
    const selectedIndustry = industry || ''

    const smartDesc = enhanceDescriptionForAgents(description, businessName, buyer)
    setDescription(smartDesc)

    if (!slug && name) setSlug(normalizeSlug(name))
    if (!ctaUrl && websiteUrl) setCtaUrl(websiteUrl)
    if (!ctaLabel || ctaLabel === 'Visit website') setCtaLabel('Book Now')

    if (!services && !products) {
      let defaultOffers = ''

      const isConsumerService = 
        selectedIndustry.toLowerCase().includes('home') ||
        selectedIndustry.toLowerCase().includes('plumbing') ||
        selectedIndustry.toLowerCase().includes('cleaning') ||
        selectedIndustry.toLowerCase().includes('fitness') ||
        selectedIndustry.toLowerCase().includes('wellness') ||
        selectedIndustry.toLowerCase().includes('massage') ||
        selectedIndustry.toLowerCase().includes('beauty') ||
        selectedIndustry.toLowerCase().includes('pet')

      if (isConsumerService) {
        defaultOffers = [
          `Standard Visit | $129 | 45-60 min. Diagnosis + service. Mobile. | ${actionUrl}`,
          `Full Service | From $249 | Premium materials + follow up. | ${actionUrl}`,
        ].join('\n')
      } else {
        defaultOffers = [
          `Discovery Call | $0 | 15 min conversation. | ${actionUrl}`,
          `Core Package | $450 | Full scope with clear deliverables. | ${actionUrl}`,
        ].join('\n')
      }

      setServices(defaultOffers)
    }

    if (!faqs) {
      const strongFaqs = generateStrongFaqs(businessName, buyer, true)
      setFaqs(strongFaqs.map((f) => `${f.question} | ${f.answer}`).join('\n'))
    }

    if (services || products) {
      const { services: s2, products: p2 } = optimizeAllOffersForAgents(services, products, {
        businessName,
        audience: buyer,
      })
      if (s2) setServices(s2)
      if (p2) setProducts(p2)
    }
  }

  function optimizeOfferCopy() {
    const businessName = name || 'This business'
    const buyer = audience || 'qualified buyers'

    const { services: optS, products: optP } = optimizeAllOffersForAgents(services, products, {
      businessName,
      audience: buyer,
    })

    if (optS) {
      setServices(optS)
      setServicesOffers(parseOfferLines(optS))
    }
    if (optP) {
      setProducts(optP)
      setProductsOffers(parseOfferLines(optP))
    }
  }

  function rewriteServicesForAgents() {
    const businessName = name || 'This business'
    const buyer = audience || 'qualified buyers'
    const { services: optS } = optimizeAllOffersForAgents(services, '', { businessName, audience: buyer })
    if (optS) {
      setServices(optS)
      setServicesOffers(parseOfferLines(optS))
    }
  }

  function rewriteProductsForAgents() {
    const businessName = name || 'This business'
    const buyer = audience || 'qualified buyers'
    const { products: optP } = optimizeAllOffersForAgents('', products, { businessName, audience: buyer })
    if (optP) {
      setProducts(optP)
      setProductsOffers(parseOfferLines(optP))
    }
  }

  async function handleCsvFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const imported = parseAgentCsv(await file.text())

      if (!imported.rowCount) {
        setImportMessage('No importable rows found in that CSV.')
        return
      }

      if (!name && imported.page.name) setName(imported.page.name)
      if (!slug && imported.page.slug) setSlug(imported.page.slug)
      if (!description && imported.page.description) setDescription(imported.page.description)
      if (!websiteUrl && imported.page.websiteUrl) setWebsiteUrl(imported.page.websiteUrl)
      if (!ctaUrl && imported.page.ctaUrl) setCtaUrl(imported.page.ctaUrl)
      if ((!ctaLabel || ctaLabel === 'Visit website') && imported.page.ctaLabel) setCtaLabel(imported.page.ctaLabel)
      if (!audience && imported.page.audience) setAudience(imported.page.audience)
      if (!location && imported.page.location) setLocation(imported.page.location)
      if (!contactEmail && imported.page.contactEmail) setContactEmail(imported.page.contactEmail)

      setServices((current) => mergeLines(current, imported.services))
      setProducts((current) => mergeLines(current, imported.products))
      setFaqs((current) => mergeLines(current, imported.faqs))

      // Phase 1 A: Keep rich state in sync after CSV import
      if (imported.services?.length) setServicesOffers(parseOfferLines(mergeLines(services, imported.services)))
      if (imported.products?.length) setProductsOffers(parseOfferLines(mergeLines(products, imported.products)))

      setImportMessage(
        `Imported ${imported.services.length} services, ${imported.products.length} products, and ${imported.faqs.length} FAQs from ${file.name}.`,
      )
      setStep(2)
    } catch (error) {
      setImportMessage(error instanceof Error ? error.message : 'Could not import that CSV.')
    } finally {
      event.target.value = ''
    }
  }

  function openCsvUpload() {
    fileInputRef.current?.click()
  }

  async function importFromStripe() {
    if (!stripeInput.trim()) {
      setImportMessage('Enter a Stripe Product ID (prod_...) or comma-separated Price IDs (price_...).')
      return
    }
    setStripeImporting(true)
    setImportMessage('')

    try {
      const isProduct = stripeInput.trim().startsWith('prod_')
      const res = await fetch('/api/integrations/stripe/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(
          isProduct ? { productId: stripeInput.trim() } : { priceIds: stripeInput.trim() }
        ),
      })
      const data = await res.json()

      if (!res.ok) {
        setImportMessage(data.error || 'Stripe import failed.')
        return
      }

      if (data.lines?.length) {
        setServices((current) => mergeLines(current, data.lines))
        setImportMessage(`Imported ${data.count} offer(s) from Stripe. Review and adjust in Step 2.`)
        setStripeImportOpen(false)
        setStripeInput('')
        if (step < 2) setStep(2)
      } else {
        setImportMessage('No importable prices found for that ID.')
      }
    } catch (e: any) {
      setImportMessage(e.message || 'Network error during Stripe import.')
    } finally {
      setStripeImporting(false)
    }
  }

  async function importFromCalendly() {
    if (!calendlyToken.trim()) {
      setImportMessage('Please paste your Calendly Personal Access Token.')
      return
    }
    setCalendlyImporting(true)
    setImportMessage('')

    try {
      const res = await fetch('/api/integrations/calendly/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: calendlyToken.trim() }),
      })
      const data = await res.json()

      if (!res.ok) {
        setImportMessage(data.error || 'Calendly import failed.')
        return
      }

      if (data.structuredOffers?.length) {
        // Phase 3: Prefer rich OfferItem[] directly into the VisualOfferBuilder (high fidelity)
        setServicesOffers((current) => [...current, ...data.structuredOffers])
        setImportMessage(`Imported ${data.count} Calendly event types as editable offers.`)
        setCalendlyImportOpen(false)
        setCalendlyToken('')
        if (step < 2) setStep(2)
      } else if (data.lines?.length) {
        // Legacy fallback
        setServices((current) => mergeLines(current, data.lines))
        setImportMessage(`Imported ${data.count} Calendly event types as bookable offers.`)
        setCalendlyImportOpen(false)
        setCalendlyToken('')
        if (step < 2) setStep(2)
      } else {
        setImportMessage(data.message || 'No active event types found.')
      }
    } catch (e: any) {
      setImportMessage(e.message || 'Network error during Calendly import.')
    } finally {
      setCalendlyImporting(false)
    }
  }

  if (publishedSlug) {
    return (
      <main className="min-h-screen bg-[#090b10] text-white">
        <div className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center px-6 text-center">
          <div className="mb-6 flex size-14 items-center justify-center rounded-lg bg-[var(--ready)] text-zinc-950">
            <Check className="size-7" />
          </div>
          <h1 className="text-4xl font-semibold tracking-tight">Agent page is live</h1>
          <p className="mt-4 max-w-xl text-zinc-300">
            Nexez opened the live agent page in a separate tab and kept your workspace here
            so you can continue editing, test it with agents, or configure settings.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <a href={agentRuntimeUrl(`/${publishedSlug}`)} target="_blank" rel="noreferrer" className="rounded-lg bg-white px-5 py-3 text-sm font-medium text-zinc-950 hover:bg-zinc-200">
              Open public page
            </a>
            <a href={appUrl('/dashboard')} className="rounded-lg border border-white/15 px-5 py-3 text-sm font-medium text-white hover:bg-white/10">
              Continue in dashboard
            </a>
          </div>
        </div>
      </main>
    )
  }

  return (
    <ErrorBoundary>
    <main className="min-h-screen bg-[#0A0A0F] text-white">
      {needsAuth && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="card w-full max-w-md !p-7 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--signal)] to-[var(--ready)] text-lg font-bold text-[#0A0A0F]">N</div>
            <h2 className="mt-4 text-2xl font-semibold">Create a free account to publish</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              Your page is saved. Sign in or create an account to publish it and unlock your dashboard, analytics, and custom domains.
            </p>
            <div className="mt-6 flex flex-col gap-2">
              <a href="/login?mode=signup&next=/create" className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-gradient-to-r from-[var(--signal)] to-[var(--ready)] px-5 font-medium text-[#0A0A0F] hover:opacity-90">
                Create account
              </a>
              <a href="/login?next=/create" className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-white/15 px-5 text-sm font-medium text-white hover:bg-white/5">
                I already have an account — sign in
              </a>
              <button type="button" onClick={() => setNeedsAuth(false)} className="mt-1 text-xs text-zinc-500 hover:text-zinc-300">
                Keep editing
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="mx-auto max-w-6xl px-6 py-8">
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={handleCsvFile}
          className="hidden"
        />

        <div className="card !p-8 border border-[var(--signal)]/40">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-[var(--signal)]/20 bg-[var(--signal)]/10 px-3 py-1 text-xs font-medium text-[var(--signal)]">
                <Wand2 className="size-3.5" />
                Guided AI Page Import
              </div>
              <h3 className="mt-4 text-2xl font-semibold">Turn an existing site into a Nexez draft</h3>
              <p className="mt-2 text-sm leading-6 text-[#9CA3AF]">
                Paste a product, services, pricing, or booking page. Add a little context so Nexez knows what to extract and which action agents should prioritize.
              </p>
            </div>
            <div className="grid min-w-0 gap-2 rounded-lg border border-white/10 bg-white/[0.03] p-4 text-xs text-zinc-400 sm:grid-cols-3 lg:w-[420px]">
              <span className="inline-flex items-center gap-2"><Globe2 className="size-4 text-[var(--signal)]" /> Crawl site</span>
              <span className="inline-flex items-center gap-2"><Bot className="size-4 text-[var(--signal)]" /> Fill fields</span>
              <span className="inline-flex items-center gap-2"><CheckCircle2 className="size-4 text-[var(--ready)]" /> Review draft</span>
            </div>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="space-y-4">
              <Field label="Business page URL">
                <input
                  type="url"
                  value={importUrl}
                  onChange={(event) => setImportUrl(event.target.value)}
                  placeholder="https://yourwebsite.com/services"
                  className={inputClass}
                />
              </Field>

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Best-fit buyer">
                  <input
                    value={guidedBuyer}
                    onChange={(event) => setGuidedBuyer(event.target.value)}
                    placeholder="e.g. founders booking strategy help"
                    className={inputClass}
                  />
                </Field>
                <Field label="Preferred action">
                  <select
                    value={guidedGoal}
                    onChange={(event) => setGuidedGoal(event.target.value)}
                    className={inputClass}
                  >
                    <option>Book appointments</option>
                    <option>Request quotes or proposals</option>
                    <option>Buy products</option>
                    <option>Contact sales</option>
                    <option>Capture qualified leads</option>
                  </select>
                </Field>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Offer focus">
                  <input
                    value={guidedFocus}
                    onChange={(event) => setGuidedFocus(event.target.value)}
                    placeholder="e.g. retainers, audits, coaching"
                    className={inputClass}
                  />
                </Field>
                <Field label="What to ignore">
                  <input
                    value={guidedNotes}
                    onChange={(event) => setGuidedNotes(event.target.value)}
                    placeholder="e.g. skip blogs or freebies"
                    className={inputClass}
                  />
                </Field>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={guidedImporting}
                  onClick={() => runGuidedImport()}
                  className="inline-flex items-center gap-2 rounded-lg bg-[var(--signal)] px-5 py-3 font-semibold text-zinc-950 hover:bg-[var(--signal)] disabled:opacity-60"
                >
                  {guidedImporting ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
                  {guidedImporting ? 'Analyzing...' : 'Generate draft'}
                </button>
                {guidedReview ? (
                  <button
                    type="button"
                    onClick={() => {
                      setGuidedReview(null)
                      setSelectedImportOffers({})
                      setGuidedAnswers({})
                      setShowAllGuidedOffers(false)
                      setImportMessage('')
                    }}
                    className={secondaryButton}
                  >
                    <X className="mr-2 inline size-4" />
                    Clear review
                  </button>
                ) : null}
              </div>
            </div>

            <div className="rounded-lg border border-white/10 bg-black/20 p-4">
              <p className="text-sm font-medium text-zinc-200">Draft quality</p>
              <div className="mt-4 grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
                <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
                  <p className="text-lg font-semibold text-white">{guidedReview?.structuredOffers?.length ?? 0}</p>
                  <p className="mt-1 text-[10px] uppercase tracking-wider text-zinc-500">Offers</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
                  <p className="text-lg font-semibold text-white">{guidedReview?.pagesAnalyzed ?? 0}</p>
                  <p className="mt-1 text-[10px] uppercase tracking-wider text-zinc-500">Pages</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
                  <p className="text-lg font-semibold text-white">{guidedReview?.confidence ? `${Math.round(guidedReview.confidence * 100)}%` : '--'}</p>
                  <p className="mt-1 text-[10px] uppercase tracking-wider text-zinc-500">Confidence</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
                  <p className="text-lg font-semibold text-white">{guidedReview?.readiness ? `${guidedReview.readiness.score}%` : '--'}</p>
                  <p className="mt-1 text-[10px] uppercase tracking-wider text-zinc-500">Readiness</p>
                </div>
              </div>
              <p className="mt-4 text-xs leading-5 text-zinc-500">
                {guidedReview
                  ? guidedAiStatusMessage(guidedReview)
                  : 'Run an import to see detected offers, field suggestions, and review notes before anything is applied.'}
              </p>
            </div>
          </div>

          {guidedReview ? (
            <div className="mt-6 rounded-lg border border-[var(--signal)]/20 bg-[var(--signal)]/[0.06] p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-lg font-semibold text-white">{guidedReview.suggestedPage?.name || 'Imported draft'}</h4>
                    <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs text-zinc-300">
                      {selectedGuidedOfferCount} selected
                    </span>
                  </div>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-300">
                    {guidedReview.suggestedPage?.description || guidedReview.message}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={applyGuidedImport}
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-white px-5 py-3 text-sm font-semibold text-zinc-950 hover:bg-zinc-200"
                >
                  <Check className="size-4" />
                  Apply to builder
                </button>
              </div>

              {guidedReview.structuredOffers?.length ? (
                <div className="mt-5">
                  <div className="mb-3 flex flex-col gap-3 rounded-lg border border-white/10 bg-black/20 p-3 text-xs text-zinc-400 sm:flex-row sm:items-center sm:justify-between">
                    <span>
                      Showing {showAllGuidedOffers ? 'all' : `first ${guidedOfferRows.length} of`} {guidedReview.structuredOffers.length} detected offers.
                      {' '}All selected offers will be applied{hiddenGuidedOfferCount ? ', including hidden ones' : ''}.
                    </span>
                    {guidedReview.structuredOffers.length > 8 ? (
                      <button
                        type="button"
                        onClick={() => setShowAllGuidedOffers((value) => !value)}
                        className="inline-flex shrink-0 items-center justify-center rounded-md border border-white/15 px-3 py-1.5 font-medium text-zinc-100 hover:border-[var(--signal)]/40 hover:text-[var(--signal)]"
                      >
                        {showAllGuidedOffers ? 'Show top 8' : `Show all ${guidedReview.structuredOffers.length}`}
                      </button>
                    ) : null}
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    {guidedOfferRows.map(({ offer, index }) => {
                      const key = offerImportKey(offer, index)
                      return (
                        <label key={key} className="flex cursor-pointer gap-3 rounded-lg border border-white/10 bg-black/25 p-3 hover:border-[var(--signal)]/30">
                          <input
                            type="checkbox"
                            checked={!!selectedImportOffers[key]}
                            onChange={(event) => {
                              setSelectedImportOffers((current) => ({ ...current, [key]: event.target.checked }))
                            }}
                            className="mt-1 size-4 accent-[var(--signal)]"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center justify-between gap-3">
                              <span className="truncate text-sm font-medium text-white">{offer.name}</span>
                              <span className="shrink-0 text-xs text-[var(--signal)]">{offer.price || 'Custom'}</span>
                            </span>
                            <span className="mt-1 block line-clamp-2 text-xs leading-5 text-zinc-400">{offer.description}</span>
                            <span className="mt-2 flex flex-wrap gap-2 text-[10px] uppercase tracking-wider text-zinc-500">
                              <span>{Math.round((offer.confidence || 0.7) * 100)}% confidence</span>
                              {offerProvenanceLabel(offer) ? <span>{offerProvenanceLabel(offer)}</span> : null}
                            </span>
                          </span>
                        </label>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <div className="mt-5 flex items-start gap-3 rounded-lg border border-[var(--amber)]/20 bg-[var(--amber)]/10 p-4 text-sm text-[var(--amber)]">
                  <AlertCircle className="mt-0.5 size-4" />
                  No structured offers were detected. Apply the page details, then add offers manually in the builder.
                </div>
              )}

              {guidedReview.clarifyingQuestions?.length ? (
                <div className="mt-5 rounded-lg border border-[var(--signal)]/20 bg-[var(--signal)]/[0.06] p-4">
                  <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-[var(--signal)]">
                    <HelpCircle className="size-4" />
                    Questions to tighten the draft
                  </p>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    {guidedReview.clarifyingQuestions.map((item) => (
                      <div key={item.id} className="rounded-lg border border-white/10 bg-black/20 p-3">
                        <p className="text-sm font-medium text-white">{item.question}</p>
                        <p className="mt-1 text-xs leading-5 text-zinc-400">{item.why}</p>
                        <textarea
                          aria-label={`Answer: ${item.question}`}
                          value={guidedAnswers[item.id] || ''}
                          onChange={(event) => {
                            setGuidedAnswers((current) => ({ ...current, [item.id]: event.target.value }))
                          }}
                          className="mt-3 min-h-20 w-full rounded-lg border border-white/10 bg-white/[0.05] px-3 py-2 text-sm text-white placeholder:text-zinc-600 outline-none transition focus:border-[var(--signal)]/50"
                          placeholder="Answer..."
                        />
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs text-zinc-500">
                      {answeredGuidedQuestions.length} answered
                    </p>
                    <button
                      type="button"
                      onClick={refineGuidedImport}
                      disabled={guidedImporting || !answeredGuidedQuestions.length}
                      className="inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--signal)]/30 px-4 py-2 text-sm font-semibold text-[var(--signal)] hover:border-[var(--signal)] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {guidedImporting ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
                      Refine draft
                    </button>
                  </div>
                </div>
              ) : null}

              {guidedReview.readiness?.gaps?.length ? (
                <div className="mt-5 rounded-lg border border-white/10 bg-black/20 p-4">
                  <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">Readiness gaps</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {guidedReview.readiness.gaps.map((gap) => (
                      <span key={gap} className="rounded-full border border-[var(--amber)]/20 bg-[var(--amber)]/10 px-3 py-1 text-xs text-[var(--amber)]">
                        {gap}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              {guidedReview.sources?.length ? (
                <div className="mt-5 rounded-lg border border-white/10 bg-black/20 p-4">
                  <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">Sources checked</p>
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    {guidedReview.sources.slice(0, 8).map((source) => (
                      <a
                        key={`${source.type}-${source.url}`}
                        href={source.url}
                        target="_blank"
                        className="min-w-0 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-zinc-300 hover:border-[var(--signal)]/30"
                      >
                        <span className="block truncate font-medium text-zinc-100">{source.label}</span>
                        <span className="mt-1 block truncate text-zinc-500">{source.method}</span>
                      </a>
                    ))}
                  </div>
                </div>
              ) : null}

              {guidedReview.reviewNotes?.length ? (
                <div className="mt-5 rounded-lg border border-white/10 bg-black/20 p-4">
                  <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">Review notes</p>
                  <ul className="mt-3 space-y-2 text-sm text-zinc-300">
                    {guidedReview.reviewNotes.map((note) => (
                      <li key={note} className="flex gap-2">
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[var(--signal)]" />
                        <span>{note}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <section className="mx-auto mt-10 max-w-4xl text-center">
          <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight">Build your Nexez Agent Page</h1>
          <p className="mt-4 text-zinc-400">Create a clean, AI-optimized page for your products and services — designed so agents can discover, understand, and buy.</p>
        </section>

        <div className="card mt-10 max-w-5xl overflow-hidden">
          <div className="border-b border-white/10 p-6">
            <Progress step={step} />
            <div className="mt-5 flex items-center justify-between">
              <h2 className="text-2xl font-semibold">
                {step === 1 ? 'Business Basics' : step === 2 ? 'Add Offers (Visual Builder + Templates)' : 'Agent Preview & Publish'}
              </h2>
              <p className="text-sm text-zinc-400">Step {step} of 3</p>
            </div>
          </div>

          <div className="grid gap-0 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="p-6">
              {step === 1 ? (
                <div className="space-y-5">
                  <Field label="Business Name">
                    <input
                      value={name}
                      onChange={(event) => {
                        setName(event.target.value)
                        if (!slug) setSlug(normalizeSlug(event.target.value))
                      }}
                      className={inputClass}
                      placeholder="e.g. John Doe's Consulting"
                      required
                    />
                  </Field>
                  <div>
                    <p className="text-sm font-medium text-zinc-200 mb-1">Logo (optional)</p>
                    <div className="flex gap-2">
                      <input
                        value={logoUrl}
                        onChange={(e) => setLogoUrl(e.target.value)}
                        placeholder="https://your-site.com/logo.png (or leave empty)"
                        className="flex-1 rounded border border-white/15 bg-black/30 px-3 py-2 text-sm"
                      />
                      {logoUrl && (
                        <button
                          type="button"
                          onClick={() => setLogoUrl('')}
                          className="rounded border border-red-400/40 px-2 text-xs text-red-300 hover:bg-red-400/10"
                          title="Remove logo"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                    <p className="mt-1 text-[10px] text-zinc-500">Public image URL (auto-filled on site import). Or set/upload file later in Settings → Branding.</p>
                  </div>
                  <Field label="Short Description">
                    <textarea value={description} onChange={(event) => setDescription(event.target.value)} className={textareaClass} placeholder="Tell us about your business" />
                  </Field>
                  <Field label="Industry or niche">
                    <input
                      list="nexez-industry-suggestions"
                      aria-label="Industry or niche"
                      value={industry}
                      onChange={(e) => setIndustry(e.target.value)}
                      className={inputClass}
                      placeholder="Start typing, e.g. AI consulting"
                      autoComplete="off"
                    />
                    <datalist id="nexez-industry-suggestions">
                      {NEXEZ_INDUSTRIES.map((ind) => (
                        <option key={ind} value={ind} />
                      ))}
                    </datalist>
                    <p className="mt-1.5 text-xs text-zinc-500">
                      Type a category or exact niche.
                    </p>
                  </Field>
                  <div className="grid gap-3 md:grid-cols-3">
                    <button
                      className={secondaryButton}
                      type="button"
                      onClick={() => setStripeImportOpen(!stripeImportOpen)}
                    >
                      Import Stripe
                    </button>
                    <button
                      className={secondaryButton}
                      type="button"
                      onClick={() => setCalendlyImportOpen(!calendlyImportOpen)}
                    >
                      Import Calendly
                    </button>
                    <button className={secondaryButton} type="button" onClick={openCsvUpload}>Upload CSV</button>
                  </div>

                  {stripeImportOpen && (
                    <div className="card !p-4 border border-[var(--signal)]/30">
                      <p className="text-sm font-medium text-[var(--signal)]">Stripe Product or Price Import</p>
                      <p className="mt-1 text-xs text-zinc-400">
                        Paste a Stripe product ID or one or more price IDs. Stripe imports must be enabled for this workspace.
                      </p>
                      <div className="mt-3 flex gap-2">
                        <input
                          value={stripeInput}
                          onChange={(e) => setStripeInput(e.target.value)}
                          placeholder="Product ID or Price ID"
                          className="flex-1 rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 text-sm text-white placeholder:text-zinc-600"
                        />
                        <button
                          type="button"
                          onClick={importFromStripe}
                          disabled={stripeImporting || !stripeInput.trim()}
                          className="rounded-lg bg-[var(--signal)] px-4 py-2 text-sm font-medium text-zinc-950 disabled:opacity-50"
                        >
                          {stripeImporting ? 'Importing...' : 'Import'}
                        </button>
                      </div>
                      <p className="mt-2 text-[10px] text-zinc-500">Results appear in the Services field. You can edit pricing and descriptions after import.</p>
                    </div>
                  )}

                  {calendlyImportOpen && (
                    <div className="card !p-4 border border-[var(--signal)]/30">
                      <p className="text-sm font-medium text-[var(--signal)]">Calendly Bookings Import</p>
                      <p className="mt-1 text-xs text-zinc-400">
                        Paste a Calendly Personal Access Token. We&apos;ll import your active event types as rich editable offers (duration + direct booking URL included).
                      </p>
                      <div className="mt-3 flex gap-2">
                        <input
                          value={calendlyToken}
                          onChange={(e) => setCalendlyToken(e.target.value)}
                          placeholder="Calendly Personal Access Token (starts with ghp_...)"
                          className="flex-1 rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 text-sm text-white placeholder:text-zinc-600"
                          type="password"
                        />
                        <button
                          type="button"
                          onClick={importFromCalendly}
                          disabled={calendlyImporting || !calendlyToken.trim()}
                          className="rounded-lg bg-[var(--signal)] px-4 py-2 text-sm font-medium text-zinc-950 disabled:opacity-50"
                        >
                          {calendlyImporting ? 'Importing...' : 'Import'}
                        </button>
                      </div>
                      <p className="mt-2 text-[10px] text-zinc-500">
                        Get your token at <a href="https://calendly.com/integrations/api_webhooks" target="_blank" className="underline">Calendly Integrations</a>. Imported offers will appear in Services.
                      </p>
                    </div>
                  )}
                  <div className="rounded-lg border border-white/10 bg-black/20 p-4 text-sm text-zinc-400">
                    <p>
                      CSV import supports rows with type, name, price, description, URL, question, answer, audience,
                      and location columns.
                    </p>
                    <a
                      href={sampleCsvHref}
                      download="nexez-agent-page-sample.csv"
                      className="mt-3 inline-flex text-[var(--signal)] hover:text-[var(--signal)]"
                    >
                      Download sample CSV
                    </a>
                  </div>
                  {importMessage ? (
                    <p className="rounded-lg border border-[var(--signal)]/20 bg-[var(--signal)]/10 p-3 text-sm text-[var(--signal)]">
                      {importMessage}
                    </p>
                  ) : null}
                  <button onClick={aiFill} className="w-full rounded-lg bg-[var(--signal)] px-5 py-3 font-semibold text-zinc-950 hover:bg-[var(--signal)]" type="button">
                    Agent Optimize
                  </button>
                </div>
              ) : null}

              {step === 2 ? (
                <div className="space-y-5">
                  {/* Phase 1 A: Visual Builder is now primary in create (matches editor + roadmap) */}
                  <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs uppercase tracking-widest text-[var(--signal)]">Services</p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const bn = name || 'This business'
                            const aud = audience || 'qualified buyers'
                            const enhanced = servicesOffers.map(o => ({
                              ...o,
                              description: enhanceDescriptionForAgents(o.description || '', bn, aud)
                            }))
                            setServicesOffers(enhanced)
                            setServices(formatOfferLines(enhanced))
                          }}
                          className="text-[10px] rounded border border-[var(--signal)]/40 px-2 py-0.5 text-[var(--signal)] hover:bg-[var(--signal)]/10"
                        >
                          Enhance All
                        </button>
                        {industry && (
                          <button
                            type="button"
                            onClick={() => {
                              // Light industry-aware suggestions (Phase 1 A)
                              const suggestions = getIndustrySuggestions(industry)
                              const combined = [...servicesOffers, ...suggestions.filter(s => 
                                !servicesOffers.some(e => e.name.toLowerCase() === s.name.toLowerCase())
                              )]
                              setServicesOffers(combined)
                              setServices(formatOfferLines(combined))
                            }}
                            className="text-[10px] rounded border border-[var(--signal)]/40 px-2 py-0.5 text-[var(--signal)] hover:bg-[var(--signal)]/10"
                          >
                            Suggest {industry.split(' ')[0]}
                          </button>
                        )}
                      </div>
                    </div>
                    <VisualOfferBuilder
                      offers={parsedServices}
                      kind="services"
                      businessName={name}
                      audience={audience}
                      onChange={(newOffers) => {
                        setServicesOffers(newOffers)
                        setServices(formatOfferLines(newOffers))
                      }}
                    />
                  </div>

                  <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
                    <p className="mb-3 text-xs uppercase tracking-widest text-[var(--signal)]">Products</p>
                    <VisualOfferBuilder
                      offers={parsedProducts}
                      kind="products"
                      businessName={name}
                      audience={audience}
                      onChange={(newOffers) => {
                        setProductsOffers(newOffers)
                        setProducts(formatOfferLines(newOffers))
                      }}
                    />

                    {/* Co-Pilot integration in create wizard */}
                    <div className="mt-3">
                      <AICoPilot
                        businessName={name}
                        audience={audience}
                        servicesOffers={servicesOffers}
                        productsOffers={productsOffers}
                        onApplyServices={(text, offers) => { setServicesOffers(offers); setServices(text) }}
                        onApplyProducts={(text, offers) => { setProductsOffers(offers); setProducts(text) }}
                        onTrackUse={() => {}}
                        llmOptIn={false}
                      />
                    </div>
                  </div>

                  {importMessage ? (
                    <p className="rounded-lg border border-[var(--signal)]/20 bg-[var(--signal)]/10 p-3 text-sm text-[var(--signal)]">
                      {importMessage}
                    </p>
                  ) : null}

                  <div className="grid gap-5 md:grid-cols-2">
                    <Field label="Main website">
                      <input type="url" value={websiteUrl} onChange={(event) => setWebsiteUrl(event.target.value)} className={inputClass} placeholder="https://example.com" />
                    </Field>
                    <Field label="Booking or checkout URL">
                      <input type="url" value={ctaUrl} onChange={(event) => setCtaUrl(event.target.value)} className={inputClass} placeholder="https://example.com/book" />
                    </Field>
                  </div>

                  {/* Legacy raw text kept for CSV / power users (advanced) */}
                  <details className="group">
                    <summary className="cursor-pointer text-xs text-zinc-400 hover:text-zinc-200">Advanced: raw format</summary>
                    <div className="mt-3 space-y-4">
                      <Field label="Services (raw text)">
                        <textarea value={services} onChange={(event) => { setServices(event.target.value); setServicesOffers(parseOfferLines(event.target.value)) }} className={textareaClass} />
                      </Field>
                      <Field label="Products (raw text)">
                        <textarea value={products} onChange={(event) => { setProducts(event.target.value); setProductsOffers(parseOfferLines(event.target.value)) }} className={textareaClass} />
                      </Field>
                      <div className="flex flex-wrap gap-3">
                        <button type="button" onClick={openCsvUpload} className={secondaryButton}>Import CSV</button>
                        <a href={sampleCsvHref} download="nexez-agent-page-sample.csv" className={secondaryButton}>Sample CSV</a>
                      </div>
                    </div>
                  </details>

                  <div className="flex flex-wrap gap-3">
                    <button type="button" onClick={optimizeOfferCopy} className={secondaryButton}>Optimize Offers</button>
                    <button type="button" onClick={rewriteServicesForAgents} className={secondaryButton}>Rewrite Services</button>
                    <button type="button" onClick={rewriteProductsForAgents} className={secondaryButton}>Rewrite Products</button>
                  </div>
                </div>
              ) : null}

              {step === 3 ? (
                <div className="space-y-5">
                  <div className="rounded-lg border border-[var(--ready)]/20 bg-[var(--ready)]/10 p-5">
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="size-8 text-[var(--ready)]" />
                      <div>
                        <h3 className="text-xl font-semibold">Agent parse check</h3>
                        <p className="text-sm text-zinc-400">{score}% crawler-ready.</p>
                      </div>
                    </div>
                  </div>
                  <ReadinessChecklist criteria={readinessCriteria} score={score} />
                  <div className="grid gap-5 md:grid-cols-2">
                    <Field label="Public slug">
                      <input value={slug} onChange={(event) => setSlug(normalizeSlug(event.target.value))} className={inputClass} />
                    </Field>
                    <Field label="CTA label">
                      <input value={ctaLabel} onChange={(event) => setCtaLabel(event.target.value)} className={inputClass} />
                    </Field>
                  </div>
                  <div className="grid gap-5 md:grid-cols-2">
                    <Field label="Best-fit buyer">
                      <input value={audience} onChange={(event) => setAudience(event.target.value)} className={inputClass} placeholder="Founders booking strategy help" />
                    </Field>
                    <Field label="Location or service area">
                      <input value={location} onChange={(event) => setLocation(event.target.value)} className={inputClass} placeholder="Remote, US, Austin" />
                    </Field>
                  </div>
                  <Field label="Contact email">
                    <input type="email" value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} className={inputClass} placeholder="sales@example.com" />
                  </Field>
                  <Field label="FAQs, one per line: question | answer">
                    <textarea value={faqs} onChange={(event) => setFaqs(event.target.value)} className={textareaClass} placeholder="Can agents book directly? | Yes, use the booking URL on this page." />
                  </Field>
                  <button type="button" onClick={aiFill} className="w-full rounded-lg bg-[var(--signal)] px-5 py-3 font-semibold text-zinc-950 hover:bg-[var(--signal)]">
                    Fill Agent Context
                  </button>
                </div>
              ) : null}
            </div>

            <aside className="border-t border-white/10 bg-black/20 p-6 lg:border-l lg:border-t-0">
              <h3 className="text-xl font-semibold">Live Preview</h3>
              <div className="mt-5 rounded-lg border border-white/10 bg-[#111620] p-5">
                <div className="mb-5 flex size-10 items-center justify-center rounded-lg bg-[var(--signal)]/20 text-[var(--signal)]">
                  <Bot className="size-5" />
                </div>
                <h4 className="text-2xl font-semibold">{name || 'Strategy Session'}</h4>
                <p className="mt-3 text-sm leading-6 text-zinc-400">{description || 'Agent summary preview.'}</p>
                <div className="mt-5 space-y-2 text-sm text-zinc-300">
                  {[...parsedServices, ...parsedProducts].slice(0, 3).map((offer, index) => (
                    <div key={`${offer.name}-${index}`} className="flex justify-between rounded-md bg-white/5 px-3 py-2">
                      <span>{offer.name || 'Untitled offer'}</span>
                      <span className="text-[var(--signal)]">{offer.price}</span>
                    </div>
                  ))}
                </div>
                <button type="button" className="mt-5 w-full rounded-lg bg-[var(--signal)] px-4 py-3 font-semibold text-zinc-950">
                  {ctaLabel || 'Book Now'}
                </button>
              </div>

              <div className="mt-5 rounded-lg border border-white/10 bg-black/30 p-4">
                <p className="text-sm font-medium text-zinc-200">Agent sees</p>
                <pre className="mt-3 whitespace-pre-wrap text-xs leading-5 text-zinc-400">
{`Name: ${name || 'Not set'}
URL: ${AGENT_RUNTIME_HOST}/${previewSlug || 'your-slug'}
Offers: ${parsedProducts.length + parsedServices.length}
Buyer: ${audience || 'Not set'}
Action: ${ctaLabel || 'Visit website'}`}
                </pre>
              </div>
            </aside>
          </div>

          <div className="flex items-center justify-between border-t border-white/10 p-6">
            <button onClick={() => setStep(Math.max(1, step - 1))} disabled={step === 1} className={secondaryButton} type="button">
              Back
            </button>
            {step < 3 ? (
              <button onClick={() => setStep(Math.min(3, step + 1))} className="inline-flex items-center gap-2 rounded-lg bg-[var(--signal)] px-5 py-3 font-semibold text-zinc-950 hover:bg-[var(--signal)]" type="button">
                Next
                <ArrowRight className="size-4" />
              </button>
            ) : (
              <button onClick={() => handleSubmit()} disabled={loading || !name || !previewSlug || !description || !websiteUrl} className="inline-flex items-center gap-2 rounded-lg bg-white px-5 py-3 font-semibold text-zinc-950 hover:bg-zinc-200 disabled:opacity-60" type="button">
                {loading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                {loading ? 'Publishing...' : 'Publish agent page'}
              </button>
            )}
          </div>
          {publishError && (
            <div className="mt-3 rounded-lg border border-[var(--amber)]/40 bg-[var(--amber)]/10 px-4 py-3 text-sm text-[var(--amber)]">
              <p>{publishError}</p>
              {draftOffer && (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => handleSubmit({ asDraft: true })}
                    disabled={loading}
                    className="inline-flex items-center gap-1.5 rounded-md bg-[var(--amber)]/20 px-3 py-1.5 text-xs font-medium text-[var(--amber)] hover:bg-[var(--amber)]/30 disabled:opacity-50"
                  >
                    {loading ? <Loader2 className="size-3.5 animate-spin" /> : null}
                    {loading ? 'Saving…' : 'Save as draft'}
                  </button>
                  <a href={appUrl('/dashboard/billing?plan=pro')} className="text-xs font-medium underline hover:no-underline">
                    Upgrade to publish more
                  </a>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
    </ErrorBoundary>
  )
}

function Progress({ step }: { step: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
      {[1, 2, 3].map((item) => (
        <div key={item} className="flex items-center gap-3">
          <div className={`flex size-7 items-center justify-center rounded-full text-xs font-semibold ${item <= step ? 'bg-[var(--signal)] text-zinc-950' : 'bg-zinc-700 text-zinc-300'}`}>
            {item < step ? <Check className="size-4" /> : item}
          </div>
          <div className={`h-1 flex-1 rounded-full ${item <= step ? 'bg-[var(--signal)]' : 'bg-zinc-700'}`} />
        </div>
      ))}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-zinc-200">{label}</span>
      {children}
    </label>
  )
}

function offerImportKey(offer: OfferItem, index: number) {
  return `${offer.name || 'offer'}-${offer.price || 'custom'}-${index}`
}

function offerProvenanceLabel(offer: OfferItem) {
  const provenance = offer.metadata?.provenance as { label?: string; method?: string } | undefined
  if (provenance?.label) return provenance.label
  if (offer.source) return offer.source.replace(/_/g, ' ')
  return ''
}

function guidedAiStatusMessage(review: GuidedImportReview) {
  const status = review.aiStatus
  if (!status) {
    return review.aiAssisted
      ? 'AI extraction contributed to this draft. Review pricing and links before publishing.'
      : 'Deterministic import completed. Add an LLM key later for messy sites.'
  }

  if (status.used) {
    return `AI extraction used ${status.model}. Review pricing and links before publishing.`
  }

  if (status.configured && status.attempted) {
    return `AI checked the page, then deterministic import produced the draft. ${status.reason}`
  }

  if (status.configured) {
    return 'AI is configured, but deterministic import handled this page.'
  }

  return 'Deterministic import completed. Add an LLM key later for messy sites.'
}

function openPendingPublicPageTab(): Window | null {
  if (typeof window === 'undefined' || typeof window.open !== 'function') return null

  const tab = window.open('', '_blank')
  if (!tab) return null

  try {
    tab.opener = null
    tab.document.title = 'Publishing Nexez page...'
    tab.document.body.innerHTML = '<main style="min-height:100vh;display:grid;place-items:center;background:#090b10;color:white;font-family:system-ui,sans-serif"><p>Publishing your Nexez agent page...</p></main>'
  } catch {
    // Some browsers restrict access to the blank tab. It can still be redirected.
  }

  return tab
}

function sendPublicPageTab(tab: Window | null, path: string) {
  if (typeof window === 'undefined') return
  const publicUrl = new URL(path, agentRuntimeUrl('/')).toString()

  if (tab && !tab.closed) {
    tab.location.href = publicUrl
    return
  }

  window.open(publicUrl, '_blank', 'noopener,noreferrer')
}

function closePendingPublicPageTab(tab: Window | null) {
  try {
    if (tab && !tab.closed) tab.close()
  } catch {
    // Nothing to clean up if the browser already closed or isolated the tab.
  }
}

const inputClass =
  'w-full rounded-lg border border-white/10 bg-white/[0.06] px-4 py-3 text-white placeholder:text-zinc-600 outline-none transition focus:border-[var(--signal)]/60'

const textareaClass =
  'min-h-28 w-full rounded-lg border border-white/10 bg-white/[0.06] px-4 py-3 text-white placeholder:text-zinc-600 outline-none transition focus:border-[var(--signal)]/60'

const secondaryButton =
  'rounded-lg border border-white/15 px-5 py-3 text-sm font-medium text-white hover:bg-white/10 disabled:opacity-40'

function mergeLines(current: string, importedLines: string[]) {
  if (!importedLines.length) return current
  return [current, importedLines.join('\n')].filter(Boolean).join('\n')
}
