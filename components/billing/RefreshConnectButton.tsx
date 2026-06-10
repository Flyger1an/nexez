'use client'

import { useState } from 'react'

/**
 * Small client button to force a refresh of the Stripe Connect account status
 * from Stripe (calls the connect route with ?refresh=true).
 * 
 * After refresh, does a full page reload so the server-rendered billing page
 * picks up the latest values from billing_subscriptions.
 */
export default function RefreshConnectButton() {
  const [loading, setLoading] = useState(false)

  async function handleRefresh() {
    setLoading(true)
    try {
      const res = await fetch('/api/billing/connect?refresh=true', { method: 'POST' })
      const data = await res.json()
      if (data.refreshed || !data.error) {
        window.location.reload()
      } else {
        alert(data.error || 'Failed to refresh Connect status')
        setLoading(false)
      }
    } catch (e: any) {
      alert(e.message || 'Refresh error')
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleRefresh}
      disabled={loading}
      className="rounded-lg border border-white/15 px-3 py-2 text-xs hover:bg-white/5 disabled:opacity-50"
    >
      {loading ? 'Refreshing...' : 'Refresh status'}
    </button>
  )
}
