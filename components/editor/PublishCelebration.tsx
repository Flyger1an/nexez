'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, ExternalLink, Link2, Wallet, X } from 'lucide-react'
import { agentRuntimeUrl } from '../../lib/site'

/**
 * One-time "your page is live" celebration, shown when the create funnel lands the
 * owner in the editor with `?created=1&public=<slug>` (a real publish, NOT a draft
 * save → `draft=1` is excluded). Reads the params on mount, then strips them via
 * replaceState so a refresh/back doesn't re-trigger. Entrance motion is CSS-only
 * (`nx-celebrate`) and honors prefers-reduced-motion.
 */
export function PublishCelebration() {
  const [show, setShow] = useState(false)
  const [slug, setSlug] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('created') === '1' && params.get('draft') !== '1') {
      setSlug(params.get('public') || '')
      setShow(true)
      params.delete('created')
      params.delete('public')
      params.delete('draft')
      const qs = params.toString()
      window.history.replaceState(null, '', window.location.pathname + (qs ? `?${qs}` : ''))
    }
  }, [])

  if (!show) return null
  const liveUrl = slug ? agentRuntimeUrl(`/${slug}`) : ''

  async function copyLink() {
    if (!liveUrl) return
    try {
      await navigator.clipboard.writeText(liveUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      /* clipboard blocked — the View-live link still works */
    }
  }

  return (
    <div className="nx-celebrate relative mb-6 overflow-hidden rounded-2xl border border-[var(--ready)]/30 bg-gradient-to-br from-[var(--ready)]/12 to-[var(--signal)]/[0.08] p-5">
      <button
        type="button"
        onClick={() => setShow(false)}
        aria-label="Dismiss"
        title="Dismiss"
        className="absolute right-3 top-3 text-[var(--fg-muted)] transition-colors hover:text-white"
      >
        <X className="size-4" />
      </button>
      <div className="flex items-start gap-3">
        <span className="nx-celebrate-pop flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--ready)]/15 text-[var(--ready)]">
          <CheckCircle2 className="size-6" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-lg font-semibold text-white">🎉 Your page is live</p>
          <p className="mt-1 max-w-xl text-sm leading-6 text-[var(--fg-muted)]">
            Agents can now discover and buy from this page. Share the link to start driving traffic — and connect payouts
            so you get paid the moment a deal closes.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            {liveUrl ? (
              <a
                href={liveUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg border border-[var(--ready)]/40 bg-[var(--ready)]/10 px-4 py-2 text-sm font-semibold text-[var(--ready)] transition-colors hover:bg-[var(--ready)]/20"
              >
                View live page <ExternalLink className="size-3.5" />
              </a>
            ) : null}
            {liveUrl ? (
              <button
                type="button"
                onClick={copyLink}
                className="inline-flex items-center gap-2 rounded-lg border border-[var(--bd-15)] px-4 py-2 text-sm text-zinc-200 transition-colors hover:bg-white/5"
              >
                <Link2 className="size-3.5" /> {copied ? 'Link copied!' : 'Copy link'}
              </button>
            ) : null}
            <a
              href="/dashboard/billing?tab=fees"
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--bd-15)] px-4 py-2 text-sm text-zinc-200 transition-colors hover:bg-white/5"
            >
              <Wallet className="size-3.5" /> Set up payouts
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
