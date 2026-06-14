import type { Metadata } from 'next'
import { MarketingContentPage } from '../../components/marketing/MarketingContentPage'
import { marketingPages } from '../../lib/marketing-content'

const content = marketingPages.compare

export const metadata: Metadata = {
  title: 'Compare Nexez',
  description: content.description,
}

export default function ComparePage() {
  return <MarketingContentPage content={content} />
}
