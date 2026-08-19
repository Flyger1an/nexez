import type { CommerceTemplate } from './schema'

export type CommerceTemplateMatchInput = {
  industry?: string | null
  description?: string | null
  offerNames?: string[] | null
  keywords?: string[] | null
}

export type CommerceTemplateMatch = {
  template: CommerceTemplate
  score: number
  confidence: number
  reasons: string[]
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function containsPhrase(haystack: string, needle: string): boolean {
  const n = normalize(needle)
  return Boolean(n) && (` ${haystack} `).includes(` ${n} `)
}

/**
 * Deterministic template matcher. It selects which knowledge definition(s) are
 * relevant; it never writes merchant fields and therefore cannot manufacture
 * merchant truth.
 */
export function scoreCommerceTemplateMatch(
  template: CommerceTemplate,
  input: CommerceTemplateMatchInput,
): CommerceTemplateMatch {
  let score = 0
  const reasons: string[] = []

  const industry = normalize(input.industry ?? '')
  if (industry) {
    for (const hint of template.matchHints.industries) {
      const normalizedHint = normalize(hint)
      if (!normalizedHint) continue
      if (industry === normalizedHint) {
        score += 100
        reasons.push(`industry exact: ${hint}`)
        break
      }
      if (industry.includes(normalizedHint) || normalizedHint.includes(industry)) {
        score += 60
        reasons.push(`industry related: ${hint}`)
        break
      }
    }
  }

  const description = normalize(input.description ?? '')
  const keywordInput = normalize((input.keywords ?? []).join(' '))
  const textHaystack = [description, keywordInput].filter(Boolean).join(' ')
  let keywordHits = 0
  if (textHaystack) {
    for (const hint of template.matchHints.keywords) {
      if (containsPhrase(textHaystack, hint)) {
        keywordHits += 1
        reasons.push(`keyword: ${hint}`)
      }
    }
  }
  score += Math.min(keywordHits * 12, 48)

  const offerHaystack = normalize((input.offerNames ?? []).join(' '))
  let offerHits = 0
  if (offerHaystack) {
    for (const hint of template.matchHints.offerTerms ?? []) {
      if (containsPhrase(offerHaystack, hint)) {
        offerHits += 1
        reasons.push(`offer term: ${hint}`)
      }
    }
  }
  score += Math.min(offerHits * 15, 45)

  // 145 is a strong exact-industry + several supporting signals match.
  const confidence = Math.max(0, Math.min(1, score / 145))
  return { template, score, confidence, reasons }
}

export function matchCommerceTemplates(
  templates: CommerceTemplate[],
  input: CommerceTemplateMatchInput,
  options?: { limit?: number; minimumScore?: number },
): CommerceTemplateMatch[] {
  const limit = options?.limit ?? 3
  const minimumScore = options?.minimumScore ?? 12
  return templates
    .map((template) => scoreCommerceTemplateMatch(template, input))
    .filter((match) => match.score >= minimumScore)
    .sort((a, b) => b.score - a.score || a.template.id.localeCompare(b.template.id))
    .slice(0, Math.max(0, limit))
}
