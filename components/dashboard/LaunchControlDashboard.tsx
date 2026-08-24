import Link from 'next/link'
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  CircleX,
  Clock3,
  CreditCard,
  Database,
  ExternalLink,
  GitCommitHorizontal,
  RefreshCw,
  ShieldCheck,
  TerminalSquare,
  TicketCheck,
  Webhook,
} from 'lucide-react'
import { relativeAge, type LaunchCheck, type LaunchControlSnapshot, type LaunchStatus } from '../../lib/launch-control'
import type { MarketplaceCurationQueue } from '../../lib/marketplace-curation'
import type { ReleaseCertificationRecord } from '../../lib/release-certification'
import { MarketplaceCurationPanel } from './MarketplaceCurationPanel'
import { CommerceDemandPanel } from './CommerceDemandPanel'
import type { CommerceDemandSnapshot } from '../../lib/commerce-demand'
import type { CommerceSupplyWorkflowSnapshot } from '../../lib/commerce-supply-workflow'

const STATUS_STYLE: Record<LaunchStatus, { label: string; className: string; Icon: typeof CheckCircle2 }> = {
  ready: {
    label: 'Ready',
    className: 'border-[var(--ready)]/25 bg-[var(--ready)]/10 text-[var(--ready)]',
    Icon: CheckCircle2,
  },
  attention: {
    label: 'Needs proof',
    className: 'border-[var(--amber)]/30 bg-[var(--amber)]/10 text-[var(--amber)]',
    Icon: AlertTriangle,
  },
  blocked: {
    label: 'Blocked',
    className: 'border-red-400/30 bg-red-400/10 text-red-300',
    Icon: CircleX,
  },
  unknown: {
    label: 'Unavailable',
    className: 'border-[var(--bd-15)] bg-white/[0.04] text-[var(--fg-muted)]',
    Icon: CircleDashed,
  },
}

export function LaunchControlDashboard({
  snapshot,
  releases,
  marketplaceCuration,
  commerceDemand,
  commerceSupplyWorkflow,
}: {
  snapshot: LaunchControlSnapshot
  releases: ReleaseCertificationRecord[]
  marketplaceCuration: MarketplaceCurationQueue
  commerceDemand: CommerceDemandSnapshot
  commerceSupplyWorkflow: CommerceSupplyWorkflowSnapshot
}) {
  const headline = snapshot.summary.status === 'ready'
    ? 'Launch systems are ready'
    : snapshot.summary.status === 'blocked'
      ? 'Launch has active blockers'
      : 'Launch needs final proof'

  return (
    <main className="nx-platform-surface min-h-screen bg-[var(--bg)] text-[var(--fg)]">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        <header className="surface-masthead flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 text-sm font-medium text-[var(--signal)]">
              <Activity className="size-4" /> Platform operations
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Launch Control</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--fg-muted)]">
              One admin view for production configuration, commerce proof, worker queues, and incidents. Secret values never leave the server.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={snapshot.summary.status} label={headline} />
            <a
              href="/admin/launch"
              title="Refresh launch signals"
              aria-label="Refresh launch signals"
              className="inline-flex size-9 items-center justify-center rounded-md border border-border text-[var(--fg-muted)] transition hover:bg-white/[0.06] hover:text-foreground"
            >
              <RefreshCw className="size-4" />
            </a>
          </div>
        </header>

        <section aria-label="Launch summary" className="grid gap-3 py-6 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            icon={ShieldCheck}
            label="Readiness"
            value={`${snapshot.summary.score}%`}
            detail={`${snapshot.summary.ready} ready · ${snapshot.summary.attention} need proof`}
            status={snapshot.summary.status}
          />
          <SummaryCard
            icon={Webhook}
            label="Stripe events"
            value={snapshot.sources.stripeWebhooks ? String(snapshot.metrics.stripeWebhookEvents) : 'Unavailable'}
            detail={snapshot.metrics.latestStripeWebhookAt
              ? `Latest ${relativeAge(snapshot.metrics.latestStripeWebhookAt, snapshot.generatedAt)}`
              : 'No recent delivery evidence'}
            status={snapshot.operations.find((check) => check.id === 'stripe-delivery')?.status ?? 'unknown'}
          />
          <SummaryCard
            icon={CreditCard}
            label="Live commerce proof"
            value={`${snapshot.metrics.directOrders + snapshot.metrics.paymentBackedNegotiations + snapshot.metrics.resourceSettlements + snapshot.metrics.stagedSettlementSettlements + snapshot.metrics.protocolOrders}`}
            detail={`${snapshot.metrics.directOrders} direct · ${snapshot.metrics.paymentBackedNegotiations} escrow · ${snapshot.metrics.resourceSettlements} resource · ${snapshot.metrics.stagedSettlementSettlements} staged · ${snapshot.metrics.protocolOrders} protocol`}
            status={certificationRollup(snapshot.certification)}
          />
          <SummaryCard
            icon={Clock3}
            label="Integration queues"
            value={String(snapshot.metrics.pendingNegotiationDecisions + snapshot.metrics.shopifyPending)}
            detail={`${snapshot.metrics.pendingNegotiationDecisions} negotiations · ${snapshot.metrics.shopifyPending} Shopify · ${snapshot.metrics.staleNegotiationDecisions + snapshot.metrics.shopifyStale} stale`}
            status={workerRollup(snapshot.operations)}
          />
        </section>

        <MarketplaceCurationPanel queue={marketplaceCuration} />

        <CommerceDemandPanel snapshot={commerceDemand} supplyWorkflow={commerceSupplyWorkflow} />

        <section className="border-t border-border py-8" aria-labelledby="release-certificates-heading">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <SectionHeading
              icon={GitCommitHorizontal}
              id="release-certificates-heading"
              title="Release certificates"
              detail="Every production candidate is tied to an exact Git revision, live probes, and the authoritative Launch Control snapshot."
            />
            <code className="inline-flex min-h-9 w-fit items-center rounded-md border border-border bg-black/30 px-3 font-mono text-xs text-[var(--fg-soft)]">
              npm run certify:release
            </code>
          </div>
          {releases.length ? (
            <div className="overflow-hidden rounded-lg border border-border bg-white/[0.025] backdrop-blur-xl">
              {releases.map((release) => <ReleaseRow key={release.id} release={release} />)}
            </div>
          ) : (
            <div className="flex min-h-32 items-center gap-4 rounded-lg border border-border bg-white/[0.025] px-5 backdrop-blur-xl">
              <GitCommitHorizontal className="size-5 shrink-0 text-[var(--fg-muted)]" />
              <div>
                <p className="text-sm font-medium">No automated release certificate yet</p>
                <p className="mt-1 text-xs leading-5 text-[var(--fg-muted)]">
                  The first successful post-CI production run will create the immutable baseline.
                </p>
              </div>
            </div>
          )}
        </section>

        <section className="border-t border-border py-8" aria-labelledby="configuration-heading">
          <SectionHeading
            icon={Database}
            id="configuration-heading"
            title="Production configuration"
            detail="Required deployment settings are evaluated by presence and behavior. Values are always redacted."
          />
          <CheckGrid checks={snapshot.configuration} />
        </section>

        <section className="border-t border-border py-8" aria-labelledby="certification-heading">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <SectionHeading
              icon={CreditCard}
              id="certification-heading"
              title="Commerce certification"
              detail="Configuration is not proof. Each money path needs durable evidence or an explicit owner-run lifecycle check."
            />
            <div className="flex flex-wrap gap-2">
              <code className="inline-flex min-h-9 items-center rounded-md border border-border bg-black/30 px-3 font-mono text-xs text-[var(--fg-soft)]">
                npm run certify:commerce
              </code>
              <a
                href="https://dashboard.stripe.com/test/workbench/webhooks"
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-9 items-center gap-2 rounded-md border border-border px-3 text-xs font-medium text-[var(--fg-soft)] transition hover:bg-white/[0.06] hover:text-foreground"
              >
                Stripe workbench <ExternalLink className="size-3.5" />
              </a>
            </div>
          </div>
          <div className="mt-5 overflow-hidden rounded-lg border border-border bg-white/[0.025] backdrop-blur-xl">
            {snapshot.certification.map((check) => <CertificationRow key={check.id} check={check} />)}
          </div>
          <p className="mt-3 text-xs leading-5 text-[var(--fg-muted-2)]">
            The automated gauntlet performs dry-run validation and tokenless denial checks. It never creates a charge, Checkout Session, or negotiation. Checkout dry runs retain their normal telemetry event.
          </p>
        </section>

        <section className="border-t border-border py-8" aria-labelledby="operations-heading">
          <SectionHeading
            icon={Activity}
            id="operations-heading"
            title="Workers and delivery"
            detail="Health is derived from the ledgers and queues each worker owns, so a silent failure becomes visible here."
          />
          <CheckGrid checks={snapshot.operations} />
        </section>

        <section className="border-t border-border py-8" aria-labelledby="support-queue-heading">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <SectionHeading
              icon={TicketCheck}
              id="support-queue-heading"
              title="Support queue"
              detail="Routing is recalculated from each owner's current plan. Severity remains a separate incident signal available to every plan."
            />
            <span className="mb-5 w-fit rounded-full border border-border px-2.5 py-1 font-mono text-[11px] text-[var(--fg-muted)]">
              {snapshot.sources.support ? `${snapshot.supportQueue.length} shown` : 'Unavailable'}
            </span>
          </div>
          {!snapshot.sources.support ? (
            <div className="flex min-h-24 items-center gap-4 rounded-lg border border-border bg-white/[0.025] px-5 backdrop-blur-xl">
              <CircleDashed className="size-5 shrink-0 text-[var(--fg-muted)]" />
              <div>
                <p className="text-sm font-medium">Support queue unavailable</p>
                <p className="mt-1 text-xs leading-5 text-[var(--fg-muted)]">Current ticket routing could not be loaded, so no priority claim is shown.</p>
              </div>
            </div>
          ) : snapshot.supportQueue.length ? (
            <ol className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-white/[0.025] backdrop-blur-xl">
              {snapshot.supportQueue.map((ticket) => (
                <li key={ticket.id}>
                  <Link href={`/admin/support/${ticket.id}`} className="grid gap-2 px-4 py-3 transition hover:bg-white/[0.04] sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:gap-4">
                  <span className={`w-fit rounded-full border px-2 py-1 text-[11px] font-medium ${ticket.serviceTier === 'priority'
                    ? 'border-[var(--signal)]/30 bg-[var(--signal)]/10 text-[var(--signal)]'
                    : 'border-border bg-white/[0.03] text-[var(--fg-muted)]'
                  }`}>
                    {planName(ticket.planId)} · {ticket.serviceTier === 'priority' ? 'Priority' : 'Standard'}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-foreground">{ticket.subject || 'Untitled support request'}</span>
                    <span className="mt-1 block font-mono text-[10px] text-[var(--fg-muted-2)]">{ticket.id}</span>
                  </span>
                  <span className="flex items-center gap-3 text-xs text-[var(--fg-muted)]">
                    <span className={ticket.severity === 'urgent' ? 'font-medium text-red-300' : ''}>{severityName(ticket.severity)}</span>
                    <span>{relativeAge(ticket.createdAt, snapshot.generatedAt)}</span>
                  </span>
                  </Link>
                </li>
              ))}
            </ol>
          ) : (
            <div className="flex min-h-24 items-center gap-4 rounded-lg border border-border bg-white/[0.025] px-5 backdrop-blur-xl">
              <CheckCircle2 className="size-5 shrink-0 text-[var(--ready)]" />
              <div>
                <p className="text-sm font-medium">Support queue is clear</p>
                <p className="mt-1 text-xs leading-5 text-[var(--fg-muted)]">No open, waiting, or in-review tickets were returned.</p>
              </div>
            </div>
          )}
        </section>

        <section className="grid gap-8 border-t border-border py-8 xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
          <div aria-labelledby="incidents-heading">
            <SectionHeading
              icon={AlertTriangle}
              id="incidents-heading"
              title="Recent incidents"
              detail="Actionable failures and urgent support incidents appear here; support ordering is resolved from each owner's current plan."
            />
            {snapshot.incidents.length ? (
              <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-white/[0.025] backdrop-blur-xl">
                {snapshot.incidents.map((incident) => {
                  const style = STATUS_STYLE[incident.status]
                  const Icon = style.Icon
                  const content = (
                    <>
                      <Icon className={`mt-0.5 size-4 shrink-0 ${incident.status === 'blocked' ? 'text-red-300' : 'text-[var(--amber)]'}`} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-foreground">{incident.title}</span>
                        <span className="mt-1 block text-xs leading-5 text-[var(--fg-muted)]">{incident.detail}</span>
                      </span>
                      <span className="shrink-0 text-xs text-[var(--fg-muted-2)]">
                        {incident.occurredAt ? relativeAge(incident.occurredAt, snapshot.generatedAt) : 'Time unavailable'}
                      </span>
                    </>
                  )
                  return incident.href ? (
                    <a key={incident.id} href={incident.href} className="flex gap-3 px-4 py-3 transition hover:bg-white/[0.04]">
                      {content}
                    </a>
                  ) : (
                    <div key={incident.id} className="flex gap-3 px-4 py-3">{content}</div>
                  )
                })}
              </div>
            ) : (
              <div className="flex min-h-36 items-center gap-4 rounded-lg border border-border bg-white/[0.025] px-5 backdrop-blur-xl">
                <CheckCircle2 className="size-5 shrink-0 text-[var(--ready)]" />
                <div>
                  <p className="text-sm font-medium">No active incidents</p>
                  <p className="mt-1 text-xs leading-5 text-[var(--fg-muted)]">The queried ledgers and queues contain no current failure signal.</p>
                </div>
              </div>
            )}
          </div>

          <div aria-labelledby="runbook-heading">
            <SectionHeading
              icon={TerminalSquare}
              id="runbook-heading"
              title="Release runbook"
              detail="A short owner sequence for every production candidate."
            />
            <ol className="space-y-3 rounded-lg border border-border bg-white/[0.025] p-4 text-sm backdrop-blur-xl">
              {[
                'Merge a production candidate only after the source CI gates pass.',
                'Wait until the exact Git revision is serving on the production deployment.',
                'Verify all three hosts, a public storefront, and every agent artifact.',
                'Run the approval-safety commerce gauntlet without moving live money.',
                'Attach Launch Control state and retain the green or red release record.',
              ].map((step, index) => (
                <li key={step} className="flex gap-3 text-[var(--fg-soft)]">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-border bg-black/25 font-mono text-[11px] text-[var(--fg-muted)]">
                    {index + 1}
                  </span>
                  <span className="pt-0.5 leading-5">{step}</span>
                </li>
              ))}
            </ol>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center font-mono text-[10px] uppercase text-[var(--fg-muted-2)]">
              <div className="rounded-md border border-border px-2 py-2">{snapshot.environment.marketingHost}</div>
              <div className="rounded-md border border-border px-2 py-2">{snapshot.environment.appHost}</div>
              <div className="rounded-md border border-border px-2 py-2">{snapshot.environment.agentHost}</div>
            </div>
          </div>
        </section>

        <footer className="border-t border-border pt-5 text-xs text-[var(--fg-muted-2)]">
          Snapshot generated {new Date(snapshot.generatedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })} UTC. Refresh before every go/no-go decision.
        </footer>
      </div>
    </main>
  )
}

function ReleaseRow({ release }: { release: ReleaseCertificationRecord }) {
  const status: LaunchStatus = release.status === 'passed' ? 'ready' : 'blocked'
  return (
    <article className="grid gap-3 border-b border-border px-4 py-4 last:border-b-0 md:grid-cols-[minmax(150px,0.55fr)_minmax(0,1fr)_auto] md:items-center">
      <div className="flex min-w-0 items-center gap-3">
        <StatusPill status={status} label={release.status === 'passed' ? 'Certified' : 'Failed'} />
        <div className="min-w-0">
          <p className="truncate font-mono text-sm font-medium text-foreground">{release.commitSha.slice(0, 12)}</p>
          <p className="mt-1 text-[11px] text-[var(--fg-muted-2)]">{release.source} · {release.environment}</p>
        </div>
      </div>
      <div>
        <p className="text-xs leading-5 text-[var(--fg-soft)]">
          Launch Control {release.launchScore}% · {release.checkCount} checks · {release.requiredFailedCount} required failures
        </p>
        <p className="mt-1 text-xs text-[var(--fg-muted-2)]">
          {new Date(release.completedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })} UTC
        </p>
      </div>
      <div className="flex items-center gap-2">
        <a
          href={release.deploymentUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex size-8 items-center justify-center rounded-md border border-border text-[var(--fg-muted)] transition hover:bg-white/[0.06] hover:text-foreground"
          title="Open certified deployment"
          aria-label={`Open deployment for ${release.commitSha.slice(0, 12)}`}
        >
          <ExternalLink className="size-3.5" />
        </a>
        {release.workflowUrl ? (
          <a
            href={release.workflowUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex size-8 items-center justify-center rounded-md border border-border text-[var(--fg-muted)] transition hover:bg-white/[0.06] hover:text-foreground"
            title="Open certification workflow"
            aria-label={`Open certification workflow for ${release.commitSha.slice(0, 12)}`}
          >
            <TerminalSquare className="size-3.5" />
          </a>
        ) : null}
      </div>
    </article>
  )
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  detail,
  status,
}: {
  icon: typeof Activity
  label: string
  value: string
  detail: string
  status: LaunchStatus
}) {
  const style = STATUS_STYLE[status]
  return (
    <article className="min-w-0 rounded-lg border border-border bg-white/[0.035] p-4 backdrop-blur-xl transition hover:border-[var(--bd-20)] hover:bg-white/[0.05]">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-[var(--fg-muted)]">{label}</span>
        <Icon className="size-4 text-[var(--fg-muted-2)]" />
      </div>
      <p className="mt-3 truncate font-mono text-2xl font-semibold text-foreground">{value}</p>
      <p className="mt-1 truncate text-xs text-[var(--fg-muted)]">{detail}</p>
      <div className="mt-3"><StatusPill status={status} label={style.label} /></div>
    </article>
  )
}

function SectionHeading({ icon: Icon, id, title, detail }: { icon: typeof Activity; id: string; title: string; detail: string }) {
  return (
    <div className="mb-5 flex max-w-3xl gap-3">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-white/[0.04]">
        <Icon className="size-4 text-[var(--fg-muted)]" />
      </div>
      <div>
        <h2 id={id} className="text-lg font-semibold tracking-tight">{title}</h2>
        <p className="mt-1 text-sm leading-6 text-[var(--fg-muted)]">{detail}</p>
      </div>
    </div>
  )
}

function CheckGrid({ checks }: { checks: LaunchCheck[] }) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {checks.map((check) => <CheckCard key={check.id} check={check} />)}
    </div>
  )
}

function CheckCard({ check }: { check: LaunchCheck }) {
  return (
    <article className="rounded-lg border border-border bg-white/[0.03] p-4 backdrop-blur-xl transition hover:border-[var(--bd-20)] hover:bg-white/[0.045]">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-medium leading-5 text-foreground">{check.label}</h3>
        <StatusPill status={check.status} />
      </div>
      <p className="mt-3 text-xs leading-5 text-[var(--fg-muted)]">{check.detail}</p>
      <p className="mt-3 border-t border-border pt-3 text-xs leading-5 text-[var(--fg-soft)]">{check.evidence}</p>
      {check.status !== 'ready' && check.action ? (
        <p className="mt-2 text-xs leading-5 text-[var(--fg-muted-2)]"><span className="font-medium text-[var(--fg-muted)]">Next:</span> {check.action}</p>
      ) : null}
    </article>
  )
}

function CertificationRow({ check }: { check: LaunchCheck }) {
  return (
    <div className="grid gap-3 border-b border-border px-4 py-4 last:border-b-0 md:grid-cols-[minmax(180px,0.65fr)_minmax(0,1.35fr)_auto] md:items-center">
      <div>
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium">{check.label}</p>
          {check.required ? <span className="text-[10px] uppercase text-[var(--fg-muted-2)]">Gate</span> : null}
        </div>
        <p className="mt-1 text-xs leading-5 text-[var(--fg-muted)]">{check.detail}</p>
      </div>
      <div>
        <p className="text-xs leading-5 text-[var(--fg-soft)]">{check.evidence}</p>
        {check.status !== 'ready' && check.action ? <p className="mt-1 text-xs leading-5 text-[var(--fg-muted-2)]">{check.action}</p> : null}
      </div>
      <StatusPill status={check.status} />
    </div>
  )
}

function StatusPill({ status, label }: { status: LaunchStatus; label?: string }) {
  const style = STATUS_STYLE[status]
  const Icon = style.Icon
  return (
    <span className={`inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-medium ${style.className}`}>
      <Icon className="size-3" /> {label || style.label}
    </span>
  )
}

function planName(planId: string) {
  return planId.charAt(0).toUpperCase() + planId.slice(1)
}

function severityName(severity: string) {
  return `${severity.charAt(0).toUpperCase()}${severity.slice(1)} severity`
}

function certificationRollup(checks: LaunchCheck[]): LaunchStatus {
  const required = checks.filter((check) => check.required)
  if (required.some((check) => check.status === 'blocked')) return 'blocked'
  if (required.some((check) => check.status === 'attention')) return 'attention'
  if (required.some((check) => check.status === 'unknown')) return 'unknown'
  return 'ready'
}

function workerRollup(checks: LaunchCheck[]): LaunchStatus {
  const workers = checks.filter((check) => check.id === 'negotiation-worker' || check.id === 'shopify-worker')
  if (workers.some((check) => check.status === 'blocked')) return 'blocked'
  if (workers.some((check) => check.status === 'attention')) return 'attention'
  if (workers.some((check) => check.status === 'unknown')) return 'unknown'
  return 'ready'
}
