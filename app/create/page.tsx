'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  Loader2,
  Sparkles,
  Upload,
} from 'lucide-react'
import {
  getReadinessScore,
  normalizeSlug,
  OfferItem,
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
import { createClient } from '../../utils/supabase/client'
import { VisualOfferBuilder } from '../../components/VisualOfferBuilder'
import { ErrorBoundary } from '../../components/ErrorBoundary'

const industries = [
  // Professional / Business Services
  'Consulting & Strategy',
  'Coaching & Training',
  'Creative & Design',
  'Legal & Professional Services',
  'Marketing & Sales',
  // Consumer / Local Bookable Services
  'Home Services (Plumbing, Electrical, Cleaning, etc.)',
  'Wellness & Fitness (Massage, Personal Training, Yoga, etc.)',
  'Beauty & Personal Care',
  'Automotive Services',
  'Pet Care & Services',
  'Health & Medical',
  'Events & Experiences',
  'Other Local Services',
]

// Light industry-aware suggestions (Phase 1 A)
function getIndustrySuggestions(industry: string): OfferItem[] {
  const ind = industry.toLowerCase()
  const base = { url: '' }
  if (ind.includes('plumb') || ind.includes('home') || ind.includes('electrical')) {
    return [
      { ...base, name: 'Standard Service Call', price: 'From $129', description: 'Diagnosis + minor repair. Includes basic parts.', duration: '60 min', isMobile: true, serviceArea: 'Local metro' },
      { ...base, name: 'Emergency Visit', price: '$189', description: 'Same-day response for urgent issues.', duration: '60-90 min', isMobile: true },
    ]
  }
  if (ind.includes('massage') || ind.includes('wellness') || ind.includes('fitness')) {
    return [
      { ...base, name: '60-Minute Deep Tissue', price: '$110', description: 'Therapeutic massage with hot stones.', duration: '60 min', isMobile: true, travelFee: '$25' },
      { ...base, name: '90-Minute Signature Session', price: '$165', description: 'Full body therapeutic treatment.', duration: '90 min', isMobile: true },
    ]
  }
  if (ind.includes('clean')) {
    return [
      { ...base, name: 'Deep House Cleaning', price: '$189', description: 'Full top-to-bottom clean for 1-2 bedroom homes.', duration: '2-3 hours', isMobile: true },
    ]
  }
  if (ind.includes('groom') || ind.includes('pet')) {
    return [
      { ...base, name: 'Full Grooming Package', price: '$85', description: 'Bath, haircut, nail trim, ear cleaning.', duration: '90-120 min', isMobile: true },
    ]
  }
  if (ind.includes('detailing') || ind.includes('auto')) {
    return [
      { ...base, name: 'Mobile Car Detailing', price: 'From $149', description: 'Interior + exterior hand wash and detail.', duration: '2-3 hours', isMobile: true },
    ]
  }
  // Professional default
  return [
    { ...base, name: 'Discovery Session', price: '$150', description: '60-minute focused call with clear next steps.', duration: '60 min' },
    { ...base, name: 'Core Engagement', price: 'From $1,800', description: 'Full delivery with priority support.', duration: 'Ongoing' },
  ]
}

export default function CreatePage() {
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
  const [products, setProducts] = useState('')
  const [services, setServices] = useState('')
  const [faqs, setFaqs] = useState('')

  // Phase 1 A: Primary rich OfferItem[] state (mirrors editor). Direct structuredOffers from importer populates cards.
  const [servicesOffers, setServicesOffers] = useState<OfferItem[]>([])
  const [productsOffers, setProductsOffers] = useState<OfferItem[]>([])

  const [loading, setLoading] = useState(false)
  const [publishedSlug, setPublishedSlug] = useState('')
  const [importMessage, setImportMessage] = useState('')
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
  const score = getReadinessScore({
    name,
    slug: previewSlug,
    description,
    website_url: websiteUrl,
    cta_url: ctaUrl || websiteUrl,
    audience,
    location,
    contact_email: contactEmail,
    products: parsedProducts,
    services: parsedServices,
    faqs: parsedFaqs,
    is_published: true,
  })

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)

    if (params.get('import') === 'csv') {
      setStep(2)
      setImportMessage('Upload a CSV to import services, products, FAQs, and page context.')
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
          if (imported.services) setServices(imported.services)

          if (structured) {
            const offers: OfferItem[] = JSON.parse(structured)
            // Phase 1 A: Direct rich population from importer (no text roundtrip loss for cards)
            setServicesOffers(offers)
            // Keep text layer in sync for advanced view + any legacy paths
            setServices(formatOfferLines(offers))
          }

          setImportMessage('Page data loaded from website import. Review and customize below.')
          setStep(1)
          // Clean up storage
          sessionStorage.removeItem('nexez_imported_page')
          sessionStorage.removeItem('nexez_imported_structured')
        } catch (e) {
          console.error('Failed to load imported data')
        }
      }
    }
  }, [])

  const handleSubmit = async () => {
    setLoading(true)

    const supabase = createClient()
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      window.location.href = '/login?next=/create'
      return
    }

    const cleanSlug = normalizeSlug(slug || name)
    const { error } = await supabase.from('pages').insert({
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
      is_published: true,
    })

    setLoading(false)

    if (error) {
      alert('Error creating page: ' + error.message)
      return
    }

    setPublishedSlug(cleanSlug)
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
          <div className="mb-6 flex size-14 items-center justify-center rounded-lg bg-emerald-400 text-zinc-950">
            <Check className="size-7" />
          </div>
          <h1 className="text-4xl font-semibold tracking-tight">Agent page is live</h1>
          <p className="mt-4 max-w-xl text-zinc-300">
            Nexez published a crawlable page with structured business details, offers, FAQs,
            and agent-friendly summary content.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <a href={`/${publishedSlug}`} className="rounded-lg bg-white px-5 py-3 text-sm font-medium text-zinc-950 hover:bg-zinc-200">
              View page
            </a>
            <a href="/dashboard" className="rounded-lg border border-white/15 px-5 py-3 text-sm font-medium text-white hover:bg-white/10">
              Dashboard
            </a>
          </div>
        </div>
      </main>
    )
  }

  return (
    <ErrorBoundary>
    <main className="min-h-screen bg-[#0A0A0F] text-white">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={handleCsvFile}
          className="hidden"
        />
        <div className="flex items-center justify-between">
          <a href="/dashboard" className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white">
            <ArrowLeft className="size-4" />
            Dashboard
          </a>
          <div className="flex gap-3">
            <button className="rounded-lg border border-cyan-300/40 px-4 py-2 text-sm text-cyan-100 hover:bg-cyan-300/10">
              Import from Squarespace
            </button>
            <button className="rounded-lg border border-white/20 px-4 py-2 text-sm text-white hover:bg-white/10">
              Import from Wix
            </button>
          </div>
        </div>

        {/* Site Importer - Prominent first-class option */}
        <div className="card !p-8 mt-8 border border-[#7C3AED]/40">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center size-12 rounded-2xl bg-[#7C3AED]/20 text-[#7C3AED] mb-4">
              <Bot className="size-6" />
            </div>
            <h3 className="text-2xl font-semibold">Import from your existing website</h3>
            <p className="text-[#9CA3AF] mt-2 max-w-md mx-auto">
              Paste your current site and we’ll automatically extract your services and generate a ready-to-edit agent page.
            </p>
          </div>

          <div className="max-w-lg mx-auto flex gap-3">
            <input
              type="url"
              placeholder="https://yourwebsite.com"
              className="flex-1 input"
              id="site-importer-url"
            />
            <button
              type="button"
              disabled={loading}
              onClick={async () => {
                const input = document.getElementById('site-importer-url') as HTMLInputElement
                if (!input?.value) return

                // Phase 1 A: loading state while importing
                setLoading(true)

                const res = await fetch('/api/tools/import-site', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ url: input.value, industry }),
                })
                const data = await res.json()

                setLoading(false)

                if (data.suggestedPage) {
                  if (data.suggestedPage.name) setName(data.suggestedPage.name)
                  if (data.suggestedPage.description) setDescription(data.suggestedPage.description)
                  if (data.suggestedPage.website_url) setWebsiteUrl(data.suggestedPage.website_url)

                  if (data.structuredOffers && data.structuredOffers.length > 0) {
                    // Phase 1 A: Direct rich OfferItem[] to Visual Builder cards (primary path)
                    const rich: OfferItem[] = data.structuredOffers
                    setServicesOffers(rich)
                    setServices(formatOfferLines(rich))
                  } else if (data.suggestedPage.services) {
                    setServices(data.suggestedPage.services)
                  }

                  if (step < 2) setStep(2)

                  // Phase 1 A: richer success message with quality signals
                  if (data.structuredOffers?.length) {
                    const count = data.structuredOffers.length
                    const avgConf = data.structuredOffers.reduce((s: number, o: any) => s + (o.confidence || 0.7), 0) / count
                    const confPct = Math.round(avgConf * 100)
                    setImportMessage(
                      `Imported ${count} offers (${confPct}% avg confidence). Ready in the Visual Builder below.`
                    )
                  } else {
                    setImportMessage(data.message || 'Website imported successfully!')
                  }
                } else {
                  setImportMessage(data.error || 'Could not analyze that site. Try a different URL or enter offers manually.')
                  setLoading(false)
                }
              }}
              className="btn-primary"
            >
              Import & Generate
            </button>
          </div>
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
                  <div className="rounded-lg border border-dashed border-white/20 bg-black/20 p-5 text-center">
                    <p className="text-sm font-medium text-zinc-200">Logo</p>
                    <p className="mt-2 text-sm text-zinc-500">Drag and drop or click to upload</p>
                    <Upload className="mx-auto mt-3 size-5 text-zinc-500" />
                  </div>
                  <Field label="Short Description">
                    <textarea value={description} onChange={(event) => setDescription(event.target.value)} className={textareaClass} placeholder="Tell us about your business" />
                  </Field>
                  <div>
                    <p className="mb-3 text-sm font-medium text-zinc-200">What industry are you in?</p>
                    <select
                      value={industry}
                      onChange={(e) => setIndustry(e.target.value)}
                      className={inputClass}
                    >
                      <option value="">Select your primary industry...</option>
                      {industries.map((ind) => (
                        <option key={ind} value={ind}>{ind}</option>
                      ))}
                    </select>
                    <p className="mt-1.5 text-xs text-zinc-500">
                      This helps us suggest better templates and phrasing for your agent page.
                    </p>
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
                    <button
                      className={secondaryButton}
                      type="button"
                      onClick={() => {
                        setImportMessage('Calendly: Paste your scheduling link or event type details below (or use CSV for now — excellent results).')
                        setStep(2)
                      }}
                    >
                      Import Calendly
                    </button>
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
                    <div className="card !p-4 border border-cyan-300/30">
                      <p className="text-sm font-medium text-cyan-200">Stripe Product or Price Import</p>
                      <p className="mt-1 text-xs text-zinc-400">
                        Paste a <code>prod_</code> ID or one or more <code>price_</code> IDs (comma separated). Requires STRIPE_SECRET_KEY on the server.
                      </p>
                      <div className="mt-3 flex gap-2">
                        <input
                          value={stripeInput}
                          onChange={(e) => setStripeInput(e.target.value)}
                          placeholder="prod_XXXX or price_XXXX,price_YYYY"
                          className="flex-1 rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 text-sm text-white placeholder:text-zinc-600"
                        />
                        <button
                          type="button"
                          onClick={importFromStripe}
                          disabled={stripeImporting || !stripeInput.trim()}
                          className="rounded-lg bg-cyan-300 px-4 py-2 text-sm font-medium text-zinc-950 disabled:opacity-50"
                        >
                          {stripeImporting ? 'Importing...' : 'Import'}
                        </button>
                      </div>
                      <p className="mt-2 text-[10px] text-zinc-500">Results appear in the Services field. You can edit pricing and descriptions after import.</p>
                    </div>
                  )}

                  {calendlyImportOpen && (
                    <div className="card !p-4 border border-violet-300/30">
                      <p className="text-sm font-medium text-violet-200">Calendly Bookings Import</p>
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
                          className="rounded-lg bg-violet-300 px-4 py-2 text-sm font-medium text-zinc-950 disabled:opacity-50"
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
                      className="mt-3 inline-flex text-cyan-200 hover:text-cyan-100"
                    >
                      Download sample CSV
                    </a>
                  </div>
                  {importMessage ? (
                    <p className="rounded-lg border border-cyan-300/20 bg-cyan-300/10 p-3 text-sm text-cyan-100">
                      {importMessage}
                    </p>
                  ) : null}
                  <button onClick={aiFill} className="w-full rounded-lg bg-cyan-300 px-5 py-3 font-semibold text-zinc-950 hover:bg-cyan-200" type="button">
                    Agent Optimize
                  </button>
                </div>
              ) : null}

              {step === 2 ? (
                <div className="space-y-5">
                  {/* Phase 1 A: Visual Builder is now primary in create (matches editor + roadmap) */}
                  <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs uppercase tracking-widest text-cyan-300">Services</p>
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
                          className="text-[10px] rounded border border-cyan-300/40 px-2 py-0.5 text-cyan-300 hover:bg-cyan-300/10"
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
                            className="text-[10px] rounded border border-[#7C3AED]/40 px-2 py-0.5 text-[#C4B5FD] hover:bg-[#7C3AED]/10"
                          >
                            Suggest for {industry.split(' ')[0]}
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
                    <p className="mb-3 text-xs uppercase tracking-widest text-cyan-300">Products</p>
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

                    {/* Co-Pilot integration in create wizard (Tier 1) */}
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
                    <p className="rounded-lg border border-cyan-300/20 bg-cyan-300/10 p-3 text-sm text-cyan-100">
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
                    <summary className="cursor-pointer text-xs text-zinc-400 hover:text-zinc-200">Advanced: raw text format (CSV import, power users)</summary>
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
                    <button type="button" onClick={optimizeOfferCopy} className={secondaryButton}>Optimize All Offers for Agents</button>
                    <button type="button" onClick={rewriteServicesForAgents} className={secondaryButton}>Rewrite Services for AI</button>
                    <button type="button" onClick={rewriteProductsForAgents} className={secondaryButton}>Rewrite Products for AI</button>
                  </div>
                </div>
              ) : null}

              {step === 3 ? (
                <div className="space-y-5">
                  <div className="rounded-lg border border-emerald-300/20 bg-emerald-300/10 p-5">
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="size-8 text-emerald-300" />
                      <div>
                        <h3 className="text-xl font-semibold">Agent parse check</h3>
                        <p className="text-sm text-zinc-400">Your page is {score}% ready for crawlers and AI buyers.</p>
                      </div>
                    </div>
                  </div>
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
                  <button type="button" onClick={aiFill} className="w-full rounded-lg bg-cyan-300 px-5 py-3 font-semibold text-zinc-950 hover:bg-cyan-200">
                    Fill Missing Agent Context
                  </button>
                </div>
              ) : null}
            </div>

            <aside className="border-t border-white/10 bg-black/20 p-6 lg:border-l lg:border-t-0">
              <h3 className="text-xl font-semibold">Live Preview</h3>
              <div className="mt-5 rounded-lg border border-white/10 bg-[#111620] p-5">
                <div className="mb-5 flex size-10 items-center justify-center rounded-lg bg-cyan-300/20 text-cyan-200">
                  <Bot className="size-5" />
                </div>
                <h4 className="text-2xl font-semibold">{name || 'Strategy Session'}</h4>
                <p className="mt-3 text-sm leading-6 text-zinc-400">{description || 'A clear AI-readable summary will appear here.'}</p>
                <div className="mt-5 space-y-2 text-sm text-zinc-300">
                  {[...parsedServices, ...parsedProducts].slice(0, 3).map((offer, index) => (
                    <div key={`${offer.name}-${index}`} className="flex justify-between rounded-md bg-white/5 px-3 py-2">
                      <span>{offer.name || 'Untitled offer'}</span>
                      <span className="text-cyan-200">{offer.price}</span>
                    </div>
                  ))}
                </div>
                <button type="button" className="mt-5 w-full rounded-lg bg-cyan-300 px-4 py-3 font-semibold text-zinc-950">
                  {ctaLabel || 'Book Now'}
                </button>
              </div>

              <div className="mt-5 rounded-lg border border-white/10 bg-black/30 p-4">
                <p className="text-sm font-medium text-zinc-200">Agent sees</p>
                <pre className="mt-3 whitespace-pre-wrap text-xs leading-5 text-zinc-400">
{`Name: ${name || 'Not set'}
URL: nexez.vercel.app/${previewSlug || 'your-slug'}
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
              <button onClick={() => setStep(Math.min(3, step + 1))} className="inline-flex items-center gap-2 rounded-lg bg-cyan-300 px-5 py-3 font-semibold text-zinc-950 hover:bg-cyan-200" type="button">
                Next
                <ArrowRight className="size-4" />
              </button>
            ) : (
              <button onClick={handleSubmit} disabled={loading || !name || !previewSlug || !description || !websiteUrl} className="inline-flex items-center gap-2 rounded-lg bg-white px-5 py-3 font-semibold text-zinc-950 hover:bg-zinc-200 disabled:opacity-60" type="button">
                {loading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                {loading ? 'Publishing...' : 'Publish agent page'}
              </button>
            )}
          </div>
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
          <div className={`flex size-7 items-center justify-center rounded-full text-xs font-semibold ${item <= step ? 'bg-cyan-300 text-zinc-950' : 'bg-zinc-700 text-zinc-300'}`}>
            {item < step ? <Check className="size-4" /> : item}
          </div>
          <div className={`h-1 flex-1 rounded-full ${item <= step ? 'bg-cyan-300' : 'bg-zinc-700'}`} />
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

const inputClass =
  'w-full rounded-lg border border-white/10 bg-white/[0.06] px-4 py-3 text-white placeholder:text-zinc-600 outline-none transition focus:border-cyan-300/60'

const textareaClass =
  'min-h-28 w-full rounded-lg border border-white/10 bg-white/[0.06] px-4 py-3 text-white placeholder:text-zinc-600 outline-none transition focus:border-cyan-300/60'

const secondaryButton =
  'rounded-lg border border-white/15 px-5 py-3 text-sm font-medium text-white hover:bg-white/10 disabled:opacity-40'

function mergeLines(current: string, importedLines: string[]) {
  if (!importedLines.length) return current
  return [current, importedLines.join('\n')].filter(Boolean).join('\n')
}
