import type { Metadata } from 'next'
import { MarketingContentPage } from '../../components/marketing/MarketingContentPage'
import { CompareHero } from '../../components/marketing/heroes'
import { marketingPages } from '../../lib/marketing-content'
import { marketingUrl } from '../../lib/site'

const content = marketingPages.compare

// SERP copy (≤60-char title incl. the layout's ' · Nexez' - no double branding; ≤160-char description).
const metaTitle = 'Nexez vs websites, directories & SEO pages'
const metaDescription =
  'Where Nexez fits beside websites, directories, schedulers, payment processors, commerce platforms, and SEO when AI agents discover and act.'

export const metadata: Metadata = {
  title: metaTitle,
  description: metaDescription,
  alternates: {
    canonical: marketingUrl('/compare'),
  },
  // Page-level openGraph replaces the layout's wholesale (shallow merge) - re-carry type/siteName.
  openGraph: {
    type: 'website',
    siteName: 'Nexez',
    url: marketingUrl('/compare'),
    title: metaTitle,
    description: metaDescription,
  },
}

export default function ComparePage() {
  return <MarketingContentPage content={content} accent="ready" hero={<CompareHero content={content} />} />
}
