'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../utils/supabase/client'

/**
 * Client Component for favorite star buttons.
 * Fixes the "Event handlers cannot be passed to Client Component props" / Server Component onClick error.
 *
 * Handles localStorage + Supabase user metadata sync for logged-in users (persistence).
 * Used in both /marketplace and /directory to keep server components pure for performance and agent crawlability.
 */
export function FavoriteButton({ slug, initialIsFav = false }: { slug: string; initialIsFav?: boolean }) {
  const [isFav, setIsFav] = useState(initialIsFav)
  const [message, setMessage] = useState('')

  // On mount, check local + try sync from server if logged in
  useEffect(() => {
    if (typeof window === 'undefined') return
    const key = 'nexez_favorites'
    const localFavs: string[] = JSON.parse(localStorage.getItem(key) || '[]')
    const fromLocal = localFavs.includes(slug)
    setIsFav(fromLocal)

    // Try to merge with server metadata if user logged in
    ;(async () => {
      try {
        const supa = createClient()
        const { data: { user } } = await supa.auth.getUser()
        if (user?.user_metadata?.favorites) {
          const serverFavs: string[] = user.user_metadata.favorites || []
          const merged = Array.from(new Set([...localFavs, ...serverFavs]))
          if (merged.length !== localFavs.length) {
            localStorage.setItem(key, JSON.stringify(merged))
            if (merged.includes(slug)) setIsFav(true)
          }
        }
      } catch {}
    })()
  }, [slug])

  const toggle = async () => {
    if (typeof window === 'undefined') return
    const key = 'nexez_favorites'
    const cur: string[] = JSON.parse(localStorage.getItem(key) || '[]')
    const wasFav = cur.includes(slug)
    const next = wasFav
      ? cur.filter((s: string) => s !== slug)
      : [...cur, slug]

    localStorage.setItem(key, JSON.stringify(next))
    setIsFav(!wasFav)

    // Sync to server if logged in (for persistence)
    try {
      const supa = createClient()
      const { data: { user } } = await supa.auth.getUser()
      if (user) {
        await supa.auth.updateUser({ data: { favorites: next } })
      }
    } catch {}

    setMessage(wasFav ? 'Unfavorited' : 'Favorited!')
    setTimeout(() => setMessage(''), 1500)
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className={`ml-1 p-1 text-[var(--amber)] hover:text-[var(--amber)] transition active:scale-95 ${isFav ? 'text-[var(--amber)]' : ''}`}
      title={isFav ? 'Remove from favorites' : 'Add to favorites'}
    >
      {isFav ? '★' : '☆'}
      {message && <span className="ml-1 text-[10px] text-[var(--fg-muted-2)]">{message}</span>}
    </button>
  )
}
