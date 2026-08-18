import type { Metadata } from 'next'
import PricingClient from './PricingClient'
import { marketingUrl } from '../../lib/site'
import { pricingFaqs } from '../../lib/marketing-content'
import { buildPlansAggregateOffer } from '../../lib/platform-agent-manifest'

// Server shell so /pricing gets its own SERP title/description + canonical/OG
// (the interactive pricing UI lives in PricingClient). The root layout applies
// the '%s · Nexez' title template - don't re-brand here.
const title = 'Pricing — plans for agent-ready listings'
const description =
  'Start free with agentic checkout and a 9% Nexez commission, or choose a paid plan for lower platform fees and more operating power.'

export const metadata: Metadata = {
  title,
  description,
  alternates: {
    canonical: marketingUrl('/pricing'),
  },
  openGraph: {
    type: 'website',
    siteName: 'Nexez',
    url: marketingUrl('/pricing'),
    title,
    description,
  },
}

// FAQPage from the same Q&A the page renders + the catalog-derived AggregateOffer
// (shared with the homepage graph) so schema can't drift from visible pricing.
const pricingStructuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'FAQPage',
      mainEntity: pricingFaqs.map((faq) => ({
        '@type': 'Question',
        name: faq.question,
        acceptedAnswer: { '@type': 'Answer', text: faq.answer },
      })),
    },
    buildPlansAggregateOffer(),
  ],
}

export default function PricingPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(pricingStructuredData).replace(/</g, '\\u003c') }}
      />
      <PricingClient />
    </>
  )
}
