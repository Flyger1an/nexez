'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Users } from 'lucide-react'
import { createClient } from '../../utils/supabase/client'

/**
 * Surfaces the signed-in user's PENDING team invitations with an Accept action — for
 * invitees who never opened (or lost) the invite email. Self-contained: reads its own
 * data via the "invitees read own invites" RLS (own verified email), and Accept POSTs to
 * /api/team/accept (service-role flips pending -> accepted) then refreshes so the freshly
 * shared pages appear. A merely-pending invite no longer grants access, so this is the
 * in-app path to the access the owner intended.
 */
export function PendingInvitesBanner() {
  const router = useRouter()
  const [count, setCount] = useState(0)
  const [accepting, setAccepting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user?.email) return
      const { count: c } = await supabase
        .from('team_invites')
        .select('id', { count: 'exact', head: true })
        .eq('email', user.email.toLowerCase())
        .eq('status', 'pending')
      if (!cancelled) setCount(c ?? 0)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (count <= 0) return null

  async function accept() {
    setAccepting(true)
    setError('')
    try {
      const res = await fetch('/api/team/accept', { method: 'POST' })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        setError(data.error || 'Could not accept the invitation.')
        return
      }
      setCount(0)
      router.refresh()
    } catch {
      setError('Could not accept — try again.')
    } finally {
      setAccepting(false)
    }
  }

  return (
    <section className="mb-5 flex flex-col gap-3 rounded-lg border border-[var(--signal)]/30 bg-[var(--signal)]/10 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <Users className="size-5 shrink-0 text-[var(--signal)]" />
        <p className="text-sm text-white">
          You&rsquo;ve been invited to collaborate on {count} {count === 1 ? 'listing' : 'listings'}.
          {error ? <span className="ml-2 text-red-300">{error}</span> : null}
        </p>
      </div>
      <button
        type="button"
        onClick={accept}
        disabled={accepting}
        className="btn-primary h-9 shrink-0 px-4 text-sm disabled:opacity-60"
      >
        {accepting ? <Loader2 className="size-4 animate-spin" /> : 'Accept'}
      </button>
    </section>
  )
}
