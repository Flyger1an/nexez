import type { Metadata } from 'next'
import { MarketingContentPage } from '../../components/marketing/MarketingContentPage'
import { CommerceExamplesProof } from '../../components/marketing/CommerceExamplesProof'
import { ExamplesHero } from '../../components/marketing/heroes'
import { marketingPages } from '../../lib/marketing-content'
import { marketingUrl } from '../../lib/site'

const content = marketingPages.examples

// SERP copy (≤160-char description; content.description is longer on-page hero copy).
const metaTitle = 'Agent Page Examples and Templates'
const metaDescription =
  'Reference agent-ready commerce examples across local services, events, and professional work — see what Nexez agents need before transacting.'

export const metadata: Metadata = {
  title: metaTitle,
  description: metaDescription,
  alternates: {
    canonical: marketingUrl('/examples'),
  },
  // Page-level openGraph replaces the layout's wholesale (shallow merge) — re-carry type/siteName.
  openGraph: {
    type: 'website',
    siteName: 'Nexez',
    url: marketingUrl('/examples'),
    title: metaTitle,
    description: metaDescription,
  },
}

export default function ExamplesPage() {
  return (
    <MarketingContentPage
      content={content}
      accent="amber"
      hero={<ExamplesHero content={content} />}
      proof={<CommerceExamplesProof />}
    />
  )
}
