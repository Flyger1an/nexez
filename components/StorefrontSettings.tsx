'use client'

import { useState } from 'react'
import { Store, Loader2, ExternalLink } from 'lucide-react'
import { agentRuntimeUrl } from '../lib/site'
import { normalizeHandle, type Storefront } from '../lib/storefront'

type Initial = Pick<Storefront, 'handle' | 'display_name' | 'description' | 'logo_url' | 'accent_color'> | null

const inputClass =
  'w-full rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 text-sm text-white placeholder:text-zinc-600 outline-none transition focus:border-[var(--signal)]/60'

export function StorefrontSettings({ initial }: { initial: Initial }) {
  const [handle, setHandle] = useState(initial?.handle ?? '')
  const [displayName, setDisplayName] = useState(initial?.display_name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [logoUrl, setLogoUrl] = useState(initial?.logo_url ?? '')
  const [accent, setAccent] = useState(initial?.accent_color ?? '')
  const [savedHandle, setSavedHandle] = useState(initial?.handle ?? '')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const preview = normalizeHandle(handle)

  async function save() {
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const res = await fetch('/api/storefront', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ handle, display_name: displayName, description, logo_url: logoUrl, accent_color: accent }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string; storefront?: { handle: string } }
      if (!res.ok) {
        setError(data.error || 'Could not save your storefront.')
        return
      }
      const saved = data.storefront?.handle ?? preview
      setHandle(saved)
      setSavedHandle(saved)
      setMessage('Storefront saved.')
    } catch {
      setError('Could not save — try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="card !p-5">
      <div className="flex items-center gap-2">
        <Store className="size-5 text-[var(--signal)]" />
        <h2 className="text-xl font-semibold">Storefront</h2>
      </div>
      <p className="mt-1 text-sm text-[var(--fg-muted)]">
        Your public brand home that lists everything you publish. Agents and buyers can browse it at one link.
      </p>

      <div className="mt-5 space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-zinc-200">Handle</span>
          <input value={handle} onChange={(e) => setHandle(e.target.value)} className={inputClass} placeholder="acme-co" />
          {preview ? (
            <p className="mt-1 text-[11px] text-zinc-500">
              Public URL: <span className="font-mono text-[var(--signal)]">{agentRuntimeUrl(`/store/${preview}`)}</span>
            </p>
          ) : null}
        </label>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-zinc-200">Display name</span>
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className={inputClass} placeholder="Acme Co" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-zinc-200">Logo URL</span>
            <input type="url" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} className={inputClass} placeholder="https://…" />
          </label>
        </div>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-zinc-200">Description</span>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className={inputClass} placeholder="One or two lines about your business." />
        </label>

        <label className="flex items-center gap-3">
          <span className="text-sm font-medium text-zinc-200">Accent color</span>
          <input type="color" value={/^#[0-9a-f]{6}$/i.test(accent) ? accent : '#5566f2'} onChange={(e) => setAccent(e.target.value)} className="h-8 w-12 cursor-pointer rounded border border-white/10 bg-transparent" aria-label="Accent color" />
          <span className="font-mono text-xs text-zinc-500">{accent || 'default'}</span>
        </label>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button type="button" onClick={save} disabled={saving || !preview} className="btn-primary h-9 px-4 text-sm disabled:opacity-60">
            {saving ? <Loader2 className="size-4 animate-spin" /> : 'Save storefront'}
          </button>
          {savedHandle ? (
            <a href={agentRuntimeUrl(`/store/${savedHandle}`)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm text-[var(--signal)] hover:underline">
              View storefront <ExternalLink className="size-3.5" />
            </a>
          ) : null}
          {message ? <span className="text-sm text-[var(--ready)]">{message}</span> : null}
          {error ? <span className="text-sm text-red-300">{error}</span> : null}
        </div>
      </div>
    </section>
  )
}
