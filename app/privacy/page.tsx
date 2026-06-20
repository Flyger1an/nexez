import type { Metadata } from 'next'
import { ArrowLeft } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How Nexez collects, uses, and protects your information.',
}

const LAST_UPDATED = 'June 19, 2026'

const sections: { heading: string; body: string[] }[] = [
  {
    heading: '1. Overview',
    body: [
      'This Privacy Policy explains what information Nexez collects, how we use it, and the choices you have. It applies to the Nexez dashboard, page builder, custom-domain hosting, APIs, and the Nxxi mobile buyer-agent app (together, the "Service").',
    ],
  },
  {
    heading: '2. Information You Provide',
    body: [
      'Account details: your name, company/business name, industry, and email when you sign up (including via Sign in with Apple or Google, which share your email and basic profile). Business content: the offers, descriptions, FAQs, and other information you publish. Configuration: custom domains, integration settings, and API key names.',
      'Buyer activity (Nxxi app): the messages you send your buyer agent, your standing preferences (budget, interests, timing, location), and the buyer details you approve for a purchase or negotiation (such as your email and order references).',
    ],
  },
  {
    heading: '3. Information Collected Automatically',
    body: [
      'Agent & visitor analytics: when your published pages are viewed, we record events (such as page views, discovery clicks, and checkout intents) and, for AI agents, classification signals derived from the request (e.g., user-agent and referrer).',
      'Mobile app: a device push-notification token (so we can notify you about your orders), and — only if you opt in — crash and diagnostic data via our error-monitoring provider to help us fix problems.',
      'Privacy-safe IPs: visitor IP addresses are never stored in raw form — only a salted hash is kept for de-duplication and abuse prevention.',
    ],
  },
  {
    heading: '4. Voice & Microphone (Nxxi app)',
    body: [
      'When you use voice input, your device’s speech-recognition service converts your speech to text so the agent can act on it. We process the resulting text like any other message; we do not store raw audio recordings. Microphone access is used only while you are actively dictating, and you can use the app entirely by typing instead.',
    ],
  },
  {
    heading: '5. How We Use Information',
    body: [
      'To operate and improve the Service; to run your buyer agent and generate recommendations; to send notifications about your orders (when enabled); to generate agent-readable artifacts and analytics; to provide support; to detect and prevent abuse; and to communicate with you about your account.',
    ],
  },
  {
    heading: '6. AI Processing',
    body: [
      'Your buyer-agent requests are sent to a large-language-model provider to interpret your intent and draft responses. When you enable external discovery sources, your search query may also be sent to a third-party search provider. These providers process the request to return a result and operate under their own terms; we do not sell your data to them.',
    ],
  },
  {
    heading: '7. Public Pages & Agents',
    body: [
      'Content you publish is intentionally public and structured so that AI agents and search engines can read it. Do not publish information you wish to keep private. Operational secrets (such as webhook signing secrets) are stored separately and are never exposed on public pages.',
    ],
  },
  {
    heading: '8. Service Providers',
    body: [
      'We use trusted processors to run the Service: Supabase (database + authentication), our hosting provider, Expo (mobile builds + push delivery), Sentry (opt-in crash/error monitoring), a large-language-model provider (buyer-agent requests), a third-party search provider (optional external discovery), and — where you enable them — payment and scheduling providers such as Stripe and Calendly. These providers process data on our behalf under their own terms.',
    ],
  },
  {
    heading: '9. Data Retention & Deletion',
    body: [
      'We retain account and content data for as long as your account is active. You can delete pages at any time. You can permanently delete your account in the Nxxi app (Profile → Delete account) or via the dashboard — this removes your account, agent data, preferences, and any pages you own, and anonymizes your buyer details on past transaction records, except where retention is required by law.',
    ],
  },
  {
    heading: '10. Your Rights',
    body: [
      'Depending on your jurisdiction, you may have rights to access, correct, export, or delete your personal data. You can delete your account in-app; for access or export requests, contact us and we will respond within the timeframe your law requires.',
    ],
  },
  {
    heading: '11. Children',
    body: [
      'The Service is not directed to children under 13 (or the minimum age in your jurisdiction), and we do not knowingly collect their personal data. If you believe a child has provided us data, contact us and we will delete it.',
    ],
  },
  {
    heading: '12. Security',
    body: [
      'We use industry-standard measures including encryption in transit, row-level security on tenant data, hashed API keys, secure on-device token storage in the mobile app, and least-privilege access. No system is perfectly secure, but we work to protect your data.',
    ],
  },
  {
    heading: '13. Changes & Contact',
    body: [
      'We may update this policy; material changes will be reflected by the “Last updated” date above. Privacy questions can be sent to privacy@nexez.app.',
    ],
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
          See also our <a href="/terms" className="text-[var(--signal)] hover:underline">Terms of Service</a>.
        </p>
      </div>
    </main>
  )
}
