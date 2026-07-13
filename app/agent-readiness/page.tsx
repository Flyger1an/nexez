import type { Metadata } from 'next'
import { MarketingContentPage } from '../../components/marketing/MarketingContentPage'
import { AgentReadinessProof } from '../../components/marketing/ConversionProofSections'
import { ReadinessHero } from '../../components/marketing/heroes'
import { marketingPages } from '../../lib/marketing-content'
import { marketingUrl } from '../../lib/site'

const content = marketingPages['agent-readiness']

// SERP copy (≤160-char description; content.description is longer on-page hero copy).
const metaTitle = 'AI Agent Readiness'
const metaDescription =
  'What makes a website legible to AI agents — the readiness checklist, scoring, and the artifacts (agent.json, llms.txt, JSON-LD) that make you transactable.'

export const metadata: Metadata = {
  title: metaTitle,
  description: metaDescription,
  alternates: {
    canonical: marketingUrl('/agent-readiness'),
  },
  // Page-level openGraph replaces the layout's wholesale (shallow merge) — re-carry type/siteName.
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
      proof={<AgentReadinessProof />}
    />
  )
}
