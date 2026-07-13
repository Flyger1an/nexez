import type { Metadata } from 'next'
import { MarketingContentPage } from '../../components/marketing/MarketingContentPage'
import { DevelopersHero } from '../../components/marketing/heroes'
import { marketingPages } from '../../lib/marketing-content'
import { marketingUrl } from '../../lib/site'

const content = marketingPages.developers

export const metadata: Metadata = {
  title: 'Developers',
  description: content.description,
  alternates: {
    canonical: marketingUrl('/developers'),
  },
  // Page-level openGraph replaces the layout's wholesale (shallow merge) — re-carry type/siteName.
  openGraph: {
    type: 'website',
    siteName: 'Nexez',
    url: marketingUrl('/developers'),
    title: 'Developers',
    description: content.description,
  },
}

export default function DevelopersPage() {
  return <MarketingContentPage content={content} accent="signal" hero={<DevelopersHero content={content} />} />
}
