import type { Metadata } from 'next'
import GlobalAgentSimulator from './SimulatorClient'
import { marketingUrl } from '../../lib/site'

// Server shell so /simulator gets its own SERP title/description + canonical/OG
// (the Agent Lab UI lives in SimulatorClient). The root layout applies the
// '%s · Nexez' title template - don't re-brand here.
const title = 'Agent Checkout Simulator'
const description =
  'Simulate how ChatGPT, Claude, Grok, and Perplexity read any listing or website — readiness scores, agent checkout success, and competitor comparison.'

export const metadata: Metadata = {
  title,
  description,
  alternates: {
    canonical: marketingUrl('/simulator'),
  },
  openGraph: {
    type: 'website',
    siteName: 'Nexez',
    url: marketingUrl('/simulator'),
    title,
    description,
  },
}

export default function SimulatorPage() {
  return <GlobalAgentSimulator />
}
