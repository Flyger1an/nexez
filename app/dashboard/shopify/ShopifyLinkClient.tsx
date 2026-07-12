'use client'

import { useState } from 'react'
import { Check, ExternalLink, Loader2 } from 'lucide-react'

type Listing = { id: string; name: string | null; slug: string }

export function ShopifyLinkClient({
  shop,
  listings,
  appApiKey,
  currentPageId = null,
}: {
  shop: string
  listings: Listing[]
  appApiKey: string
  currentPageId?: string | null
}) {
  const [pageId, setPageId] = useState(currentPageId ?? listings[0]?.id ?? '')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [msg, setMsg] = useState('')
  const [syncStatus, setSyncStatus] = useState('')
  const themeEditorUrl = `https://${shop}/admin/themes/current/editor?context=apps&template=index&activateAppId=${encodeURIComponent(appApiKey)}/agent-ready`

  async function link() {
    if (!pageId || busy) return
    setBusy(true)
    setMsg('')
    try {
      const res = await fetch('/api/shopify/link', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pageId }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data?.ok) {
        setDone(true)
        setSyncStatus('Connected. Importing your active Shopify products…')
        const syncRes = await fetch(`/api/pages/${encodeURIComponent(pageId)}/integrations/shopify/sync`, { method: 'POST' })
        const syncData = await syncRes.json().catch(() => ({}))
        if (syncRes.ok) {
          const count = Number(syncData?.imported || 0)
          setSyncStatus(`Catalog synced. ${count} active product${count === 1 ? '' : 's'} imported.`)
        } else if (syncRes.status === 402) {
          setSyncStatus('Store connected. Upgrade to Pro when you are ready to import and re-sync the catalog.')
        } else {
          setSyncStatus(`Store connected, but the first catalog sync needs attention. ${syncData?.error || 'Try Sync now in listing settings.'}`)
        }
      } else {
        setMsg(data?.error || 'Could not connect. Try again.')
      }
    } catch {
      setMsg('Network error. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div className="space-y-3">
        <div className="flex items-start gap-2 rounded-lg border border-[var(--bd-10)] bg-[var(--ov-03)] p-4 text-sm">
          <Check className="mt-0.5 size-4 shrink-0" style={{ color: 'var(--ready)' }} />
          <span>
            Connected <span className="font-medium">{shop}</span>. Your listing and storefront proxy are linked.
          </span>
        </div>
        <a
          href={themeEditorUrl}
          target="_blank"
          rel="noreferrer"
          className="btn-primary inline-flex min-h-[44px] w-full items-center justify-center gap-2 px-5"
        >
          Enable agent discovery in theme
          <ExternalLink className="size-4" aria-hidden="true" />
        </a>
        <p className="text-xs leading-5 text-[var(--fg-muted)]">
          {syncStatus || 'Shopify opens the active theme with Nexez selected. Review the app embed, then click Save.'}
        </p>
        {syncStatus ? (
          <p className="text-xs leading-5 text-[var(--fg-muted)]">Next, enable the app embed in Shopify and click Save.</p>
        ) : null}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <label htmlFor="nexez-listing" className="block text-sm font-medium">
        Listing
      </label>
      <select
        id="nexez-listing"
        value={pageId}
        onChange={(e) => setPageId(e.target.value)}
        disabled={busy}
        className="min-h-[44px] w-full rounded-[12px] border border-[var(--bd-10)] bg-[var(--ov-03)] px-3 text-sm outline-none focus:border-[var(--signal)]"
      >
        {listings.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name || l.slug}
          </option>
        ))}
      </select>
      <button type="button" onClick={link} disabled={busy || !pageId} className="btn-primary min-h-[44px] px-5 disabled:opacity-60">
        {busy ? <Loader2 className="size-4 animate-spin" /> : null}
        {busy ? 'Connecting…' : 'Connect this listing'}
      </button>
      {msg ? (
        <p role="alert" className="text-sm text-red-400">
          {msg}
        </p>
      ) : null}
    </div>
  )
}
