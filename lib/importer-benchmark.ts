import type { ImportResult } from './importer'

export type ImportBenchmarkExpectation = {
  nameTerms: string[]
  offerTerms: string[]
  priceTerms?: string[]
  actionTerms?: string[]
  expectedKinds?: Array<{ offerTerm: string; kind: 'product' | 'service' }>
  detailTerms?: string[]
  forbiddenTerms?: string[]
  forbiddenOfferTerms?: string[]
  expectedOfferCount?: number
  offerLinks?: Array<{ offerTerm: string; urlTerm: string }>
  expectNoOffers?: boolean
}

export type ImportBenchmarkScore = {
  score: number
  passing: boolean
  automaticFailure: string | null
  points: {
    identity: number
    offers: number
    pricing: number
    action: number
    classification: number
    operatingDetails: number
    traceability: number
    ambiguitySafety: number
    reviewReady: number
  }
}

function includesAny(value: string, terms: string[] | undefined): boolean {
  if (!terms?.length) return true
  const normalized = value.toLowerCase()
  return terms.some((term) => normalized.includes(term.toLowerCase()))
}

export function scoreImporterBenchmark(
  result: ImportResult,
  expected: ImportBenchmarkExpectation,
): ImportBenchmarkScore {
  const offers = result.structuredOffers || []
  const evidenceIds = new Set(result.evidence.map((item) => item.id))
  const allOfferText = offers.map((offer) => `${offer.name} ${offer.description || ''}`).join(' ')
  const identity = includesAny(result.title, expected.nameTerms) ? 1 : 0
  const offerCoverage = expected.expectNoOffers
    ? offers.length === 0 ? 1 : 0
    : expected.offerTerms.length
      ? expected.offerTerms.filter((term) => includesAny(allOfferText, [term])).length / expected.offerTerms.length
      : 1
  const semanticOfferShare = expected.expectNoOffers
    ? offers.length === 0 ? 1 : 0
    : offers.length
      ? offers.filter((offer) => includesAny(`${offer.name} ${offer.description || ''}`, expected.offerTerms)).length / offers.length
      : 0
  const supportedOffers = offers.filter((offer) => {
    const ids = Array.isArray(offer.metadata?.evidenceIds) ? offer.metadata.evidenceIds as string[] : []
    return ids.length > 0 && ids.every((id) => evidenceIds.has(id))
  })
  const offerTraceShare = offers.length ? supportedOffers.length / offers.length : 1
  const offerPoints = Math.min(2, offerCoverage + semanticOfferShare)

  const priceText = offers.flatMap((offer) => [
    offer.price || '',
    ...(offer.tiers || []).map((tier) => tier.price || ''),
  ]).join(' ')
  const pricing = expected.priceTerms?.length
    ? includesAny(priceText, expected.priceTerms) ? 1 : 0
    : offers.every((offer) => /^(?:custom|unknown|see options|confirm)$/i.test(offer.price || '')
      || (offer.metadata?.evidenceIds || []).some((id: string) => result.evidence.some((item) => item.id === id && item.field.endsWith('.price')))) ? 1 : 0
  const action = includesAny(`${result.cta_label || ''} ${result.cta_url || ''}`, expected.actionTerms) ? 1 : 0
  const classification = expected.expectedKinds?.length
    ? expected.expectedKinds.every((item) => offers.some((offer) => (
        includesAny(`${offer.name} ${offer.description || ''}`, [item.offerTerm])
        && offer.metadata?.offerKind === item.kind
      ))) ? 1 : 0
    : offers.every((offer) => ['product', 'service'].includes(String(offer.metadata?.offerKind || ''))) ? 1 : offers.length === 0 ? 1 : 0
  const detailsText = [
    result.location || '',
    result.businessDetails.address || '',
    result.businessDetails.phone || '',
    result.businessDetails.email || '',
    ...(result.businessDetails.openingHours || []),
    ...offers.flatMap((offer) => [offer.duration || '', offer.serviceArea || '', offer.availability || '']),
  ].join(' ')
  const operatingDetails = includesAny(detailsText, expected.detailTerms) ? 1 : 0
  const traceability = offerTraceShare === 1 && result.evidence.length > 0 ? 1 : 0
  const ambiguitySafety = expected.expectNoOffers
    ? offers.length === 0 && result.suggestedOffers.every((offer) => offer.metadata?.evidenceStatus === 'suggested') ? 1 : 0
    : offers.every((offer) => offer.metadata?.evidenceStatus !== 'suggested') ? 1 : 0
  const combinedFacts = [result.title, result.description, result.location || '', allOfferText, priceText, result.cta_url || ''].join(' ')
  const forbidden = expected.forbiddenTerms?.find((term) => includesAny(combinedFacts, [term])) || null
  const forbiddenOffer = expected.forbiddenOfferTerms?.find((term) => (
    offers.some((offer) => includesAny(offer.name, [term]))
  )) || null
  const offerCountMismatch = typeof expected.expectedOfferCount === 'number' && offers.length !== expected.expectedOfferCount
    ? `Expected ${expected.expectedOfferCount} offers but detected ${offers.length}.`
    : null
  const offerLinkMismatch = expected.offerLinks?.find((item) => !offers.some((offer) => (
    includesAny(`${offer.name} ${offer.description || ''}`, [item.offerTerm])
    && includesAny(offer.url || '', [item.urlTerm])
  ))) || null
  const integrityConflict = offers.find((offer) => (
    Array.isArray(offer.metadata?.integrityWarnings) && offer.metadata.integrityWarnings.length > 0
  ))
  const unsupportedOffer = offers.find((offer) => {
    const ids = Array.isArray(offer.metadata?.evidenceIds) ? offer.metadata.evidenceIds as string[] : []
    const cited = result.evidence.filter((item) => ids.includes(item.id))
    const corpus = cited.map((item) => `${item.value} ${item.sourceText}`).join(' ')
    return !includesAny(corpus, [offer.name])
  })
  const automaticFailure = forbidden
    ? `Forbidden term detected: ${forbidden}`
    : forbiddenOffer
      ? `Forbidden offer detected: ${forbiddenOffer}`
      : offerCountMismatch
        ? offerCountMismatch
        : offerLinkMismatch
          ? `Offer link mismatch: ${offerLinkMismatch.offerTerm} must link to ${offerLinkMismatch.urlTerm}`
          : integrityConflict
            ? `Offer has unresolved integrity warnings: ${integrityConflict.name}`
    : unsupportedOffer
      ? `Offer lacks name evidence: ${unsupportedOffer.name}`
      : null
  const reviewReady = automaticFailure === null && result.telemetry.importerVersion === '2.0.0' ? 1 : 0
  const points = {
    identity,
    offers: offerPoints,
    pricing,
    action,
    classification,
    operatingDetails,
    traceability,
    ambiguitySafety,
    reviewReady,
  }
  const score = Object.values(points).reduce((sum, value) => sum + value, 0)
  return { score, passing: score >= 8 && !automaticFailure, automaticFailure, points }
}
