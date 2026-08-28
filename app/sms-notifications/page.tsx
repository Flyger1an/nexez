import type { Metadata } from 'next'
import { ArrowRight, BellRing, CheckCircle2, ExternalLink, MessageSquareText, ShieldCheck } from 'lucide-react'
import { appUrl, marketingUrl } from '../../lib/site'
import {
  SMS_CONSENT_CORE_COPY,
  SMS_PRIVACY_NON_SHARING_COPY,
  SMS_SAMPLE_MESSAGE,
  SMS_SETTINGS_PATH,
} from '../../lib/sms-consent'

const metaTitle = 'SMS Notification Consent'
const metaDescription =
  'How Nexez sellers opt in to optional transactional SMS alerts for new negotiations, verify their number, and opt out.'

export const metadata: Metadata = {
  title: metaTitle,
  description: metaDescription,
  alternates: { canonical: marketingUrl('/sms-notifications') },
  openGraph: {
    type: 'website',
    siteName: 'Nexez',
    url: marketingUrl('/sms-notifications'),
    title: metaTitle,
    description: metaDescription,
  },
}

const consentDisclosure = (
  <>
    {SMS_CONSENT_CORE_COPY} See our <a className="font-semibold underline underline-offset-4" href="/terms">Terms</a>{' '}
    and <a className="font-semibold underline underline-offset-4" href="/privacy">Privacy Policy</a>.
  </>
)

const steps = [
  {
    title: 'Enter a mobile number',
    description: 'A signed-in seller opens Account settings, then Notifications, and enters a mobile number in E.164 format.',
  },
  {
    title: 'Give active consent',
    description: 'SMS is off by default. The seller must actively select the unchecked disclosure shown below.',
  },
  {
    title: 'Verify and enable',
    description: 'Nexez sends a one-time verification code. Alerts begin only after the seller enters the correct code.',
  },
] as const

export default function SmsNotificationsPage() {
  return (
    <main className="overflow-hidden bg-[var(--bg)] text-[var(--fg)]">
      <section className="relative border-b border-[var(--line-soft)] px-5 pb-16 pt-20 sm:pb-20 sm:pt-28">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_22%_8%,color-mix(in_srgb,var(--signal)_18%,transparent),transparent_34%),radial-gradient(circle_at_82%_70%,color-mix(in_srgb,var(--ready)_10%,transparent),transparent_28%)]" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.75fr)]">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-[var(--signal)]/35 bg-[var(--signal)]/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--signal)]">
              <ShieldCheck className="size-4" aria-hidden="true" /> Clear, optional consent
            </span>
            <h1 className="mt-6 max-w-3xl text-balance text-4xl font-semibold tracking-[-0.04em] sm:text-6xl">
              Nexez SMS notifications
            </h1>
            <p className="mt-6 max-w-2xl text-pretty text-lg leading-8 text-[var(--fg-muted)]">
              Sellers can choose to receive a brief transactional text when a new negotiation needs review. SMS never
              approves a deal, changes terms, or moves money. Every action still requires a normal sign-in to Nexez.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href={appUrl(SMS_SETTINGS_PATH)}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--signal)] px-5 py-3 text-sm font-semibold text-white shadow-[0_14px_40px_color-mix(in_srgb,var(--signal)_28%,transparent)] transition hover:brightness-110"
              >
                Open notification settings <ArrowRight className="size-4" aria-hidden="true" />
              </a>
              <a
                href={appUrl('/onboard')}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--fill-1)] px-5 py-3 text-sm font-semibold transition hover:border-[var(--signal)]/50"
              >
                Create an account <ExternalLink className="size-4" aria-hidden="true" />
              </a>
            </div>
          </div>

          <div className="rounded-[28px] border border-[var(--signal)]/45 bg-[var(--fill-1)] p-3 shadow-[0_24px_80px_rgba(0,0,0,0.22)]">
            <div className="rounded-[22px] border border-[var(--line-soft)] bg-[var(--bg)] p-5 sm:p-6">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="flex size-11 items-center justify-center rounded-2xl bg-[var(--signal)]/12 text-[var(--signal)]">
                    <MessageSquareText className="size-5" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold">Nexez</p>
                    <p className="text-xs text-[var(--fg-muted)]">Transactional alert</p>
                  </div>
                </div>
                <span className="rounded-full border border-[var(--ready)]/30 bg-[var(--ready)]/10 px-2.5 py-1 text-[11px] font-semibold text-[var(--ready)]">
                  Verified opt-in
                </span>
              </div>
              <div className="mt-6 rounded-2xl rounded-tl-sm bg-[var(--fill-2)] p-4 text-sm leading-6">
                {SMS_SAMPLE_MESSAGE}
              </div>
              <p className="mt-4 text-xs leading-5 text-[var(--fg-muted)]">
                No buyer details, prices, approval links, or sensitive deal terms appear in the message.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16 sm:py-20" aria-labelledby="opt-in-flow-heading">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--signal)]">Web form opt-in</p>
          <h2 id="opt-in-flow-heading" className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            The complete subscriber flow
          </h2>
          <p className="mt-4 text-base leading-7 text-[var(--fg-muted)]">
            Account creation alone does not enroll anyone. The SMS preference is separate, optional, and available only
            to the signed-in account owner.
          </p>
        </div>

        <ol className="mt-10 grid gap-4 md:grid-cols-3">
          {steps.map((step, index) => (
            <li key={step.title} className="rounded-3xl border border-[var(--signal)]/35 bg-[var(--fill-1)] p-6">
              <span className="flex size-9 items-center justify-center rounded-xl bg-[var(--signal)] text-sm font-bold text-white">
                {index + 1}
              </span>
              <h3 className="mt-5 text-lg font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--fg-muted)]">{step.description}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="border-y border-[var(--line-soft)] bg-[var(--fill-1)] px-5 py-16 sm:py-20">
        <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)]">
          <div>
            <div className="flex size-12 items-center justify-center rounded-2xl border border-[var(--signal)]/35 bg-[var(--signal)]/10 text-[var(--signal)]">
              <BellRing className="size-6" aria-hidden="true" />
            </div>
            <h2 className="mt-5 text-3xl font-semibold tracking-tight">The exact consent disclosure</h2>
            <p className="mt-3 text-sm leading-6 text-[var(--fg-muted)]">
              This is the same unchecked disclosure shown in Nexez Account settings before a verification code can be sent.
            </p>
          </div>

          <div className="rounded-3xl border border-[var(--signal)]/45 bg-[var(--bg)] p-5 sm:p-7">
            <div className="flex items-start gap-3 rounded-2xl border border-[var(--line)] bg-[var(--fill-1)] p-4">
              <span aria-hidden="true" className="mt-0.5 size-5 shrink-0 rounded border-2 border-[var(--fg-muted)] bg-transparent" />
              <p className="text-sm leading-6 text-[var(--fg-muted)]">{consentDisclosure}</p>
            </div>
            <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-[var(--fg-muted)]">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[var(--ready)]" aria-hidden="true" />
              The checkbox is always unchecked by default. The verification button remains disabled until it is selected.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
        <div className="grid gap-5 md:grid-cols-2">
          <article className="rounded-3xl border border-[var(--line)] bg-[var(--fill-1)] p-6 sm:p-8">
            <h2 className="text-xl font-semibold">Message terms</h2>
            <ul className="mt-5 space-y-3 text-sm leading-6 text-[var(--fg-muted)]">
              <li>Message frequency varies with seller negotiation activity.</li>
              <li>Message and data rates may apply.</li>
              <li>Consent is not a condition of purchase.</li>
              <li>Reply STOP to opt out or HELP for help.</li>
            </ul>
          </article>
          <article className="rounded-3xl border border-[var(--line)] bg-[var(--fill-1)] p-6 sm:p-8">
            <h2 className="text-xl font-semibold">Privacy and control</h2>
            <p className="mt-5 text-sm leading-6 text-[var(--fg-muted)]">
              {SMS_PRIVACY_NON_SHARING_COPY} Sellers can turn SMS off in Account settings at any time.
            </p>
            <div className="mt-5 flex flex-wrap gap-4 text-sm font-semibold">
              <a className="text-[var(--signal)] hover:underline" href="/privacy">Privacy Policy</a>
              <a className="text-[var(--signal)] hover:underline" href="/terms">Terms</a>
              <a className="text-[var(--signal)] hover:underline" href="/support">Support</a>
            </div>
          </article>
        </div>
      </section>
    </main>
  )
}
