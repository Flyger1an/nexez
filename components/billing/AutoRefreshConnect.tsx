'use client'

import { useEffect } from 'react'

/**
 * Auto-triggers a status refresh from Stripe when the page is loaded with ?connect=success.
 * This is useful because the Stripe redirect now lands on /dashboard/billing?connect=success.
 * We call the refresh endpoint (which does accounts.retrieve + DB update) and then do a clean reload
 * to the billing page without the query param so the server component re-renders with fresh data.
 */
export function AutoRefreshConnect({ connectSuccess }: { connectSuccess: boolean }) {
  useEffect(() => {
    if (!connectSuccess) return

    // Fire the refresh (safe even if no account yet - the route will create if needed on normal flow,
    // but here we just want to pull latest after onboarding).
    fetch('/api/billing/connect?refresh=true', { method: 'POST' })
      .catch(() => {
        // ignore network errors; user can manually refresh
      })
      .finally(() => {
        // Remove the query param and reload so server data is fresh.
        // Using replace to avoid back-button loops.
        window.location.replace('/dashboard/billing')
      })
  }, [connectSuccess])

  return null
}
