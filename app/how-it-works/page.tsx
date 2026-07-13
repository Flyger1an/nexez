import type { Metadata } from 'next'
import { MarketingContentPage } from '../../components/marketing/MarketingContentPage'
import { HowItWorksProof } from '../../components/marketing/ConversionProofSections'
import { HowItWorksHero } from '../../components/marketing/heroes'
import { marketingPages } from '../../lib/marketing-content'
import { marketingUrl } from '../../lib/site'

const content = marketingPages['how-it-works']

export const metadata: Metadata = {
  title: 'How Nexez Works',
  description: content.description,
  alternates: {
    canonical: marketingUrl('/how-it-works'),
  },
  // Page-level openGraph replaces the layout's wholesale (shallow merge) — re-carry type/siteName.
  openGraph: {
    type: 'website',
    siteName: 'Nexez',
    url: marketingUrl('/how-it-works'),
    title: 'How Nexez Works',
    description: content.description,
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
