import type { Metadata } from 'next'
import { Trophy } from 'lucide-react'
import { AgentPage, PUBLIC_PAGE_SELECT, getOfferCount, getReadinessScore, getTrustScore } from '../../lib/agent-page'
import { supabase } from '../../lib/supabase'
import { agentRuntimeUrl, appUrl } from '../../lib/site'

export const metadata: Metadata = {
  title: 'Agent-Ready Leaderboard',
  description: 'The most agent-ready businesses on Nexez, ranked by readiness and trust.',
}

type Props = { searchParams?: Promise<{ industry?: string }> }

export default async function LeaderboardPage({ searchParams }: Props) {
  const industry = (await searchParams)?.industry || ''

  const { data } = await supabase
    .from('pages_public')
    .select(PUBLIC_PAGE_SELECT)
    .eq('is_published', true)
    .limit(500)
    .returns<AgentPage[]>()

  const all = (data ?? []).map((p) => ({ ...p, products: p.products ?? [], services: p.services ?? [], faqs: p.faqs ?? [] }))
  const industries = Array.from(new Set(all.map((p) => (p.industry || '').trim()).filter(Boolean))).sort()

  const ranked = all
    .filter((p) => !industry || (p.industry || '').trim() === industry)
    .map((p) => ({
      page: p,
      readiness: getReadinessScore(p),
      trust: getTrustScore(p),
      offers: getOfferCount(p),
    }))
    .sort((a, b) => b.readiness - a.readiness || b.trust - a.trust)
    .slice(0, 100)

  return (
    <main className="min-h-screen bg-[#0A0A0F] text-white">
      <div className="mx-auto max-w-4xl px-6 py-10">
        <header className="flex items-center gap-3">
          <Trophy className="size-7 text-[var(--amber)]" />
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Agent-Ready Leaderboard</h1>
            <p className="mt-1 text-sm text-zinc-400">
              The most agent-ready businesses on Nexez, ranked by readiness then trust.
            </p>
          </div>
        </header>

        {industries.length > 0 && (
          <div className="mt-6 flex flex-wrap gap-2 text-xs">
            <a
              href="/leaderboard"
              className={`rounded-full border px-3 py-1 ${!industry ? 'border-[var(--signal)]/50 bg-[var(--signal)]/15 text-white' : 'border-white/15 text-zinc-300 hover:bg-white/5'}`}
            >
              All industries
            </a>
            {industries.map((ind) => (
              <a
                key={ind}
                href={`/leaderboard?industry=${encodeURIComponent(ind)}`}
                className={`rounded-full border px-3 py-1 ${industry === ind ? 'border-[var(--signal)]/50 bg-[var(--signal)]/15 text-white' : 'border-white/15 text-zinc-300 hover:bg-white/5'}`}
              >
                {ind}
              </a>
            ))}
          </div>
        )}

        <ol className="mt-8 space-y-2">
          {ranked.length === 0 ? (
            <li className="rounded-lg border border-dashed border-white/15 p-10 text-center text-sm text-zinc-500">
              No published pages yet{industry ? ` in ${industry}` : ''}.
            </li>
          ) : (
            ranked.map((row, i) => (
              <li
                key={row.page.slug}
                className="flex items-center gap-4 rounded-lg border border-white/10 bg-white/[0.03] p-4"
              >
                <span
                  className={`flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                    i === 0 ? 'bg-[var(--amber)] text-zinc-950' : i === 1 ? 'bg-zinc-300 text-zinc-950' : i === 2 ? 'bg-[var(--amber)]/55 text-zinc-950' : 'bg-white/10 text-zinc-300'
                  }`}
                >
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <a href={agentRuntimeUrl(`/${row.page.slug}`)} className="block truncate font-medium text-white hover:text-[var(--signal)]">
                    {row.page.name}
                  </a>
                  <div className="text-xs text-zinc-500">
                    {row.page.industry || 'General'} · {row.offers} offer{row.offers === 1 ? '' : 's'}
                    {row.page.custom_domain_verified ? ' · ✓ verified' : ''}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-semibold text-[var(--ready)]">{row.readiness}</div>
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500">readiness</div>
                </div>
                <div className="hidden text-right sm:block">
                  <div className="text-lg font-semibold text-[var(--signal)]">{row.trust}</div>
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500">trust</div>
                </div>
              </li>
            ))
          )}
        </ol>

        <p className="mt-8 text-xs text-zinc-500">
          Want to climb? Improve your readiness in the editor and verify your custom domain.{' '}
          <a href={appUrl('/create')} className="text-[var(--signal)] hover:underline">Create a page →</a>
        </p>
      </div>
    </main>
  )
}
