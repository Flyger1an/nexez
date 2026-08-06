import {
  BadgeCheck,
  Bot,
  Code2,
  Globe2,
  KeyRound,
  Link2,
  Search,
  ShieldCheck,
} from 'lucide-react'
import { cookies } from 'next/headers'
import { AgentPage, BASIC_OWNER_PAGE_SELECT, OWNER_PAGE_SELECT, getBaseUrl, getOfferCount, getReadinessScore } from '../../../lib/agent-page'
import { createClient } from '../../../utils/supabase/server'
import { ProfileSettings } from '../../../components/ProfileSettings'
import { AccountDataControls } from '../../../components/AccountDataControls'
import { TeamInvites } from '../../../components/TeamInvites'
import { StorefrontSettings, type StorefrontListing } from '../../../components/StorefrontSettings'
import { loadStorefrontsForOwner } from '../../../lib/server/storefront'
import { PlanGate } from '../../../components/billing/PlanGate'
import { getOwnerPlanId } from '../../../lib/server/plan'

const schemaSignals = [
  ['WebPage', 'Public page identity and canonical URL'],
  ['Organization', 'Seller name, website, contact, and service area'],
  ['Offer', 'Products/services with price, description, and checkout URL'],
  ['BuyAction', 'Agent-readable checkout handoff target'],
]

export default async function AccountSettingsPage() {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#090b10] text-white">
        <a href="/login?next=/dashboard/settings" className="rounded-lg bg-white px-5 py-3 font-medium text-zinc-950">
          Sign in to manage settings
        </a>
      </main>
    )
  }

  const currentPlan = await getOwnerPlanId(supabase, user.id)

  const pageRes = await supabase
    .from('pages')
    .select(OWNER_PAGE_SELECT)
    .eq('owner_id', user.id)
    .order('created_at', { ascending: false })
    .returns<AgentPage[]>()

  // Degrade gracefully (like dashboard + listings) instead of rendering an empty
  // settings page when the rich select fails — e.g. schema drift on one column.
  let pages = pageRes.error ? null : pageRes.data
  if (pageRes.error) {
    const basic = await supabase
      .from('pages')
      .select(BASIC_OWNER_PAGE_SELECT)
      .eq('owner_id', user.id)
      .order('created_at', { ascending: false })
      .returns<AgentPage[]>()
    pages = basic.data
  }

  // The owner's storefronts (Phase 4: an account owns 1..N) + each one's published-listing
  // count, oldest first. Powers the multi-storefront StorefrontSettings editor + picker.
  const storefronts = await loadStorefrontsForOwner(user.id)

  // Lightweight listing rows (id + which storefront they're in) for the assignment control.
  const { data: listingRows } = await supabase
    .from('pages')
    .select('id, name, slug, is_published, storefront_id')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: false })
    .returns<StorefrontListing[]>()

  const ownedPages = pages ?? []
  const publishedPages = ownedPages.filter((page) => page.is_published)
  const offerCount = ownedPages.reduce((sum, page) => sum + getOfferCount(page), 0)
  const averageReadiness = ownedPages.length
    ? Math.round(ownedPages.reduce((sum, page) => sum + getReadinessScore(page), 0) / ownedPages.length)
    : 0
  const baseUrl = getBaseUrl()

  return (
    <main className="min-h-screen bg-[#090b10] text-white">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="flex justify-end">
          <div className="flex flex-wrap gap-3">
            <a href="/openapi.json" className={topButtonClass}>
              <Code2 className="size-4" />
              OpenAPI
            </a>
            <a href="/.well-known/nexez.json" className={topButtonClass}>
              <Bot className="size-4" />
              Capabilities
            </a>
          </div>
        </div>

        <section className="mt-8 grid gap-6 lg:grid-cols-[0.82fr_1.18fr]">
          <aside className="space-y-5 min-w-0">
            <div>
              <p className="flex items-center gap-2 text-sm text-[var(--signal)]">
                <ShieldCheck className="size-4" />
                Advanced Config
              </p>
              <h1 className="mt-3 text-4xl font-semibold tracking-tight">Your storefront.</h1>
              <p className="mt-4 text-sm leading-6 text-[var(--fg-muted)]">
                Separate human site. Structured agent layer.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              <Stat label="Published listings" value={String(publishedPages.length)} />
              <Stat label="Listed offers" value={String(offerCount)} />
              <Stat label="Avg readiness" value={`${averageReadiness}%`} />
            </div>
          </aside>

          <div className="space-y-5 min-w-0">
            <StorefrontSettings storefronts={storefronts} listings={listingRows ?? []} />
            <ProfileSettings
              email={user.email ?? ''}
              initialFullName={(user.user_metadata?.full_name as string) ?? ''}
              initialCompany={(user.user_metadata?.company as string) ?? ''}
              initialIndustry={(user.user_metadata?.industry as string) ?? ''}
            />
            <PlanGate
              feature="teamCollaboration"
              currentPlan={currentPlan}
              title="Team collaboration"
              description="Invite editors and reviewers and run approval workflows on your listings - available on the Pro plan and up."
            >
              <TeamInvites />
            </PlanGate>
            <AccountDataControls email={user.email ?? ''} />
            <section className="card !p-5">
              <div className="flex items-center gap-2">
                <Search className="size-5 text-[var(--signal)]" />
                <h2 className="text-xl font-semibold">Discovery Endpoints</h2>
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

            <section className="grid gap-5 grid-cols-1 md:grid-cols-2 xl:grid-cols-2">
              <div className="card !p-5">
                <div className="flex items-center gap-2">
                  <Globe2 className="size-5 text-[var(--signal)]" />
                  <h2 className="text-xl font-semibold">Custom Domains</h2>
                </div>
                <div className="mt-5 space-y-3 text-sm">
                  <ConfigRow label="Suggested CNAME" value="agent.yourdomain.com -> cname.vercel-dns.com" />
                  <ConfigRow label="Fallback URL" value={baseUrl} />
                  <ConfigRow label="Status" value="Ready for domain mapping" />
                </div>
              </div>

              <div className="card !p-5">
                <div className="flex items-center gap-2">
                  <KeyRound className="size-5 text-[var(--signal)]" />
                  <h2 className="text-xl font-semibold">API Access</h2>
                </div>
                <div className="mt-5 space-y-3 text-sm">
                  <ConfigRow label="Public APIs" value="No key required" />
                  <ConfigRow label="Private API keys" value="Planned for Scale" />
                  <ConfigRow label="Service role exposure" value="Never exposed" />
                </div>
              </div>
            </section>

            <section className="card !p-5">
              <div className="flex items-center gap-2">
                <Code2 className="size-5 text-[var(--signal)]" />
                <h2 className="text-xl font-semibold">Schema Controls</h2>
              </div>
              <div className="mt-5 grid gap-3 md:grid-cols-2">
                {schemaSignals.map(([label, description]) => (
                  <div key={label} className="rounded-lg border border-[var(--bd-10)] bg-[var(--panel)]/50 p-4">
                    <div className="flex items-center gap-2">
                      <BadgeCheck className="size-4 text-[var(--ready)]" />
                      <p className="font-medium">{label}</p>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-[var(--fg-muted-2)]">{description}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="card !p-5">
              <div className="flex items-center gap-2">
                <Link2 className="size-5 text-[var(--signal)]" />
                <h2 className="text-xl font-semibold">Agent Surface Status</h2>
              </div>
              <div className="mt-5 overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="text-[var(--fg-muted-2)]">
                    <tr>
                      <th className="py-3 font-medium">Listing</th>
                      <th className="py-3 font-medium">Public</th>
                      <th className="py-3 font-medium">Offers</th>
                      <th className="py-3 font-medium">Readiness</th>
                      <th className="py-3 text-right font-medium">Settings</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ownedPages.map((page) => (
                      <tr key={page.id} className="border-t border-[var(--bd-10)]">
                        <td className="py-4">
                          <p className="font-medium">{page.name}</p>
                          <p className="font-mono text-xs text-[var(--fg-muted-2)]">/{page.slug}</p>
                        </td>
                        <td className="py-4 text-zinc-300">{page.is_published ? 'Published' : 'Draft'}</td>
                        <td className="py-4 text-zinc-300">{getOfferCount(page)}</td>
                        <td className="py-4 text-[var(--signal)]">{getReadinessScore(page)}%</td>
                        <td className="py-4 text-right">
                          <a href={`/dashboard/${page.id}/settings`} className="text-[var(--signal)] hover:text-[var(--signal)]">
                            Configure
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!ownedPages.length ? (
                  <div className="rounded-lg border border-dashed border-[var(--bd-10)] p-8 text-center text-sm text-[var(--fg-muted-2)]">
                    Create a listing first.
                  </div>
                ) : null}
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  )
}

function Endpoint({ label, value }: { label: string; value: string }) {
  return (
    <a href={value} className="block min-w-0 rounded-lg border border-[var(--bd-10)] bg-[var(--panel)]/50 p-4 hover:bg-white/10">
      <p className="text-sm font-medium text-zinc-200">{label}</p>
      <p className="mt-2 truncate font-mono text-xs text-[var(--signal)]">{value}</p>
    </a>
  )
}

function ConfigRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-[var(--bd-10)] bg-[var(--panel)]/50 px-3 py-3">
      <span className="text-[var(--fg-muted-2)]">{label}</span>
      <span className="max-w-[62%] text-right text-zinc-200">{value}</span>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card !p-5">
      <p className="text-sm text-[var(--fg-muted-2)]">{label}</p>
      <p className="mt-2 text-4xl font-semibold tracking-tight">{value}</p>
    </div>
  )
}

const topButtonClass =
  'inline-flex items-center gap-2 rounded-lg border border-[var(--bd-10)] px-4 py-2 text-sm text-zinc-300 hover:bg-white/10'
