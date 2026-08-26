import { randomUUID } from 'node:crypto'
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  BadgeCheck,
  CheckCircle2,
  CircleDashed,
  ExternalLink,
  FileCheck2,
  Gauge,
  HandCoins,
  ListChecks,
  Rocket,
  ShoppingBag,
  Store,
  Users,
} from 'lucide-react'
import { requirePlatformAdmin } from '../../../lib/server/admin-access'
import { getCommerceTemplateReviewReport } from '../../../lib/server/commerce-template-reviews'
import {
  getCommerceTemplateOpportunitySnapshot,
  type CommerceTemplateOpportunitySnapshot,
} from '../../../lib/server/commerce-template-opportunities'
import type { CommerceTemplateOutcomeSnapshot } from '../../../lib/server/commerce-template-outcomes'
import {
  COMMERCE_TEMPLATE_REVIEW_MIN_LISTINGS,
  COMMERCE_TEMPLATE_REVIEW_MIN_PUBLISHED,
  COMMERCE_TEMPLATE_REVIEW_READINESS_GAP,
  type CommerceTemplateOpportunityRow,
  type CommerceTemplateOpportunityTone,
} from '../../../lib/commerce-template-opportunities'
import type { CommerceTemplateRailCounts } from '../../../lib/commerce-template-outcomes'
import type {
  CommerceTemplateActivationGroup,
  CommerceTemplateActivationReport,
  CommerceTemplateActivationRow,
  CommerceTemplateActivationStatus,
  CommerceTemplateOutsideSupplyRelationship,
} from '../../../lib/commerce-template-activation'
import {
  commerceTemplateReviewDecisionLabel,
  commerceTemplateReviewReasonLabel,
  type CommerceTemplateReviewEvidence,
  type CommerceTemplateReviewReport,
} from '../../../lib/commerce-template-reviews'
import {
  CommerceTemplateReviewDesk,
  type CommerceTemplateReviewDeskItem,
} from '../../../components/admin/CommerceTemplateReviewDesk'
import { agentRuntimeUrl } from '../../../lib/site'

const RAIL_LABELS: Array<[keyof CommerceTemplateRailCounts, string]> = [
  ['hosted_checkout', 'Hosted'],
  ['protocol_checkout', 'Agent protocols'],
  ['recurring_service', 'Recurring'],
  ['staged_settlement', 'Staged'],
  ['resource_reservation', 'Reservations'],
]

export default async function AdminTemplateOutcomesPage() {
  await requirePlatformAdmin('/admin/templates')
  const [snapshot, reviewReport] = await Promise.all([
    getCommerceTemplateOpportunitySnapshot(),
    getCommerceTemplateReviewReport(),
  ])
  const outcomes = snapshot.outcomes
  const reviewItems = buildReviewDeskItems(snapshot.rows, reviewReport)

  return (
    <main className="min-h-[calc(100vh-4rem)] bg-background">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        <header className="border-b border-border pb-7">
          <div className="flex items-center gap-2 text-sm font-medium text-[var(--signal)]">
            <BarChart3 className="size-4" /> Commerce Templates
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">What to improve next</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--fg-muted)]">
            Connect buyer interest, certified merchants, template use, and completed commerce. Every next move names the evidence behind it. Nothing here changes a template or merchant listing.
          </p>
        </header>

        {snapshot.warnings.length ? <Warnings warnings={snapshot.warnings} /> : null}
        <OpportunitySummary snapshot={snapshot} />
        <OpportunityMap snapshot={snapshot} />
        <CommerceTemplateReviewDesk
          available={reviewReport.available}
          truncated={reviewReport.truncated}
          items={reviewItems}
        />
        <ActivationQueue report={snapshot.activation} />

        <section className="mt-8 border-t border-border pt-7" aria-labelledby="template-results-heading">
          <div className="mb-1">
            <h2 id="template-results-heading" className="text-xl font-semibold tracking-tight">Observed results</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--fg-muted)]">
              Listing and commerce results stay attached to the exact template version a merchant selected.
            </p>
          </div>
          {!outcomes.available ? (
            <UnavailableState />
          ) : (
            <>
              <Summary snapshot={outcomes} />
              <TemplateTable snapshot={outcomes} />
              <Methodology snapshot={outcomes} />
            </>
          )}
        </section>

        <footer className="mt-8 border-t border-border pt-5 text-xs text-[var(--fg-muted-2)]">
          Snapshot generated {new Date(snapshot.generatedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })} UTC.
        </footer>
      </div>
    </main>
  )
}

function ActivationQueue({ report }: { report: CommerceTemplateActivationReport }) {
  return (
    <section className="mt-8 border-t border-border pt-7" aria-labelledby="template-activation-heading">
      <div className="flex max-w-3xl gap-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-white/[0.04]">
          <Rocket className="size-4 text-[var(--signal)]" />
        </div>
        <div>
          <h2 id="template-activation-heading" className="text-xl font-semibold tracking-tight">Merchant launch queue</h2>
          <p className="mt-1 text-sm leading-6 text-[var(--fg-muted)]">
            See which listings use each guide, what needs attention, and which exact certified merchants sit outside that guide.
          </p>
        </div>
      </div>

      {!report.available ? (
        <section className="mt-5 rounded-lg border border-[var(--amber)]/30 bg-[var(--amber)]/8 px-5 py-8 text-center">
          <AlertTriangle className="mx-auto size-6 text-[var(--amber)]" />
          <h3 className="mt-3 text-base font-semibold">Merchant launch data is unavailable</h3>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[var(--fg-muted)]">
            Private guide history could not be read. Refresh before helping a merchant launch.
          </p>
        </section>
      ) : (
        <>
          <section aria-label="Merchant activation summary" className="grid gap-3 py-6 sm:grid-cols-2 xl:grid-cols-5">
            <MetricCard icon={ListChecks} label="Using an active guide" value={displayCount(report.summary.listings)} detail={`Across ${report.summary.activeGuides} active guides`} />
            <MetricCard icon={Rocket} label="Need publishing" value={displayCount(report.summary.needsPublishing)} detail="Seller action required" />
            <MetricCard icon={Store} label="Published" value={displayCount(report.summary.published)} detail="Guide use only, not certification" />
            <MetricCard icon={BadgeCheck} label="Exact certified supply" value={displayCount(report.summary.certifiedOnGuide)} detail="Uses the exact guide version" />
            <MetricCard icon={Users} label="Certified outside guide" value={displayCount(report.summary.certifiedOutsideGuide)} detail="Kept separate from guide use" />
          </section>
          <ActivationSourceNotes report={report} />
          <div className="grid gap-4 xl:grid-cols-2">
            {report.groups.map((group) => <ActivationGroup key={`${group.templateId}@${group.templateVersion}`} group={group} />)}
          </div>
          {report.summary.outsideActiveGuides ? (
            <p className="mt-4 text-xs leading-5 text-[var(--fg-muted-2)]">
              {report.summary.outsideActiveGuides} recorded {report.summary.outsideActiveGuides === 1 ? 'listing uses' : 'listings use'} a guide version that is not active. Those listings remain outside this launch queue.
            </p>
          ) : null}
        </>
      )}
    </section>
  )
}

function ActivationSourceNotes({ report }: { report: CommerceTemplateActivationReport }) {
  const notes = [
    report.sources.listings.truncated ? 'The listing limit was reached, so this queue is incomplete.' : null,
    !report.sources.marketplace ? 'Marketplace review status is unavailable.' : null,
    !report.sources.supply ? 'Exact certification status is unavailable.' : null,
  ].filter((note): note is string => Boolean(note))
  if (!notes.length) return null

  return (
    <div className="mb-4 flex gap-3 rounded-lg border border-[var(--amber)]/25 bg-[var(--amber)]/[0.05] px-4 py-3">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--amber)]" />
      <p className="text-xs leading-5 text-[var(--fg-muted)]">{notes.join(' ')}</p>
    </div>
  )
}

function ActivationGroup({ group }: { group: CommerceTemplateActivationGroup }) {
  return (
    <article className="overflow-hidden rounded-lg border border-border bg-white/[0.025]">
      <header className="border-b border-border px-4 py-4 sm:px-5">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold">{group.title}</h3>
            <p className="mt-1 truncate font-mono text-[11px] text-[var(--fg-muted-2)]">{group.templateId}@{group.templateVersion}</p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2 text-[10px] text-[var(--fg-muted)]">
            <span className="rounded-full border border-border px-2 py-1">{group.summary.listings} using guide</span>
            <span className="rounded-full border border-border px-2 py-1">{group.summary.published} published</span>
            <a
              href={`#${templateReviewAnchor(group.templateId, group.templateVersion)}`}
              className="rounded-full border border-[var(--signal)]/30 px-2 py-1 text-[var(--signal)] transition hover:bg-[var(--signal)]/10"
            >
              Review guide
            </a>
          </div>
        </div>
      </header>

      {group.listings.length ? (
        <div className="divide-y divide-border">
          {group.listings.map((listing) => <ActivationListing key={listing.id} listing={listing} />)}
        </div>
      ) : (
        <div className="px-5 py-7 text-center">
          <CircleDashed className="mx-auto size-5 text-[var(--fg-muted-2)]" />
          <p className="mt-2 text-sm font-medium">No listings use this guide yet</p>
          <p className="mt-1 text-xs leading-5 text-[var(--fg-muted)]">Guide use starts only after a merchant selects it during setup.</p>
        </div>
      )}

      {group.certifiedOutsideVersion === null ? (
        <div className="border-t border-border px-4 py-3 text-xs text-[var(--fg-muted)] sm:px-5">Exact certified supply is unavailable.</div>
      ) : group.certifiedOutsideVersion.length ? (
        <div className="border-t border-border bg-black/15 px-4 py-4 sm:px-5">
          <h4 className="text-xs font-medium">Exact certified merchants outside this guide</h4>
          <div className="mt-3 space-y-2">
            {group.certifiedOutsideVersion.map((listing) => (
              <div key={listing.pageId} className="flex flex-col justify-between gap-2 rounded-md border border-border bg-white/[0.025] px-3 py-2.5 sm:flex-row sm:items-center">
                <span className="min-w-0">
                  <span className="block truncate text-xs font-medium">{listing.pageName}</span>
                  <span className="mt-0.5 block truncate text-[11px] text-[var(--fg-muted)]">{outsideSupplyLabel(listing.relationship)} · {listing.offerName}</span>
                </span>
                <a href={agentRuntimeUrl(`/${encodeURIComponent(listing.pageSlug)}`)} target="_blank" rel="noreferrer" className="inline-flex min-h-8 shrink-0 items-center gap-1.5 self-start rounded-md border border-border px-2.5 text-[11px] text-[var(--fg-soft)] transition hover:bg-white/[0.06] hover:text-foreground sm:self-auto">
                  Open listing <ExternalLink className="size-3" />
                </a>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </article>
  )
}

function ActivationListing({ listing }: { listing: CommerceTemplateActivationRow }) {
  const launchControl = listing.status === 'needs-marketplace-review' || listing.status === 'discovery-excluded'
  return (
    <div className="px-4 py-4 sm:px-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-medium">{listing.name}</p>
            <ActivationStatus status={listing.status} />
          </div>
          <p className="mt-1 truncate font-mono text-[11px] text-[var(--fg-muted-2)]">/{listing.slug} · {listing.readiness}% ready</p>
          <p className="mt-2 text-xs leading-5 text-[var(--fg-muted)]">{listing.nextAction}</p>
        </div>
        {listing.isPublished ? (
          <a
            href={launchControl ? '/admin/launch#marketplace-curation' : agentRuntimeUrl(`/${encodeURIComponent(listing.slug)}`)}
            target={launchControl ? undefined : '_blank'}
            rel={launchControl ? undefined : 'noreferrer'}
            className="inline-flex min-h-8 shrink-0 items-center gap-1.5 self-start rounded-md border border-border px-2.5 text-[11px] text-[var(--fg-soft)] transition hover:bg-white/[0.06] hover:text-foreground"
          >
            {launchControl ? 'Open Launch Control' : 'Open listing'} <ExternalLink className="size-3" />
          </a>
        ) : null}
      </div>
    </div>
  )
}

function ActivationStatus({ status }: { status: CommerceTemplateActivationStatus }) {
  const labels: Record<CommerceTemplateActivationStatus, string> = {
    'needs-publishing': 'Needs publishing',
    'needs-marketplace-review': 'Needs review',
    published: 'Published',
    'discovery-excluded': 'Discovery excluded',
    'exact-certified-supply': 'Exact certified supply',
  }
  const styles: Record<CommerceTemplateActivationStatus, string> = {
    'needs-publishing': 'border-[var(--signal)]/30 bg-[var(--signal)]/10 text-[var(--signal)]',
    'needs-marketplace-review': 'border-[var(--amber)]/30 bg-[var(--amber)]/10 text-[var(--amber)]',
    published: 'border-border bg-white/[0.035] text-[var(--fg-soft)]',
    'discovery-excluded': 'border-red-400/30 bg-red-400/10 text-red-300',
    'exact-certified-supply': 'border-[var(--ready)]/30 bg-[var(--ready)]/10 text-[var(--ready)]',
  }
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium ${styles[status]}`}>{labels[status]}</span>
}

function outsideSupplyLabel(relationship: CommerceTemplateOutsideSupplyRelationship): string {
  if (relationship === 'different-version') return 'Uses another version'
  if (relationship === 'different-guide') return 'Uses a different guide'
  return 'No recorded guide'
}

function displayCount(value: number | null): string {
  return value == null ? 'Unavailable' : value.toLocaleString()
}

function OpportunitySummary({ snapshot }: { snapshot: CommerceTemplateOpportunitySnapshot }) {
  return (
    <section aria-label="Template priority summary" className="grid gap-3 py-6 sm:grid-cols-2 xl:grid-cols-5">
      <MetricCard icon={AlertTriangle} label="Needs action" value={snapshot.summary.needsAction.toLocaleString()} detail={`Across ${snapshot.summary.templates} active guides`} />
      <MetricCard icon={Store} label="Recruit merchants" value={snapshot.summary.recruit.toLocaleString()} detail="No exact certified supply" />
      <MetricCard icon={Users} label="Help merchants launch" value={snapshot.summary.activate.toLocaleString()} detail="Adoption or publishing work" />
      <MetricCard icon={BadgeCheck} label="Review guides" value={snapshot.summary.review.toLocaleString()} detail="Evidence floor reached" />
      <MetricCard icon={Activity} label="Monitoring" value={snapshot.summary.monitoring.toLocaleString()} detail="Gathering or watching evidence" />
    </section>
  )
}

function OpportunityMap({ snapshot }: { snapshot: CommerceTemplateOpportunitySnapshot }) {
  return (
    <section aria-labelledby="template-opportunity-heading">
      <div className="mb-4 flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
        <div>
          <h2 id="template-opportunity-heading" className="text-lg font-semibold tracking-tight">Next moves</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--fg-muted)]">
            Ordered by the action required, then by observed unresolved requests. There is no combined opportunity score.
          </p>
        </div>
        <p className="text-xs text-[var(--fg-muted-2)]">Buyer interest since {formatDate(snapshot.demandSince)}</p>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {snapshot.rows.map((row) => <OpportunityCard key={`${row.templateId}@${row.templateVersion}`} row={row} />)}
      </div>
      <DecisionRules />
    </section>
  )
}

function OpportunityCard({ row }: { row: CommerceTemplateOpportunityRow }) {
  return (
    <article className={`rounded-lg border p-5 ${toneClasses(row.tone)}`}>
      <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div className="min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--fg-muted-2)]">Priority {row.rank}</span>
          <h3 className="mt-1 truncate text-base font-semibold">{row.title}</h3>
          <p className="mt-1 truncate font-mono text-[11px] text-[var(--fg-muted-2)]">{row.templateId}@{row.templateVersion}</p>
        </div>
        {row.action === 'review-template' ? (
          <a
            href={`#${templateReviewAnchor(row.templateId, row.templateVersion)}`}
            className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-full border border-current/25 px-2.5 py-1 text-xs font-medium transition hover:bg-white/[0.06]"
          >
            {row.actionLabel}<ArrowRight className="size-3" aria-hidden="true" />
          </a>
        ) : (
          <span className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-full border border-current/25 px-2.5 py-1 text-xs font-medium">
            {row.actionLabel}<ArrowRight className="size-3" aria-hidden="true" />
          </span>
        )}
      </header>
      <p className="mt-4 text-sm leading-6 text-[var(--fg-muted)]">{row.reason}</p>
      <dl className="mt-5 grid gap-3 border-t border-current/10 pt-4 sm:grid-cols-2">
        <Evidence label="Buyer interest" {...demandEvidence(row)} />
        <Evidence label="Certified merchants" {...supplyEvidence(row)} />
        <Evidence label="Template use" {...adoptionEvidence(row)} />
        <Evidence label="Completed commerce" {...commerceEvidence(row)} />
      </dl>
      <p className="mt-4 text-[11px] leading-5 text-[var(--fg-muted-2)]">
        Buyer interest is category-level. Template use, readiness, and commerce results are exact to version {row.templateVersion}.
      </p>
    </article>
  )
}

function Evidence({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="min-w-0 rounded-md bg-black/15 px-3 py-2.5">
      <dt className="text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--fg-muted-2)]">{label}</dt>
      <dd className="mt-1 font-mono text-sm font-medium">{value}</dd>
      <dd className="mt-1 truncate text-[11px] text-[var(--fg-muted)]">{detail}</dd>
    </div>
  )
}

function DecisionRules() {
  return (
    <section className="mt-5 rounded-lg border border-border bg-white/[0.02] p-5" aria-labelledby="decision-rules-heading">
      <div className="flex items-center gap-2"><CheckCircle2 className="size-4 text-[var(--ready)]" /><h3 id="decision-rules-heading" className="text-sm font-semibold">Decision rules</h3></div>
      <ul className="mt-3 grid gap-2 text-xs leading-5 text-[var(--fg-muted)] lg:grid-cols-2">
        <li>Recruitment requires a verified lack of exact certified supply. Category coverage does not prove availability, location, price, or request-level fit.</li>
        <li>Template review waits for at least {COMMERCE_TEMPLATE_REVIEW_MIN_LISTINGS} listings and {COMMERCE_TEMPLATE_REVIEW_MIN_PUBLISHED} published listings on the exact version.</li>
        <li>A review appears only when current readiness trails comparable listings by at least {Math.abs(COMMERCE_TEMPLATE_REVIEW_READINESS_GAP)} points.</li>
        <li>Checkout and negotiated deals remain separate. Missing evidence is unavailable, never zero.</li>
      </ul>
    </section>
  )
}

function Summary({ snapshot }: { snapshot: CommerceTemplateOutcomeSnapshot }) {
  const benchmarkAvailable = snapshot.sources.benchmark.available
  const checkoutAvailable = snapshot.sources.checkout.available
  const negotiatedAvailable = snapshot.sources.negotiated.available
  return (
    <section aria-label="Template outcome summary" className="grid gap-3 py-6 sm:grid-cols-2 xl:grid-cols-3">
      <MetricCard
        icon={BarChart3}
        label="Listings started with a template"
        value={snapshot.summary.listings.toLocaleString()}
        detail={`${snapshot.summary.templateVersions} ${snapshot.summary.templateVersions === 1 ? 'template version' : 'template versions'}`}
      />
      <MetricCard
        icon={FileCheck2}
        label="Published"
        value={formatRate(snapshot.summary.publishedRate)}
        detail={`${snapshot.summary.publishedListings} of ${snapshot.summary.listings} listings`}
      />
      <MetricCard
        icon={Gauge}
        label="Current readiness"
        value={formatPercent(snapshot.summary.averageReadiness)}
        detail="Average across template listings"
      />
      <MetricCard
        icon={CircleDashed}
        label="No recorded template"
        value={benchmarkAvailable ? formatPercent(snapshot.noTemplateBenchmark.averageReadiness) : 'Unavailable'}
        detail={benchmarkAvailable ? `${snapshot.noTemplateBenchmark.listings} listings in the same time window` : 'Comparison source could not be read'}
      />
      <MetricCard
        icon={ShoppingBag}
        label="Live checkout orders"
        value={checkoutAvailable ? snapshot.summary.checkoutOrders.toLocaleString() : 'Unavailable'}
        detail={checkoutAvailable ? `${snapshot.summary.checkoutListings} template listings converted` : 'Checkout source could not be read'}
      />
      <MetricCard
        icon={HandCoins}
        label="Settled negotiated deals"
        value={negotiatedAvailable ? snapshot.summary.negotiatedDeals.toLocaleString() : 'Unavailable'}
        detail={negotiatedAvailable ? `${snapshot.summary.negotiatedListings} template listings converted` : 'Escrow source could not be read'}
      />
    </section>
  )
}

function TemplateTable({ snapshot }: { snapshot: CommerceTemplateOutcomeSnapshot }) {
  if (!snapshot.templates.length) {
    return (
      <section className="rounded-lg border border-border bg-white/[0.025] px-5 py-10 text-center">
        <CircleDashed className="mx-auto size-6 text-[var(--fg-muted-2)]" />
        <h2 className="mt-3 text-base font-semibold">No template outcomes yet</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[var(--fg-muted)]">
          This report begins when a merchant creates a listing from a recorded Commerce Template selection.
        </p>
      </section>
    )
  }

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-white/[0.025]" aria-labelledby="template-outcomes-table-heading">
      <div className="border-b border-border px-4 py-4 sm:px-5">
        <h2 id="template-outcomes-table-heading" className="text-base font-semibold tracking-tight">Results by template version</h2>
        <p className="mt-1 text-xs leading-5 text-[var(--fg-muted)]">Each version remains separate so later template edits do not rewrite earlier results.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[980px] w-full text-left text-sm">
          <thead className="border-b border-border bg-white/[0.025] text-[10px] uppercase tracking-[0.12em] text-[var(--fg-muted-2)]">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium sm:px-5">Template</th>
              <th scope="col" className="px-4 py-3 font-medium">Listings</th>
              <th scope="col" className="px-4 py-3 font-medium">Published</th>
              <th scope="col" className="px-4 py-3 font-medium">Readiness</th>
              <th scope="col" className="px-4 py-3 font-medium">Live checkout</th>
              <th scope="col" className="px-4 py-3 font-medium">Negotiated deals</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {snapshot.templates.map((template) => (
              <tr key={`${template.templateId}@${template.templateVersion}`} className="align-top">
                <th scope="row" className="px-4 py-4 font-normal sm:px-5">
                  <span className="block font-medium text-foreground">{template.title}</span>
                  <span className="mt-1 block font-mono text-[11px] text-[var(--fg-muted-2)]">{template.templateId}@{template.templateVersion}</span>
                </th>
                <td className="px-4 py-4 font-mono">{template.listings}</td>
                <td className="px-4 py-4">
                  <span className="block font-mono">{formatRate(template.publishedRate)}</span>
                  <span className="mt-1 block text-xs text-[var(--fg-muted)]">{template.publishedListings} of {template.listings}</span>
                </td>
                <td className="px-4 py-4">
                  <span className="block font-mono">{formatPercent(template.averageReadiness)}</span>
                  <span className="mt-1 block text-xs text-[var(--fg-muted)]">
                    {snapshot.sources.benchmark.available ? readinessComparison(template.readinessVsNoTemplate) : 'Comparison unavailable'}
                  </span>
                </td>
                <td className="px-4 py-4">
                  {snapshot.sources.checkout.available ? (
                    <>
                      <span className="block font-mono">{template.checkout.orders} orders</span>
                      <span className="mt-1 block text-xs text-[var(--fg-muted)]">{railSummary(template.checkout.rails)}</span>
                    </>
                  ) : <span className="text-[var(--fg-muted)]">Unavailable</span>}
                </td>
                <td className="px-4 py-4">
                  {snapshot.sources.negotiated.available ? (
                    <>
                      <span className="block font-mono">{template.negotiated.deals} deals</span>
                      <span className="mt-1 block text-xs text-[var(--fg-muted)]">Across {template.negotiated.listings} listings</span>
                    </>
                  ) : <span className="text-[var(--fg-muted)]">Unavailable</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function Methodology({ snapshot }: { snapshot: CommerceTemplateOutcomeSnapshot }) {
  return (
    <section className="mt-5 grid gap-4 rounded-lg border border-border bg-white/[0.02] p-5 lg:grid-cols-2" aria-labelledby="template-method-heading">
      <div>
        <div className="flex items-center gap-2"><CheckCircle2 className="size-4 text-[var(--ready)]" /><h2 id="template-method-heading" className="text-sm font-semibold">What counts</h2></div>
        <ul className="mt-3 space-y-2 text-xs leading-5 text-[var(--fg-muted)]">
          <li>Completed listing: the merchant published it.</li>
          <li>Readiness: the listing&apos;s current score, compared with listings that have no recorded template in the same time window.</li>
          <li>Live checkout: retained live-mode payment records. Test payments, full refunds, open disputes, and negotiation-channel duplicates are excluded.</li>
          <li>Negotiated deal: a separate live-mode escrow record in complete status.</li>
        </ul>
      </div>
      <div>
        <div className="flex items-center gap-2"><AlertTriangle className="size-4 text-[var(--amber)]" /><h2 className="text-sm font-semibold">How to read this</h2></div>
        <p className="mt-3 text-xs leading-5 text-[var(--fg-muted)]">
          These are directional cohort results, not a randomized experiment. A stronger result can guide the next template review, but this page never upgrades a template automatically.
        </p>
        <p className="mt-2 text-xs leading-5 text-[var(--fg-muted-2)]">
          Reporting window starts {snapshot.cohortStartedAt ? new Date(snapshot.cohortStartedAt).toLocaleDateString('en-US', { dateStyle: 'medium', timeZone: 'UTC' }) : 'when the first template listing is recorded'}.
        </p>
      </div>
    </section>
  )
}

function Warnings({ warnings }: { warnings: string[] }) {
  return (
    <section aria-label="Data availability warnings" className="mt-6 rounded-lg border border-[var(--amber)]/30 bg-[var(--amber)]/8 p-4">
      <div className="flex gap-3">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--amber)]" />
        <div><h2 className="text-sm font-medium">Some results need attention</h2><ul className="mt-2 space-y-1 text-xs leading-5 text-[var(--fg-muted)]">{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div>
      </div>
    </section>
  )
}

function UnavailableState() {
  return (
    <section className="mt-6 rounded-lg border border-[var(--amber)]/30 bg-[var(--amber)]/8 px-5 py-8 text-center">
      <AlertTriangle className="mx-auto size-6 text-[var(--amber)]" />
      <h2 className="mt-3 text-base font-semibold">Template outcomes are unavailable</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[var(--fg-muted)]">The private listing source could not be read. Refresh before making a template decision.</p>
    </section>
  )
}

function MetricCard({ icon: Icon, label, value, detail }: { icon: typeof BarChart3; label: string; value: string; detail: string }) {
  return (
    <article className="min-w-0 rounded-lg border border-border bg-white/[0.035] p-4">
      <div className="flex items-center justify-between gap-3"><span className="text-xs font-medium text-[var(--fg-muted)]">{label}</span><Icon className="size-4 text-[var(--fg-muted-2)]" /></div>
      <p className="mt-3 truncate font-mono text-2xl font-semibold">{value}</p>
      <p className="mt-1 truncate text-xs text-[var(--fg-muted)]">{detail}</p>
    </article>
  )
}

function formatRate(value: number | null): string {
  return value == null ? 'Not enough data' : `${value}%`
}

function formatPercent(value: number | null): string {
  return value == null ? 'Not enough data' : `${value}%`
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('en-US', { dateStyle: 'medium', timeZone: 'UTC' })
}

function toneClasses(tone: CommerceTemplateOpportunityTone): string {
  if (tone === 'attention') return 'border-[var(--signal)]/35 bg-[var(--signal)]/[0.055]'
  if (tone === 'watch') return 'border-[var(--amber)]/30 bg-[var(--amber)]/[0.045]'
  return 'border-[var(--ready)]/25 bg-[var(--ready)]/[0.035]'
}

function demandEvidence(row: CommerceTemplateOpportunityRow): { value: string; detail: string } {
  if (!row.demand.available) return { value: 'Unavailable', detail: 'No demand value inferred' }
  const observed = row.demand.observed ?? 0
  const unresolved = row.demand.unresolved ?? 0
  return {
    value: `${row.demand.truncated ? 'At least ' : ''}${unresolved} unresolved`,
    detail: `${observed} ${observed === 1 ? 'request' : 'requests'} in the current window`,
  }
}

function supplyEvidence(row: CommerceTemplateOpportunityRow): { value: string; detail: string } {
  if (!row.supply.available) return { value: 'Unavailable', detail: 'No supply value inferred' }
  const count = row.supply.certifiedListings ?? 0
  return {
    value: `${count} certified`,
    detail: count === 1 ? 'Exact category listing' : 'Exact category listings',
  }
}

function adoptionEvidence(row: CommerceTemplateOpportunityRow): { value: string; detail: string } {
  if (!row.adoption.available) return { value: 'Unavailable', detail: 'No adoption value inferred' }
  const listings = row.adoption.listings ?? 0
  const published = row.adoption.publishedListings ?? 0
  return {
    value: `${published} of ${listings} published`,
    detail: row.adoption.averageReadiness == null
      ? 'No readiness result yet'
      : `${formatPercent(row.adoption.averageReadiness)} current readiness`,
  }
}

function commerceEvidence(row: CommerceTemplateOpportunityRow): { value: string; detail: string } {
  if (!row.checkout.available && !row.negotiated.available) {
    return { value: 'Unavailable', detail: 'No commerce value inferred' }
  }
  if (!row.checkout.available) {
    return { value: 'Checkout unavailable', detail: `${row.negotiated.deals ?? 0} negotiated deals` }
  }
  if (!row.negotiated.available) {
    return { value: 'Deals unavailable', detail: `${row.checkout.orders ?? 0} checkout orders` }
  }
  return {
    value: `${row.checkout.orders ?? 0} checkout · ${row.negotiated.deals ?? 0} negotiated`,
    detail: 'Kept separate by commerce rail',
  }
}

function readinessComparison(value: number | null): string {
  if (value == null) return 'No comparison cohort yet'
  if (value === 0) return 'Matches listings with no recorded template'
  return `${value > 0 ? '+' : ''}${value} points vs no recorded template`
}

function railSummary(rails: CommerceTemplateRailCounts): string {
  const parts = RAIL_LABELS.flatMap(([key, label]) => rails[key] ? [`${label} ${rails[key]}`] : [])
  return parts.length ? parts.join(' · ') : 'No live checkout payments'
}

function buildReviewDeskItems(
  rows: CommerceTemplateOpportunityRow[],
  report: CommerceTemplateReviewReport,
): CommerceTemplateReviewDeskItem[] {
  return rows.map((row) => {
    const cases = report.cases.filter((review) => (
      review.templateId === row.templateId && review.templateVersion === row.templateVersion
    ))
    const active = cases.find((review) => review.status === 'open') ?? null
    const evidence = active?.opened.evidence
    return {
      templateId: row.templateId,
      templateVersion: row.templateVersion,
      title: row.title,
      recommendationLabel: row.actionLabel,
      performanceReviewReady: row.action === 'review-template',
      openToken: randomUUID(),
      decisionToken: randomUUID(),
      activeReview: active && evidence ? {
        reviewId: active.reviewId,
        reason: active.reviewReason,
        reasonLabel: commerceTemplateReviewReasonLabel(active.reviewReason),
        rationale: active.opened.rationale,
        openedAt: active.opened.createdAt,
        evidenceGeneratedAt: evidence.generatedAt,
        evidenceActionLabel: evidence.recommendation.label,
        performanceReviewReady: evidence.recommendation.performanceReviewReady,
        missingSources: unavailableReviewSources(evidence.sources),
        checkoutValue: evidence.checkout.available ? `${evidence.checkout.orders ?? 0} orders` : 'Unavailable',
        negotiatedValue: evidence.negotiated.available ? `${evidence.negotiated.deals ?? 0} deals` : 'Unavailable',
      } : null,
      history: cases
        .flatMap((review) => {
          const decision = review.decision
          if (!decision?.decision) return []
          return [{
            reviewId: review.reviewId,
            reasonLabel: commerceTemplateReviewReasonLabel(review.reviewReason),
            decision: decision.decision,
            decisionLabel: commerceTemplateReviewDecisionLabel(decision.decision),
            rationale: decision.rationale,
            decidedAt: decision.createdAt,
          }]
        })
        .slice(0, 3),
    }
  })
}

function unavailableReviewSources(
  sources: CommerceTemplateReviewEvidence['sources'],
): string[] {
  const labels: Array<[keyof typeof sources, string]> = [
    ['demand', 'buyer interest'],
    ['supply', 'certified supply'],
    ['listings', 'guide use'],
    ['benchmark', 'comparison readiness'],
    ['checkout', 'live checkout'],
    ['negotiated', 'negotiated commerce'],
  ]
  return labels.flatMap(([key, label]) => sources[key] ? [] : [label])
}

function templateReviewAnchor(templateId: string, templateVersion: number): string {
  return `review-${templateId.replace(/[^a-z0-9]+/g, '-')}-${templateVersion}`
}
