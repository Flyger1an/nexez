import type { Metadata } from 'next'
import { MarketingContentPage } from '../../components/marketing/MarketingContentPage'
import { HowItWorksProof } from '../../components/marketing/ConversionProofSections'
import { HowItWorksHero } from '../../components/marketing/heroes'
import { marketingPages } from '../../lib/marketing-content'
import { marketingUrl } from '../../lib/site'

const content = marketingPages['how-it-works']

// SERP copy (≤160-char description; content.description is longer on-page hero copy).
const metaTitle = 'How Nexez Works'
const metaDescription =
  'Publish one structured listing and AI agents can find, understand, and transact with your business — the three steps from setup to your first agent sale.'

export const metadata: Metadata = {
  title: metaTitle,
  description: metaDescription,
  alternates: {
    canonical: marketingUrl('/how-it-works'),
  },
  // Page-level openGraph replaces the layout's wholesale (shallow merge) — re-carry type/siteName.
  openGraph: {
    type: 'website',
    siteName: 'Nexez',
    url: marketingUrl('/how-it-works'),
    title: metaTitle,
    description: metaDescription,
  },
}

export default function HowItWorksPage() {
  return (
    <MarketingContentPage
      content={content}
      accent="signal"
      hero={<HowItWorksHero content={content} />}
      proof={<HowItWorksProof />}
    />
  )
}
