import type { Metadata } from 'next'
import { MarketingContentPage } from '../../components/marketing/MarketingContentPage'
import { IntegrationsHero } from '../../components/marketing/heroes'
import { marketingPages } from '../../lib/marketing-content'
import { marketingUrl } from '../../lib/site'

const content = marketingPages.integrations

export const metadata: Metadata = {
  title: 'Integrations',
  description: content.description,
  alternates: {
    canonical: marketingUrl('/integrations'),
  },
  // Page-level openGraph replaces the layout's wholesale (shallow merge) — re-carry type/siteName.
  openGraph: {
    type: 'website',
    siteName: 'Nexez',
    url: marketingUrl('/integrations'),
    title: 'Integrations',
    description: content.description,
  },
}

export default function IntegrationsMarketingPage() {
  return <MarketingContentPage content={content} accent="ready" hero={<IntegrationsHero content={content} />} />
}
