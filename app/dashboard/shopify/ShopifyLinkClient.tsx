'use client'

import { useState } from 'react'
import { Check, Loader2 } from 'lucide-react'

type Listing = { id: string; name: string | null; slug: string }

export function ShopifyLinkClient({ shop, listings }: { shop: string; listings: Listing[] }) {
  const [pageId, setPageId] = useState(listings[0]?.id ?? '')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [msg, setMsg] = useState('')

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
      } else {
        setMsg(data?.error || 'Could not connect. Try again.')
      }
    } catch {
      setMsg('Network error — please try again.')
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-[var(--bd-10)] bg-[var(--ov-03)] p-4 text-sm">
        <Check className="size-4" style={{ color: 'var(--ready)' }} />
        <span>
          Connected <span className="font-medium">{shop}</span>. Agents can now transact with this listing on your
          Shopify storefront.
        </span>
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
