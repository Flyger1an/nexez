'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ExternalLink, Loader2, Play, Save } from 'lucide-react'
import {
  AgentPage,
  formatFaqLines,
  formatOfferLines,
  getReadinessScore,
  normalizeSlug,
  parseFaqLines,
  parseOfferLines,
} from '../../../lib/agent-page'
import { optimizeAllOffersForAgents, enhanceDescriptionForAgents } from '../../../lib/ai-optimize'
import { VisualOfferBuilder } from '../../../components/VisualOfferBuilder'
import { createClient } from '../../../utils/supabase/client'

type PageProps = {
  params: Promise<{ id: string }>
}

export default function EditAgentPage({ params }: PageProps) {
  const [id, setId] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [page, setPage] = useState<AgentPage | null>(null)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [description, setDescription] = useState('')
  const [websiteUrl, setWebsiteUrl] = useState('')
  const [ctaUrl, setCtaUrl] = useState('')
  const [ctaLabel, setCtaLabel] = useState('')
  const [audience, setAudience] = useState('')
  const [location, setLocation] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [products, setProducts] = useState('')
  const [services, setServices] = useState('')
  const [faqs, setFaqs] = useState('')

  // Visual builder state (synced with text fields)
  const parsedServices = React.useMemo(() => parseOfferLines(services), [services])
  const parsedProducts = React.useMemo(() => parseOfferLines(products), [products])
  const [isPublished, setIsPublished] = useState(true)

  useEffect(() => {
    params.then(({ id }) => setId(id))
  }, [params])

  useEffect(() => {
    if (!id) return
    loadPage(id)
  }, [id])

  const score = useMemo(
    () =>
      getReadinessScore({
        name,
        slug,
        description,
        website_url: websiteUrl,
        cta_url: ctaUrl,
        audience,
        location,
        contact_email: contactEmail,
        products: parseOfferLines(products),
        services: parseOfferLines(services),
        faqs: parseFaqLines(faqs),
        is_published: isPublished,
      }),
    [audience, contactEmail, ctaUrl, description, faqs, isPublished, location, name, products, services, slug, websiteUrl],
  )

  async function loadPage(pageId: string) {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      window.location.href = `/login?next=/dashboard/${pageId}`
      return
    }

    const { data, error } = await supabase
      .from('pages')
      .select('*')
      .eq('id', pageId)
      .eq('owner_id', user.id)
      .single<AgentPage>()

    if (error || !data) {
      setMessage('Page not found, or you do not have access to edit it.')
      setLoading(false)
      return
    }

    setPage(data)
    setName(data.name)
    setSlug(data.slug)
    setDescription(data.description ?? '')
    setWebsiteUrl(data.website_url ?? '')
    setCtaUrl(data.cta_url ?? '')
    setCtaLabel(data.cta_label ?? 'Visit website')
    setAudience(data.audience ?? '')
    setLocation(data.location ?? '')
    setContactEmail(data.contact_email ?? '')
    setProducts(formatOfferLines(data.products))
    setServices(formatOfferLines(data.services))
    setFaqs(formatFaqLines(data.faqs))
    setIsPublished(data.is_published)
    setLoading(false)
  }

  function optimizeOffersWithAI() {
    const businessName = name || 'This business'
    const buyer = audience || 'qualified buyers'
    const { services: optS, products: optP } = optimizeAllOffersForAgents(services, products, {
      businessName,
      audience: buyer,
    })
    if (optS) setServices(optS)
    if (optP) setProducts(optP)
    setMessage('Offers rewritten for AI agents (local high-quality rules).')
  }

  function enhanceDescriptionWithAI() {
    const businessName = name || 'This business'
    const buyer = audience || 'buyers evaluating services'
    const improved = enhanceDescriptionForAgents(description, businessName, buyer)
    setDescription(improved)
    setMessage('Description enhanced for agent readability.')
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!page) return

    setSaving(true)
    setMessage('')

    const supabase = createClient()
    const { error } = await supabase
      .from('pages')
      .update({
        name,
        slug: normalizeSlug(slug || name),
        description,
        website_url: websiteUrl,
        cta_url: ctaUrl || websiteUrl,
        cta_label: ctaLabel || 'Visit website',
        audience,
        location,
        contact_email: contactEmail,
        products: parseOfferLines(products),
        services: parseOfferLines(services),
        faqs: parseFaqLines(faqs),
        is_published: isPublished,
      })
      .eq('id', page.id)

    setSaving(false)
    setMessage(error ? error.message : 'Saved.')
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-950 text-white">
        Loading editor...
      </main>
    )
  }

  if (!page) {
    return (
      <main className="min-h-screen bg-zinc-950 px-6 py-12 text-white">
        <div className="mx-auto max-w-2xl">
          <a href="/dashboard" className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white">
            <ArrowLeft className="size-4" />
            Dashboard
          </a>
          <p className="mt-10 rounded-lg border border-white/10 bg-white/[0.04] p-6 text-zinc-300">
            {message || 'Page not found.'}
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#0A0A0F] text-white">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-center">
          <a href="/dashboard" className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white">
            <ArrowLeft className="size-4" />
            Dashboard
          </a>
          <div className="flex flex-wrap gap-3">
            <a
              href={`/dashboard/${page.id}/test`}
              className="inline-flex w-fit items-center gap-2 rounded-lg border border-cyan-300/40 px-4 py-2 text-sm text-cyan-100 hover:bg-cyan-300/10"
            >
              Test with agents
              <Play className="size-4" />
            </a>
            <a
              href={`/${page.slug}`}
              className="inline-flex w-fit items-center gap-2 rounded-lg border border-white/15 px-4 py-2 text-sm text-white hover:bg-white/10"
            >
              View public page
              <ExternalLink className="size-4" />
            </a>
          </div>
        </div>

        <div className="mt-10 grid gap-8 lg:grid-cols-[0.75fr_1.25fr]">
          <aside>
            <h1 className="text-4xl font-semibold tracking-tight">Edit agent page</h1>
            <p className="mt-4 text-zinc-400">
              Tighten the facts an AI buyer needs. The readiness score updates as you fill in the page.
            </p>
            <div className="mt-6 rounded-lg border border-white/10 bg-white/[0.04] p-5">
              <p className="text-sm text-zinc-500">AI readiness</p>
              <p className="mt-2 text-4xl font-semibold">{score}%</p>
              <div className="mt-4 h-2 rounded-full bg-white/10">
                <div className="h-full rounded-full bg-cyan-300" style={{ width: `${score}%` }} />
              </div>
            </div>
          </aside>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid gap-5 md:grid-cols-2">
              <Field label="Business or offer name">
                <input value={name} onChange={(event) => setName(event.target.value)} className={inputClass} required />
              </Field>
              <Field label="Public slug">
                <input value={slug} onChange={(event) => setSlug(normalizeSlug(event.target.value))} className={inputClass} required />
              </Field>
            </div>

            <Field label="Short AI summary">
              <textarea value={description} onChange={(event) => setDescription(event.target.value)} className={textareaClass} required />
              <button
                type="button"
                onClick={enhanceDescriptionWithAI}
                className="mt-2 rounded-lg border border-cyan-300/40 px-3 py-1 text-xs text-cyan-200 hover:bg-cyan-300/10"
              >
                Enhance for AI agents
              </button>
            </Field>

            <div className="grid gap-5 md:grid-cols-2">
              <Field label="Main website">
                <input type="url" value={websiteUrl} onChange={(event) => setWebsiteUrl(event.target.value)} className={inputClass} required />
              </Field>
              <Field label="Purchase or booking URL">
                <input type="url" value={ctaUrl} onChange={(event) => setCtaUrl(event.target.value)} className={inputClass} />
              </Field>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <Field label="CTA label">
                <input value={ctaLabel} onChange={(event) => setCtaLabel(event.target.value)} className={inputClass} />
              </Field>
              <Field label="Best-fit buyer">
                <input value={audience} onChange={(event) => setAudience(event.target.value)} className={inputClass} />
              </Field>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <Field label="Location or service area">
                <input value={location} onChange={(event) => setLocation(event.target.value)} className={inputClass} />
              </Field>
              <Field label="Contact email">
                <input type="email" value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} className={inputClass} />
              </Field>
            </div>

            {/* Visual Drag & Drop Builder - Core of the new Nexez vision */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-zinc-200">Visual Builder (Drag & Drop + Templates)</p>
                <button
                  type="button"
                  onClick={optimizeOffersWithAI}
                  className="rounded-lg border border-cyan-300/40 px-3 py-1 text-xs text-cyan-200 hover:bg-cyan-300/10"
                >
                  AI Optimize All
                </button>
              </div>

              <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
                <p className="mb-3 text-xs uppercase tracking-widest text-cyan-300">Services</p>
                <VisualOfferBuilder
                  offers={parsedServices}
                  kind="services"
                  onChange={(newOffers) => {
                    const lines = newOffers.map(o => [o.name, o.price, o.description, o.url].join(' | ')).join('\n')
                    setServices(lines)
                  }}
                />
              </div>

              <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
                <p className="mb-3 text-xs uppercase tracking-widest text-cyan-300">Products</p>
                <VisualOfferBuilder
                  offers={parsedProducts}
                  kind="products"
                  onChange={(newOffers) => {
                    const lines = newOffers.map(o => [o.name, o.price, o.description, o.url].join(' | ')).join('\n')
                    setProducts(lines)
                  }}
                />
              </div>
            </div>

            {/* Legacy text view (kept for power users / CSV import compatibility) */}
            <details className="group">
              <summary className="cursor-pointer text-xs text-zinc-400 hover:text-zinc-200">Show raw text format (advanced)</summary>
              <div className="mt-3 space-y-4">
                <Field label="Products (raw text)">
                  <textarea value={products} onChange={(event) => setProducts(event.target.value)} className={textareaClass} />
                </Field>
                <Field label="Services (raw text)">
                  <textarea value={services} onChange={(event) => setServices(event.target.value)} className={textareaClass} />
                </Field>
              </div>
            </details>

            <Field label="FAQs, one per line: question | answer">
              <textarea value={faqs} onChange={(event) => setFaqs(event.target.value)} className={textareaClass} />
            </Field>

            <label className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.04] p-4 text-sm text-zinc-200">
              <input
                type="checkbox"
                checked={isPublished}
                onChange={(event) => setIsPublished(event.target.checked)}
                className="size-4 accent-cyan-300"
              />
              Published and visible to crawlers
            </label>

            {message ? <p className="rounded-lg border border-white/10 bg-black/30 p-3 text-sm text-zinc-300">{message}</p> : null}

            <button
              type="submit"
              disabled={saving}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-white px-5 py-3 font-medium text-zinc-950 hover:bg-zinc-200 disabled:opacity-60"
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              {saving ? 'Saving...' : 'Save changes'}
            </button>
          </form>
        </div>
      </div>
    </main>
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
