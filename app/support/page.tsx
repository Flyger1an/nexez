import { SupportDesk } from '../../components/SupportDesk'
import { marketingUrl } from '../../lib/site'

// Single-sourced meta copy: <title> ≤60 chars with the layout's ' · Nexez' template,
// description ≤160 chars, mirrored into openGraph below (page OG replaces the layout's).
const metaTitle = 'Support - Help with agent-ready listings'
const metaDescription =
  'Get AI-assisted help with your Nexez workspace and agent-ready listings - Nexez AI attempts a fix first, then packages the context into a ticket for a human.'

export const metadata = {
  title: metaTitle,
  description: metaDescription,
  alternates: {
    canonical: marketingUrl('/support'),
  },
  // Page-level openGraph replaces the layout's wholesale (shallow merge) - re-carry type/siteName.
  openGraph: {
    type: 'website',
    siteName: 'Nexez',
    url: marketingUrl('/support'),
    title: metaTitle,
    description: metaDescription,
  },
}

export default function SupportPage() {
  return (
    <main className="min-h-screen bg-background text-white">
      <div className="mx-auto max-w-7xl px-5 py-8 md:px-8">
        <section className="mb-8 border-b border-border pb-8">
          <p className="text-sm font-medium text-muted-foreground">Nexez Support</p>
          <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-[-0.05em] md:text-6xl">
            What can we help you with?
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">
            Pick the workspace or agent listing first. Nexez AI will attempt a fix, then package the context into a ticket if you still need a human.
          </p>
        </section>

        <SupportDesk />
      </div>
    </main>
  )
}
