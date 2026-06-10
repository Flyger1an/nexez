'use client'

import { useState } from 'react'

/**
 * Client-side handler for Stripe Connect (Express) onboarding / management.
 * 
 * The /api/billing/connect returns JSON { url } (or { error }).
 * We fetch and redirect client-side so the browser doesn't try to render the JSON response
 * as the page (which was causing the raw JSON to be displayed).
 * 
 * This matches the pattern used in /onboard.
 * 
 * Works for both initial connect and "manage" (Stripe returns appropriate link).
 */
export default function StripeConnectButton() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleConnect() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/billing/connect', { method: 'POST' })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url // redirect to Stripe hosted onboarding/manage
      } else {
        setError(data.error || 'Failed to start Stripe Connect onboarding.')
        setLoading(false)
      }
    } catch (e: any) {
      setError(e.message || 'Connect error')
      setLoading(false)
    }
  }

  return (
    <>
      <button
        onClick={handleConnect}
        disabled={loading}
        className="rounded-lg border border-white/15 px-4 py-2 text-sm hover:bg-white/5 disabled:opacity-50"
      >
        {loading ? 'Connecting...' : 'Connect or manage Stripe account'}
      </button>
      {error && (
        <p className="text-xs text-red-400 mt-1">{error}</p>
      )}
    </>
  )
}
