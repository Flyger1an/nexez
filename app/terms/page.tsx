import type { Metadata } from 'next'
import { ArrowLeft } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'The terms governing your use of the Nexez platform.',
}

const LAST_UPDATED = 'June 3, 2026'

const sections: { heading: string; body: string[] }[] = [
  {
    heading: '1. Agreement to Terms',
    body: [
      'These Terms of Service ("Terms") govern your access to and use of the Nexez platform, including the dashboard, page builder, custom-domain hosting, APIs, and related services (collectively, the "Service"). By creating an account or using the Service, you agree to these Terms.',
    ],
  },
  {
    heading: '2. Accounts',
    body: [
      'You must provide accurate account information and are responsible for safeguarding your credentials and API keys. You are responsible for all activity that occurs under your account. Notify us promptly of any unauthorized use.',
    ],
  },
  {
    heading: '3. Your Content',
    body: [
      'You retain ownership of the business information, offers, and other content you publish ("Your Content"). You grant Nexez a license to host, process, and display Your Content for the purpose of operating the Service — including generating agent-readable artifacts (such as JSON-LD, llms.txt, and agent manifests) and serving your pages on Nexez subdomains and your connected custom domains.',
      'You are responsible for the accuracy and legality of Your Content and for having the rights to publish it.',
    ],
  },
  {
    heading: '4. Custom Domains',
    body: [
      'When you connect a custom domain, you represent that you own or control it. You are responsible for your DNS configuration. Nexez provisions TLS and serves your pages but is not responsible for downtime caused by misconfigured DNS or third-party domain registrars.',
    ],
  },
  {
    heading: '5. Acceptable Use',
    body: [
      'You agree not to use the Service to publish unlawful, deceptive, or infringing content; to misrepresent pricing or availability to buyers or agents; to interfere with the Service; or to attempt to access data that is not yours. We may suspend accounts that violate these Terms.',
    ],
  },
  {
    heading: '6. Payments & Agent Transactions',
    body: [
      'Certain features rely on third-party providers (e.g., Stripe, Calendly). Your use of those features is also subject to their terms. Where Nexez facilitates agent-driven checkout or negotiation, you remain the merchant of record for transactions with your buyers unless stated otherwise.',
    ],
  },
  {
    heading: '7. Disclaimers',
    body: [
      'The Service is provided "as is" without warranties of any kind. We do not guarantee that AI agents will discover, rank, or transact with your pages, nor that any particular business outcome will result from using the Service.',
    ],
  },
  {
    heading: '8. Limitation of Liability',
    body: [
      'To the maximum extent permitted by law, Nexez will not be liable for indirect, incidental, or consequential damages, or for lost profits or revenues, arising out of your use of the Service.',
    ],
  },
  {
    heading: '9. Changes',
    body: [
      'We may update these Terms from time to time. Material changes will be reflected by updating the "Last updated" date. Continued use of the Service after changes constitutes acceptance.',
    ],
  },
  {
    heading: '10. Contact',
    body: ['Questions about these Terms can be sent to legal@nexez.app.'],
  },
]

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#0A0A0F] text-white">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <a href="/" className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white">
          <ArrowLeft className="size-4" /> Home
        </a>
        <h1 className="mt-8 text-4xl font-semibold tracking-tight">Terms of Service</h1>
        <p className="mt-2 text-sm text-zinc-400">Last updated: {LAST_UPDATED}</p>

        <div className="mt-6 rounded-lg border border-[var(--amber)]/20 bg-[var(--amber)]/5 p-4 text-xs text-[var(--amber)]/90">
          This is a general template provided for convenience and is not legal advice. Have it reviewed by counsel
          before relying on it for your business.
        </div>

        <div className="mt-8 space-y-8">
          {sections.map((s) => (
            <section key={s.heading}>
              <h2 className="text-xl font-semibold text-white">{s.heading}</h2>
              {s.body.map((p, i) => (
                <p key={i} className="mt-3 text-sm leading-7 text-zinc-300">
                  {p}
                </p>
              ))}
            </section>
          ))}
        </div>

        <p className="mt-12 text-sm text-zinc-500">
          See also our <a href="/privacy" className="text-[var(--signal)] hover:underline">Privacy Policy</a>.
        </p>
      </div>
    </main>
  )
}
