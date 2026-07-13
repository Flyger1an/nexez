import { SupportDesk } from '../../components/SupportDesk'
import { marketingUrl } from '../../lib/site'

export const metadata = {
  title: 'Support',
  description: 'Get AI-assisted Nexez support or create a support ticket with listing context attached.',
  alternates: {
    canonical: marketingUrl('/support'),
  },
  // Page-level openGraph replaces the layout's wholesale (shallow merge) — re-carry type/siteName.
  openGraph: {
    type: 'website',
    siteName: 'Nexez',
    url: marketingUrl('/support'),
    title: 'Support',
    description: 'Get AI-assisted Nexez support or create a support ticket with listing context attached.',
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
