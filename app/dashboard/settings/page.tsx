import {
  ArrowLeft,
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
import { AgentPage, getBaseUrl, getOfferCount, getReadinessScore } from '../../../lib/agent-page'
import { createClient } from '../../../utils/supabase/server'

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

  const { data: pages } = await supabase
    .from('pages')
    .select('*')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: false })
    .returns<AgentPage[]>()

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
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <a href="/dashboard" className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white">
            <ArrowLeft className="size-4" />
            Dashboard
          </a>
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
          <aside className="space-y-5">
            <div>
              <p className="flex items-center gap-2 text-sm text-cyan-200">
                <ShieldCheck className="size-4" />
                Advanced Config
              </p>
              <h1 className="mt-3 text-4xl font-semibold tracking-tight">Your AI-facing surface.</h1>
              <p className="mt-4 text-sm leading-6 text-zinc-400">
                Nexez keeps your human website separate from the clean, structured agent surface that bots can parse and act on.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              <Stat label="Published pages" value={String(publishedPages.length)} />
              <Stat label="Listed offers" value={String(offerCount)} />
              <Stat label="Avg readiness" value={`${averageReadiness}%`} />
            </div>
          </aside>

          <div className="space-y-5">
            <section className="card !p-5">
              <div className="flex items-center gap-2">
                <Search className="size-5 text-cyan-200" />
                <h2 className="text-xl font-semibold">Discovery Endpoints</h2>
              </div>
              <div className="mt-5 grid gap-3 md:grid-cols-2">
                <Endpoint label="Agent directory" value={`${baseUrl}/directory`} />
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
                  <Globe2 className="size-5 text-cyan-200" />
                  <h2 className="text-xl font-semibold">Custom Domain Readiness</h2>
                </div>
                <div className="mt-5 space-y-3 text-sm">
                  <ConfigRow label="Suggested CNAME" value="agent.yourdomain.com -> cname.vercel-dns.com" />
                  <ConfigRow label="Fallback URL" value={baseUrl} />
                  <ConfigRow label="Status" value="Ready for domain mapping" />
                </div>
              </div>

              <div className="card !p-5">
                <div className="flex items-center gap-2">
                  <KeyRound className="size-5 text-cyan-200" />
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
                <Code2 className="size-5 text-cyan-200" />
                <h2 className="text-xl font-semibold">Schema Controls</h2>
              </div>
              <div className="mt-5 grid gap-3 md:grid-cols-2">
                {schemaSignals.map(([label, description]) => (
                  <div key={label} className="rounded-lg border border-white/10 bg-black/20 p-4">
                    <div className="flex items-center gap-2">
                      <BadgeCheck className="size-4 text-emerald-300" />
                      <p className="font-medium">{label}</p>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-zinc-500">{description}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="card !p-5">
              <div className="flex items-center gap-2">
                <Link2 className="size-5 text-cyan-200" />
                <h2 className="text-xl font-semibold">Page Surface Status</h2>
              </div>
              <div className="mt-5 overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="text-zinc-500">
                    <tr>
                      <th className="py-3 font-medium">Page</th>
                      <th className="py-3 font-medium">Public</th>
                      <th className="py-3 font-medium">Offers</th>
                      <th className="py-3 font-medium">Readiness</th>
                      <th className="py-3 text-right font-medium">Settings</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ownedPages.map((page) => (
                      <tr key={page.id} className="border-t border-white/10">
                        <td className="py-4">
                          <p className="font-medium">{page.name}</p>
                          <p className="font-mono text-xs text-zinc-500">/{page.slug}</p>
                        </td>
                        <td className="py-4 text-zinc-300">{page.is_published ? 'Published' : 'Draft'}</td>
                        <td className="py-4 text-zinc-300">{getOfferCount(page)}</td>
                        <td className="py-4 text-cyan-200">{getReadinessScore(page)}%</td>
                        <td className="py-4 text-right">
                          <a href={`/dashboard/${page.id}/settings`} className="text-cyan-200 hover:text-cyan-100">
                            Configure
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!ownedPages.length ? (
                  <div className="rounded-lg border border-dashed border-white/10 p-8 text-center text-sm text-zinc-500">
                    Create a page to see its agent surface status.
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
    <a href={value} className="rounded-lg border border-white/10 bg-black/20 p-4 hover:bg-white/10">
      <p className="text-sm font-medium text-zinc-200">{label}</p>
      <p className="mt-2 truncate font-mono text-xs text-cyan-200">{value}</p>
    </a>
  )
}

function ConfigRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-white/10 bg-black/20 px-3 py-3">
      <span className="text-zinc-500">{label}</span>
      <span className="max-w-[62%] text-right text-zinc-200">{value}</span>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card !p-5">
      <p className="text-sm text-zinc-500">{label}</p>
      <p className="mt-2 text-4xl font-semibold tracking-tight">{value}</p>
    </div>
  )
}

const topButtonClass =
  'inline-flex items-center gap-2 rounded-lg border border-white/10 px-4 py-2 text-sm text-zinc-300 hover:bg-white/10'
