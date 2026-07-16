import type { Metadata } from 'next'
import { GeneratorClient } from './GeneratorClient'
import { marketingUrl } from '../../../lib/site'

const metaTitle = 'Free llms.txt generator'
const metaDescription =
  'Paste your URL and get a spec-shaped llms.txt built from your own pages — free, no signup. Plus the honest take on what llms.txt does and does not do.'

export const metadata: Metadata = {
  title: metaTitle,
  description: metaDescription,
  alternates: {
    canonical: marketingUrl('/tools/llms-txt-generator'),
  },
  // Page-level openGraph replaces the layout's wholesale (shallow merge) — re-carry type/siteName.
  openGraph: {
    type: 'website',
    siteName: 'Nexez',
    url: marketingUrl('/tools/llms-txt-generator'),
    title: metaTitle,
    description: metaDescription,
  },
}

const faqs = [
  {
    question: 'Is this generator really free?',
    answer: 'Yes — no signup, no email, no watermark. Paste a URL, copy or download the file.',
  },
  {
    question: 'Does llms.txt improve my rankings?',
    answer:
      'There is no evidence it does: Ahrefs found no performance correlation, and Google says it is not required. It is a cheap, harmless addition — the artifacts agents demonstrably use (structured data, feeds, agent endpoints) matter more.',
  },
  {
    question: 'Where do I put the file?',
    answer: 'At your site root, so it is reachable at yoursite.com/llms.txt — same place as robots.txt.',
  },
  {
    question: 'What does the generator actually do?',
    answer:
      'It fetches your page once, reads the title, description, and your own navigation links, and formats them into the llmstxt.org structure with clearly marked placeholders for the parts only you can write.',
  },
]

const faqSchema = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: 'Nexez llms.txt generator',
      applicationCategory: 'DeveloperApplication',
      operatingSystem: 'Web',
      url: marketingUrl('/tools/llms-txt-generator'),
      offers: { '@type': 'Offer', price: 0, priceCurrency: 'USD' },
    },
    {
      '@type': 'FAQPage',
      mainEntity: faqs.map((faq) => ({
        '@type': 'Question',
        name: faq.question,
        acceptedAnswer: { '@type': 'Answer', text: faq.answer },
      })),
    },
  ],
}

export default function LlmsTxtGeneratorPage() {
  return (
    <main className="min-h-screen">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema).replace(/</g, '\\u003c') }}
      />
      <section className="relative overflow-hidden border-b border-border">
        <div className="pointer-events-none absolute inset-0 z-0">
          <div className="nx-grid" />
        </div>
        <div className="relative z-10 mx-auto max-w-3xl px-5 py-16 md:py-20">
          <p className="text-sm font-medium" style={{ color: 'var(--signal)' }}>
            Free tool
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.045em] md:text-5xl">llms.txt generator</h1>
          <p className="mt-4 text-muted-foreground">
            Paste your URL. We read your page once and draft a spec-shaped <span className="font-mono">llms.txt</span> from
            your own titles, description, and navigation — with placeholders marked for the parts only you can write. No
            signup.
          </p>
          <div className="mt-8">
            <GeneratorClient />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-5 py-12 md:py-16">
        <h2 className="text-2xl font-semibold tracking-[-0.03em]">The honest part</h2>
        <p className="mt-4 leading-7 text-muted-foreground">
          llms.txt is a proposed convention, not a standard anyone is required to read: Ahrefs found no correlation between
          having one and AI visibility, and Google&rsquo;s guidance says it is not required. So why generate one? Because it
          costs nothing, some agents do read it, and writing it forces you to state clearly what you sell — which is the real
          work. The full reasoning is in{' '}
          <a href="/learn/what-is-llms-txt" className="underline decoration-[var(--signal)]/50 underline-offset-2">
            What is llms.txt — and do you actually need one?
          </a>
        </p>
        <p className="mt-4 leading-7 text-muted-foreground">
          The artifacts agents weight more heavily are structured data (JSON-LD), product feeds, and callable endpoints
          (agent.json, OpenAPI, MCP).{' '}
          <a href="/scan" className="underline decoration-[var(--signal)]/50 underline-offset-2">
            Run the free scan
          </a>{' '}
          to see which of those your site already has.
        </p>

        <h2 className="mt-12 text-2xl font-semibold tracking-[-0.03em]">Frequently asked questions</h2>
        <div className="mt-5 space-y-4">
          {faqs.map((faq) => (
            <div key={faq.question} className="rounded-lg border border-border bg-white/[0.02] p-4">
              <h3 className="font-medium">{faq.question}</h3>
              <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{faq.answer}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}
