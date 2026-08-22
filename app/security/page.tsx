import type { Metadata } from 'next'
import { MarketingContentPage } from '../../components/marketing/MarketingContentPage'
import { SecurityHero } from '../../components/marketing/heroes'
import { marketingPages } from '../../lib/marketing-content'
import { marketingUrl } from '../../lib/site'

const content = marketingPages.security

// SERP copy (≤160-char description; content.description is longer on-page hero copy).
const metaTitle = 'Security and Trust'
const metaDescription =
  'Nexez security: separated hosts, row-level data access, restricted public projections, encrypted credentials, signed events, and release controls.'

export const metadata: Metadata = {
  title: metaTitle,
  description: metaDescription,
  alternates: {
    canonical: marketingUrl('/security'),
  },
  // Page-level openGraph replaces the layout's wholesale (shallow merge) — re-carry type/siteName.
  openGraph: {
    type: 'website',
    siteName: 'Nexez',
    url: marketingUrl('/security'),
    title: metaTitle,
    description: metaDescription,
  },
}

export default function SecurityPage() {
  return <MarketingContentPage content={content} accent="amber" hero={<SecurityHero content={content} />} />
}
