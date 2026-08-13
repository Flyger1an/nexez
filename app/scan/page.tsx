import type { Metadata } from 'next'
import { marketingUrl } from '../../lib/site'
import { ScanClient } from './ScanClient'

export const metadata: Metadata = {
  title: 'Can AI find your business? | Free scan',
  description:
    'See what ChatGPT, Perplexity, and buyer agents actually read from your site: offers, pricing, checkout paths, and crawler access. Free, no signup.',
  alternates: {
    canonical: marketingUrl('/scan'),
  },
  // Page-level openGraph replaces the layout's wholesale (shallow merge), so re-carry type/siteName.
  openGraph: {
    type: 'website',
    siteName: 'Nexez',
    url: marketingUrl('/scan'),
    title: 'Can AI find your business? | Free scan',
    description:
      'See what ChatGPT, Perplexity, and buyer agents actually read from your site: offers, pricing, checkout paths, and crawler access. Free, no signup.',
  },
}

export default async function ScanPage({
  searchParams,
}: {
  searchParams: Promise<{ url?: string | string[] }>
}) {
  const params = await searchParams
  const raw = Array.isArray(params.url) ? params.url[0] : params.url
  const initialUrl = typeof raw === 'string' ? raw.slice(0, 2048) : ''
  return <ScanClient initialUrl={initialUrl} />
}
