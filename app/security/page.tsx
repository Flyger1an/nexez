import type { Metadata } from 'next'
import { MarketingContentPage } from '../../components/marketing/MarketingContentPage'
import { SecurityHero } from '../../components/marketing/heroes'
import { marketingPages } from '../../lib/marketing-content'
import { marketingUrl } from '../../lib/site'

const content = marketingPages.security

export const metadata: Metadata = {
  title: 'Security and Trust',
  description: content.description,
  alternates: {
    canonical: marketingUrl('/security'),
  },
  // Page-level openGraph replaces the layout's wholesale (shallow merge) — re-carry type/siteName.
  openGraph: {
    type: 'website',
    siteName: 'Nexez',
    url: marketingUrl('/security'),
    title: 'Security and Trust',
    description: content.description,
  },
}

export default function SecurityPage() {
  return <MarketingContentPage content={content} accent="amber" hero={<SecurityHero content={content} />} />
}
