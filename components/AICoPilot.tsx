'use client'

import React, { useMemo, useState } from 'react'
import { Sparkles, Check, X } from 'lucide-react'
import { OfferItem } from '../lib/agent-page'
import {
  optimizeAllOffersForAgents,
  enhanceDescriptionForAgents,
  suggestPricingTiers,
  suggestSchemaImprovements,
  suggestEnhancedFAQs,
  generateStrongFaqs,
  rewriteForVoiceSync as rewriteForVoice,
} from '../lib/ai-optimize'

type CoPilotProps = {
  businessName: string
  audience: string
  servicesOffers: OfferItem[]
  productsOffers: OfferItem[]
  onApplyServices: (newText: string, newOffers: OfferItem[]) => void
  onApplyProducts: (newText: string, newOffers: OfferItem[]) => void
  onTrackUse: () => void
  llmOptIn?: boolean  // from page llm_opt_in flag for hook
  pageId?: string     // for per-page LLM opt-in check in /api/ai/enhance
}

export function AICoPilot({
  businessName,
  audience,
  servicesOffers,
  productsOffers,
  onApplyServices,
  onApplyProducts,
  onTrackUse,
  llmOptIn = false,
  pageId,
}: CoPilotProps) {
  const [activeTab, setActiveTab] = useState<'desc' | 'pricing' | 'faq' | 'schema' | 'voice' | 'memory' | 'trust' | 'competitor'>('desc')
  const [applied, setApplied] = useState<Record<string, boolean>>({})
  const [usageCount, setUsageCount] = useState(0)
  const [localMessage, setLocalMessage] = useState('')

  const allOffers = [...servicesOffers, ...productsOffers]
  const hasContent = allOffers.length > 0

  const pricingSuggestion = useMemo(() => suggestPricingTiers(allOffers), [allOffers])
  const schemaTips = useMemo(() => suggestSchemaImprovements({ services: servicesOffers, products: productsOffers, description: '', faqs: [] }), [servicesOffers, productsOffers])
  const enhancedFaqs = useMemo(() => suggestEnhancedFAQs(businessName, audience, allOffers), [businessName, audience, allOffers])

  async function applyDescriptionEnhance(kind: 'services' | 'products') {
    const current = kind === 'services' ? servicesOffers : productsOffers

    let enhanced: OfferItem[]

    if (llmOptIn && pageId) {
      // Wire real LLM via the enhance API (respects page llm_opt_in + LLM_API_KEY)
      try {
        const first = current[0]
        if (first) {
          const res = await fetch('/api/ai/enhance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              description: first.description || '',
              businessName,
              audience,
              pageId,
            }),
          })
          const data = await res.json()
          if (data?.enhanced) {
            enhanced = current.map((o, i) => i === 0 ? { ...o, description: data.enhanced } : o)
            // For simplicity, enhance only the first; bulk would need per-offer calls or a batch endpoint.
          } else {
            // fallback
            enhanced = current.map(o => ({
              ...o,
              description: enhanceDescriptionForAgents(o.description || '', businessName, audience),
            }))
          }
        } else {
          enhanced = current
        }
      } catch {
        // fallback on error
        enhanced = current.map(o => ({
          ...o,
          description: enhanceDescriptionForAgents(o.description || '', businessName, audience),
        }))
      }
    } else {
      enhanced = current.map(o => ({
        ...o,
        description: enhanceDescriptionForAgents(o.description || '', businessName, audience),
      }))
    }

    const text = enhanced.map(o => `${o.name} | ${o.price} | ${o.description} | ${o.url || ''}`).join('\n')

    if (kind === 'services') onApplyServices(text, enhanced)
    else onApplyProducts(text, enhanced)

    onTrackUse()
    setUsageCount(c => c + 1)
    setApplied(prev => ({ ...prev, [`desc-${kind}`]: true }))
  }

  function applyPricingTiers() {
    if (!allOffers.length) return
    // Smarter: apply example tiers to first service + first product if present (preserves full OfferItem fidelity)
    let changed = false
    const newServices = servicesOffers.map((o, i) => {
      if (i === 0) { changed = true; return { ...o, tiers: pricingSuggestion.exampleTiers } }
      return o
    })
    const newProducts = productsOffers.map((o, i) => {
      if (i === 0 && !changed) { changed = true; return { ...o, tiers: pricingSuggestion.exampleTiers } }
      return o
    })
    const textS = newServices.map(o => `${o.name} | ${o.price} | ${o.description} | ${o.url || ''} ||TIERS||${JSON.stringify(o.tiers || [])}`).join('\n')
    if (newServices.length !== servicesOffers.length || changed) {
      onApplyServices(textS, newServices)
    }
    const textP = newProducts.map(o => `${o.name} | ${o.price} | ${o.description} | ${o.url || ''} ||TIERS||${JSON.stringify(o.tiers || [])}`).join('\n')
    if (newProducts.length !== productsOffers.length || (productsOffers.length && changed)) {
      onApplyProducts(textP, newProducts)
    }
    onTrackUse()
    setUsageCount(c => c + 1)
    setApplied(prev => ({ ...prev, pricing: true }))
  }

  async function copyToClipboard(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text)
      setLocalMessage(`Copied ${label} to clipboard. Paste into FAQ editor or schema notes.`)
    } catch {
      // fallback
      alert(label + ':\n\n' + text)
    }
    onTrackUse()
    setUsageCount(c => c + 1)
  }

  function applyFaqs() {
    const faqText = enhancedFaqs.map(f => `${f.question} | ${f.answer}`).join('\n')
    copyToClipboard(faqText, 'suggested FAQs')
    setApplied(prev => ({ ...prev, faq: true }))
  }

  function applySchemaTip() {
    const schemaText = schemaTips.join('\n• ')
    copyToClipboard(schemaText, 'schema tips')
    setApplied(prev => ({ ...prev, schema: true }))
  }

  const showMsg = localMessage || ''

  if (!hasContent) {
    return <div className="text-sm text-zinc-500">Add offers for Co-Pilot.</div>
  }

  return (
    <div className="rounded-xl border border-[#7C3AED]/30 bg-[#1A1625] p-4">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="size-4 text-[var(--signal)]" />
        <span className="font-semibold text-[var(--signal)]">AI Co-Pilot</span>
        <span className="ml-auto text-[10px] text-zinc-500">Before/after • Uses: {usageCount} {llmOptIn ? '• LLM enabled' : ''}</span>
      </div>

      {showMsg && <div className="mb-2 text-xs text-[var(--ready)]">{showMsg}</div>}

      <div className="flex gap-2 mb-4 text-xs flex-wrap">
        {(['desc', 'pricing', 'faq', 'schema', 'voice', 'memory', 'trust', 'competitor'] as const).map(t => (
          <button key={t} onClick={() => setActiveTab(t)} className={`px-3 py-1 rounded text-xs ${activeTab === t ? 'bg-[#7C3AED] text-white' : 'border border-white/20'}`}>
            {t === 'desc' ? 'Descriptions' : t === 'pricing' ? 'Pricing Tiers' : t === 'faq' ? 'FAQs' : t === 'schema' ? 'Schema' : t === 'voice' ? 'Voice' : t === 'memory' ? 'Memory' : t === 'trust' ? 'Trust' : 'Competitor'}
          </button>
        ))}
      </div>

      {activeTab === 'desc' && (
        <div className="grid md:grid-cols-2 gap-4 text-sm">
          <div>
            <div className="uppercase tracking-widest text-xs text-zinc-400 mb-1">Current (first few)</div>
            <div className="bg-black/40 p-2 rounded text-xs overflow-auto max-h-28 space-y-1">
              {servicesOffers.slice(0,2).map((o,i) => <div key={i}><span className="text-zinc-500">{o.name}:</span> {o.description}</div>)}
              {productsOffers.slice(0,1).map((o,i) => <div key={'p'+i}><span className="text-zinc-500">{o.name}:</span> {o.description}</div>)}
            </div>
          </div>
          <div>
            <div className="uppercase tracking-widest text-xs text-[var(--ready)] mb-1">AI Enhanced</div>
            <div className="text-xs text-zinc-400">Adds fit + CTA clarity.</div>
            <div className="mt-2 flex gap-2">
              <button onClick={() => applyDescriptionEnhance('services')} className="text-xs rounded border border-[var(--ready)]/40 px-2 py-1 hover:bg-[var(--ready)]/10">Apply Services</button>
              <button onClick={() => applyDescriptionEnhance('products')} className="text-xs rounded border border-[var(--ready)]/40 px-2 py-1 hover:bg-[var(--ready)]/10">Apply Products</button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'pricing' && (
        <div>
          <div className="text-sm">{pricingSuggestion.suggestion}</div>
          <pre className="mt-2 bg-black/40 p-2 text-xs overflow-auto">{JSON.stringify(pricingSuggestion.exampleTiers, null, 2)}</pre>
          <button onClick={applyPricingTiers} className="mt-2 text-xs rounded bg-[var(--ready)] px-3 py-1 text-zinc-950">Apply tiers</button>
          <div className="mt-1 text-[10px] text-zinc-500">Edit further in builder.</div>
        </div>
      )}

      {activeTab === 'faq' && (
        <div>
          <div className="text-xs text-zinc-400 mb-1">Suggested FAQs:</div>
          <ul className="text-xs space-y-1">
            {enhancedFaqs.slice(0, 4).map((f, i) => <li key={i}>• {f.question} — {f.answer}</li>)}
          </ul>
          <button onClick={applyFaqs} className="mt-2 text-xs rounded border border-white/20 px-3 py-1">Copy FAQs</button>
          {applied.faq && <span className="ml-2 text-[10px] text-[var(--ready)]">Copied ✓</span>}
        </div>
      )}

      {activeTab === 'schema' && (
        <div>
          <ul className="text-xs space-y-1">
            {schemaTips.map((t, i) => <li key={i}>• {t}</li>)}
          </ul>
          <button onClick={applySchemaTip} className="mt-2 text-xs rounded border border-white/20 px-3 py-1">Copy schema tips</button>
          {applied.schema && <span className="ml-2 text-[10px] text-[var(--ready)]">Copied ✓</span>}
        </div>
      )}

      {activeTab === 'voice' && (
        <div>
          <div className="text-xs text-zinc-400 mb-2">Voice-agent rewrite.</div>
          <div className="text-sm bg-black/30 p-2 rounded mb-2">
            Before: {(allOffers[0]?.description || '—').slice(0, 80)}
          </div>
          <div className="text-sm bg-[var(--ready)]/10 p-2 rounded mb-2">
            Voice: {allOffers[0] ? rewriteForVoice(allOffers[0], businessName).description.slice(0, 100) : 'Add offers'}
          </div>
          <button onClick={() => {
            if (!allOffers.length) return
            const voiced = rewriteForVoice(allOffers[0], businessName)
            const newS = servicesOffers.map((o, i) => i === 0 ? voiced : o)
            const text = newS.map(o => `${o.name} | ${o.price} | ${o.description} | ${o.url || ''}`).join('\n')
            onApplyServices(text, newS)
            onTrackUse()
            setUsageCount(c => c + 1)
            setApplied(prev => ({ ...prev, voice: true }))
          }} className="text-xs rounded bg-[var(--ready)] px-3 py-1 text-zinc-950">Apply Voice Rewrite</button>
          {applied.voice && <span className="ml-2 text-xs text-[var(--ready)]">Applied ✓ (edit further in builder)</span>}
          <div className="mt-2 text-[10px] text-zinc-500">Voice-safe copy.</div>
        </div>
      )}

      {activeTab === 'memory' && (
        <div>
          <div className="text-xs text-zinc-400 mb-2">Agent memory suggestions (persistent context).</div>
          <div className="text-sm bg-black/30 p-2 rounded mb-2">Use Settings → Agent Memory to edit LLM-suggested notes. Auto on publish if opt-in.</div>
          <button onClick={() => {
            onTrackUse()
            setApplied(prev => ({ ...prev, memory: true }))
          }} className="text-xs rounded bg-[var(--ready)] px-3 py-1 text-zinc-950">View/Edit in Settings</button>
        </div>
      )}

      {activeTab === 'trust' && (
        <div>
          <div className="text-xs text-zinc-400 mb-2">Trust score insights.</div>
          <div className="text-sm bg-black/30 p-2 rounded mb-2">Current: strongest when your page is verified and receiving real activity. See Analytics for the full report.</div>
          <button onClick={() => {
            onTrackUse()
            setApplied(prev => ({ ...prev, trust: true }))
          }} className="text-xs rounded bg-[var(--ready)] px-3 py-1 text-zinc-950">Generate in Analytics</button>
        </div>
      )}

      {activeTab === 'competitor' && (
        <div>
          <div className="text-xs text-zinc-400 mb-2">Competitor analysis.</div>
          <div className="text-sm bg-black/30 p-2 rounded mb-2">Compare your page against another website for scores and AI recommendations.</div>
          <a href="/dashboard/competitors" className="text-xs rounded bg-[var(--ready)] px-3 py-1 text-zinc-950 inline-block">Open Analyzer →</a>
        </div>
      )}

      <div className="mt-3 text-[10px] text-zinc-500">
        {llmOptIn ? 'Advanced AI assist is enabled for this page.' : 'Advanced AI assist is off for this page.'}
      </div>
    </div>
  )
}
