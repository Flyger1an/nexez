import type { Metadata } from 'next'
import { MarketingContentPage } from '../../components/marketing/MarketingContentPage'
import { ExamplesProof } from '../../components/marketing/ConversionProofSections'
import { ExamplesHero } from '../../components/marketing/heroes'
import { marketingPages } from '../../lib/marketing-content'
import { marketingUrl } from '../../lib/site'

const content = marketingPages.examples

export const metadata: Metadata = {
  title: 'Agent Page Examples and Templates',
  description: content.description,
  alternates: {
    canonical: marketingUrl('/examples'),
  },
  // Page-level openGraph replaces the layout's wholesale (shallow merge) — re-carry type/siteName.
  openGraph: {
    type: 'website',
    siteName: 'Nexez',
    url: marketingUrl('/examples'),
    title: 'Agent Page Examples and Templates',
    description: content.description,
  },
}

export default function ExamplesPage() {
  return (
    <MarketingContentPage
      content={content}
      accent="amber"
      hero={<ExamplesHero content={content} />}
      proof={<ExamplesProof />}
    />
  )
}
