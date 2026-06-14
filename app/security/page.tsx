import type { Metadata } from 'next'
import { MarketingContentPage } from '../../components/marketing/MarketingContentPage'
import { marketingPages } from '../../lib/marketing-content'

const content = marketingPages.security

export const metadata: Metadata = {
  title: 'Security and Trust',
  description: content.description,
}

export default function SecurityPage() {
  return <MarketingContentPage content={content} />
}
