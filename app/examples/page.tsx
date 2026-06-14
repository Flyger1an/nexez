import type { Metadata } from 'next'
import { MarketingContentPage } from '../../components/marketing/MarketingContentPage'
import { ExamplesHero } from '../../components/marketing/heroes'
import { marketingPages } from '../../lib/marketing-content'

const content = marketingPages.examples

export const metadata: Metadata = {
  title: 'Agent Page Examples and Templates',
  description: content.description,
}

export default function ExamplesPage() {
  return <MarketingContentPage content={content} accent="amber" hero={<ExamplesHero content={content} />} />
}
