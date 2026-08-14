import Link from 'next/link'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CircleDashed,
  Gift,
  ListChecks,
  Rocket,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react'
import type { LaunchCheck, LaunchStatus } from '../../lib/launch-control'
import { requirePlatformAdmin } from '../../lib/server/admin-access'
import { getGrowthControlSnapshot } from '../../lib/server/growth-control'
import { getLaunchControlSnapshot } from '../../lib/server/launch-control'
import { getMarketplaceCurationQueue } from '../../lib/server/marketplace-curation'
import { getReleaseCertificationHistory } from '../../lib/server/release-certification'

const STATUS_COPY: Record<LaunchStatus, string> = {
  ready: 'Ready',
  attention: 'Needs proof',
  blocked: 'Blocked',
  unknown: 'Unavailable',
}

const STATUS_CLASS: Record<LaunchStatus, string> = {
  ready: 'border-[var(--ready)]/25 bg-[var(--ready)]/10 text-[var(--ready)]',
  attention: 'border-[var(--amber)]/30 bg-[var(--amber)]/10 text-[var(--amber)]',
  blocked: 'border-red-400/30 bg-red-400/10 text-red-300',
  unknown: 'border-border bg-white/[0.04] text-[var(--fg-muted)]',
}

export default async function AdminOverviewPage() {
  await requirePlatformAdmin('/admin')
  const [launch, growth, marketplace, releases] = await Promise.all([
    getLaunchControlSnapshot(),
    getGrowthControlSnapshot(),
    getMarketplaceCurationQueue(),
    getReleaseCertificationHistory(1),
  ])

  const launchChecks = [...launch.configuration, ...launch.certification, ...launch.operations]
  const attention = buildAttentionItems(launchChecks, growth.warnings, marketplace.available ? marketplace.summary.unreviewed : null)
  const latestRelease = releases[0] ?? null
  const campaignCapacity = growth.campaign?.maxGrants ?? 0

  return (
    <main className="min-h-[calc(100vh-4rem)] bg-background">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        <header className="flex flex-col gap-5 border-b border-border pb-7 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 text-sm font-medium text-[var(--signal)]"><ShieldCheck className="size-4" /> Admin control panel</div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Platform overview</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--fg-muted)]">One protected entry point for launch readiness, seller-growth operations, marketplace decisions, and auditable operator activity.</p>
          </div>
          <span className={`inline-flex min-h-9 w-fit items-center rounded-full border px-3 text-xs font-medium ${STATUS_CLASS[launch.summary.status]}`}>
            {STATUS_COPY[launch.summary.status]}
          </span>
        </header>

        <section aria-label="Admin summary" className="grid gap-3 py-6 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard icon={Rocket} label="Launch readiness" value={`${launch.summary.score}%`} detail={`${launch.summary.ready} ready · ${launch.summary.attention} need proof`} />
          <MetricCard icon={AlertTriangle} label="Active incidents" value={String(launch.incidents.length)} detail={launch.incidents.length ? 'Open Launch Control for details' : 'No current failure signal'} />
          <MetricCard
            icon={Gift}
            label="Growth grants"
            value={growth.available && growth.campaign ? `${growth.metrics.grantsTotal} / ${campaignCapacity.toLocaleString()}` : 'Unavailable'}
            detail={growth.campaign ? `Campaign ${growth.campaign.status}` : 'No active campaign ledger'}
          />
          <MetricCard
            icon={ListChecks}
            label="Marketplace review"
            value={marketplace.available ? String(marketplace.summary.unreviewed) : 'Unavailable'}
            detail={marketplace.available ? `${marketplace.summary.total} published listings` : 'Curation ledger could not be read'}
          />
        </section>

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(300px,.75fr)]">
          <div className="overflow-hidden rounded-lg border border-border bg-white/[0.025]">
            <div className="border-b border-border px-4 py-4">
              <h2 className="text-base font-semibold tracking-tight">Control domains</h2>
              <p className="mt-1 text-xs leading-5 text-[var(--fg-muted)]">Each surface uses its existing server data and authorization boundary.</p>
            </div>
            <ControlDomain
              href="/admin/launch"
              icon={Rocket}
              title="Launch Control"
              detail="Production configuration, commerce proof, worker queues, incidents, marketplace curation, and release certificates."
              status={STATUS_COPY[launch.summary.status]}
              statusClass={STATUS_CLASS[launch.summary.status]}
            />
            <ControlDomain
              href="/admin/growth"
              icon={TrendingUp}
              title="Growth Control"
              detail="Complimentary Launch grants, referral funnel quality, paid conversion, campaign lifecycle, capacity, and signup window."
              status={growth.campaign?.status ?? (growth.available ? 'No campaign' : 'Unavailable')}
              statusClass={growth.campaign?.status === 'active' ? STATUS_CLASS.ready : growth.available ? STATUS_CLASS.attention : STATUS_CLASS.unknown}
            />
            <ControlDomain
              href="/admin/audit"
              icon={ShieldCheck}
              title="Access & audit"
              detail="Platform-admin membership plus a unified, read-only trail of growth, marketplace, and release events."
              status="Admin only"
              statusClass={STATUS_CLASS.ready}
            />
          </div>

          <aside className="overflow-hidden rounded-lg border border-border bg-white/[0.025]">
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-4">
              <div><h2 className="text-base font-semibold tracking-tight">Needs attention</h2><p className="mt-1 text-xs text-[var(--fg-muted)]">Only live signals requiring an operator decision.</p></div>
              <span className="font-mono text-sm text-[var(--amber)]">{attention.length}</span>
            </div>
            {attention.length ? (
              <div className="divide-y divide-border">
                {attention.slice(0, 8).map((item) => (
                  <Link key={item.id} href={item.href} className="flex gap-3 px-4 py-3 transition hover:bg-white/[0.04]">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--amber)]" />
                    <span className="min-w-0"><span className="block text-sm font-medium">{item.label}</span><span className="mt-1 block text-xs leading-5 text-[var(--fg-muted)]">{item.evidence}</span></span>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="flex min-h-40 items-center gap-3 px-4 py-5"><CheckCircle2 className="size-5 text-[var(--ready)]" /><div><p className="text-sm font-medium">No operator decision is waiting</p><p className="mt-1 text-xs leading-5 text-[var(--fg-muted)]">Required launch checks and marketplace review signals are clear.</p></div></div>
            )}
            <div className="border-t border-border px-4 py-4">
              <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--fg-muted-2)]">Latest release</p>
              {latestRelease ? (
                <div className="mt-2 flex items-center justify-between gap-3"><span className="font-mono text-xs">{latestRelease.commitSha.slice(0, 12)}</span><span className={`rounded-full border px-2 py-1 text-[10px] ${latestRelease.status === 'passed' ? STATUS_CLASS.ready : STATUS_CLASS.blocked}`}>{latestRelease.status}</span></div>
              ) : (
                <div className="mt-2 flex items-center gap-2 text-xs text-[var(--fg-muted)]"><CircleDashed className="size-3.5" /> No release certificate available</div>
              )}
            </div>
          </aside>
        </section>

        <footer className="mt-8 border-t border-border pt-5 text-xs text-[var(--fg-muted-2)]">Snapshot generated {new Date(launch.generatedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })} UTC.</footer>
      </div>
    </main>
  )
}

function buildAttentionItems(checks: LaunchCheck[], growthWarnings: string[], unreviewed: number | null) {
  const items = checks
    .filter((check) => check.status !== 'ready')
    .map((check) => ({ id: `launch:${check.id}`, label: check.label, evidence: check.evidence, href: '/admin/launch' }))
  if (unreviewed && unreviewed > 0) {
    items.push({ id: 'marketplace:unreviewed', label: 'Marketplace review queue', evidence: `${unreviewed} published ${unreviewed === 1 ? 'listing needs' : 'listings need'} an explicit quality decision.`, href: '/admin/launch#marketplace-curation' })
  }
  growthWarnings.forEach((warning, index) => items.push({ id: `growth:${index}`, label: 'Growth Control warning', evidence: warning, href: '/admin/growth' }))
  return items
}

function MetricCard({ icon: Icon, label, value, detail }: { icon: typeof Rocket; label: string; value: string; detail: string }) {
  return (
    <article className="min-w-0 rounded-lg border border-border bg-white/[0.035] p-4">
      <div className="flex items-center justify-between gap-3"><span className="text-xs font-medium text-[var(--fg-muted)]">{label}</span><Icon className="size-4 text-[var(--fg-muted-2)]" /></div>
      <p className="mt-3 truncate font-mono text-2xl font-semibold">{value}</p>
      <p className="mt-1 truncate text-xs text-[var(--fg-muted)]">{detail}</p>
    </article>
  )
}

function ControlDomain({ href, icon: Icon, title, detail, status, statusClass }: { href: string; icon: typeof Rocket; title: string; detail: string; status: string; statusClass: string }) {
  return (
    <Link href={href} className="grid gap-3 border-b border-border px-4 py-4 transition last:border-b-0 hover:bg-white/[0.04] sm:grid-cols-[32px_minmax(0,1fr)_auto] sm:items-center">
      <span className="flex size-8 items-center justify-center rounded-md border border-border bg-white/[0.04]"><Icon className="size-4 text-[var(--fg-muted)]" /></span>
      <span className="min-w-0"><span className="block text-sm font-medium">{title}</span><span className="mt-1 block text-xs leading-5 text-[var(--fg-muted)]">{detail}</span></span>
      <span className="flex items-center gap-2"><span className={`rounded-full border px-2 py-1 text-[10px] capitalize ${statusClass}`}>{status}</span><ArrowRight className="size-3.5 text-[var(--fg-muted-2)]" /></span>
    </Link>
  )
}
