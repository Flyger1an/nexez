import type { Metadata } from 'next'
import PricingClient from './PricingClient'
import { marketingUrl } from '../../lib/site'

// Server shell so /pricing gets its own SERP title/description + canonical/OG
// (the interactive pricing UI lives in PricingClient). The root layout applies
// the '%s · Nexez' title template - don't re-brand here.
const title = 'Pricing — plans for agent-ready listings'
const description =
  'Simple, transparent plans for agent-ready listings. Every plan starts with a 7-day free trial — no card — and Pro unlocks agentic checkout for AI agents.'

export const metadata: Metadata = {
  title,
  description,
  alternates: {
    canonical: marketingUrl('/pricing'),
  },
  openGraph: {
    type: 'website',
    siteName: 'Nexez',
    url: marketingUrl('/pricing'),
    title,
    description,
  },
}

export default function PricingPage() {
  return <PricingClient />
}
