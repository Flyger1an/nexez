import type { Metadata } from 'next'
import { MarketingContentPage } from '../../components/marketing/MarketingContentPage'
import { CompareHero } from '../../components/marketing/heroes'
import { marketingPages } from '../../lib/marketing-content'
import { marketingUrl } from '../../lib/site'

const content = marketingPages.compare

export const metadata: Metadata = {
  title: 'Compare Nexez',
  description: content.description,
  alternates: {
    canonical: marketingUrl('/compare'),
  },
  // Page-level openGraph replaces the layout's wholesale (shallow merge) — re-carry type/siteName.
  openGraph: {
    type: 'website',
    siteName: 'Nexez',
    url: marketingUrl('/compare'),
    title: 'Compare Nexez',
    description: content.description,
  },
}

export default function ComparePage() {
  return <MarketingContentPage content={content} accent="ready" hero={<CompareHero content={content} />} />
}
