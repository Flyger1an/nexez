'use client'

import { useState } from 'react'
import { CheckCircle2, Loader2, Mail } from 'lucide-react'

export function OrdersLookupForm() {
  const [email, setEmail] = useState('')
  const [state, setState] = useState<'idle' | 'submitting' | 'sent'>('idle')
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) {
      setError('Enter the email you used at checkout.')
      return
    }
    setState('submitting')
    setError('')
    try {
      const res = await fetch('/api/order-portal/lookup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        setError(data.error || 'Something went wrong — try again.')
        setState('idle')
        return
      }
      setState('sent')
    } catch {
      setError('Something went wrong — try again.')
      setState('idle')
    }
  }

  if (state === 'sent') {
    return (
      <div className="mt-6 w-full rounded-xl border border-[var(--ready)]/30 bg-[var(--ready)]/[0.06] p-5 text-left">
        <p className="flex items-center gap-2 text-sm font-medium text-[var(--ready)]">
          <CheckCircle2 className="size-4" /> Check your inbox
        </p>
        <p className="mt-1 text-sm leading-6 text-zinc-300">
          If that email has orders with us, we&rsquo;ve sent a secure link to view them. The link expires in 24 hours.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="mt-6 w-full">
      <label htmlFor="lookup-email" className="sr-only">
        Email address
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
          <input
            id="lookup-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            disabled={state === 'submitting'}
            className="w-full rounded-lg border border-white/10 bg-[#0b0d12] py-2.5 pl-9 pr-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-[var(--signal)]/50 focus:outline-none disabled:opacity-60"
          />
        </div>
        <button
          type="submit"
          disabled={state === 'submitting'}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--signal)] px-5 py-2.5 text-sm font-semibold text-zinc-950 hover:opacity-90 disabled:opacity-50"
        >
          {state === 'submitting' ? <Loader2 className="size-4 animate-spin" /> : null}
          Email me my orders
        </button>
      </div>
      {error ? <p className="mt-2 text-sm text-red-300">{error}</p> : null}
    </form>
  )
}
