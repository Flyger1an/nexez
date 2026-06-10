/**
 * AI Optimization helpers for Nexez agent pages (lean MVP).
 *
 * These produce high-quality, agent-optimized copy using deterministic rules + templates.
 * They power the One-Click AI Optimize feature in the Nexez builder.
 *
 * The system also supports future multi-agent optimization and competitor analysis
 * as described in the Nexez vision.
 */

import type { OfferItem, FaqItem } from './agent-page'
import { parseOfferLines, formatOfferLines } from './agent-page'

export function rewriteOfferForAgents(offer: OfferItem, context?: { businessName?: string; audience?: string }): OfferItem {
  const name = (offer.name || 'Service').trim()
  const price = (offer.price || 'Custom quote').trim()
  const originalDesc = (offer.description || '').trim()
  const url = offer.url || ''

  // Agent-friendly rewrite principles:
  // - Lead with outcome / deliverable
  // - Explicit fit criteria (who this is for)
  // - Clear next step / what happens after
  // - Pricing transparency
  // - Scannable, factual, low-fluff

  let description = originalDesc

  if (!description || description.length < 20) {
    description = `${name} with clear scope and direct next-step action.`
  }

  // Consumer service friendly enhancements
  if (offer.duration || offer.serviceArea || offer.isMobile || offer.travelFee) {
    const details = []
    if (offer.duration) details.push(offer.duration)
    if (offer.serviceArea) details.push(`serves ${offer.serviceArea}`)
    if (offer.isMobile) details.push('mobile / on-site')
    if (offer.travelFee) details.push(`+ ${offer.travelFee} travel`)

    if (details.length) {
      description = `${description} ${details.join(' • ')}.`
    }
  }

  if (!description.includes('for') && !description.includes('who') && context?.audience) {
    description = `${description} Best for ${context.audience.toLowerCase()}.`
  }

  if (!description.toLowerCase().includes('book') && !description.toLowerCase().includes('schedule')) {
    description = `${description} Book directly via the link on this page.`
  }

  return {
    ...offer, // Phase 4 + full fidelity: preserve prefer_original_for_this, source, metadata, confidence, all consumer fields, tiers
    name,
    price,
    description: description.length > 180 ? description.slice(0, 177) + '...' : description,
    url,
  }
}

export function generateAgentSummary(businessName: string, audience: string, offerCount: number, location?: string | null): string {
  const who = audience || 'buyers evaluating services'
  const where = location ? ` in ${location}` : ''
  return `${businessName} helps ${who} quickly discover available services, compare options, understand pricing and fit, and take direct action${where}. This page is structured for AI agents and assistants to parse offers, answer questions, and route purchase intent.`
}

export function generateStrongFaqs(businessName: string, audience: string, hasPricing: boolean): FaqItem[] {
  const faqs: FaqItem[] = []

  faqs.push({
    question: 'Can an AI agent book or purchase directly from this page?',
    answer: 'Yes. Every offer includes a direct "Agent checkout" path or booking URL that agents can follow or present to the buyer.',
  })

  if (hasPricing) {
    faqs.push({
      question: 'Are prices final or starting points?',
      answer: 'Prices shown are transparent starting points or fixed for standard scope. Custom work is quoted after a short discovery conversation.',
    })
  }

  faqs.push({
    question: `Who is this best for?`,
    answer: audience || `${businessName} works best with clients who have a clear goal and are ready to move forward after understanding scope and next steps.`,
  })

  faqs.push({
    question: 'What information should I (or my buyer) provide?',
    answer: 'Business goal, timeline, budget range, and preferred contact method. The clearer the input, the faster we can propose the right package.',
  })

  if (businessName.length) {
    faqs.push({
      question: `How quickly can ${businessName} respond?`,
      answer: 'Most inquiries routed through this page receive a response or proposal within 1-2 business days.',
    })
  }

  return faqs
}

// Voice Agent Optimization - advanced LLM-powered (using the platform's configured LLM when llm_opt_in + key set, else high-quality deterministic).
// Makes descriptions phonetic, short, spoken-friendly (numbers as words, remove fluff, clear pauses, natural flow).
import { isLlmConfigured, llmComplete } from './llm'

export async function rewriteForVoice(offer: OfferItem, businessName: string, useLlm = false): Promise<OfferItem> {
  const base = { ...offer }

  if (useLlm && isLlmConfigured()) {
    try {
      const prompt = `Rewrite this offer description for voice AI agents (e.g. Siri, Alexa, voice assistants). Make it phonetic, concise, spoken naturally: spell out numbers and symbols, remove parentheticals and fluff, use short sentences, natural pauses. Keep all facts, pricing, actions intact. Business: ${businessName}. Original: "${offer.description || ''}"`
      const voiced = await llmComplete(prompt, { maxTokens: 200, temperature: 0.3 })
      if (voiced) {
        base.description = voiced.trim()
        return base
      }
    } catch (e) {
      // fall to deterministic
    }
  }

  // Deterministic high-quality fallback (always available)
  let desc = (offer.description || '').trim()
  if (desc.length > 140) desc = desc.substring(0, 137) + '...'
  desc = desc.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
  desc = desc.replace(/\b(\d+)\s*(min|minute|minutes|hr|hour|hours)\b/gi, '$1 $2')
    .replace(/\$(\d+)/g, '$1 dollars')
    .replace(/&/g, ' and ')
    .replace(/%/g, ' percent ')
    .replace(/\//g, ' or ')
  desc = desc.replace(/\s*\([^)]*\)/g, '')
  return {
    ...offer,
    description: `${desc.replace(/[.\s]+$/, '')}. To book the ${offer.name}, say it for ${businessName}.`,
  }
}

// Sync deterministic for tests / legacy
export function rewriteForVoiceSync(offer: OfferItem, businessName: string): OfferItem {
  let desc = (offer.description || '').trim()
  if (desc.length > 140) desc = desc.substring(0, 137) + '...'
  desc = desc.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
  desc = desc.replace(/\b(\d+)\s*(min|minute|minutes|hr|hour|hours)\b/gi, '$1 $2')
    .replace(/\$(\d+)/g, '$1 dollars')
    .replace(/&/g, ' and ')
    .replace(/%/g, ' percent ')
    .replace(/\//g, ' or ')
  desc = desc.replace(/\s*\([^)]*\)/g, '')
  return {
    ...offer,
    description: `${desc.replace(/[.\s]+$/, '')}. To book the ${offer.name}, say it for ${businessName}.`,
  }
}

export function suggestPricingTiers(offers: OfferItem[]): { suggestion: string; exampleTiers: any[] } {
  if (!offers.length) return { suggestion: 'Add at least one offer to generate tier suggestions.', exampleTiers: [] }

  const basePrice = offers[0].price || '$100'
  const name = offers[0].name

  return {
    suggestion: `Consider tiered pricing for "${name}" to give agents clear options and increase conversion. Example below preserves your base while adding upsells.`,
    exampleTiers: [
      { name: 'Essential', price: basePrice, description: 'Core delivery' },
      { name: 'Pro', price: '2x ' + basePrice, description: 'Core + priority + extras' },
      { name: 'Enterprise', price: 'Custom', description: 'Full scope with dedicated support' },
    ],
  }
}

export function suggestSchemaImprovements(page: any): string[] {
  const tips: string[] = []
  if (!page.description || page.description.length < 40) tips.push('Add a rich natural-language summary (used in JSON-LD and agent.json).')
  if ((page.services || []).some((s: any) => !s.duration)) tips.push('Add duration to services — agents use it for scheduling and availability.')
  if (!page.faqs || page.faqs.length < 2) tips.push('Add 2-3 FAQs (generateStrongFaqs already available).')
  if (!page.location && !page.contact_email) tips.push('Add location or email for agent context and trust.')
  tips.push('Ensure every offer has a direct url or global cta_url so agents have an actionable next step.')
  return tips
}

export function suggestEnhancedFAQs(businessName: string, audience: string, offers: OfferItem[]): any[] {
  // Leverage existing generator + per-offer flavor
  const base = generateStrongFaqs(businessName, audience, offers.some(o => !!o.price))
  // Add one offer-specific
  if (offers[0]) {
    base.push({
      question: `Can I (or my agent) book the "${offers[0].name}" directly?`,
      answer: `Yes — use the direct checkout link on this page or the agent.json for structured automation.`,
    })
  }
  return base
}

export function optimizeAllOffersForAgents(
  services: string,
  products: string,
  context: { businessName?: string; audience?: string }
): { services: string; products: string } {
  // Phase 1 A + Phase 4: Delegate to real parseOfferLines (now supports consumer + tiers + prefer_original_for_this)
  // + rewrite (preserves all passthrough fields) + formatOfferLines (writes markers). Full roundtrip fidelity.
  const optimizeText = (text: string) =>
    formatOfferLines(
      parseOfferLines(text).map((offer) => rewriteOfferForAgents(offer, context))
    )

  return {
    services: optimizeText(services),
    products: optimizeText(products),
  }
}

export function enhanceDescriptionForAgents(raw: string, businessName: string, audience: string): string {
  let d = raw.trim()
  if (!d) {
    return generateAgentSummary(businessName || 'This business', audience, 0)
  }
  if (d.length < 60) {
    d = `${d}. This agent page makes pricing, scope, and next steps machine readable so AI buyers can evaluate fit instantly.`
  }
  if (!d.toLowerCase().includes('agent') && !d.toLowerCase().includes('ai')) {
    d = `${d} Structured for AI agents and assistants.`
  }
  return d
}
