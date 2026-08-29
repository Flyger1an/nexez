import { afterEach, describe, expect, it, vi } from 'vitest'
import { analyzeSite } from '../importer'
import { scoreImporterBenchmark, type ImportBenchmarkExpectation } from '../importer-benchmark'

type Sample = {
  name: string
  url: string
  homepage: string
  pages?: Record<string, string>
  robots?: string
  sitemaps?: Record<string, string>
  shopifyProducts?: unknown
  expected: ImportBenchmarkExpectation
}

function page(title: string, body: string, graph?: unknown) {
  return `<!doctype html><html><head><title>${title}</title>${graph ? `<script type="application/ld+json">${JSON.stringify(graph)}</script>` : ''}</head><body>${body}</body></html>`
}

const samples: Sample[] = [
  {
    name: 'local service business',
    url: 'https://benchmark-local.example.com/',
    homepage: page('Austin Home Care', '<a href="/book">Book repair</a>', { '@type': 'LocalBusiness', name: 'Austin Home Care', telephone: '512-555-0100', address: { streetAddress: '10 Lake Road', addressLocality: 'Austin', addressRegion: 'TX' }, openingHours: ['Mo-Fr 08:00-17:00'] }),
    pages: { '/services': page('Repair Services', '<h1>Repair Services</h1>', { '@type': 'Service', name: 'Home Repair Visit', description: 'A scheduled home repair visit in Austin.', areaServed: 'Austin, Texas', offers: { price: '125', priceCurrency: 'USD', url: '/book' } }) },
    expected: { nameTerms: ['Austin Home Care'], offerTerms: ['Home Repair Visit'], priceTerms: ['USD 125'], actionTerms: ['/book'], expectedKinds: [{ offerTerm: 'Home Repair', kind: 'service' }], detailTerms: ['Austin'] },
  },
  {
    name: 'professional service',
    url: 'https://benchmark-advisory.example.com/',
    homepage: page('Northstar Advisory', '<section class="service-card"><h2>Strategy Audit</h2><p>A focused strategy audit for $600.</p><a href="/contact">Request consultation</a></section>'),
    expected: { nameTerms: ['Northstar Advisory'], offerTerms: ['Strategy Audit'], priceTerms: ['$600'], actionTerms: ['/contact'], expectedKinds: [{ offerTerm: 'Strategy Audit', kind: 'service' }] },
  },
  {
    name: 'appointment business',
    url: 'https://benchmark-appointments.example.com/',
    homepage: page('Willow Wellness', '<a href="/schedule">Schedule appointment</a>', { '@type': 'Service', name: 'Wellness Session', description: 'A 60 minute wellness appointment.', duration: 'PT60M', offers: { price: '95', priceCurrency: 'USD', url: '/schedule' } }),
    expected: { nameTerms: ['Willow Wellness'], offerTerms: ['Wellness Session'], priceTerms: ['USD 95'], actionTerms: ['/schedule'], expectedKinds: [{ offerTerm: 'Wellness Session', kind: 'service' }], detailTerms: ['PT60M'] },
  },
  {
    name: 'product catalog',
    url: 'https://benchmark-products.example.com/',
    homepage: page('Field Goods', '<a href="/checkout/toolkit">Buy toolkit</a>', { '@type': 'Product', name: 'Field Toolkit', description: 'A stocked toolkit for field teams.', offers: { price: '149', priceCurrency: 'USD', availability: 'https://schema.org/InStock', url: '/checkout/toolkit' } }),
    expected: { nameTerms: ['Field Goods'], offerTerms: ['Field Toolkit'], priceTerms: ['USD 149'], actionTerms: ['/checkout/toolkit'], expectedKinds: [{ offerTerm: 'Field Toolkit', kind: 'product' }], detailTerms: ['available'] },
  },
  {
    name: 'Shopify store',
    url: 'https://benchmark-shopify.example.com/',
    homepage: page('Merchant Supply', '<script src="https://cdn.shopify.com/storefront.js"></script><a href="/products/merchant-kit">Buy Merchant Kit</a>'),
    shopifyProducts: { products: [{ title: 'Merchant Kit', handle: 'merchant-kit', body_html: '<p>A complete merchant kit.</p>', variants: [{ title: 'Default', price: '129.00', available: true }] }] },
    expected: { nameTerms: ['Merchant Supply'], offerTerms: ['Merchant Kit'], priceTerms: ['$129'], actionTerms: ['/products/merchant-kit'], expectedKinds: [{ offerTerm: 'Merchant Kit', kind: 'product' }], detailTerms: ['available'] },
  },
  {
    name: 'WordPress site',
    url: 'https://benchmark-wordpress.example.com/',
    homepage: page('Harbor Studio', '<a href="/offers/brand-workshop">View workshop pricing</a>'),
    sitemaps: { '/wp-sitemap.xml': '<urlset><url><loc>https://benchmark-wordpress.example.com/offers/brand-workshop</loc></url></urlset>' },
    pages: { '/offers/brand-workshop': page('Brand Workshop', '<h1>Brand Workshop</h1>', { '@type': 'Service', name: 'Brand Workshop', description: 'A facilitated brand workshop.', offers: { price: '800', priceCurrency: 'USD', url: '/contact' } }) },
    expected: { nameTerms: ['Harbor Studio'], offerTerms: ['Brand Workshop'], priceTerms: ['USD 800'], actionTerms: ['/contact'], expectedKinds: [{ offerTerm: 'Brand Workshop', kind: 'service' }] },
  },
  {
    name: 'nested sitemap site',
    url: 'https://benchmark-nested.example.com/',
    homepage: page('Nested Commerce', '<p>Public company profile.</p>'),
    robots: 'User-agent: *\nAllow: /\nSitemap: https://benchmark-nested.example.com/sitemap-index.xml',
    sitemaps: {
      '/sitemap-index.xml': '<sitemapindex><sitemap><loc>https://benchmark-nested.example.com/offers-sitemap.xml</loc></sitemap></sitemapindex>',
      '/offers-sitemap.xml': '<urlset><url><loc>https://benchmark-nested.example.com/offer/nested-audit</loc></url></urlset>',
    },
    pages: { '/offer/nested-audit': page('Nested Audit', '<a href="/quote">Request quote</a>', { '@type': 'Service', name: 'Nested Audit', description: 'An audit discovered through a nested sitemap.', offers: { price: '450', priceCurrency: 'USD', url: '/quote' } }) },
    expected: { nameTerms: ['Nested Commerce'], offerTerms: ['Nested Audit'], priceTerms: ['USD 450'], actionTerms: ['/quote'], expectedKinds: [{ offerTerm: 'Nested Audit', kind: 'service' }] },
  },
  {
    name: 'JavaScript shell with structured payload',
    url: 'https://benchmark-js-shell.example.com/',
    homepage: page('Modern Booking', '<div id="app"></div>', { '@type': 'Service', name: 'Modern Consult', description: 'A consultation exposed through structured page data.', offers: { price: '200', priceCurrency: 'USD', url: '/book/modern' } }),
    expected: { nameTerms: ['Modern Booking'], offerTerms: ['Modern Consult'], priceTerms: ['USD 200'], actionTerms: ['/book/modern'], expectedKinds: [{ offerTerm: 'Modern Consult', kind: 'service' }] },
  },
  {
    name: 'multi-location business',
    url: 'https://benchmark-multi.example.com/',
    homepage: page('Metro Dental Group', '<a href="/appointments">Book appointment</a>', { '@type': 'Dentist', name: 'Metro Dental Group', telephone: '214-555-0111', address: { streetAddress: '200 Elm Street', addressLocality: 'Dallas', addressRegion: 'TX' }, openingHours: ['Mo-Sa 08:00-18:00'] }),
    pages: { '/services': page('Dental Services', '<h1>Dental Services</h1>', { '@type': 'Service', name: 'New Patient Exam', description: 'A new patient dental exam in Dallas.', offers: { price: '175', priceCurrency: 'USD', url: '/appointments' } }) },
    expected: { nameTerms: ['Metro Dental Group'], offerTerms: ['New Patient Exam'], priceTerms: ['USD 175'], actionTerms: ['/appointments'], expectedKinds: [{ offerTerm: 'New Patient Exam', kind: 'service' }], detailTerms: ['Dallas'] },
  },
  {
    name: 'structured local service with noisy booking steps',
    url: 'https://benchmark-kismet-quality.example.com/',
    homepage: page(
      'Kismet Quality Fixture',
      '<meta property="og:image" content="/img/modern-hero.jpg"><header><img src="/assets/kismet-logo.svg" alt="Kismet Quality Fixture logo"></header><h2>FORT WORTH</h2><h2>Step 1 - Enter Your Address</h2><h2>Step 4 - Select a Date and Time</h2><h2>Trusted by 1 + Dallas Families and Growing.</h2><article><h2>1. The Type of Cleaning Service</h2><p>Routine cleaning affects the quote.</p></article><a href="/book">Book now</a>',
      {
        '@context': 'https://schema.org',
        '@graph': [
          { '@type': 'Organization', name: 'Kismet Quality Fixture', logo: '/assets/kismet-logo.svg' },
          { '@type': 'Service', name: 'One-time Premium Cleaning', url: '/premium-cleaning' },
          { '@type': 'Service', name: 'Move-in and Move-out Cleaning', url: '/moving-cleaning' },
          { '@type': 'Service', name: 'Routine Cleaning', url: '/routine-cleaning' },
          { '@type': 'Service', name: 'Deep Cleaning', url: '/deep-cleaning' },
        ],
      },
    ),
    expected: {
      nameTerms: ['Kismet Quality Fixture'],
      offerTerms: ['One-time Premium Cleaning', 'Move-in and Move-out Cleaning', 'Routine Cleaning', 'Deep Cleaning'],
      actionTerms: ['/book'],
      expectedKinds: [{ offerTerm: 'Routine Cleaning', kind: 'service' }],
      forbiddenOfferTerms: ['Step 1', 'Step 4', 'Trusted by', 'Type of Cleaning Service', 'FORT WORTH'],
      expectedOfferCount: 4,
    },
  },
  {
    name: 'repeated destination plan cards',
    url: 'https://benchmark-wirect-quality.example.com/',
    homepage: page('Travel eSIM Plans', `
      <article class="card plan-card"><p class="destination-name">Spain</p><h3>5 GB</h3><span>30 days</span><span>Instant eSIM</span><span>One-time price</span><strong>$5.49</strong><a href="/plans/spain-5-gb-30-days">View plan</a></article>
      <article class="card plan-card"><p class="destination-name">United States</p><h3>5 GB</h3><span>30 days</span><span>Instant eSIM</span><span>One-time price</span><strong>$5.49</strong><a href="/plans/united-states-5-gb-30-days">View plan</a></article>
      <article class="card plan-card"><p class="destination-name">United Kingdom</p><h3>5 GB</h3><span>30 days</span><span>Instant eSIM</span><span>One-time price</span><strong>$5.49</strong><a href="/plans/united-kingdom-5-gb-30-days">View plan</a></article>
      <article class="card plan-card"><p class="destination-name">France</p><h3>10 GB</h3><span>30 days</span><span>Instant eSIM</span><span>One-time price</span><strong>$9.49</strong><a href="/plans/germany-10-gb-30-days">View plan</a></article>
      <article class="card plan-card"><h3>Supported networks</h3><span>30 days</span><span>$5.49</span><a href="/plans/france-5-gb-30-days">View plan</a></article>
    `),
    pages: {
      '/plans/spain-5-gb-30-days': page('Spain 5 GB eSIM', '<h1>Spain 5 GB eSIM</h1>', {
        '@type': 'Product',
        name: 'Spain 5 GB eSIM',
        description: 'A 30 day travel eSIM for Spain.',
        offers: { price: '5.49', priceCurrency: 'USD', url: '/plans/spain-5-gb-30-days' },
      }),
    },
    expected: {
      nameTerms: ['Travel eSIM Plans'],
      offerTerms: ['Spain 5 GB', 'United States 5 GB', 'United Kingdom 5 GB'],
      priceTerms: ['$5.49'],
      actionTerms: ['/plans/'],
      expectedKinds: [{ offerTerm: 'Spain 5 GB', kind: 'product' }],
      forbiddenOfferTerms: ['One-time price', 'France 10 GB', 'Supported networks'],
      expectedOfferCount: 3,
      offerLinks: [
        { offerTerm: 'Spain 5 GB', urlTerm: '/plans/spain-' },
        { offerTerm: 'United States 5 GB', urlTerm: '/plans/united-states-' },
        { offerTerm: 'United Kingdom 5 GB', urlTerm: '/plans/united-kingdom-' },
      ],
    },
  },
  {
    name: 'thin ambiguous site',
    url: 'https://benchmark-thin.example.com/',
    homepage: page('Quiet Company', '<p>Welcome to our company website.</p>'),
    expected: { nameTerms: ['Quiet Company'], offerTerms: [], expectNoOffers: true, forbiddenTerms: ['Main Service', 'Consultation $75'] },
  },
]

describe('Website Importer V2 twelve-sample certification', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('averages at least 8 out of 10 with no unsupported detected facts', async () => {
    const byHost = new Map(samples.map((sample) => [new URL(sample.url).hostname, sample]))
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const requested = new URL(String(input))
      const sample = byHost.get(requested.hostname)
      if (!sample) return new Response('', { status: 404 })
      if (requested.pathname === '/robots.txt') return sample.robots ? new Response(sample.robots) : new Response('', { status: 404 })
      if (/llms\.txt|agent\.json|nexez\.json/.test(requested.pathname)) return new Response('', { status: 404 })
      if (requested.pathname === '/products.json') return sample.shopifyProducts ? Response.json(sample.shopifyProducts) : new Response('', { status: 404 })
      if (sample.sitemaps?.[requested.pathname]) return new Response(sample.sitemaps[requested.pathname])
      if (/sitemap.*\.xml$/.test(requested.pathname)) return new Response('', { status: 404 })
      if (sample.pages?.[requested.pathname]) return new Response(sample.pages[requested.pathname], { headers: { 'content-type': 'text/html' } })
      return new Response(sample.homepage, { headers: { 'content-type': 'text/html' } })
    }))

    const scores = []
    for (const sample of samples) {
      const result = await analyzeSite(sample.url, null, { skipLlm: true })
      scores.push({ sample: sample.name, ...scoreImporterBenchmark(result, sample.expected) })
    }
    const average = scores.reduce((sum, item) => sum + item.score, 0) / scores.length

    expect(scores.filter((item) => item.automaticFailure)).toEqual([])
    expect(scores.filter((item) => !item.passing)).toEqual([])
    expect(average).toBeGreaterThanOrEqual(8)
  })
})
