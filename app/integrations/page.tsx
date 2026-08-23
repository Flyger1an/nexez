import type { Metadata } from 'next'
import { MarketingContentPage } from '../../components/marketing/MarketingContentPage'
import { IntegrationsHero } from '../../components/marketing/heroes'
import { marketingPages } from '../../lib/marketing-content'
import { marketingUrl } from '../../lib/site'

const content = marketingPages.integrations

// SERP copy (≤60-char title incl. the layout's ' · Nexez'; ≤160-char description).
// Distinct from content.description, which is on-page hero copy.
const metaTitle = 'Integrations - Stripe, Calendly, Shopify & more'
const metaDescription =
  'Connect Stripe, Shopify, Square, Calendly, and Acuity. Import CSV and websites, and generate clearly labeled Google Calendar availability samples.'

export const metadata: Metadata = {
  title: metaTitle,
  description: metaDescription,
  alternates: {
    canonical: marketingUrl('/integrations'),
  },
  // Page-level openGraph replaces the layout's wholesale (shallow merge) - re-carry type/siteName.
  openGraph: {
    type: 'website',
    siteName: 'Nexez',
    url: marketingUrl('/integrations'),
    title: metaTitle,
    description: metaDescription,
  },
}

export default function IntegrationsMarketingPage() {
  return <MarketingContentPage content={content} accent="ready" hero={<IntegrationsHero content={content} />} />
}
