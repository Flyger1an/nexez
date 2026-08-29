import { describe, expect, it } from 'vitest'
import { analyzeSite } from '../importer'
import { scoreImporterBenchmark, type ImportBenchmarkExpectation } from '../importer-benchmark'

type LiveSample = {
  category: string
  url: string
  expected: ImportBenchmarkExpectation
}

const liveSamples: LiveSample[] = [
  { category: 'local service', url: 'https://saulify.com/', expected: { nameTerms: ['Saulify'], offerTerms: ['Starter Growth System', 'Full Growth System'], priceTerms: ['$250', '$597'], actionTerms: ['begin', 'contact', 'start', 'book', 'walkthrough'], expectedKinds: [{ offerTerm: 'Starter Growth System', kind: 'service' }], detailTerms: ['Dallas', 'Texas'] } },
  { category: 'professional service', url: 'https://commandstaffconsulting.com/fee-schedule/', expected: { nameTerms: ['Command Staff', 'Fee Schedule'], offerTerms: ['Keynote', 'Half-Day Workshop', 'Full-Day Training'], priceTerms: ['1250', '2000', '3100'], actionTerms: ['book', 'contact'], expectedKinds: [{ offerTerm: 'Keynote', kind: 'service' }] } },
  { category: 'appointment platform', url: 'https://www.booksimpl.com/', expected: { nameTerms: ['Booksimpl'], offerTerms: ['Starter', 'Growth', 'Pro'], priceTerms: ['12.00', '29.00', '59.00'], actionTerms: ['free', 'book', 'start'], expectedKinds: [{ offerTerm: 'Starter', kind: 'product' }], forbiddenOfferTerms: ['Manage your whole booking day', 'Professional booking that grows'] } },
  { category: 'WordPress product', url: 'https://www.bookingpressplugin.com/', expected: { nameTerms: ['BookingPress'], offerTerms: ['Standard', 'Professional', 'Enterprise'], priceTerms: ['89', '229'], actionTerms: ['pricing', 'buy', 'free', 'purchase'], expectedKinds: [{ offerTerm: 'Standard', kind: 'product' }] } },
  { category: 'multi-location software', url: 'https://vertexordering.com/industries/services-booking-software-dallas', expected: { nameTerms: ['Vertex', 'booking'], offerTerms: ['Free', 'Starter', 'Growth'], priceTerms: ['$0', '$9.99'], actionTerms: ['start', 'services', 'pricing'], expectedKinds: [{ offerTerm: 'Free', kind: 'product' }], detailTerms: ['Dallas', 'Texas'], forbiddenOfferTerms: ['Services workflow highlights'] } },
  { category: 'salon marketplace pricing', url: 'https://www.thelocalgem.com/pricing', expected: { nameTerms: ['Local Gem', 'Salon'], offerTerms: ['Early Access Annual Plan', 'Standard Annual Plan'], priceTerms: ['99.00', '199.00'], actionTerms: ['start', 'free', 'contact', 'register', 'pricing'], expectedKinds: [{ offerTerm: 'Standard Annual Plan', kind: 'product' }], detailTerms: ['Fort Worth', 'TX'] } },
  { category: 'Shopify product catalog', url: 'https://www.allbirds.com/', expected: { nameTerms: ['Allbirds'], offerTerms: ['Tree'], priceTerms: ['$'], actionTerms: ['product', 'shop'], expectedKinds: [{ offerTerm: 'Tree', kind: 'product' }] } },
  { category: 'appointment pricing', url: 'https://www.acuityscheduling.com/pricing', expected: { nameTerms: ['Acuity', 'scheduling'], offerTerms: ['Starter', 'Standard', 'Premium'], priceTerms: ['$16', '$27', '$49'], actionTerms: ['start', 'trial'], expectedKinds: [{ offerTerm: 'Starter', kind: 'product' }] } },
  { category: 'JavaScript-heavy pricing', url: 'https://linear.app/pricing', expected: { nameTerms: ['Linear', 'pricing'], offerTerms: ['Free', 'Basic', 'Business'], priceTerms: ['$'], actionTerms: ['start', 'signup', 'contact'], expectedKinds: [{ offerTerm: 'Basic', kind: 'product' }] } },
  { category: 'structured local cleaning service', url: 'https://kismetpros.com/', expected: { nameTerms: ['Kismet Pros'], offerTerms: ['One-time Premium Cleaning', 'Move-in and Move-out Cleaning', 'Routine Cleaning'], actionTerms: ['book', 'availability'], expectedKinds: [{ offerTerm: 'Routine Cleaning', kind: 'service' }], detailTerms: ['Dallas', 'Grand Prairie'], forbiddenOfferTerms: ['Step 1', 'Step 4', 'Step 5', 'Trusted by', 'Type of Cleaning Service', 'FORT WORTH'] } },
  { category: 'repeated destination eSIM plans', url: 'https://wirect.co/', expected: { nameTerms: ['wirect'], offerTerms: ['Spain 5 GB', 'United States 5 GB', 'United Kingdom 5 GB'], priceTerms: ['$5.49'], actionTerms: ['register', 'plan', 'start'], expectedKinds: [{ offerTerm: 'Spain 5 GB', kind: 'product' }], forbiddenOfferTerms: ['One-time price', 'Supported networks'], offerLinks: [{ offerTerm: 'Spain 5 GB', urlTerm: '/plans/spain-' }, { offerTerm: 'United States 5 GB', urlTerm: '/plans/united-states-' }, { offerTerm: 'United Kingdom 5 GB', urlTerm: '/plans/united-kingdom-' }] } },
  { category: 'thin ambiguous site', url: 'https://example.com/', expected: { nameTerms: ['Example Domain'], offerTerms: [], expectNoOffers: true, forbiddenTerms: ['Main Service', 'Consultation $75'] } },
]

describe.skipIf(process.env.RUN_LIVE_IMPORTER_BENCHMARK !== '1')('Website Importer V2 live public-web benchmark', () => {
  it('scores every sample at least 8 out of 10 and fabricates no detected facts', async () => {
    const filter = process.env.IMPORTER_BENCHMARK_FILTER?.toLowerCase()
    const samples = filter
      ? liveSamples.filter((sample) => `${sample.category} ${sample.url}`.toLowerCase().includes(filter))
      : liveSamples
    expect(samples.length).toBeGreaterThan(0)
    const scorecard = []
    for (const sample of samples) {
      const result = await analyzeSite(sample.url, null, { skipLlm: true })
      const scored = scoreImporterBenchmark(result, sample.expected)
      scorecard.push({
        category: sample.category,
        url: sample.url,
        title: result.title,
        offers: result.structuredOffers.map((offer) => ({
          name: offer.name,
          price: offer.price,
          kind: offer.metadata?.offerKind,
          source: offer.source,
          url: offer.url,
          duration: offer.duration,
          destination: offer.metadata?.destination,
          confidence: offer.confidence,
          tiers: offer.tiers,
        })),
        cta: result.cta_url,
        actions: result.businessDetails.actionLinks,
        location: result.location,
        pages: result.pagesAnalyzed,
        evidence: result.evidence.length,
        ...scored,
      })
    }
    const average = scorecard.reduce((sum, item) => sum + item.score, 0) / scorecard.length
    if (process.env.REPORT_IMPORTER_BENCHMARK === '1') {
      process.stdout.write(`\nIMPORTER_LIVE_SCORECARD ${JSON.stringify({ average, scorecard })}\n`)
    }

    expect(scorecard.filter((item) => item.automaticFailure)).toEqual([])
    expect(scorecard.filter((item) => item.score < 8).map((item) => ({ category: item.category, score: item.score }))).toEqual([])
    expect(average).toBeGreaterThanOrEqual(8)
  }, 300_000)
})
