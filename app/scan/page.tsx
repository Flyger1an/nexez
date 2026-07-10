import type { Metadata } from 'next'
import { ScanClient } from './ScanClient'

export const metadata: Metadata = {
  title: 'Is your website agent-legible? — Free scan',
  description:
    'Scan any website for agent legibility in seconds. See how AI shopping agents read your site — structured data, agent.json, llms.txt, crawler access — and how to fix the gaps.',
}

export default function ScanPage() {
  return <ScanClient />
}
