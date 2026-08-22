import type { Metadata } from 'next'
import { MarketingContentPage } from '../../components/marketing/MarketingContentPage'
import { CommerceExamplesProof } from '../../components/marketing/CommerceExamplesProof'
import { ExamplesHero } from '../../components/marketing/heroes'
import { marketingPages } from '../../lib/marketing-content'
import { appUrl, marketingUrl } from '../../lib/site'

const content = {
  ...marketingPages.examples,
  description:
    'Explore seven canonical reference templates that show how Nexez represents recurring, mobile, event, professional, education, and project-based service commerce.',
  primaryCta: { label: 'Build your version', href: appUrl('/create') },
  stats: [
    { value: '7', label: 'Canonical pilot templates' },
    { value: '1', label: 'Shared commerce registry' },
    { value: '0', label: 'Live-provider claims' },
  ],
  visualTitle: 'Commerce template logic',
  visualItems: [
    'Start from the customer intent and work backward to the facts an agent needs.',
    'Use the same definition for reference examples, seller interview intelligence, and evaluations.',
    'Keep template knowledge separate from merchant truth until the business confirms its own facts.',
  ],
  finalCtaTitle: 'Teach Nexez how your business actually works.',
  finalCtaCopy: 'Start with Nexxi, describe your business in plain language, and confirm the facts that make your offers transactable.',
}

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
