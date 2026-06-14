import type { Metadata } from 'next'
import { MarketingContentPage } from '../../components/marketing/MarketingContentPage'
import { ReadinessHero } from '../../components/marketing/heroes'
import { marketingPages } from '../../lib/marketing-content'

const content = marketingPages['agent-readiness']

export const metadata: Metadata = {
  title: 'AI Agent Readiness',
  description: content.description,
}

export default function AgentReadinessPage() {
  return <MarketingContentPage content={content} accent="ready" hero={<ReadinessHero content={content} />} />
}
