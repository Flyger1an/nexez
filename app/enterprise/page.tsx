import type { Metadata } from 'next'
import { MarketingContentPage } from '../../components/marketing/MarketingContentPage'
import { EnterpriseHero } from '../../components/marketing/heroes'
import { marketingPages } from '../../lib/marketing-content'
import { marketingUrl } from '../../lib/site'

const content = marketingPages.enterprise

export const metadata: Metadata = {
  title: 'Enterprise',
  description: content.description,
  alternates: {
    canonical: marketingUrl('/enterprise'),
  },
  // Page-level openGraph replaces the layout's wholesale (shallow merge) — re-carry type/siteName.
  openGraph: {
    type: 'website',
    siteName: 'Nexez',
    url: marketingUrl('/enterprise'),
    title: 'Enterprise',
    description: content.description,
  },
}

export default function EnterprisePage() {
  return <MarketingContentPage content={content} accent="signal" hero={<EnterpriseHero content={content} />} />
}
