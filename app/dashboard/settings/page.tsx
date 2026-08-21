import type { LucideIcon } from 'lucide-react'
import {
  ArrowUpRight,
  BadgeCheck,
  Bot,
  Building2,
  Code2,
  Database,
  Globe2,
  KeyRound,
  Link2,
  LockKeyhole,
  Search,
  Settings2,
  ShieldCheck,
  Store,
  Users,
} from 'lucide-react'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { type AgentPage, getBaseUrl, getOfferCount, getReadinessScore } from '../../../lib/agent-page'
import { getBillingPlan, minPlanForFeature } from '../../../lib/billing'
import { loadStorefrontsForOwner } from '../../../lib/server/storefront'
import { getOwnerPlanId } from '../../../lib/server/plan'
import { createClient } from '../../../utils/supabase/server'
import { AccountDataControls } from '../../../components/AccountDataControls'
import { PasskeySettings } from '../../../components/PasskeySettings'
import { ProfileSettings } from '../../../components/ProfileSettings'
import { StorefrontSettings, type StorefrontListing } from '../../../components/StorefrontSettings'
import { TeamInvites } from '../../../components/TeamInvites'
import { PlanGate } from '../../../components/billing/PlanGate'

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

const settingsNav: Array<{ href: string; label: string; icon: LucideIcon }> = [
  { href: '#workspace', label: 'Workspace', icon: Building2 },
  { href: '#security', label: 'Profile & security', icon: LockKeyhole },
  { href: '#team', label: 'Team access', icon: Users },
  { href: '#data', label: 'Data controls', icon: Database },
  { href: '#agent-surfaces', label: 'Agent surfaces', icon: Bot },
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

  const [currentPlan, pageState, storefrontState, listingState] = await Promise.all([
    getOwnerPlanId(supabase, user.id),
    loadAccountPages(supabase, user.id),
    loadStorefrontState(user.id),
    loadListingAssignments(supabase, user.id),
  ])

  const dataIssues = [pageState.error, storefrontState.error, listingState.error].filter(Boolean) as string[]
  const ownedPages = pageState.data
  const publishedPages = ownedPages.filter((page) => page.is_published)
  const offerCount = ownedPages.reduce((sum, page) => sum + getOfferCount(page), 0)
  const averageReadiness = ownedPages.length
    ? Math.round(ownedPages.reduce((sum, page) => sum + getReadinessScore(page), 0) / ownedPages.length)
    : 0
  const planName = getBillingPlan(currentPlan)?.name ?? 'Free'
  const baseUrl = getBaseUrl()
  const firstListingSettingsHref = ownedPages[0] ? `/dashboard/${ownedPages[0].id}/settings` : '/dashboard'

  return (
    <main data-testid="account-settings-screen" className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-[1680px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <section className="overflow-hidden rounded-[28px] border border-[var(--bd-10)] bg-[var(--panel)]">
          <div className="grid gap-8 px-5 py-7 sm:px-7 lg:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)] lg:px-9 lg:py-9">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-medium text-[var(--signal)]">
                <Settings2 className="size-4" aria-hidden="true" />
                Account control center
              </p>
              <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">Settings</h1>
              <p className="mt-4 max-w-3xl text-sm leading-6 text-[var(--fg-muted)] sm:text-base sm:leading-7">
                Manage the workspace, people, security, data, and public agent infrastructure behind your business.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link href="/dashboard/tools" className={topButtonClass}>
                  <KeyRound className="size-4" aria-hidden="true" />
                  Developer tools
                </Link>
                <Link href="/simulator" className={topButtonClass}>
                  <Bot className="size-4" aria-hidden="true" />
                  Open Agent Lab
                </Link>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Stat label="Current plan" value={planName} />
              <Stat label="Published listings" value={pageState.error ? '—' : String(publishedPages.length)} />
              <Stat label="Listed offers" value={pageState.error ? '—' : String(offerCount)} />
              <Stat label="Average readiness" value={pageState.error ? '—' : `${averageReadiness}%`} />
            </div>
          </div>
        </section>

        {dataIssues.length ? (
          <div
            role="status"
            className="mt-5 rounded-2xl border border-[var(--amber)]/35 bg-[var(--amber)]/10 px-4 py-3 text-sm text-[var(--fg-muted)]"
          >
            <p className="font-medium text-foreground">Some live settings data is unavailable.</p>
            <p className="mt-1">{dataIssues.join(' ')}</p>
          </div>
        ) : null}

        <div className="mt-6 grid min-w-0 gap-6 xl:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="max-w-full min-w-0 overflow-hidden xl:sticky xl:top-6 xl:h-fit">
            <nav
              aria-label="Settings sections"
              className="flex w-full max-w-full min-w-0 gap-2 overflow-x-auto overscroll-x-contain rounded-2xl border border-[var(--bd-10)] bg-[var(--panel)] p-2 xl:flex-col"
            >
              {settingsNav.map(({ href, label, icon: Icon }) => (
                <a
                  key={href}
                  href={href}
                  className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-3 text-sm text-[var(--fg-muted)] transition-colors hover:bg-[var(--hover)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--signal)]"
                >
                  <Icon className="size-4" aria-hidden="true" />
                  {label}
                </a>
              ))}
            </nav>
          </aside>

          <div className="min-w-0 space-y-7">
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
              <PasskeySettings />
            </SettingsArea>

            <SettingsArea
              id="team"
              eyebrow="Workspace access"
              title="Team access"
              description="Invite collaborators, adjust roles, and revoke open invitations without exposing another workspace."
              icon={Users}
            >
              <PlanGate
                feature="teamCollaboration"
                currentPlan={currentPlan}
                title="Team collaboration"
                description="Invite editors and reviewers and run approval workflows on your listings—available on the Pro plan and up."
              >
                <TeamInvites />
              </PlanGate>
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
                    <Endpoint label="Search API" value={`${baseUrl}/api/agent-search?q=consulting`} />
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
                    <div key={label} className="rounded-xl border border-[var(--bd-10)] bg-[var(--panel)]/50 p-4">
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
    <section id={id} className="max-w-full min-w-0 scroll-mt-6 overflow-hidden rounded-[24px] border border-[var(--bd-10)] bg-[var(--panel)]/45 p-4 sm:p-6 lg:p-7">
      <header className="mb-5 flex items-start gap-3 sm:mb-6">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-[var(--bd-10)] bg-[var(--panel)] text-[var(--signal)]">
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--fg-muted-2)]">{eyebrow}</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight">{title}</h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-[var(--fg-muted)]">{description}</p>
        </div>
      </header>
      <div className="min-w-0 space-y-5">{children}</div>
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
        <div className="mt-5 rounded-xl border border-dashed border-[var(--bd-10)] p-8 text-center text-sm text-[var(--fg-muted-2)]">
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
                  <tr key={page.id} className="border-t border-[var(--bd-10)]">
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
              <article key={page.id} className="max-w-full min-w-0 rounded-xl border border-[var(--bd-10)] bg-[var(--panel)]/50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{page.name}</p>
                    <p className="truncate font-mono text-xs text-[var(--fg-muted-2)]">/{page.slug}</p>
                  </div>
                  <span className="rounded-full border border-[var(--bd-10)] px-2.5 py-1 text-xs text-[var(--fg-muted)]">
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

function Endpoint({ label, value }: { label: string; value: string }) {
  return (
    <a
      href={value}
      className="group block min-w-0 rounded-xl border border-[var(--bd-10)] bg-[var(--panel)]/50 p-4 transition-colors hover:bg-[var(--hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--signal)]"
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
    <div className="flex items-start justify-between gap-4 rounded-xl border border-[var(--bd-10)] bg-[var(--panel)]/50 px-3 py-3">
      <span className="text-[var(--fg-muted-2)]">{label}</span>
      <span className="max-w-[62%] text-right text-foreground">{value}</span>
    </div>
  )
}

function UnavailablePanel({ message }: { message: string }) {
  return (
    <div role="status" className="mt-5 rounded-xl border border-dashed border-[var(--bd-10)] p-5 text-sm text-[var(--fg-muted)]">
      {message}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--bd-10)] bg-background/30 p-4 sm:p-5">
      <p className="text-xs uppercase tracking-[0.12em] text-[var(--fg-muted-2)]">{label}</p>
      <p className="mt-2 truncate text-2xl font-semibold tracking-tight sm:text-3xl">{value}</p>
    </div>
  )
}

const topButtonClass =
  'inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--bd-10)] px-4 py-2 text-sm font-medium text-[var(--fg-muted)] transition-colors hover:bg-[var(--hover)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--signal)]'

const inlineActionClass =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg text-sm font-medium text-[var(--signal)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--signal)]'
