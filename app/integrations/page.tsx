import type { Metadata } from 'next'
import { MarketingContentPage } from '../../components/marketing/MarketingContentPage'
import { marketingPages } from '../../lib/marketing-content'

const content = marketingPages.integrations

export const metadata: Metadata = {
  title: 'Integrations',
  description: content.description,
}

export default function IntegrationsMarketingPage() {
  return <MarketingContentPage content={content} />
}
