import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'
import { marketingUrl } from '../../lib/site'

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'The terms governing your use of the Nexez platform.',
  alternates: {
    canonical: marketingUrl('/terms'),
  },
  // Page-level openGraph replaces the layout's wholesale (shallow merge) - re-carry type/siteName.
  openGraph: {
    type: 'website',
    siteName: 'Nexez',
    url: marketingUrl('/terms'),
    title: 'Terms of Service',
    description: 'The terms governing your use of the Nexez platform.',
  },
}

const LAST_UPDATED = 'August 27, 2026'

const sections: { heading: string; body: ReactNode[] }[] = [
  {
    heading: '1. Agreement to Terms',
    body: [
      'These Terms of Service ("Terms") govern your access to and use of Nexez websites, seller tools, hosted listings and storefronts, APIs, integrations, developer tools, support, and the Nexxi buyer-agent experience, including the mobile app (collectively, the "Service"). By creating an account, installing a Nexez integration, or using the Service, you agree to these Terms and our Privacy Policy.',
      'If you use the Service for a company or other organization, you represent that you have authority to bind it, and “you” includes that organization. Additional terms presented for a plan, integration, transaction, promotion, or partner program also apply to that feature. If additional terms conflict with these Terms, the more specific terms govern that feature.',
    ],
  },
  {
    heading: '2. Eligibility, Accounts & Teams',
    body: [
      'You must be at least 18 years old and legally able to enter a binding agreement. You must provide accurate information, keep it current, safeguard login credentials, API keys, integration credentials, approval links, and devices, and promptly notify us of suspected unauthorized use.',
      'You are responsible for activity performed through your account, workspace, credentials, configured agents, and authorized team members. Workspace owners control team access and are responsible for granting and revoking it. You may not share credentials in a way that bypasses account, plan, or security controls.',
    ],
  },
  {
    heading: '3. The Service & Plans',
    body: [
      'Nexez provides tools for businesses to create and publish structured offers, make those offers readable by people and software agents, connect supported providers, receive analytics, and operate supported discovery and transaction workflows. Features, limits, availability, and pricing vary by plan and can change prospectively.',
      'Beta, preview, experimental, partner-gated, or enrollment-dependent features can be incomplete, unavailable, or changed without notice. Protocol feeds or routes do not guarantee that a third-party platform has enrolled Nexez or will display, recommend, or transact with a listing.',
    ],
  },
  {
    heading: '4. Shopify Connector',
    body: [
      'The core Nexez Shopify connector is free to install and use. It connects an authorized Shopify shop, reads the product catalog within the approved scopes, publishes agent-readable catalog surfaces, and keeps supported product information synchronized. It does not require a paid Nexez subscription and does not charge the merchant through off-platform billing for that core connector.',
      'Optional paid Nexez platform services are separate from the Shopify connector. A merchant chooses those services independently through Nexez, and declining or canceling them does not remove the core Shopify connector. Shopify-origin product purchases remain on the merchant’s Shopify storefront and use Shopify checkout.',
    ],
  },
  {
    heading: '5. Your Content & Public Listings',
    body: [
      'You retain ownership of the business information, offers, instructions, media, and other content you submit ("Your Content"). You grant Nexez a worldwide, non-exclusive, royalty-free license to host, reproduce, format, analyze, transmit, and display Your Content as needed to operate, secure, promote, and improve the Service, including generating public pages, storefronts, search results, previews, analytics, and machine-readable artifacts such as structured data, llms.txt, agent manifests, MCP surfaces, and OpenAPI descriptions.',
      'You are responsible for the accuracy, legality, availability, pricing, fulfillment terms, intellectual-property rights, and required notices for Your Content. Published content is intentionally public and can be indexed or copied by people, search engines, directories, and AI systems. Removing content from Nexez does not guarantee removal from third-party caches or indexes.',
    ],
  },
  {
    heading: '6. AI, Agents & Approval',
    body: [
      'The Service uses automated systems and third-party AI models to assist with discovery, analysis, drafting, comparison, support, and requested workflows. AI output can be incomplete, inaccurate, or unsuitable. You are responsible for reviewing material facts, prices, availability, parties, and terms before relying on or approving an output.',
      'Supported consequential agent actions use validation and approval controls, but those controls do not replace your judgment. An approval, authenticated API request, or action performed with your credentials can authorize Nexez to initiate the described workflow. You must not claim another person approved an action, bypass safeguards, or allow an agent to spend money, contact a seller, publish content, or accept terms beyond the authority actually granted.',
      'Nexez does not guarantee discovery, ranking, recommendation, negotiation success, transaction completion, or any business result.',
    ],
  },
  {
    heading: '7. SMS Notifications',
    body: [
      <>
        Nexez offers optional transactional SMS alerts for seller negotiations and authorization requests. To subscribe, you provide a mobile number, actively select an unchecked consent box, and verify that number through the Service. Message frequency varies with your activity. Message and data rates may apply. Consent is not a condition of purchase.
      </>,
      <>
        You can opt out at any time by replying <strong>STOP</strong>. For help, reply <strong>HELP</strong> or visit <a href="https://nexez.ai/support" className="text-[var(--signal)] hover:underline">https://nexez.ai/support</a>. Carriers are not liable for delayed or undelivered messages. See our <a href="/privacy" className="text-[var(--signal)] hover:underline">Privacy Policy</a> for how we handle mobile information and SMS consent.
      </>,
    ],
  },
  {
    heading: '8. Sellers, Buyers & Transactions',
    body: [
      'Nexez provides commerce infrastructure and workflow tools; it is not the seller of a merchant’s products or services. Unless expressly stated otherwise, the seller is the merchant of record and is solely responsible for its offers, required licenses, buyer disclosures, taxes, fulfillment, scheduling, cancellations, returns, refunds, warranties, support, and compliance with law. Buyers are responsible for reviewing seller terms and providing accurate transaction information.',
      'A validation, simulation, recommendation, negotiation draft, agreement record, or checkout handoff is not a guarantee that an offer is lawful, available, suitable, or fulfilled. Sellers and buyers remain responsible for the transaction between them. Nexez can provide status, evidence, messaging, and payment or scheduling integrations without becoming a party to the underlying sale or service agreement.',
    ],
  },
  {
    heading: '9. Subscriptions, Fees & Cancellation',
    body: [
      'Current plan prices, billing intervals, included features, limits, and transaction or platform fees are shown before purchase and form part of these Terms. Taxes can be added where required. Free and paid plans can have different limits and fee rates.',
      'A paid subscription renews for the interval shown at purchase until canceled. Before you confirm a paid subscription, Nexez or its billing provider will display the renewal price and frequency and provide a retainable confirmation. You can manage or cancel an online subscription through the billing portal linked from the Billing page. Cancellation stops future renewals and normally takes effect at the end of the paid period unless law or the checkout terms require otherwise.',
      'A trial or promotion that does not collect a payment method does not automatically create a charge. When it ends, access returns to the then-current Free plan unless you separately choose a paid plan. If a future trial converts automatically, the price, timing, and cancellation method will be disclosed and affirmative consent obtained before enrollment.',
      'Subscription charges are non-refundable except where required by law or expressly stated at purchase. Changing plans can change features, limits, and fees prospectively. You remain responsible for charges incurred before cancellation and for keeping billing information current.',
    ],
  },
  {
    heading: '10. Payments, Refunds & Disputes',
    body: [
      'Payment processing, connected-account onboarding, payouts, refunds, and disputes can be provided by Stripe, Shopify, or another enabled provider and are also governed by that provider’s terms. Nexez does not intentionally receive or store full card numbers or card security codes.',
      'For transactions processed for a seller through a connected payment account, applicable platform fees can be collected from the seller’s transaction proceeds. The seller is responsible for refunds, chargebacks, disputes, negative balances, taxes, and fulfillment obligations associated with its transactions. Nexez may relay a refund or cancellation request but does not guarantee that a seller or provider will approve it.',
      'You must not use test, sandbox, validation, or simulated transaction paths as evidence that money moved or an order was accepted. Live and test activity are treated as separate states.',
    ],
  },
  {
    heading: '11. Integrations & Custom Domains',
    body: [
      'Optional integrations are provided by third parties and are subject to their terms, availability, scopes, and account requirements. You authorize Nexez to access and process the connected data needed for the features you enable. You are responsible for the connected account, permissions, and data you instruct Nexez to import, synchronize, publish, or send.',
      'When you connect a custom domain, you represent that you own or control it and authorize Nexez to configure and serve the applicable listing. You are responsible for DNS configuration and third-party registrar obligations. Nexez is not responsible for downtime or loss caused by a registrar, provider, revoked permission, expired credential, or incorrect configuration outside Nexez’s control.',
    ],
  },
  {
    heading: '12. Acceptable Use',
    body: [
      'You may not use the Service to violate law or another person’s rights; offer prohibited or unlawfully regulated goods or services; publish deceptive, harmful, infringing, or malicious content; misrepresent identity, authority, price, availability, provenance, approval, or transaction status; send spam; facilitate fraud, money laundering, exploitation, or unsafe activity; introduce malware; probe or bypass security; access another user’s data; disrupt the Service; evade limits or fees; or use automated access contrary to published interfaces and rate limits.',
      'You may use public discovery artifacts and documented APIs for their intended interoperability purposes. Nexez may remove content, limit features, or suspend access when reasonably necessary to address risk, abuse, provider requirements, or violations of these Terms.',
    ],
  },
  {
    heading: '13. Nexez Technology & Feedback',
    body: [
      'Nexez and its licensors retain all rights in the Service, software, designs, documentation, models, workflows, trademarks, and other technology, excluding Your Content. Subject to these Terms, Nexez grants you a limited, non-exclusive, non-transferable, revocable right to use the Service for its intended purpose during your authorized access.',
      'If you provide feedback or suggestions, you grant Nexez a perpetual, worldwide, royalty-free right to use them without restriction or obligation to you. You may not copy, resell, reverse engineer, or create derivative works from non-public Service technology except where applicable law expressly permits it.',
    ],
  },
  {
    heading: '14. Suspension & Termination',
    body: [
      'You may stop using the Service at any time and can cancel paid subscriptions through the available billing controls. Deleting buyer data does not delete a seller business operated through the same login; seller-account closure must be requested separately so business records are not destroyed accidentally.',
      'We may suspend, restrict, or terminate access when you materially breach these Terms, create security or legal risk, fail to pay amounts due, abuse the Service, or when a provider or authority requires action. Where practical, we will provide notice and an opportunity to cure. Provisions that by their nature should survive termination, including ownership, payment obligations, disclaimers, liability limits, indemnity, and general terms, will survive.',
    ],
  },
  {
    heading: '15. Disclaimers',
    body: [
      'To the maximum extent permitted by law, the Service is provided “as is” and “as available.” Nexez disclaims implied warranties of merchantability, fitness for a particular purpose, title, and non-infringement. We do not warrant uninterrupted operation, error-free AI output, third-party availability, permanent indexing, a particular ranking or business outcome, or that every defect or security event will be prevented.',
      'Nothing in these Terms excludes warranties or rights that cannot lawfully be excluded. You are responsible for maintaining appropriate backups of Your Content and for verifying important outputs and transaction details.',
    ],
  },
  {
    heading: '16. Limitation of Liability',
    body: [
      'To the maximum extent permitted by law, Nexez will not be liable for indirect, incidental, special, exemplary, punitive, or consequential damages; loss of profits, revenue, goodwill, data, or business opportunity; or losses caused by a seller, buyer, agent, integration, payment provider, scheduling provider, registrar, or other third party.',
      'To the maximum extent permitted by law, Nexez’s aggregate liability arising from or relating to the Service or these Terms will not exceed the greater of US $100 or the amount you paid Nexez for the Service during the 12 months before the event giving rise to the claim. These limits apply regardless of the theory of liability and even if a remedy fails of its essential purpose. They do not limit liability that applicable law does not allow us to limit.',
    ],
  },
  {
    heading: '17. Indemnification',
    body: [
      'To the extent permitted by law, you will defend, indemnify, and hold harmless Nexez and its personnel from third-party claims, damages, losses, and reasonable costs arising from Your Content, your products or services, your transactions or fulfillment, your violation of law or third-party rights, your misuse of the Service, or your breach of these Terms. This obligation does not apply to the extent a claim results from Nexez’s own unlawful conduct.',
    ],
  },
  {
    heading: '18. Promotional Access',
    body: [
      'Promotional Launch access is time-limited, requires an eligible verified business, is limited to one claim per business and campaign, and may not be sold or transferred. Launch pass invitations are bound to the recipient email and create a separate business account, not access to the sender’s workspace. Promotional access does not create an automatic charge. We may reject or revoke fraudulent, duplicate, ineligible, or abusive claims.',
    ],
  },
  {
    heading: '19. Changes & Notices',
    body: [
      'We may update these Terms to reflect changes to the Service, law, providers, or risk. We will update the date above and provide additional notice when required. Changes apply prospectively from their stated effective date. If you do not agree to updated Terms, you must stop using the affected Service. We may send operational or legal notices through the Service or to the email associated with your account.',
    ],
  },
  {
    heading: '20. General',
    body: [
      'These Terms, the Privacy Policy, and any applicable additional terms are the entire agreement about the Service and replace prior agreements on the same subject. If a provision is unenforceable, it will be modified to the minimum extent necessary and the remaining provisions will continue. A failure to enforce a provision is not a waiver. You may not assign these Terms without our consent; Nexez may assign them in connection with a merger, financing, reorganization, or sale of assets. Mandatory consumer protections and other rights that cannot be waived remain unaffected.',
    ],
  },
  {
    heading: '21. Contact',
    body: [
      'Questions about these Terms can be sent to legal@nexez.ai or mailed to Nexez, 8 The Green, Ste B, Dover, DE 19901, USA.',
    ],
  },
]

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#0A0A0F] text-white">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <a href="/" className="inline-flex items-center gap-2 text-sm text-[var(--fg-muted)] hover:text-white">
          <ArrowLeft className="size-4" /> Home
        </a>
        <h1 className="mt-8 text-4xl font-semibold tracking-tight">Terms of Service</h1>
        <p className="mt-2 text-sm text-[var(--fg-muted)]">Last updated: {LAST_UPDATED}</p>

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
