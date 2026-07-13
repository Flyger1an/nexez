import type { Metadata } from 'next'
import { marketingUrl } from '../../lib/site'
import { ScanClient } from './ScanClient'

export const metadata: Metadata = {
  title: 'Is your website agent-legible? | Free scan',
  description:
    'Scan any website for agent legibility. Test structured offers, pricing, buyer actions, agent manifests, and crawler access.',
  alternates: {
    canonical: marketingUrl('/scan'),
  },
  // Page-level openGraph replaces the layout's wholesale (shallow merge) — re-carry type/siteName.
  openGraph: {
    type: 'website',
    siteName: 'Nexez',
    url: marketingUrl('/scan'),
    title: 'Is your website agent-legible? | Free scan',
    description:
      'Scan any website for agent legibility. Test structured offers, pricing, buyer actions, agent manifests, and crawler access.',
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
