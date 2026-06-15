'use client'

import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Copy, EyeOff, Plus, Trash2, X } from 'lucide-react'
import { AgentPage, BASIC_OWNER_PAGE_SELECT, OWNER_PAGE_SELECT, getBaseUrl } from '../lib/agent-page'
import { buildDuplicatePayload } from '../lib/duplicate-page'
import { createClient } from '../utils/supabase/client'
import { PageCard } from './dashboard/PageCard'
import { getPlanLimits } from '../lib/billing'
import { appUrl } from '../lib/site'
import { usePlan } from './billing/PlanProvider'

type Status = 'all' | 'published' | 'draft'

export function PagesManager({
  initialPages,
  signalsByPageId,
  status = 'all',
}: {
  initialPages: AgentPage[]
  signalsByPageId: Record<string, number>
  status?: Status
}) {
  const plan = usePlan()
  const pageLimit = getPlanLimits(plan).pages
  const [pages, setPages] = useState<AgentPage[]>(initialPages)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [limitMsg, setLimitMsg] = useState<string | null>(null)

  const counts = useMemo(
    () => ({
      all: pages.length,
      published: pages.filter((p) => p.is_published).length,
      draft: pages.filter((p) => !p.is_published).length,
    }),
    [pages],
  )

  function atPublishLimit() {
    return Number.isFinite(pageLimit) && counts.published >= pageLimit
  }

  const filtered = useMemo(() => {
    if (status === 'published') return pages.filter((p) => p.is_published)
    if (status === 'draft') return pages.filter((p) => !p.is_published)
    return pages
  }, [pages, status])

  // Client-side pagination so the DOM stays bounded for accounts with many pages.
  const PER_PAGE = 12
  const [pageNum, setPageNum] = useState(1)
  useEffect(() => {
    setPageNum(1)
  }, [status])
  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE))
  const safePage = Math.min(pageNum, totalPages)
  const pageStart = (safePage - 1) * PER_PAGE
  const paged = filtered.slice(pageStart, pageStart + PER_PAGE)

  async function reload() {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return
    let res = await supabase
      .from('pages')
      .select(OWNER_PAGE_SELECT)
      .eq('owner_id', user.id)
      .order('created_at', { ascending: false })
      .returns<AgentPage[]>()
    if (res.error) {
      res = await supabase
        .from('pages')
        .select(BASIC_OWNER_PAGE_SELECT)
        .eq('owner_id', user.id)
        .order('created_at', { ascending: false })
        .returns<AgentPage[]>()
    }
    setPages(res.data ?? [])
    setSelectedIds(new Set())
  }

  async function togglePublished(id: string, current: boolean) {
    // Plan gate: block publishing a new page past the plan's limit (the v1 API and
    // create flow enforce server-side too; this surfaces the upgrade nudge in the UI).
    if (!current && atPublishLimit()) {
      setLimitMsg(`Your plan allows ${pageLimit} published page${pageLimit === 1 ? '' : 's'}. Upgrade to publish more.`)
      return
    }
    setLimitMsg(null)
    const supabase = createClient()
    await supabase.from('pages').update({ is_published: !current }).eq('id', id)
    reload()
  }

  async function deletePage(id: string) {
    if (!confirm('Delete this agent page?')) return
    const supabase = createClient()
    await supabase.from('pages').delete().eq('id', id)
    reload()
  }

  async function copyUrl(slug: string) {
    try {
      await navigator.clipboard.writeText(`${getBaseUrl()}/${slug}`)
    } catch {}
  }

  async function duplicatePage(page: AgentPage) {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return
    const { error } = await supabase
      .from('pages')
      .insert(buildDuplicatePayload(page, user.id, pages.map((p) => p.slug)))
    if (error) {
      alert(`Could not duplicate this page: ${error.message}`)
      return
    }
    reload()
  }

  async function bulkDuplicate() {
    if (!selectedIds.size) return
    setBusy(true)
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      setBusy(false)
      return
    }
    // Accumulate slugs so each new duplicate stays collision-free against the
    // others created in this same batch.
    const slugs = pages.map((p) => p.slug)
    const payloads = pages
      .filter((p) => selectedIds.has(p.id))
      .map((p) => {
        const payload = buildDuplicatePayload(p, user.id, slugs)
        slugs.push((payload as { slug: string }).slug)
        return payload
      })
    if (payloads.length) {
      const { error } = await supabase.from('pages').insert(payloads)
      if (error) alert(`Could not duplicate selected pages: ${error.message}`)
    }
    setBusy(false)
    reload()
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAllVisible() {
    setSelectedIds(new Set(filtered.map((p) => p.id)))
  }

  async function bulkSetPublished(published: boolean) {
    if (!selectedIds.size) return
    // Plan gate: don't let a bulk-publish push past the plan's published-page limit.
    if (published && Number.isFinite(pageLimit)) {
      const newlyPublishing = [...selectedIds].filter((id) => !pages.find((p) => p.id === id)?.is_published).length
      if (counts.published + newlyPublishing > pageLimit) {
        setLimitMsg(`Your plan allows ${pageLimit} published page${pageLimit === 1 ? '' : 's'}. Upgrade to publish more.`)
        return
      }
    }
    setLimitMsg(null)
    setBusy(true)
    const supabase = createClient()
    await Promise.all(
      [...selectedIds].map((id) => supabase.from('pages').update({ is_published: published }).eq('id', id)),
    )
    setBusy(false)
    reload()
  }

  async function bulkDelete() {
    if (!selectedIds.size) return
    if (!confirm(`Delete ${selectedIds.size} selected page(s)? This cannot be undone.`)) return
    setBusy(true)
    const supabase = createClient()
    await Promise.all([...selectedIds].map((id) => supabase.from('pages').delete().eq('id', id)))
    setBusy(false)
    reload()
  }

  const tabs: { id: Status; label: string; href: string; count: number }[] = [
    { id: 'all', label: 'All', href: '/dashboard/pages', count: counts.all },
    { id: 'published', label: 'Published', href: '/dashboard/pages?status=published', count: counts.published },
    { id: 'draft', label: 'Drafts', href: '/dashboard/pages?status=draft', count: counts.draft },
  ]

  return (
    <main className="min-h-screen bg-[#0A0A0F] text-white">
      <div className="mx-auto max-w-7xl px-6 py-8">
        {limitMsg && (
          <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-[var(--signal)]/25 bg-[var(--signal)]/[0.06] px-4 py-3">
            <span className="min-w-0 flex-1 text-sm text-zinc-300">{limitMsg}</span>
            <a href={appUrl('/dashboard/billing')} className="btn-primary btn-sm shrink-0">Upgrade plan</a>
          </div>
        )}
        <div className="flex flex-col gap-4 border-b border-white/10 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm text-[var(--signal)]">Manage</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">Pages</h1>
            <p className="mt-2 text-sm text-zinc-400">
              Create, publish, duplicate, and organize every agent page from one place.
            </p>
          </div>
          <a href="/create" className="btn-primary h-10 self-start px-4 sm:self-auto">
            <Plus className="size-4" />
            New page
          </a>
        </div>

        {/* Status tabs */}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          {tabs.map((t) => (
            <a
              key={t.id}
              href={t.href}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                status === t.id
                  ? 'border-[var(--signal)]/40 bg-[var(--signal)]/15 text-white'
                  : 'border-white/10 bg-white/[0.03] text-zinc-400 hover:text-white'
              }`}
            >
              {t.label}
              <span className="rounded-full bg-white/10 px-1.5 text-xs">{t.count}</span>
            </a>
          ))}
        </div>

        {/* Bulk action bar */}
        {selectedIds.size > 0 && (
          <div className="mt-5 flex flex-wrap items-center gap-2 rounded-lg border border-[var(--signal)]/30 bg-[var(--signal)]/10 p-3 text-sm">
            <span className="font-medium text-white">{selectedIds.size} selected</span>
            <span className="text-zinc-400">·</span>
            <button
              onClick={() => bulkSetPublished(true)}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--ready)]/30 bg-[var(--ready)]/10 px-3 py-1.5 text-[var(--ready)] hover:bg-[var(--ready)]/20 disabled:opacity-50"
            >
              <CheckCircle2 className="size-4" /> Publish
            </button>
            <button
              onClick={() => bulkSetPublished(false)}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-zinc-200 hover:bg-white/10 disabled:opacity-50"
            >
              <EyeOff className="size-4" /> Unpublish
            </button>
            <button
              onClick={bulkDuplicate}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--signal)]/30 bg-[var(--signal)]/10 px-3 py-1.5 text-[var(--signal)] hover:bg-[var(--signal)]/20 disabled:opacity-50"
            >
              <Copy className="size-4" /> Duplicate
            </button>
            <button
              onClick={bulkDelete}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-md border border-red-400/30 bg-red-400/10 px-3 py-1.5 text-red-200 hover:bg-red-400/20 disabled:opacity-50"
            >
              <Trash2 className="size-4" /> Delete
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="ml-auto inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-zinc-400 hover:text-white"
            >
              <X className="size-4" /> Clear
            </button>
          </div>
        )}

        {filtered.length > 0 && (
          <div className="mt-5 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {filtered.length <= PER_PAGE
                ? `${filtered.length} page${filtered.length === 1 ? '' : 's'}`
                : `Showing ${pageStart + 1}–${Math.min(pageStart + PER_PAGE, filtered.length)} of ${filtered.length}`}
            </span>
            <button onClick={selectAllVisible} className="text-xs text-zinc-400 hover:text-white">
              Select all ({filtered.length})
            </button>
          </div>
        )}

        <section className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {paged.map((page) => (
            <PageCard
              key={page.id}
              page={page}
              eventCount={signalsByPageId[page.id] ?? 0}
              onCopy={() => copyUrl(page.slug)}
              onDelete={() => deletePage(page.id)}
              onDuplicate={() => duplicatePage(page)}
              onToggle={() => togglePublished(page.id, page.is_published)}
              selected={selectedIds.has(page.id)}
              onSelectToggle={() => toggleSelect(page.id)}
            />
          ))}
        </section>

        {totalPages > 1 && (
          <div className="mt-6 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => setPageNum(safePage - 1)}
              disabled={safePage <= 1}
              className="inline-flex h-9 items-center rounded-md border border-white/10 px-3 text-sm text-zinc-300 hover:bg-white/10 disabled:opacity-40"
            >
              Previous
            </button>
            <span className="text-sm text-muted-foreground">Page {safePage} of {totalPages}</span>
            <button
              type="button"
              onClick={() => setPageNum(safePage + 1)}
              disabled={safePage >= totalPages}
              className="inline-flex h-9 items-center rounded-md border border-white/10 px-3 text-sm text-zinc-300 hover:bg-white/10 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        )}

        {filtered.length === 0 && (
          <div className="mt-6 rounded-lg border border-dashed border-white/15 p-12 text-center">
            <p className="text-zinc-400">
              {status === 'published'
                ? 'No published pages yet — publish a draft to make it discoverable by agents.'
                : status === 'draft'
                  ? 'No drafts. Pages you create or duplicate land here until you publish them.'
                  : 'No pages yet — create your first agent page to get started.'}
            </p>
            <a href="/create" className="btn-secondary mt-4 inline-flex h-10 px-4">
              <Plus className="size-4" /> Create a page
            </a>
          </div>
        )}
      </div>
    </main>
  )
}
