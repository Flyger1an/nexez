import type { Metadata } from 'next'
import { ArrowLeft } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Privacy Policy | Nexez',
  description: 'How Nexez collects, uses, and protects your information.',
}

const LAST_UPDATED = 'June 3, 2026'

const sections: { heading: string; body: string[] }[] = [
  {
    heading: '1. Overview',
    body: [
      'This Privacy Policy explains what information Nexez collects, how we use it, and the choices you have. It applies to the Nexez dashboard, page builder, custom-domain hosting, and APIs (the "Service").',
    ],
  },
  {
    heading: '2. Information You Provide',
    body: [
      'Account details: your name, company/business name, industry, and email when you sign up. Business content: the offers, descriptions, FAQs, and other information you publish. Configuration: custom domains, integration settings, and API key names.',
    ],
  },
  {
    heading: '3. Information Collected Automatically',
    body: [
      'Agent & visitor analytics: when your published pages are viewed, we record events (such as page views, discovery clicks, and checkout intents) and, for AI agents, classification signals derived from the request (e.g., user-agent and referrer).',
      'Privacy-safe IPs: visitor IP addresses are never stored in raw form — only a salted hash is kept for de-duplication and abuse prevention.',
    ],
  },
  {
    heading: '4. How We Use Information',
    body: [
      'To operate and improve the Service; to generate agent-readable artifacts and analytics; to provide support; to detect and prevent abuse; and to communicate with you about your account.',
    ],
  },
  {
    heading: '5. Public Pages & Agents',
    body: [
      'Content you publish is intentionally public and structured so that AI agents and search engines can read it. Do not publish information you wish to keep private. Operational secrets (such as webhook signing secrets) are stored separately and are never exposed on public pages.',
    ],
  },
  {
    heading: '6. Service Providers',
    body: [
      'We use trusted processors to run the Service, including Supabase (database, authentication) and Vercel (hosting), and — where you enable them — payment and scheduling providers such as Stripe and Calendly. These providers process data on our behalf under their own terms.',
    ],
  },
  {
    heading: '7. Data Retention',
    body: [
      'We retain account and content data for as long as your account is active. You can delete pages at any time, and you may request account deletion, after which we remove or anonymize associated data except where retention is required by law.',
    ],
  },
  {
    heading: '8. Your Rights',
    body: [
      'Depending on your jurisdiction, you may have rights to access, correct, export, or delete your personal data. Contact us to exercise these rights.',
    ],
  },
  {
    heading: '9. Security',
    body: [
      'We use industry-standard measures including encryption in transit, row-level security on tenant data, hashed API keys, and least-privilege access. No system is perfectly secure, but we work to protect your data.',
    ],
  },
  {
    heading: '10. Contact',
    body: ['Privacy questions can be sent to privacy@nexez.app.'],
  },
]

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#0A0A0F] text-white">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <a href="/" className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white">
          <ArrowLeft className="size-4" /> Home
        </a>
        <h1 className="mt-8 text-4xl font-semibold tracking-tight">Privacy Policy</h1>
        <p className="mt-2 text-sm text-zinc-400">Last updated: {LAST_UPDATED}</p>

        <div className="mt-6 rounded-lg border border-amber-300/20 bg-amber-400/5 p-4 text-xs text-amber-200/90">
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
          See also our <a href="/terms" className="text-cyan-200 hover:underline">Terms of Service</a>.
        </p>
      </div>
    </main>
  )
}
