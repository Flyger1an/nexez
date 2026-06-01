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
  if (offer.duration || offer.serviceArea || offer.isMobile) {
    const details = []
    if (offer.duration) details.push(offer.duration)
    if (offer.serviceArea) details.push(`serves ${offer.serviceArea}`)
    if (offer.isMobile) details.push('mobile / on-site')

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
    name,
    price,
    description: description.length > 180 ? description.slice(0, 177) + '...' : description,
    url,
    duration: offer.duration,
    serviceArea: offer.serviceArea,
    isMobile: offer.isMobile,
    travelFee: offer.travelFee,
    tiers: offer.tiers, // Phase 1 A fidelity - preserve tiers
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

export function optimizeAllOffersForAgents(
  services: string,
  products: string,
  context: { businessName?: string; audience?: string }
): { services: string; products: string } {
  // Phase 1 A: Parse richer lines (consumer + tiers) and preserve them after rewrite
  const parse = (text: string) =>
    text
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line) => {
        const parts = line.split('|').map((p) => p.trim())
        const [name = '', price = '', desc = '', url = ''] = parts

        // Reconstruct full OfferItem for rewrite (preserves consumer fields + tiers)
        const fullOffer: OfferItem = {
          name,
          price,
          description: desc,
          url,
          duration: parts[4] || undefined,
          serviceArea: parts[5] || undefined,
          travelFee: parts[6] || undefined,
          isMobile: parts[7] === '1' || parts[7]?.toLowerCase() === 'true' || parts[7]?.toLowerCase() === 'mobile' || undefined,
          tiers: undefined, // tiers are harder to parse from text; rely on rich array path in editor/create
        }

        const rewritten = rewriteOfferForAgents(fullOffer, context)

        // Rebuild line preserving consumer fields + tiers marker if they existed
        let newLine = [rewritten.name, rewritten.price, rewritten.description, rewritten.url].join(' | ')

        const hadConsumer = !!fullOffer.duration || !!fullOffer.serviceArea || !!fullOffer.travelFee || !!fullOffer.isMobile
        if (hadConsumer) {
          newLine += ` | ${rewritten.duration || ''} | ${rewritten.serviceArea || ''} | ${rewritten.travelFee || ''} | ${rewritten.isMobile ? '1' : '0'}`
        }

        return newLine
      })
      .join('\n')

  return {
    services: parse(services),
    products: parse(products),
  }
}

export function enhanceDescriptionForAgents(raw: string, businessName: string, audience: string): string {
  let d = raw.trim()
  if (!d) {
    return generateAgentSummary(businessName || 'This business', audience, 0)
  }
  if (d.length < 60) {
    d = `${d}. This agent page makes pricing, scope, and next steps machine-readable so AI buyers can evaluate fit instantly.`
  }
  if (!d.toLowerCase().includes('agent') && !d.toLowerCase().includes('ai')) {
    d = `${d} Structured for AI agents and assistants.`
  }
  return d
}
