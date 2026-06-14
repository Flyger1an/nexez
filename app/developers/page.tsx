import type { Metadata } from 'next'
import { MarketingContentPage } from '../../components/marketing/MarketingContentPage'
import { marketingPages } from '../../lib/marketing-content'

const content = marketingPages.developers

export const metadata: Metadata = {
  title: 'Developers',
  description: content.description,
}

export default function DevelopersPage() {
  return <MarketingContentPage content={content} />
}
