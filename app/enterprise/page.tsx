import type { Metadata } from 'next'
import { MarketingContentPage } from '../../components/marketing/MarketingContentPage'
import { EnterpriseHero } from '../../components/marketing/heroes'
import { marketingPages } from '../../lib/marketing-content'

const content = marketingPages.enterprise

export const metadata: Metadata = {
  title: 'Enterprise',
  description: content.description,
}

export default function EnterprisePage() {
  return <MarketingContentPage content={content} accent="signal" hero={<EnterpriseHero content={content} />} />
}
