'use client'

import { Loader2, Save } from 'lucide-react'
import { ErrorBoundary } from '../../../components/ErrorBoundary'
import { hasPendingDraft } from '../../../lib/draft'
import { freshnessLabel, isStale } from '../../../lib/freshness'
import { usePageEditor } from '../../../components/editor/usePageEditor'
import { EditorInitial } from '../../../components/editor/types'
import { Field, textareaClass } from '../../../components/editor/Field'
import { EditorToolbar } from '../../../components/editor/EditorToolbar'
import { ReadinessAside } from '../../../components/editor/ReadinessAside'
import { EditorFields } from '../../../components/editor/EditorFields'
import { VisualBuilderSection } from '../../../components/editor/VisualBuilderSection'
import { CalendlyBookingsCard } from '../../../components/editor/CalendlyBookingsCard'
import { OutboundActivityCard } from '../../../components/editor/OutboundActivityCard'
import { IntegrationsHealthPanel } from '../../../components/editor/IntegrationsHealthPanel'
import { AvailabilityCard } from '../../../components/editor/AvailabilityCard'
import { ReanalysisPreview } from '../../../components/editor/ReanalysisPreview'
import { appUrl } from '../../../lib/site'

export function EditorClient({ initial }: { initial: EditorInitial }) {
  const e = usePageEditor(initial)
  const page = e.page as any

  return (
    <main className="min-h-screen bg-[#0A0A0F] text-white">
      <ErrorBoundary>
        <div className="mx-auto max-w-5xl px-6 py-10">
          <EditorToolbar e={e} />

          <div className="mt-10 grid gap-8 lg:grid-cols-[0.75fr_1.25fr]">
            <ReadinessAside e={e} />

            <form onSubmit={e.handleSubmit} className="min-w-0 space-y-5">
              {page && isStale(page) && page.website_url && (
                <div className="rounded-lg border border-amber-300/30 bg-amber-400/5 p-3 text-sm">
                  <span className="text-amber-200">
                    Freshness: {freshnessLabel(page)}. Your live business may have changed — re-sync from your
                    website to keep agent data accurate.
                  </span>{' '}
                  <a href={`/dashboard/${e.id}/settings`} className="text-cyan-300 hover:underline">
                    Re-sync in Settings →
                  </a>
                </div>
              )}
              {e.restoredVersion && (
                <div className="rounded-lg border border-amber-300/40 bg-amber-400/10 p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-amber-200">
                      Restored from version saved {new Date(e.restoredVersion.timestamp).toLocaleString()}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        e.setRestoredVersion(null)
                        e.setMessage('Restored state discarded. You can continue editing or reload the page.')
                      }}
                      className="rounded border border-amber-300/40 px-2 py-0.5 text-xs hover:bg-amber-400/20"
                    >
                      Discard restore
                    </button>
                  </div>
                  <div className="mt-1 text-[11px] text-amber-300/80">Review the offers and metadata, then Save to make this the current version.</div>
                </div>
              )}

              <EditorFields e={e} />

              <VisualBuilderSection e={e} />

              <CalendlyBookingsCard e={e} />
              <OutboundActivityCard e={e} />
              <IntegrationsHealthPanel e={e} />
              <AvailabilityCard e={e} />
              <ReanalysisPreview e={e} />

              {/* Legacy text view (kept for power users / CSV import compatibility) */}
              <details className="group">
                <summary className="cursor-pointer text-xs text-zinc-400 hover:text-zinc-200">Show raw text format (advanced)</summary>
                <div className="mt-3 space-y-4">
                  <Field label="Products (raw text)">
                    <textarea value={e.products} onChange={(event) => e.setProducts(event.target.value)} className={textareaClass} />
                  </Field>
                  <Field label="Services (raw text)">
                    <textarea value={e.services} onChange={(event) => e.setServices(event.target.value)} className={textareaClass} />
                  </Field>
                </div>
              </details>

              <Field label="FAQs, one per line: question | answer">
                <textarea value={e.faqs} onChange={(event) => e.setFaqs(event.target.value)} className={textareaClass} />
              </Field>

              <label className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.04] p-4 text-sm text-zinc-200">
                <input
                  type="checkbox"
                  checked={e.isPublished}
                  onChange={(event) => e.setIsPublished(event.target.checked)}
                  className="size-4 accent-cyan-300"
                />
                Published and visible to crawlers
              </label>

              {e.message ? <p className="rounded-lg border border-white/10 bg-black/30 p-3 text-sm text-zinc-300">{e.message}</p> : null}

              {page?.team_collaboration?.approvals?.some((a: any) => a.status === 'pending') && (
                <div className="rounded-lg border border-amber-300/30 bg-amber-400/5 p-3 text-xs text-amber-200">
                  Team approvals pending. Saving will queue these edits as a new approval request (see Settings). The live published version updates only after approval.
                </div>
              )}

              <button
                type="submit"
                disabled={e.saving}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-white px-5 py-3 font-medium text-zinc-950 hover:bg-zinc-200 disabled:opacity-60"
              >
                {e.saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                {e.saving ? 'Saving...' : 'Save changes'}
              </button>

              {/* D12 staging: draft → preview → publish (live save above stays unchanged) */}
              <div className="mt-3 rounded-lg border border-white/10 bg-white/[0.02] p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-zinc-300">
                    Staging: save a draft, preview it on your page, then publish to live.
                  </p>
                  <button
                    type="button"
                    disabled={e.saving}
                    onClick={e.handleSaveDraft}
                    className="rounded-lg border border-white/20 px-3 py-1.5 text-xs text-zinc-200 hover:bg-white/10 disabled:opacity-50"
                  >
                    Save as draft
                  </button>
                </div>
                {hasPendingDraft(page) && (
                  <div className="mt-2 flex flex-col gap-2 rounded border border-amber-300/30 bg-amber-400/5 p-2 sm:flex-row sm:items-center sm:justify-between">
                    <span className="text-[11px] text-amber-200">
                      Draft staged{page?.draft_updated_at ? ` ${new Date(page.draft_updated_at).toLocaleString()}` : ''} — not live yet.
                    </span>
                    <span className="flex gap-2">
                      <a
                        href={appUrl(`/${e.slug}?preview=1`)}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded border border-cyan-300/40 px-3 py-1 text-[11px] text-cyan-100 hover:bg-cyan-300/10"
                      >
                        Preview draft ↗
                      </a>
                      <button
                        type="button"
                        disabled={e.saving}
                        onClick={e.handlePublishDraft}
                        className="rounded border border-emerald-300/40 px-3 py-1 text-[11px] text-emerald-100 hover:bg-emerald-300/10 disabled:opacity-50"
                      >
                        Publish draft → live
                      </button>
                    </span>
                  </div>
                )}
              </div>
            </form>
          </div>
        </div>
      </ErrorBoundary>
    </main>
  )
}
