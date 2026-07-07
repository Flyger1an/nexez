'use client'

import { useState } from 'react'
import { CheckCircle2, Loader2, LifeBuoy, Mail, RotateCcw } from 'lucide-react'
import type { BuyerRequestKind } from '../../../lib/buyer-portal'

type ActionState = 'idle' | 'open' | 'submitting' | 'done'

export function BuyerOrderActions({
  token,
  offerName,
  sellerEmail,
  sellerName,
  reference,
  canRefund,
  hasOpenRefund,
  hasOpenProblem,
}: {
  token: string
  offerName: string | null
  sellerEmail: string | null
  sellerName: string | null
  reference: string
  canRefund: boolean
  hasOpenRefund: boolean
  hasOpenProblem: boolean
}) {
  return (
    <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
      {canRefund ? (
        <RequestCard
          kind="refund_request"
          token={token}
          title="Request a refund"
          icon={<RotateCcw className="size-4" />}
          blurb="Ask the seller to refund this order. They'll review it and refund you from their dashboard."
          placeholder="Optional: tell the seller why (e.g. didn't receive it, wrong item)…"
          cta="Send refund request"
          alreadyOpen={hasOpenRefund}
          openLabel="Refund request pending"
        />
      ) : null}
      <RequestCard
        kind="problem_report"
        token={token}
        title="Report a problem"
        icon={<LifeBuoy className="size-4" />}
        blurb="Something wrong with your order? Send the seller the details and they'll get back to you."
        placeholder="Describe the problem…"
        cta="Send report"
        requireMessage
        alreadyOpen={hasOpenProblem}
        openLabel="Problem report submitted"
      />
      {sellerEmail ? (
        <a
          href={`mailto:${sellerEmail}?subject=${encodeURIComponent(`Order question${offerName ? ` - ${offerName}` : ''}`)}&body=${encodeURIComponent(`Hi, I have a question about my order (ref ${reference}).`)}`}
          className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-4 text-left text-sm text-zinc-300 transition hover:bg-white/[0.05] sm:col-span-2"
        >
          <Mail className="size-4 text-[var(--signal)]" />
          <span>
            Prefer email? <span className="font-medium text-white">Contact {sellerName || 'the seller'}</span> directly.
          </span>
        </a>
      ) : null}
    </div>
  )
}

function RequestCard({
  kind,
  token,
  title,
  icon,
  blurb,
  placeholder,
  cta,
  requireMessage,
  alreadyOpen,
  openLabel,
}: {
  kind: BuyerRequestKind
  token: string
  title: string
  icon: React.ReactNode
  blurb: string
  placeholder: string
  cta: string
  requireMessage?: boolean
  alreadyOpen: boolean
  openLabel: string
}) {
  const [state, setState] = useState<ActionState>(alreadyOpen ? 'done' : 'idle')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function submit() {
    if (requireMessage && !message.trim()) {
      setError('Please add a short description.')
      return
    }
    setState('submitting')
    setError('')
    try {
      const res = await fetch('/api/order-portal/request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, kind, message: message.trim() }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        setError(data.error || 'Could not send - try again.')
        setState('open')
        return
      }
      setState('done')
    } catch {
      setError('Could not send - try again.')
      setState('open')
    }
  }

  const doneCopy = alreadyOpen && state === 'done' && !message ? openLabel : 'Sent - the seller has been notified.'

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-white">
        <span className="text-[var(--signal)]">{icon}</span>
        {title}
      </p>
      {state === 'done' ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-[var(--ready)]">
          <CheckCircle2 className="size-4" /> {doneCopy}
        </p>
      ) : (
        <>
          <p className="mt-1 text-sm leading-6 text-zinc-400">{blurb}</p>
          {state === 'open' || state === 'submitting' ? (
            <div className="mt-3">
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={placeholder}
                rows={3}
                maxLength={2000}
                disabled={state === 'submitting'}
                className="w-full resize-none rounded-lg border border-white/10 bg-[#0b0d12] px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-[var(--signal)]/50 focus:outline-none"
              />
              {error ? <p className="mt-2 text-sm text-red-300">{error}</p> : null}
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={submit}
                  disabled={state === 'submitting'}
                  className="inline-flex items-center gap-2 rounded-lg bg-[var(--signal)] px-3.5 py-2 text-sm font-semibold text-zinc-950 hover:opacity-90 disabled:opacity-50"
                >
                  {state === 'submitting' ? <Loader2 className="size-4 animate-spin" /> : null}
                  {cta}
                </button>
                <button type="button" onClick={() => setState('idle')} disabled={state === 'submitting'} className="text-sm text-zinc-500 hover:text-zinc-300">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setState('open')}
              className="mt-3 inline-flex items-center gap-2 rounded-lg border border-white/15 px-3.5 py-2 text-sm text-zinc-200 hover:bg-white/5"
            >
              {title}
            </button>
          )}
        </>
      )}
    </div>
  )
}
