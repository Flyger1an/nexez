'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, Loader2, AlertCircle, MailWarning } from 'lucide-react'

type State = 'loading' | 'accepted' | 'none' | 'error' | 'unconfirmed'

export function AcceptInvite({ emailConfirmed }: { emailConfirmed: boolean }) {
  const [state, setState] = useState<State>(emailConfirmed ? 'loading' : 'unconfirmed')
  const [count, setCount] = useState(0)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!emailConfirmed) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/team/accept', { method: 'POST' })
        const data = (await res.json().catch(() => ({}))) as { accepted?: number; error?: string }
        if (cancelled) return
        if (!res.ok) {
          setError(data.error || 'Could not accept the invitation.')
          setState('error')
          return
        }
        setCount(data.accepted ?? 0)
        setState((data.accepted ?? 0) > 0 ? 'accepted' : 'none')
      } catch {
        if (!cancelled) setState('error')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [emailConfirmed])

  return (
    <div className="w-full rounded-2xl border border-white/10 bg-white/[0.03] p-8">
      {state === 'loading' ? (
        <>
          <Loader2 className="mx-auto size-8 animate-spin text-[var(--signal)]" />
          <p className="mt-4 text-sm text-zinc-400">Accepting your invitation…</p>
        </>
      ) : state === 'accepted' ? (
        <>
          <CheckCircle2 className="mx-auto size-10 text-[var(--ready)]" />
          <h1 className="mt-4 text-xl font-semibold text-white">Invitation accepted</h1>
          <p className="mt-2 text-sm text-zinc-400">
            You now have access to {count} shared {count === 1 ? 'page' : 'pages'}.
          </p>
          <Link href="/dashboard" className="btn btn-primary mt-6 inline-flex">Go to dashboard</Link>
        </>
      ) : state === 'none' ? (
        <>
          <CheckCircle2 className="mx-auto size-10 text-[var(--ready)]" />
          <h1 className="mt-4 text-xl font-semibold text-white">You&rsquo;re all set</h1>
          <p className="mt-2 text-sm text-zinc-400">
            No pending invitations to accept — any shared pages are already on your dashboard.
          </p>
          <Link href="/dashboard" className="btn btn-primary mt-6 inline-flex">Go to dashboard</Link>
        </>
      ) : state === 'unconfirmed' ? (
        <>
          <MailWarning className="mx-auto size-10 text-[var(--amber)]" />
          <h1 className="mt-4 text-xl font-semibold text-white">Confirm your email first</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Confirm your email address (check your inbox), then reopen this link to accept the invitation.
          </p>
        </>
      ) : (
        <>
          <AlertCircle className="mx-auto size-10 text-red-400" />
          <h1 className="mt-4 text-xl font-semibold text-white">Couldn&rsquo;t accept the invitation</h1>
          <p className="mt-2 text-sm text-zinc-400">{error || 'Please try again.'}</p>
          <Link href="/dashboard" className="btn btn-secondary mt-6 inline-flex">Go to dashboard</Link>
        </>
      )}
    </div>
  )
}
