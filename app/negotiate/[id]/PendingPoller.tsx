'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bot } from 'lucide-react'

/**
 * Shown on the persistent negotiation page while the LLM decision is still being
 * produced (decision_pending). The decision is asynchronous now, so the server
 * render that follows a form submit won't have the seller turn yet. This polls
 * the lightweight /api/negotiations/status endpoint and soft-refreshes the route
 * once the decision lands (decisionPending flips false, or decisionSeq advances),
 * then stops. Capped so it never polls forever.
 */
export default function PendingPoller({ id, token, currentSeq }: { id: string; token: string; currentSeq: number }) {
  const router = useRouter()
  const [waited, setWaited] = useState(0)
  const done = useRef(false)

  useEffect(() => {
    if (!token) return
    const INTERVAL_MS = 2500
    const MAX_MS = 120_000
    let elapsed = 0

    const timer = setInterval(async () => {
      if (done.current) return
      elapsed += INTERVAL_MS
      setWaited(elapsed)
      if (elapsed >= MAX_MS) {
        clearInterval(timer)
        return
      }
      try {
        const res = await fetch(`/api/negotiations/status?id=${encodeURIComponent(id)}&token=${encodeURIComponent(token)}`, {
          cache: 'no-store',
        })
        if (!res.ok) return
        const data = await res.json()
        const landed = data.decisionPending === false || (typeof data.decisionSeq === 'number' && data.decisionSeq > currentSeq)
        if (landed) {
          done.current = true
          clearInterval(timer)
          router.refresh()
        }
      } catch {
        // transient — keep polling until the cap
      }
    }, INTERVAL_MS)

    return () => clearInterval(timer)
  }, [id, token, currentSeq, router])

  return (
    <div className="card mb-6 border border-[#7C3AED]/30 bg-[#7C3AED]/5 flex items-center gap-3">
      <Bot className="size-5 text-[#7C3AED] animate-pulse" />
      <div>
        <div className="text-sm font-medium">The seller’s negotiation assistant is responding…</div>
        <div className="text-xs text-zinc-400">
          {waited >= 120_000
            ? 'Still working — refresh in a moment to see the decision.'
            : 'This usually takes a few seconds. The thread will update automatically.'}
        </div>
      </div>
    </div>
  )
}
