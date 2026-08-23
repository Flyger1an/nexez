import type { Metadata } from 'next'
import { MarketingContentPage } from '../../components/marketing/MarketingContentPage'
import { AgentReadinessProof, AgentReadyCertificationStandard } from '../../components/marketing/ConversionProofSections'
import { ReadinessHero } from '../../components/marketing/heroes'
import { marketingPages } from '../../lib/marketing-content'
import { marketingUrl } from '../../lib/site'

const content = marketingPages['agent-readiness']

// SERP copy (≤160-char description; content.description is longer on-page hero copy).
const metaTitle = 'AI Agent Readiness'
const metaDescription =
  'How Nexez separates listing completeness, trust evidence, runtime checks, machine artifacts, actionability, and buyer approval for AI agents.'

export const metadata: Metadata = {
  title: metaTitle,
  description: metaDescription,
  alternates: {
    canonical: marketingUrl('/agent-readiness'),
  },
  // Page-level openGraph replaces the layout's wholesale (shallow merge) - re-carry type/siteName.
  openGraph: {
    type: 'website',
    siteName: 'Nexez',
    url: marketingUrl('/agent-readiness'),
    title: metaTitle,
    description: metaDescription,
  },
}

export default function AgentReadinessPage() {
  return (
    <MarketingContentPage
      content={content}
      accent="ready"
      hero={<ReadinessHero content={content} />}
      proof={
        <>
          <AgentReadinessProof />
          <AgentReadyCertificationStandard />
        </>
      }
    />
  )
}
