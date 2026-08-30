import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'
import { SMS_PRIVACY_NON_SHARING_COPY } from '../../lib/sms-consent'
import { marketingUrl } from '../../lib/site'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How Nexez collects, uses, and protects your information.',
  alternates: {
    canonical: marketingUrl('/privacy'),
  },
  // Page-level openGraph replaces the layout's wholesale (shallow merge) - re-carry type/siteName.
  openGraph: {
    type: 'website',
    siteName: 'Nexez',
    url: marketingUrl('/privacy'),
    title: 'Privacy Policy',
    description: 'How Nexez collects, uses, and protects your information.',
  },
}

const LAST_UPDATED = 'August 30, 2026'

const sections: { heading: string; body: ReactNode[] }[] = [
  {
    heading: '1. Overview',
    body: [
      'This Privacy Policy explains how Nexez collects, uses, discloses, retains, and protects personal data. It applies to Nexez websites, seller tools, hosted listings and storefronts, APIs, integrations, developer tools, support, and the Nexxi buyer-agent experience, including the mobile app (together, the "Service").',
      'Nexez generally acts as the controller of account, buyer-agent, billing, support, security, and product-usage data. When a merchant connects a third-party platform or asks Nexez to process data on the merchant’s behalf, the merchant and Nexez may have different legal roles under applicable law and the provider’s terms.',
    ],
  },
  {
    heading: '2. Account, Business & Support Information',
    body: [
      'We process account details such as your name, email, authentication identifiers, company or business name, industry, role, and preferences. If you sign in with Apple, Google, or another identity provider, we receive the account details that provider shares with us.',
      'We process the listings, storefronts, offers, descriptions, prices, availability, FAQs, policies, media, custom domains, branding, and other business content you create or import. We also process workspace membership, team invitations, integration settings, API-key names, outbound-webhook settings, support requests, feedback, and communications with us.',
      'Launch pass invitations: when a business invites another business, we process the recipient business email, sender business name, delivery and claim status, and campaign eligibility records. Invitation tokens are stored as one-way hashes. To prevent duplicate promotional claims, we record verified business identity signals such as a verified website or custom domain, connected Shopify store, or charges-enabled Stripe account.',
    ],
  },
  {
    heading: '3. Buyer, Agent & Transaction Information',
    body: [
      'We process buyer-agent messages, saved sellers and searches, standing preferences such as budget, interests, timing, and location, scheduled tasks, notifications, referral activity, and the information a buyer approves for a purchase, booking, service request, or negotiation.',
      'Transaction records can include seller and listing references, selected offers, configuration choices, buyer contact details, budgets, timelines, negotiation messages and decisions, approval records, agreements, checkout and payment status, order and refund status, disputes, provider identifiers, receipts, and fraud-prevention or idempotency records. Card numbers and card security codes are collected by payment providers such as Stripe and are not intentionally stored by Nexez.',
      'Businesses and buyers are responsible for avoiding sensitive personal information in free-text messages unless it is necessary for the requested transaction.',
    ],
  },
  {
    heading: '4. Connected Services',
    body: [
      'When you connect Shopify, we process the shop domain, installation and sync status, encrypted access credentials, and the active product catalog used for Nexez listings. Catalog data can include product names, descriptions, variants, prices, availability, inventory signals, currency, and storefront URLs. The Nexez Shopify app requests product access and does not request Shopify customer or order data.',
      'Other optional integrations can provide account or resource identifiers, catalog or service data, prices, scheduling links, appointment types, calendar availability or busy-time information, payment-account status, and synchronization events. Depending on what you enable, these integrations can include Stripe, Square, Calendly, Acuity, Google Calendar, and similar providers.',
      'You control whether to connect an optional integration. Disconnecting an integration stops new synchronization, but information already incorporated into a listing or transaction can remain until it is removed under the applicable retention and deletion rules.',
    ],
  },
  {
    heading: '5. Information Collected Automatically',
    body: [
      'When people, applications, or AI agents use the Service, we process device and request information such as browser or client type, user-agent, referrer, pages or API routes requested, timestamps, approximate network information, authentication events, errors, rate-limit events, and security signals.',
      'When published listings are viewed or used, we record events such as page views, searches, discovery clicks, validation attempts, checkout intents, and transaction-funnel events. We can classify requests as human or agent traffic using request signals. We use a first-party experiment cookie to keep a visitor in a consistent product or page variation.',
      'For signed-in Nexxi users, we record a limited activation funnel such as app open, onboarding completion, completed agent turn, checkout start or return, and feedback opening. These events are linked to the account and include platform and release identifiers so we can evaluate beta reliability and activation. They do not include message or search text, email, raw IP address, payment details, advertising identifiers, or arbitrary event metadata.',
      'Website readiness scanner: when you submit a public URL, we fetch a limited portion of the public page and its public agent-discovery files to produce a report. We do not retain the fetched page content. We record the submitted domain, score, timing, and service telemetry needed to operate, secure, and improve the scanner. If you choose the model-assisted analysis, up to 8,000 characters of public page text are sent to our configured large-language-model provider.',
      'The mobile app can process a device push-notification token so we can send enabled order and account notifications. If diagnostic reporting is enabled, we and our monitoring provider process crash and performance information needed to investigate problems.',
      'IP addresses may be processed transiently for security and rate limiting. Where an identifier is retained for analytics or de-duplication, we use a salted hash instead of the raw address.',
    ],
  },
  {
    heading: '6. Voice & Microphone',
    body: [
      'When you use voice input, your device’s speech-recognition service converts your speech to text so the agent can act on it. We process the resulting text like any other message; we do not store raw audio recordings. Microphone access is used only while you are actively dictating, and you can use the app entirely by typing instead.',
    ],
  },
  {
    heading: '7. SMS Notifications',
    body: [
      <>
        Nexez offers optional transactional SMS alerts when a new seller negotiation needs review. To subscribe, you enter a mobile number in account settings, actively select an unchecked consent box, and verify that number. Message frequency varies with your activity. Message and data rates may apply. Reply <strong>STOP</strong> to opt out or <strong>HELP</strong> for help.
      </>,
      <>
        Nexez collects the mobile phone number you enter and records your opt-in, verification, and opt-out status solely to provide and administer these transactional alerts. Consent is not a condition of purchase. {SMS_PRIVACY_NON_SHARING_COPY} For support, visit <a href="https://nexez.ai/support" className="text-[var(--signal)] hover:underline">https://nexez.ai/support</a>.
      </>,
    ],
  },
  {
    heading: '8. How We Use Information',
    body: [
      'We use information to provide, personalize, maintain, and secure the Service; authenticate users; publish human- and agent-readable business content; operate buyer-agent, search, comparison, validation, negotiation, booking, checkout, order, refund, and support workflows; synchronize enabled integrations; administer plans, billing, promotional access, and invitations; send requested or service-related communications; analyze performance; troubleshoot; enforce our terms; prevent fraud and abuse; and comply with law.',
      'Where a legal basis is required, we rely on performance of a contract, steps requested before entering a contract, our legitimate interests in operating and securing the Service, consent where required, and compliance with legal obligations. We do not use Shopify merchant or catalog data for behavioral advertising.',
    ],
  },
  {
    heading: '9. AI Processing & Automated Assistance',
    body: [
      'Buyer-agent requests, relevant conversation context, public listing information, and information needed to perform a requested task can be sent to a configured large-language-model provider to interpret intent and draft responses. When external discovery is enabled, a search query can also be sent to a third-party search or business-information provider.',
      'AI-generated results can be incomplete or incorrect. Nexez uses deterministic checks and explicit approval steps for supported consequential actions, but you should review important details before approving a purchase, booking, negotiation, publication, or other action. Nexez does not use automated processing to make employment, credit, housing, insurance, medical, or similarly high-impact eligibility decisions.',
      'Provider retention and model-training treatment depends on the provider and account configuration used for the Service. Nexez does not sell your prompts or connected-service data to AI providers.',
    ],
  },
  {
    heading: '10. Public Content',
    body: [
      'Published listings, storefronts, offers, policies, and machine-readable artifacts are intentionally public and can be indexed, copied, or used by search engines, AI agents, directories, and other third parties. Do not publish information you want to keep private. Drafts, provider credentials, API-key secrets, webhook signing secrets, private analytics, and private account settings are not intended for public artifacts.',
    ],
  },
  {
    heading: '11. How We Disclose Information',
    body: [
      'We disclose information to service providers that help operate the Service, including Supabase for database, authentication, and storage; Vercel for hosting, delivery, and product analytics; Stripe for subscriptions, payments, connected-account onboarding, payouts, refunds, and disputes; Resend-compatible email delivery; Expo for mobile builds and push delivery; Sentry and other observability providers for enabled diagnostics; infrastructure and rate-limiting providers; and configured AI and search providers.',
      'At your direction, we also disclose information to enabled commerce, catalog, identity, scheduling, calendar, and business-information providers such as Shopify, Square, Calendly, Acuity, Google, Apple, and similar services. Public content is disclosed to anyone who accesses it. Transaction information is disclosed between the participating buyer, seller, authorized agents, and payment or scheduling providers as needed to complete the requested workflow.',
      'We can disclose information to professional advisers, auditors, insurers, authorities, or other parties when reasonably necessary to protect rights and safety, investigate abuse, comply with law, or complete a merger, financing, acquisition, reorganization, or sale of assets. We do not sell personal data for money.',
    ],
  },
  {
    heading: '12. Shopify Privacy Requests',
    body: [
      'The Nexez Shopify app does not request Shopify customer or order data. We authenticate and acknowledge Shopify customer data-access and redaction requests even when Nexez has no responsive Shopify customer data. Uninstalling the app revokes stored credentials, disconnects the shop, and removes Shopify-imported offers from the linked listing. Shopify’s final shop-redaction request removes the remaining installation record and catalog copy, except information we must retain by law.',
    ],
  },
  {
    heading: '13. Cookies & Similar Technologies',
    body: [
      'We use authentication and security cookies needed to keep accounts signed in and protect requests, plus a first-party experiment cookie that assigns a stable variation. Hosting and analytics services can also process request and device information. Browser controls can block some cookies, but blocking necessary cookies can prevent account features from working.',
    ],
  },
  {
    heading: '14. Retention & Deletion',
    body: [
      'We retain account, workspace, listing, and configuration data while the applicable account or business relationship remains active. We retain transaction, billing, dispute, security, audit, and fraud-prevention records for the period reasonably needed to complete the transaction, enforce agreements, maintain financial records, prevent abuse, and satisfy legal obligations. Logs, diagnostics, and backups are retained for limited operational cycles and then deleted or overwritten. Public content can remain in third-party caches or indexes after Nexez removes it.',
      'Buyer-account deletion removes the buyer-agent profile, conversations, preferences, saved items, tasks, notifications, launch-funnel events, and push tokens, and anonymizes buyer details in seller-owned transaction records where supported. If the same login also operates a seller business, buyer deletion preserves the seller account, login, listings, billing, API keys, and other business records so a buyer-side request does not accidentally destroy the business. A seller can separately request closure of the retained business account. A buyer-only account is deleted after the buyer data is removed, subject to required retention.',
      'Promotional grant, invitation, and verified-business claim records can be retained while needed to administer the program and prevent duplicate or abusive claims. Deletion from provider backups and downstream systems follows their normal deletion cycles and legal obligations.',
    ],
  },
  {
    heading: '15. Your Choices & Privacy Rights',
    body: [
      'You can update account and listing information, disconnect integrations, manage notifications, export available account data, delete buyer data, and cancel a Nexez subscription through the applicable product controls. You can also contact us about access, correction, deletion, portability, restriction, objection, consent withdrawal, or an appeal of a privacy-request decision.',
      'These rights vary by jurisdiction and can be subject to verification and legal exceptions. Where applicable, you can complain to your local data-protection authority. Nexez does not discriminate against users for exercising applicable privacy rights.',
    ],
  },
  {
    heading: '16. Security & International Processing',
    body: [
      'Nexez uses safeguards including TLS in transit, provider-managed encryption at rest, tenant-level authorization and database row-level security, restricted service credentials, encrypted integration credentials, hashed API keys and invitation tokens, signed webhooks, rate limits, and approval and idempotency controls for supported agent actions. No service can guarantee absolute security.',
      'Nexez and its providers can process information in countries other than where you live. Where required, we rely on contractual, organizational, and technical safeguards for international transfers.',
    ],
  },
  {
    heading: '17. Children',
    body: [
      'The Service is designed for adults and businesses and is not directed to children under 13 or the minimum age required by local law. We do not knowingly collect personal data from children. If you believe a child has provided personal data, contact us so we can investigate and delete it as appropriate.',
    ],
  },
  {
    heading: '18. Changes & Contact',
    body: [
      'We may update this policy to reflect changes to the Service, our practices, or applicable requirements. We will update the date above and provide additional notice when required. Privacy questions and requests can be sent to legal@nexez.ai or mailed to Nexez, 8 The Green, Ste B, Dover, DE 19901, USA. Terms governing use of the Service are available on the Terms of Service page.',
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
