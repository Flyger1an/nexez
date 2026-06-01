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
  parseFaqLines,
  parseOfferLines,
} from '../../lib/agent-page'
import {
  enhanceDescriptionForAgents,
  generateAgentSummary,
  generateStrongFaqs,
  optimizeAllOffersForAgents,
  rewriteOfferForAgents,
} from '../../lib/ai-optimize'
import { parseAgentCsv, sampleAgentCsv } from '../../lib/csv-import'
import { createClient } from '../../utils/supabase/client'

const serviceTargets = ['Consulting', 'Coaching', 'Bookings', 'Retainers', 'Memberships', 'Events', 'Products', 'Other']

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
  const [products, setProducts] = useState('')
  const [services, setServices] = useState('')
  const [faqs, setFaqs] = useState('')
  const [loading, setLoading] = useState(false)
  const [publishedSlug, setPublishedSlug] = useState('')
  const [importMessage, setImportMessage] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [stripeImportOpen, setStripeImportOpen] = useState(false)
  const [stripeInput, setStripeInput] = useState('')
  const [stripeImporting, setStripeImporting] = useState(false)

  const previewSlug = useMemo(() => normalizeSlug(slug || name), [name, slug])
  const sampleCsvHref = useMemo(() => `data:text/csv;charset=utf-8,${encodeURIComponent(sampleAgentCsv)}`, [])
  const parsedProducts = useMemo(() => parseOfferLines(products), [products])
  const parsedServices = useMemo(() => parseOfferLines(services), [services])
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
    const buyer = audience || 'buyers evaluating services'
    const actionUrl = ctaUrl || websiteUrl || 'https://example.com/book'
    const offerCount = parseOfferLines(services).length + parseOfferLines(products).length

    // Use the new strong agent-optimized generators
    const smartDesc = enhanceDescriptionForAgents(description, businessName, buyer)
    setDescription(smartDesc)

    if (!slug && name) setSlug(normalizeSlug(name))
    if (!ctaUrl && websiteUrl) setCtaUrl(websiteUrl)
    if (!ctaLabel || ctaLabel === 'Visit website') setCtaLabel('Book or request quote')

    if (!services && !products) {
      setServices(
        [
          `Strategy Session | $450 | 60-minute advisory session. Clear scope, recommendations, and next-step plan. Best for ${buyer.toLowerCase()}. | ${actionUrl}`,
          `Implementation Retainer | From $1,500/mo | Ongoing execution support after the initial session. Includes priority access and monthly reviews. | ${actionUrl}`,
        ].join('\n'),
      )
    }

    if (!faqs) {
      const strongFaqs = generateStrongFaqs(businessName, buyer, true)
      setFaqs(strongFaqs.map((f) => `${f.question} | ${f.answer}`).join('\n'))
    }

    // If we already have offers, rewrite them too
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

    if (optS) setServices(optS)
    if (optP) setProducts(optP)
  }

  function rewriteServicesForAgents() {
    const businessName = name || 'This business'
    const buyer = audience || 'qualified buyers'
    const { services: optS } = optimizeAllOffersForAgents(services, '', { businessName, audience: buyer })
    if (optS) setServices(optS)
  }

  function rewriteProductsForAgents() {
    const businessName = name || 'This business'
    const buyer = audience || 'qualified buyers'
    const { products: optP } = optimizeAllOffersForAgents('', products, { businessName, audience: buyer })
    if (optP) setProducts(optP)
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
        // Jump to offerings step
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

        <section className="mx-auto mt-10 max-w-4xl text-center">
          <h1 className="text-5xl font-semibold tracking-tight">Build your Nexez Agent Page</h1>
          <p className="mt-4 text-zinc-400">Create a clean, AI-optimized page for your products and services — designed so agents can discover, understand, and buy.</p>
        </section>

        <div className="mx-auto mt-10 max-w-5xl overflow-hidden rounded-lg border border-white/10 bg-white/[0.04]">
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
                    <p className="mb-3 text-sm font-medium text-zinc-200">Target Services</p>
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                      {serviceTargets.map((target, index) => (
                        <label key={target} className="flex items-center gap-2 text-sm text-zinc-300">
                          <input type="checkbox" defaultChecked={[0, 2, 6].includes(index)} className="size-4 accent-cyan-300" />
                          {target}
                        </label>
                      ))}
                    </div>
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
                    <button className={secondaryButton} type="button" onClick={openCsvUpload}>Upload CSV</button>
                  </div>

                  {stripeImportOpen && (
                    <div className="rounded-lg border border-cyan-300/30 bg-black/30 p-4">
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
                  <div className="grid grid-cols-2 rounded-lg bg-white/10 p-1">
                    <button className="rounded-md bg-cyan-300 px-4 py-2 font-medium text-zinc-950" type="button">Services</button>
                    <button className="rounded-md px-4 py-2 font-medium text-zinc-300" type="button">Products</button>
                  </div>
                  <Field label="Services, one per line: name | price | description | URL">
                    <textarea value={services} onChange={(event) => setServices(event.target.value)} className={textareaClass} placeholder="Strategy Session | $450 | 60-minute advisory session | https://example.com/book" />
                  </Field>
                  <div className="flex flex-wrap gap-3">
                    <button type="button" onClick={openCsvUpload} className={secondaryButton}>
                      Import CSV
                    </button>
                    <a href={sampleCsvHref} download="nexez-agent-page-sample.csv" className={secondaryButton}>
                      Sample CSV
                    </a>
                  </div>
                  {importMessage ? (
                    <p className="rounded-lg border border-cyan-300/20 bg-cyan-300/10 p-3 text-sm text-cyan-100">
                      {importMessage}
                    </p>
                  ) : null}
                  <Field label="Products, one per line: name | price | description | URL">
                    <textarea value={products} onChange={(event) => setProducts(event.target.value)} className={textareaClass} placeholder="Template Pack | $99 | AI-ready service templates | https://example.com/templates" />
                  </Field>
                  <div className="grid gap-5 md:grid-cols-2">
                    <Field label="Main website">
                      <input type="url" value={websiteUrl} onChange={(event) => setWebsiteUrl(event.target.value)} className={inputClass} placeholder="https://example.com" />
                    </Field>
                    <Field label="Booking or checkout URL">
                      <input type="url" value={ctaUrl} onChange={(event) => setCtaUrl(event.target.value)} className={inputClass} placeholder="https://example.com/book" />
                    </Field>
                  </div>
                  <button type="button" onClick={() => setServices(`${services}${services ? '\n' : ''}New Service | From $199 | Describe what buyers get | https://example.com`)} className="rounded-lg bg-cyan-300 px-5 py-3 font-semibold text-zinc-950 hover:bg-cyan-200">
                    Add Another Service
                  </button>
                  <button type="button" onClick={optimizeOfferCopy} className={secondaryButton}>
                    Optimize All Offers for Agents
                  </button>
                  <button type="button" onClick={rewriteServicesForAgents} className={secondaryButton}>
                    Rewrite Services for AI
                  </button>
                  <button type="button" onClick={rewriteProductsForAgents} className={secondaryButton}>
                    Rewrite Products for AI
                  </button>
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
  )
}

function Progress({ step }: { step: number }) {
  return (
    <div className="grid grid-cols-3 gap-3">
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
