import type { Metadata } from 'next'
import { MarketingContentPage } from '../../components/marketing/MarketingContentPage'
import { EnterpriseHero } from '../../components/marketing/heroes'
import { marketingPages } from '../../lib/marketing-content'
import { marketingUrl } from '../../lib/site'

const content = marketingPages.enterprise

// SERP copy (≤60-char title incl. the layout's ' · Nexez'; ≤160-char description).
const metaTitle = 'Enterprise agent commerce'
const metaDescription =
  'Roll out agent-legible, transactable listings across your organization — SSO, custom terms, dedicated support, and volume pricing.'

export const metadata: Metadata = {
  title: metaTitle,
  description: metaDescription,
  alternates: {
    canonical: marketingUrl('/enterprise'),
  },
  // Page-level openGraph replaces the layout's wholesale (shallow merge) — re-carry type/siteName.
  openGraph: {
    type: 'website',
    siteName: 'Nexez',
    url: marketingUrl('/enterprise'),
    title: metaTitle,
    description: metaDescription,
  },
}

export default function EnterprisePage() {
  return <MarketingContentPage content={content} accent="signal" hero={<EnterpriseHero content={content} />} />
}
