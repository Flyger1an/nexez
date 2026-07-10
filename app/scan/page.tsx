import type { Metadata } from 'next'
import { ScanClient } from './ScanClient'

export const metadata: Metadata = {
  title: 'Is your website agent-legible? | Free scan',
  description:
    'Scan any website for agent legibility. Test structured offers, pricing, buyer actions, agent manifests, and crawler access.',
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
