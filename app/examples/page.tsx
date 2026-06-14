import type { Metadata } from 'next'
import { MarketingContentPage } from '../../components/marketing/MarketingContentPage'
import { marketingPages } from '../../lib/marketing-content'

const content = marketingPages.examples

export const metadata: Metadata = {
  title: 'Agent Page Examples and Templates',
  description: content.description,
}

export default function ExamplesPage() {
  return <MarketingContentPage content={content} />
}
