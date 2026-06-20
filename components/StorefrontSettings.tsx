'use client'

import { useMemo, useState } from 'react'
import { Store, Loader2, ExternalLink, Plus } from 'lucide-react'
import { agentRuntimeUrl } from '../lib/site'
import { MAX_STOREFRONTS_PER_ACCOUNT, normalizeHandle, type StorefrontWithCount } from '../lib/storefront'

export type StorefrontListing = {
  id: string
  name: string | null
  slug: string | null
  is_published: boolean
  storefront_id: string | null
}

type Editable = Pick<StorefrontWithCount, 'id' | 'handle' | 'display_name' | 'description' | 'logo_url' | 'accent_color'>
type EditState = { id: string | null; handle: string; display_name: string; description: string; logo_url: string; accent_color: string }

const inputClass =
  'w-full rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 text-sm text-white placeholder:text-zinc-600 outline-none transition focus:border-[var(--signal)]/60'

function toEditable(s: StorefrontWithCount): Editable {
  return { id: s.id, handle: s.handle, display_name: s.display_name, description: s.description, logo_url: s.logo_url, accent_color: s.accent_color }
}
function toEditState(s: Editable | null): EditState {
  return {
    id: s?.id ?? null,
    handle: s?.handle ?? '',
    display_name: s?.display_name ?? '',
    description: s?.description ?? '',
    logo_url: s?.logo_url ?? '',
    accent_color: s?.accent_color ?? '',
  }
}

export function StorefrontSettings({
  storefronts: initialStorefronts,
  listings: initialListings,
}: {
  storefronts: StorefrontWithCount[]
  listings: StorefrontListing[]
}) {
  const [storefronts, setStorefronts] = useState<Editable[]>(initialStorefronts.map(toEditable))
  const [listings, setListings] = useState<StorefrontListing[]>(initialListings)
  const [edit, setEdit] = useState<EditState>(toEditState(initialStorefronts.length ? toEditable(initialStorefronts[0]) : null))
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const preview = normalizeHandle(edit.handle)
  const isNew = edit.id === null
  const atCap = storefronts.length >= MAX_STOREFRONTS_PER_ACCOUNT
  const selectedSaved = storefronts.find((s) => s.id === edit.id) ?? null

  // Live published-listing counts per storefront (kept in sync as listings are reassigned).
  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const l of listings) if (l.is_published && l.storefront_id) m.set(l.storefront_id, (m.get(l.storefront_id) ?? 0) + 1)
    return m
  }, [listings])

  function select(s: Editable | null) {
    setMessage('')
    setError('')
    setEdit(toEditState(s))
  }

  async function save() {
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const res = await fetch('/api/storefront', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: edit.id ?? undefined,
          handle: edit.handle,
          display_name: edit.display_name,
          description: edit.description,
          logo_url: edit.logo_url,
          accent_color: edit.accent_color,
        }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string; storefront?: Editable }
      if (!res.ok || !data.storefront) {
        setError(data.error || 'Could not save your storefront.')
        return
      }
      const saved = data.storefront
      setStorefronts((prev) => {
        const idx = prev.findIndex((p) => p.id === saved.id)
        if (idx === -1) return [...prev, saved]
        const next = [...prev]
        next[idx] = saved
        return next
      })
      setEdit(toEditState(saved))
      setMessage(isNew ? 'Storefront created.' : 'Storefront saved.')
    } catch {
      setError('Could not save — try again.')
    } finally {
      setSaving(false)
    }
  }

  async function assign(pageId: string, storefrontId: string) {
    const prev = listings
    setListings((ls) => ls.map((l) => (l.id === pageId ? { ...l, storefront_id: storefrontId } : l)))
    setError('')
    try {
      const res = await fetch('/api/storefront', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pageId, storefrontId }),
      })
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string }
        setListings(prev)
        setError(d.error || 'Could not move that listing.')
      }
    } catch {
      setListings(prev)
      setError('Could not move that listing.')
    }
  }

  return (
    <section className="card !p-5">
      <div className="flex items-center gap-2">
        <Store className="size-5 text-[var(--signal)]" />
        <h2 className="text-xl font-semibold">Storefronts</h2>
      </div>
      <p className="mt-1 text-sm text-[var(--fg-muted)]">
        Your public brand homes that list everything you publish. Agents and buyers can browse each at one link.
      </p>

      {/* Storefront picker — one chip per storefront + New */}
      {storefronts.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {storefronts.map((s) => {
            const active = s.id === edit.id
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => select(s)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition ${
                  active ? 'border-[var(--signal)]/70 bg-[var(--signal)]/10 text-white' : 'border-white/10 bg-white/[0.04] text-zinc-300 hover:border-white/20'
                }`}
              >
                <span className="font-medium">{s.display_name || s.handle}</span>
                <span className="text-[11px] text-zinc-500">{counts.get(s.id) ?? 0}</span>
              </button>
            )
          })}
          <button
            type="button"
            onClick={() => select(null)}
            disabled={atCap}
            title={atCap ? `Up to ${MAX_STOREFRONTS_PER_ACCOUNT} storefronts` : 'Create a new storefront'}
            className={`inline-flex items-center gap-1.5 rounded-full border border-dashed px-3 py-1.5 text-sm transition ${
              isNew ? 'border-[var(--signal)]/70 text-white' : 'border-white/15 text-zinc-400 hover:border-white/30'
            } disabled:opacity-40`}
          >
            <Plus className="size-3.5" /> New storefront
          </button>
        </div>
      ) : null}

      <div className="mt-5 space-y-4">
        {isNew && storefronts.length > 0 ? (
          <p className="text-sm text-[var(--signal)]">New storefront — pick a unique handle to publish it.</p>
        ) : null}

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-zinc-200">Handle</span>
          <input value={edit.handle} onChange={(e) => setEdit({ ...edit, handle: e.target.value })} className={inputClass} placeholder="acme-co" />
          {preview ? (
            <p className="mt-1 text-[11px] text-zinc-500">
              Public URL: <span className="font-mono text-[var(--signal)]">{agentRuntimeUrl(`/store/${preview}`)}</span>
            </p>
          ) : null}
        </label>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-zinc-200">Display name</span>
            <input value={edit.display_name} onChange={(e) => setEdit({ ...edit, display_name: e.target.value })} className={inputClass} placeholder="Acme Co" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-zinc-200">Logo URL</span>
            <input type="url" value={edit.logo_url} onChange={(e) => setEdit({ ...edit, logo_url: e.target.value })} className={inputClass} placeholder="https://…" />
          </label>
        </div>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-zinc-200">Description</span>
          <textarea value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} rows={3} className={inputClass} placeholder="One or two lines about your business." />
        </label>

        <label className="flex items-center gap-3">
          <span className="text-sm font-medium text-zinc-200">Accent color</span>
          <input
            type="color"
            value={/^#[0-9a-f]{6}$/i.test(edit.accent_color) ? edit.accent_color : '#5566f2'}
            onChange={(e) => setEdit({ ...edit, accent_color: e.target.value })}
            className="h-8 w-12 cursor-pointer rounded border border-white/10 bg-transparent"
            aria-label="Accent color"
          />
          <span className="font-mono text-xs text-zinc-500">{edit.accent_color || 'default'}</span>
        </label>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button type="button" onClick={save} disabled={saving || !preview} className="btn-primary h-9 px-4 text-sm disabled:opacity-60">
            {saving ? <Loader2 className="size-4 animate-spin" /> : isNew ? 'Create storefront' : 'Save storefront'}
          </button>
          {selectedSaved ? (
            <a href={agentRuntimeUrl(`/store/${selectedSaved.handle}`)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm text-[var(--signal)] hover:underline">
              View storefront <ExternalLink className="size-3.5" />
            </a>
          ) : null}
          {message ? <span className="text-sm text-[var(--ready)]">{message}</span> : null}
          {error ? <span className="text-sm text-red-300">{error}</span> : null}
        </div>
      </div>

      {/* Organize listings across storefronts (only meaningful with ≥2) */}
      {storefronts.length > 1 && listings.length > 0 ? (
        <div className="mt-6 border-t border-white/10 pt-5">
          <h3 className="text-sm font-semibold text-zinc-200">Organize listings</h3>
          <p className="mt-1 text-xs text-[var(--fg-muted)]">Move a listing into whichever storefront it belongs to.</p>
          <div className="mt-3 space-y-2">
            {listings.map((l) => (
              <div key={l.id} className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm text-zinc-200">{l.name || l.slug || 'Untitled listing'}</p>
                  <p className="truncate text-[11px] text-zinc-500">{l.is_published ? '/' + (l.slug ?? '') : 'Draft'}</p>
                </div>
                <select
                  value={l.storefront_id ?? ''}
                  onChange={(e) => assign(l.id, e.target.value)}
                  aria-label={`Storefront for ${l.name || l.slug || 'listing'}`}
                  className="shrink-0 rounded-lg border border-white/10 bg-[#0e1117] px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-[var(--signal)]/60"
                >
                  {storefronts.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.display_name || s.handle}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  )
}
