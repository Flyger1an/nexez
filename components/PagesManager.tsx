'use client'

import { useMemo, useState } from 'react'
import { CheckCircle2, EyeOff, Plus, Trash2, X } from 'lucide-react'
import { AgentPage, BASIC_OWNER_PAGE_SELECT, OWNER_PAGE_SELECT, getBaseUrl } from '../lib/agent-page'
import { buildDuplicatePayload } from '../lib/duplicate-page'
import { createClient } from '../utils/supabase/client'
import { PageCard } from './dashboard/PageCard'

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
  const [pages, setPages] = useState<AgentPage[]>(initialPages)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)

  const counts = useMemo(
    () => ({
      all: pages.length,
      published: pages.filter((p) => p.is_published).length,
      draft: pages.filter((p) => !p.is_published).length,
    }),
    [pages],
  )

  const filtered = useMemo(() => {
    if (status === 'published') return pages.filter((p) => p.is_published)
    if (status === 'draft') return pages.filter((p) => !p.is_published)
    return pages
  }, [pages, status])

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
        <div className="flex flex-col gap-4 border-b border-white/10 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm text-cyan-200">Manage</p>
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
                  ? 'border-[#7C3AED]/40 bg-[#7C3AED]/15 text-white'
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
          <div className="mt-5 flex flex-wrap items-center gap-2 rounded-lg border border-[#7C3AED]/30 bg-[#7C3AED]/10 p-3 text-sm">
            <span className="font-medium text-white">{selectedIds.size} selected</span>
            <span className="text-zinc-400">·</span>
            <button
              onClick={() => bulkSetPublished(true)}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-md border border-emerald-300/30 bg-emerald-400/10 px-3 py-1.5 text-emerald-200 hover:bg-emerald-400/20 disabled:opacity-50"
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
            <span className="text-xs text-muted-foreground">{filtered.length} page{filtered.length === 1 ? '' : 's'}</span>
            <button onClick={selectAllVisible} className="text-xs text-zinc-400 hover:text-white">
              Select all
            </button>
          </div>
        )}

        <section className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((page) => (
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
