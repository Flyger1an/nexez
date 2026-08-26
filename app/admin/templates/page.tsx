import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  BadgeCheck,
  CheckCircle2,
  CircleDashed,
  FileCheck2,
  Gauge,
  HandCoins,
  ShoppingBag,
  Store,
  Users,
} from 'lucide-react'
import { requirePlatformAdmin } from '../../../lib/server/admin-access'
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

const RAIL_LABELS: Array<[keyof CommerceTemplateRailCounts, string]> = [
  ['hosted_checkout', 'Hosted'],
  ['protocol_checkout', 'Agent protocols'],
  ['recurring_service', 'Recurring'],
  ['staged_settlement', 'Staged'],
  ['resource_reservation', 'Reservations'],
]

export default async function AdminTemplateOutcomesPage() {
  await requirePlatformAdmin('/admin/templates')
  const snapshot = await getCommerceTemplateOpportunitySnapshot()
  const outcomes = snapshot.outcomes

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
        <span className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-full border border-current/25 px-2.5 py-1 text-xs font-medium">
          {row.actionLabel}<ArrowRight className="size-3" aria-hidden="true" />
        </span>
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
