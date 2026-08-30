import Link from 'next/link'
import { requirePlatformAdmin } from '../../../lib/server/admin-access'
import { getNexxiBetaFunnel } from '../../../lib/server/nexxi-beta-funnel'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function NexxiBetaDashboard() {
  await requirePlatformAdmin('/admin/nexxi-beta')
  const funnel = await getNexxiBetaFunnel(30)

  return (
    <main className="min-h-screen bg-[#0A0A0F] px-6 py-12 text-white">
      <div className="mx-auto max-w-5xl">
        <Link href="/admin/launch" className="text-sm text-zinc-400 hover:text-white">Back to launch control</Link>
        <p className="mt-8 text-xs font-semibold uppercase tracking-[0.22em] text-[var(--signal)]">Nexxi closed beta</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">Activation funnel</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
          Authenticated beta events from the last 30 days. Counts are distinct users who reached each preceding stage. Live transaction completion uses provider-confirmed, live-mode orders.
        </p>

        <div className="mt-8 grid gap-4 md:grid-cols-5">
          {funnel.steps.map((step) => (
            <section key={step.key} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
              <p className="text-xs leading-5 text-zinc-400">{step.label}</p>
              <p className="mt-3 text-3xl font-semibold">{step.users}</p>
              <p className="mt-2 text-xs text-zinc-500">
                {step.conversionFromPrevious == null
                  ? 'Cohort entry'
                  : `${Math.round(step.conversionFromPrevious * 100)}% from prior`}
              </p>
            </section>
          ))}
        </div>

        <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-sm text-zinc-400">
          <p>{funnel.eventCount} accepted beta events since {new Date(funnel.since).toLocaleDateString('en-US')}.</p>
          <p className="mt-2">No message text, search text, email, IP address, payment details, or advertising identifiers are collected in this funnel.</p>
        </div>
      </div>
    </main>
  )
}
