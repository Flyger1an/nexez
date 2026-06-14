import type { Metadata } from 'next'
import { MarketingContentPage } from '../../components/marketing/MarketingContentPage'
import { IntegrationsHero } from '../../components/marketing/heroes'
import { marketingPages } from '../../lib/marketing-content'

const content = marketingPages.integrations

export const metadata: Metadata = {
  title: 'Integrations',
  description: content.description,
}

export default function IntegrationsMarketingPage() {
  return <MarketingContentPage content={content} accent="ready" hero={<IntegrationsHero content={content} />} />
}
