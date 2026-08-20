import type { Metadata } from 'next'
import { HowItWorksExperience } from '../../components/marketing/HowItWorksExperience'
import { marketingUrl } from '../../lib/site'

const metaTitle = 'How It Works'
const metaDescription =
  'Tell Nexez what you sell, set your preferences, and let customers and AI assistants choose the right service, get the right price, and place an order.'

export const metadata: Metadata = {
  title: metaTitle,
  description: metaDescription,
  keywords: [
    'AI assistants for business',
    'service business sales',
    'online service booking',
    'service pricing',
    'repeat services',
    'AI shopping',
  ],
  alternates: {
    canonical: marketingUrl('/how-it-works'),
  },
  openGraph: {
    type: 'website',
    siteName: 'Nexez',
    url: marketingUrl('/how-it-works'),
    title: metaTitle,
    description: metaDescription,
  },
}

export default function HowItWorksPage() {
  return <HowItWorksExperience />
}
