import type { LucideIcon } from 'lucide-react'
import {
  ArrowUpRight,
  Activity,
  BadgeCheck,
  BellRing,
  Bot,
  Building2,
  Code2,
  Database,
  Globe2,
  KeyRound,
  Link2,
  ListChecks,
  Search,
  Settings2,
  ShieldCheck,
  Store,
  Target,
  Users,
} from 'lucide-react'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { type AgentPage, getBaseUrl, getOfferCount, getReadinessScore } from '../../../lib/agent-page'
import { getBillingPlan, minPlanForFeature, planAllows } from '../../../lib/billing'
import { loadStorefrontsForOwner } from '../../../lib/server/storefront'
import { getOwnerPlanId } from '../../../lib/server/plan'
import { loadAgentOperations } from '../../../lib/server/agent-operations'
import { buildAgentOperationsSnapshot, type AgentOperationsSnapshot } from '../../../lib/agent-operations'
import { createClient } from '../../../utils/supabase/server'
import { AccountDataControls } from '../../../components/AccountDataControls'
import { PasskeySettings } from '../../../components/PasskeySettings'
import { PhoneSignInSettings } from '../../../components/PhoneSignInSettings'
import { ProfileSettings } from '../../../components/ProfileSettings'
import { StorefrontSettings, type StorefrontListing } from '../../../components/StorefrontSettings'
import { TeamInvites } from '../../../components/TeamInvites'
import { UpgradeBanner } from '../../../components/billing/PlanGate'
import { SurfaceHeader, surfaceActionClass } from '../../../components/dashboard/SurfacePrimitives'
import { StatusPill } from '../../../components/settings/SettingsPrimitives'
import { AccountSettingsNav } from '../../../components/settings/AccountSettingsNav'
import { NotificationPreferencesPanel } from '../../../components/NotificationPreferencesPanel'
import { SmsNotificationSettings } from '../../../components/SmsNotificationSettings'
import { loadSellerNotificationPreferences } from '../../../lib/server/seller-notification-preferences'
import { maskE164PhoneNumber } from '../../../lib/phone-auth'
import {
  DEFAULT_SELLER_NOTIFICATION_PREFERENCES,
  type SellerNotificationPreferences,
} from '../../../lib/seller-notification-policy'

const ACCOUNT_SETTINGS_PAGE_SELECT = [
  'id',
  'owner_id',
  'name',
  'slug',
  'description',
  'website_url',
  'cta_url',
  'audience',
  'industry',
  'location',
  'contact_email',
  'products',
  'services',
  'faqs',
  'is_published',
  'created_at',
].join(',')

const schemaSignals = [
  ['WebPage', 'Public page identity and canonical URL'],
  ['Organization', 'Seller name, website, contact, and service area'],
  ['Offer', 'Products or services with price, description, and checkout URL'],
  ['BuyAction', 'Agent-readable checkout handoff target'],
]

type DataState<T> = { data: T; error: string | null }

async function loadAccountPages(supabase: ReturnType<typeof createClient>, ownerId: string): Promise<DataState<AgentPage[]>> {
  const result = await supabase
    .from('pages')
    .select(ACCOUNT_SETTINGS_PAGE_SELECT)
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: false })
    .returns<AgentPage[]>()

  if (result.error) {
    return { data: [], error: 'Listing metrics and agent-surface status are temporarily unavailable.' }
  }
  return { data: result.data ?? [], error: null }
}

async function loadStorefrontState(ownerId: string) {
  try {
    return { data: await loadStorefrontsForOwner(ownerId), error: null }
  } catch {
    return { data: [], error: 'Storefront controls could not be loaded.' }
  }
}

async function loadListingAssignments(
  supabase: ReturnType<typeof createClient>,
  ownerId: string,
): Promise<DataState<StorefrontListing[]>> {
  const result = await supabase
    .from('pages')
    .select('id, name, slug, is_published, storefront_id')
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: false })
    .returns<StorefrontListing[]>()

  if (result.error) return { data: [], error: 'Listing assignments could not be loaded.' }
  return { data: result.data ?? [], error: null }
}

async function loadNotificationState(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<DataState<{ preferences: SellerNotificationPreferences; configured: boolean }>> {
  try {
    return { data: await loadSellerNotificationPreferences(supabase, userId), error: null }
  } catch {
    return {
      data: { preferences: { ...DEFAULT_SELLER_NOTIFICATION_PREFERENCES }, configured: false },
      error: 'Notification preferences are temporarily unavailable.',
    }
  }
}

export default async function AccountSettingsPage() {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
        <Link
          href="/login?next=/dashboard/settings"
          className="inline-flex min-h-11 items-center rounded-xl bg-foreground px-5 py-3 font-medium text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--signal)]"
        >
          Sign in to manage settings
        </Link>
      </main>
    )
  }

  const [currentPlan, pageState, storefrontState, listingState, agentState, notificationState] = await Promise.all([
    getOwnerPlanId(supabase, user.id),
    loadAccountPages(supabase, user.id),
    loadStorefrontState(user.id),
    loadListingAssignments(supabase, user.id),
    loadAgentOperations(supabase, user.id),
    loadNotificationState(supabase, user.id),
  ])

  const dataIssues = [pageState.error, storefrontState.error, listingState.error, agentState.error, notificationState.error].filter(Boolean) as string[]
  const ownedPages = pageState.data
  const publishedPages = ownedPages.filter((page) => page.is_published)
  const offerCount = ownedPages.reduce((sum, page) => sum + getOfferCount(page), 0)
  const averageReadiness = ownedPages.length
    ? Math.round(ownedPages.reduce((sum, page) => sum + getReadinessScore(page), 0) / ownedPages.length)
    : 0
  const planName = getBillingPlan(currentPlan)?.name ?? 'Free'
  const baseUrl = getBaseUrl()
  const searchApiTemplate = `${baseUrl}/api/agent-search?q={query}`
  const searchApiExample = `${baseUrl}/api/agent-search?q=consulting`
  const firstListingSettingsHref = ownedPages[0] ? `/dashboard/${ownedPages[0].id}/settings` : '/dashboard'
  const agentOperations = !pageState.error && !agentState.error
    ? buildAgentOperationsSnapshot(ownedPages, agentState.data)
    : null

  return (
    <main data-testid="account-settings-screen" className="nx-platform-surface min-h-screen bg-[var(--bg)] text-[var(--fg)]">
      <div className="mx-auto max-w-[1680px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <SurfaceHeader
          eyebrow="Platform settings"
          icon={Settings2}
          title="Settings"
          description="Manage the workspace, people, security, data, and public agent infrastructure behind your business."
          actions={(
            <>
              <Link href="/dashboard/tools" className={surfaceActionClass}>
                <KeyRound className="size-4" aria-hidden="true" />
                Developer tools
              </Link>
              <Link href="/simulator" className={surfaceActionClass}>
                <Bot className="size-4" aria-hidden="true" />
                Open Agent Lab
              </Link>
            </>
          )}
          footer={(
            <>
              <StatusPill label={`${planName} plan`} />
              <StatusPill label={pageState.error ? 'Listings unavailable' : `${publishedPages.length} published listing${publishedPages.length === 1 ? '' : 's'}`} tone={pageState.error ? 'attention' : publishedPages.length ? 'ready' : 'neutral'} />
              <StatusPill label={pageState.error ? 'Offers unavailable' : `${offerCount} listed offer${offerCount === 1 ? '' : 's'}`} />
              <StatusPill label={pageState.error ? 'Readiness unavailable' : `${averageReadiness}% average readiness`} tone={averageReadiness >= 80 ? 'ready' : averageReadiness >= 60 ? 'attention' : 'neutral'} />
            </>
          )}
        />

        {dataIssues.length ? (
          <div
            role="status"
            className="mt-5 rounded-2xl border border-[var(--amber)]/35 bg-[var(--amber)]/10 px-4 py-3 text-sm text-[var(--fg-muted)]"
          >
            <p className="font-medium text-foreground">Some live settings data is unavailable.</p>
            <p className="mt-1">{dataIssues.join(' ')}</p>
          </div>
        ) : null}

        <div className="mt-8 grid min-w-0 grid-cols-[minmax(0,1fr)] items-start gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="sticky top-16 z-30 min-w-0 max-w-full lg:top-24">
            <AccountSettingsNav />
          </aside>

          <div className="min-w-0 space-y-8">
            <SettingsArea
              id="workspace"
              eyebrow="Business identity"
              title="Workspace"
              description="Set the identity shared by your team and organize the storefronts that group your public listings."
              icon={Building2}
            >
              {storefrontState.error ? (
                <UnavailablePanel message={storefrontState.error} />
              ) : (
                <StorefrontSettings storefronts={storefrontState.data} listings={listingState.data} />
              )}
              <div className="grid gap-5 2xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
                <ProfileSettings
                  email={user.email ?? ''}
                  initialFullName={(user.user_metadata?.full_name as string) ?? ''}
                  initialCompany={(user.user_metadata?.company as string) ?? ''}
                  initialIndustry={(user.user_metadata?.industry as string) ?? ''}
                />
                <WorkspaceGuide />
              </div>
            </SettingsArea>

            <SettingsArea
              id="security"
              eyebrow="Account protection"
              title="Profile & security"
              description="Keep your identity current and add phishing-resistant sign-in protection."
              icon={ShieldCheck}
            >
              <div className="grid gap-5 2xl:grid-cols-2">
                <PasskeySettings />
                <PhoneSignInSettings
                  initialPhoneMasked={user.phone_confirmed_at ? maskE164PhoneNumber(user.phone) : null}
                />
              </div>
            </SettingsArea>

            <SettingsArea
              id="notifications"
              eyebrow="Account delivery policy"
              title="Notifications"
              description="Control optional seller alerts across every device while preserving required money-state notices."
              icon={BellRing}
            >
              {notificationState.error ? (
                <UnavailablePanel message={notificationState.error} />
              ) : (
                <NotificationPreferencesPanel initialPreferences={notificationState.data.preferences} />
              )}
              <SmsNotificationSettings />
            </SettingsArea>

            <SettingsArea
              id="team"
              eyebrow="Workspace access"
              title="Team access"
              description="Invite collaborators, adjust roles, and revoke open invitations without exposing another workspace."
              icon={Users}
            >
              <UpgradeBanner
                feature="teamCollaboration"
                currentPlan={currentPlan}
                title="Team collaboration"
                description="New invitations and role changes require Pro. Existing access stays visible here so you can revoke it after a downgrade."
                className="mb-4"
              />
              <TeamInvites collaborationEnabled={planAllows(currentPlan, 'teamCollaboration')} />
            </SettingsArea>

            <SettingsArea
              id="data"
              eyebrow="Privacy & lifecycle"
              title="Data controls"
              description="Export a verified account archive or remove personal buyer data with the exact retention behavior shown before confirmation."
              icon={Database}
            >
              <AccountDataControls email={user.email ?? ''} />
            </SettingsArea>

            <SettingsArea
              id="agent-surfaces"
              eyebrow="Machine-facing infrastructure"
              title="Agent surfaces"
              description="Inspect the discovery endpoints, schema contract, and listing readiness that external agents can consume."
              icon={Bot}
            >
              <AgentOperationsPanel snapshot={agentOperations} error={agentState.error || pageState.error} />

              <div className="grid gap-5 2xl:grid-cols-[minmax(0,1.3fr)_minmax(340px,0.7fr)]">
                <section className="card !p-5 sm:!p-6">
                  <div className="flex items-center gap-2">
                    <Search className="size-5 text-[var(--signal)]" aria-hidden="true" />
                    <h3 className="text-xl font-semibold">Discovery endpoints</h3>
                  </div>
                  <div className="mt-5 grid gap-3 md:grid-cols-2">
                    <Endpoint label="Agent discovery" value={`${baseUrl}/discovery`} />
                    <Endpoint label="llms.txt" value={`${baseUrl}/llms.txt`} />
                    <Endpoint label="Agent index" value={`${baseUrl}/agent-pages.json`} />
                    <Endpoint label="Search API" value={searchApiTemplate} href={searchApiExample} />
                    <Endpoint label="OpenAPI" value={`${baseUrl}/openapi.json`} />
                    <Endpoint label="Capabilities" value={`${baseUrl}/.well-known/nexez.json`} />
                  </div>
                </section>

                <div className="grid gap-5 sm:grid-cols-2 2xl:grid-cols-1">
                  <ControlCard icon={Globe2} title="Custom domains">
                    <ConfigRow label="Fallback URL" value={baseUrl} />
                    <ConfigRow label="Status" value={ownedPages.length ? 'Configured per listing' : 'Create a listing to begin'} />
                    <Link href={firstListingSettingsHref} className={inlineActionClass}>
                      Manage domain settings <ArrowUpRight className="size-4" aria-hidden="true" />
                    </Link>
                  </ControlCard>
                  <ControlCard icon={KeyRound} title="API access">
                    <ConfigRow label="Public APIs" value="No key required" />
                    <ConfigRow label="Private API keys" value={`${minPlanForFeature('apiAccess').name} and up`} />
                    <Link href="/dashboard/tools" className={inlineActionClass}>
                      Manage API access <ArrowUpRight className="size-4" aria-hidden="true" />
                    </Link>
                  </ControlCard>
                </div>
              </div>

              <section className="card !p-5 sm:!p-6">
                <div className="flex items-center gap-2">
                  <Code2 className="size-5 text-[var(--signal)]" aria-hidden="true" />
                  <h3 className="text-xl font-semibold">Published schema contract</h3>
                </div>
                <div className="mt-5 grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
                  {schemaSignals.map(([label, description]) => (
                    <div key={label} className="rounded-xl border border-[var(--line-soft)] bg-[var(--fill-1)] p-4">
                      <div className="flex items-center gap-2">
                        <BadgeCheck className="size-4 text-[var(--ready)]" aria-hidden="true" />
                        <p className="font-medium">{label}</p>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-[var(--fg-muted-2)]">{description}</p>
                    </div>
                  ))}
                </div>
              </section>

              <AgentSurfaceTable pages={pageState.error ? null : ownedPages} />
            </SettingsArea>
          </div>
        </div>
      </div>
    </main>
  )
}

function AgentOperationsPanel({ snapshot, error }: { snapshot: AgentOperationsSnapshot | null; error: string | null }) {
  return (
    <section className="card !p-5 sm:!p-6" aria-labelledby="agent-operations-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="size-5 text-[var(--signal)]" aria-hidden="true" />
            <h3 id="agent-operations-title" className="text-xl font-semibold">Agent operations</h3>
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--fg-muted)]">
            Turn listing evidence and saved external research into a concrete operating queue.
          </p>
        </div>
        <Link href="/simulator" className={topButtonClass}>Review in Agent Lab <ArrowUpRight className="size-4" aria-hidden="true" /></Link>
      </div>

      {error || !snapshot ? (
        <UnavailablePanel message={error || 'Agent operations are temporarily unavailable.'} />
      ) : (
        <>
          <div className="mt-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
            <OperationsStat label="Evidence runs" value={`${snapshot.simulationRuns}${snapshot.historyWindowComplete ? '' : '+'}`} detail="Attributable listing tests" />
            <OperationsStat label="Listing coverage" value={`${snapshot.coveragePercent}%`} detail={`${snapshot.testedPublishedListings} of ${snapshot.publishedListings} published tested`} />
            <OperationsStat label="Research targets" value={String(snapshot.uniqueResearchTargets)} detail={`${snapshot.researchRuns}${snapshot.historyWindowComplete ? '' : '+'} saved snapshots`} />
            <OperationsStat
              label="Latest research"
              value={snapshot.latestResearchScore == null ? '—' : String(snapshot.latestResearchScore)}
              detail={snapshot.latestResearchTarget
                ? `${snapshot.latestResearchTarget} · ${snapshot.latestResearchDelta == null ? 'no comparable prior snapshot' : `${snapshot.latestResearchDelta > 0 ? '+' : ''}${snapshot.latestResearchDelta} vs prior snapshot`}`
                : 'No scored research snapshots yet'}
            />
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
            <div className="rounded-2xl border border-[var(--line-soft)] bg-[var(--fill-1)] p-4 sm:p-5">
              <div className="flex items-center gap-2">
                <ListChecks className="size-4 text-[var(--signal)]" aria-hidden="true" />
                <h4 className="font-semibold">Priority queue</h4>
              </div>
              <div className="mt-3 grid gap-2 lg:grid-cols-3">
                {snapshot.actions.map((action, index) => (
                  <Link key={action.key} href={action.href} className="group rounded-xl border border-[var(--line-soft)] bg-[var(--glass)] p-3 outline-none transition-colors hover:bg-[var(--fill-2)] focus-visible:ring-2 focus-visible:ring-[var(--settings-focus)]">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--fg-muted-2)]">Priority {index + 1}</p>
                    <p className="mt-2 text-sm font-medium group-hover:text-[var(--signal)]">{action.title}</p>
                    <p className="mt-1 text-xs leading-5 text-[var(--fg-muted-2)]">{action.detail}</p>
                  </Link>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--line-soft)] bg-[var(--fill-1)] p-4 sm:p-5">
              <div className="flex items-center gap-2">
                <Target className="size-4 text-[var(--ready)]" aria-hidden="true" />
                <h4 className="font-semibold">Evidence cadence</h4>
              </div>
              <p className="mt-3 text-sm text-[var(--fg-muted)]">
                {snapshot.latestActivityAt ? `Last recorded activity ${formatSettingsDate(snapshot.latestActivityAt)}.` : 'No attributable Agent Lab activity yet.'}
              </p>
              <p className="mt-2 text-xs leading-5 text-[var(--fg-muted-2)]">
                {snapshot.historyWindowComplete
                  ? 'Coverage uses the complete retained history available to this workspace.'
                  : 'The view reached its 500-row safety window; totals are shown as minimums.'}
              </p>
            </div>
          </div>
        </>
      )}
    </section>
  )
}

function OperationsStat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-[var(--line-soft)] bg-[var(--fill-1)] p-4">
      <p className="text-[10px] uppercase tracking-[0.13em] text-[var(--fg-muted-2)]">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-xs leading-5 text-[var(--fg-muted-2)]">{detail}</p>
    </div>
  )
}

function formatSettingsDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'at an unknown time'
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(date)
}

function SettingsArea({
  id,
  eyebrow,
  title,
  description,
  icon: Icon,
  children,
}: {
  id: string
  eyebrow: string
  title: string
  description: string
  icon: LucideIcon
  children: React.ReactNode
}) {
  return (
    <section id={id} className="platform-settings-area relative max-w-full min-w-0 scroll-mt-28 overflow-hidden rounded-[var(--r-card)] border border-[var(--line-soft)] bg-[var(--glass)] shadow-[var(--settings-panel-shadow)] backdrop-blur-[var(--blur-card)]">
      <header className="flex items-start gap-3 border-b border-[var(--line-soft)] px-5 py-5 sm:px-6">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-[var(--radius)] border border-[var(--line-soft)] bg-[var(--fill-1)] text-[var(--settings-emphasis)]">
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--fg-muted-2)]">{eyebrow}</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight">{title}</h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-[var(--fg-muted)]">{description}</p>
        </div>
      </header>
      <div className="min-w-0 space-y-5 p-5 sm:p-6">{children}</div>
    </section>
  )
}

function WorkspaceGuide() {
  return (
    <aside className="card !p-5 sm:!p-6">
      <div className="flex items-center gap-2">
        <Store className="size-5 text-[var(--signal)]" aria-hidden="true" />
        <h3 className="text-lg font-semibold">Workspace map</h3>
      </div>
      <div className="mt-5 space-y-4 text-sm">
        <GuideStep number="01" title="Account identity" body="Your name, company, and industry describe the owner behind every workspace surface." />
        <GuideStep number="02" title="Storefronts" body="Storefronts group listings into a shared public business destination." />
        <GuideStep number="03" title="Listings" body="Each listing controls its own offers, domain, readiness, and checkout behavior." />
      </div>
    </aside>
  )
}

function GuideStep({ number, title, body }: { number: string; title: string; body: string }) {
  return (
    <div className="grid grid-cols-[36px_minmax(0,1fr)] gap-3">
      <span className="font-mono text-xs text-[var(--signal)]">{number}</span>
      <div>
        <p className="font-medium">{title}</p>
        <p className="mt-1 leading-6 text-[var(--fg-muted-2)]">{body}</p>
      </div>
    </div>
  )
}

function ControlCard({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: React.ReactNode }) {
  return (
    <section className="card !p-5">
      <div className="flex items-center gap-2">
        <Icon className="size-5 text-[var(--signal)]" aria-hidden="true" />
        <h3 className="text-lg font-semibold">{title}</h3>
      </div>
      <div className="mt-4 space-y-3 text-sm">{children}</div>
    </section>
  )
}

function AgentSurfaceTable({ pages }: { pages: AgentPage[] | null }) {
  return (
    <section className="card max-w-full min-w-0 overflow-hidden !p-5 sm:!p-6">
      <div className="flex items-center gap-2">
        <Link2 className="size-5 text-[var(--signal)]" aria-hidden="true" />
        <h3 className="text-xl font-semibold">Agent surface status</h3>
      </div>
      {pages === null ? (
        <UnavailablePanel message="Live listing status is unavailable. No zero values have been assumed." />
      ) : pages.length === 0 ? (
        <div className="mt-5 rounded-xl border border-dashed border-[var(--line-soft)] p-8 text-center text-sm text-[var(--fg-muted-2)]">
          Create a listing to publish your first agent surface.
        </div>
      ) : (
        <>
          <div className="mt-5 hidden overflow-x-auto md:block">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="text-[var(--fg-muted-2)]">
                <tr>
                  <th className="py-3 font-medium">Listing</th>
                  <th className="py-3 font-medium">Visibility</th>
                  <th className="py-3 font-medium">Offers</th>
                  <th className="py-3 font-medium">Readiness</th>
                  <th className="py-3 text-right font-medium">Controls</th>
                </tr>
              </thead>
              <tbody>
                {pages.map((page) => (
                  <tr key={page.id} className="border-t border-[var(--line-soft)]">
                    <td className="py-4">
                      <p className="font-medium">{page.name}</p>
                      <p className="font-mono text-xs text-[var(--fg-muted-2)]">/{page.slug}</p>
                    </td>
                    <td className="py-4 text-[var(--fg-muted)]">{page.is_published ? 'Published' : 'Draft'}</td>
                    <td className="py-4 text-[var(--fg-muted)]">{getOfferCount(page)}</td>
                    <td className="py-4 text-[var(--signal)]">{getReadinessScore(page)}%</td>
                    <td className="py-4 text-right">
                      <Link href={`/dashboard/${page.id}/settings`} className={inlineActionClass}>Configure</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-5 grid min-w-0 gap-3 md:hidden">
            {pages.map((page) => (
              <article key={page.id} className="max-w-full min-w-0 rounded-xl border border-[var(--line-soft)] bg-[var(--fill-1)] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{page.name}</p>
                    <p className="truncate font-mono text-xs text-[var(--fg-muted-2)]">/{page.slug}</p>
                  </div>
                  <span className="rounded-full border border-[var(--line)] px-2.5 py-1 text-xs text-[var(--fg-muted)]">
                    {page.is_published ? 'Published' : 'Draft'}
                  </span>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div><dt className="text-[var(--fg-muted-2)]">Offers</dt><dd className="mt-1 font-medium">{getOfferCount(page)}</dd></div>
                  <div><dt className="text-[var(--fg-muted-2)]">Readiness</dt><dd className="mt-1 font-medium text-[var(--signal)]">{getReadinessScore(page)}%</dd></div>
                </dl>
                <Link href={`/dashboard/${page.id}/settings`} className={`${inlineActionClass} mt-4`}>Configure listing</Link>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  )
}

function Endpoint({ label, value, href = value }: { label: string; value: string; href?: string }) {
  return (
    <a
      href={href}
      data-testid="settings-endpoint-card"
      className="group block min-w-0 rounded-xl border border-[var(--line-soft)] bg-[var(--fill-1)] p-4 transition-shadow hover:bg-[var(--fill-2)] hover:shadow-[inset_0_0_0_1px_var(--line-hi)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--settings-focus)]"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium">{label}</p>
        <ArrowUpRight className="size-4 text-[var(--fg-muted-2)] transition-colors group-hover:text-[var(--signal)]" aria-hidden="true" />
      </div>
      <p className="mt-2 truncate font-mono text-xs text-[var(--signal)]">{value}</p>
    </a>
  )
}

function ConfigRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-[var(--line-soft)] bg-[var(--fill-1)] px-3 py-3">
      <span className="text-[var(--fg-muted-2)]">{label}</span>
      <span className="max-w-[62%] text-right text-foreground">{value}</span>
    </div>
  )
}

function UnavailablePanel({ message }: { message: string }) {
  return (
    <div role="status" className="mt-5 rounded-xl border border-dashed border-[var(--line-soft)] p-5 text-sm text-[var(--fg-muted)]">
      {message}
    </div>
  )
}

const topButtonClass =
  'inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--line)] px-4 py-2 text-sm font-medium text-[var(--fg-muted)] transition-colors hover:bg-[var(--fill-2)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--settings-focus)]'

const inlineActionClass =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg text-sm font-medium text-[var(--signal)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--signal)]'
