'use client'

import { requestRefund } from '../../lib/refund-request'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, CheckCircle2, Loader2, PackageCheck, RefreshCcw } from 'lucide-react'
import { formatCurrencyAmount, toMajorAmount, toStripeAmount } from '../../lib/currency'
import { formatDisplayDateTime } from '../../lib/international-operations'
import {
  fulfillmentCapability,
  fulfillmentDescription,
  fulfillmentLabel,
  refundCapability,
  refundConsequence,
  type FulfillmentStatus,
} from '../../lib/order-operations'
import { REQUEST_KIND_LABEL, REQUEST_STATUS_LABEL, type BuyerRequestKind } from '../../lib/buyer-portal'

type OperationsOrder = {
  id: string
  status: string
  amountCents: number
  currency: string
  refundedCents: number | null
  paymentIntentId: string | null
  channel: string | null
}

type OperationsFulfillment = {
  status: FulfillmentStatus
  version: number
  updatedAt: string
} | null

type OperationsRequest = {
  id: string
  kind: BuyerRequestKind
  status: string
  message: string | null
  buyerEmail: string | null
  createdAt: string
}

type RefundConfirmation = {
  amount: number | null
  amountLabel: string
  requestId: string | null
}

export function OrderOperationsPanel({
  order: initialOrder,
  fulfillment: initialFulfillment,
  requests: initialRequests,
  stagedObligationKind,
  locale = 'en-US',
}: {
  order: OperationsOrder
  fulfillment: OperationsFulfillment
  requests: OperationsRequest[]
  stagedObligationKind?: string | null
  locale?: string
}) {
  const router = useRouter()
  const [order, setOrder] = useState(initialOrder)
  const [fulfillment, setFulfillment] = useState(initialFulfillment)
  const [requests, setRequests] = useState(initialRequests)
  const [refundAmount, setRefundAmount] = useState('')
  const [confirmation, setConfirmation] = useState<RefundConfirmation | null>(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const fulfillmentAccess = fulfillmentCapability({ paymentStatus: order.status, stagedObligationKind })
  const refundAccess = refundCapability({
    paymentStatus: order.status,
    paymentIntentId: order.paymentIntentId,
    amountCents: order.amountCents,
    refundedCents: order.refundedCents,
  })

  async function updateFulfillment(status: FulfillmentStatus) {
    setBusy(`fulfillment:${status}`)
    clearFeedback()
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(order.id)}/fulfillment`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const result = (await response.json().catch(() => ({}))) as {
        error?: string
        fulfillment?: { status: FulfillmentStatus; version: number; updated_at: string }
      }
      if (!response.ok || !result.fulfillment) throw new Error(result.error || 'Could not update fulfillment.')
      setFulfillment({ status: result.fulfillment.status, version: result.fulfillment.version, updatedAt: result.fulfillment.updated_at })
      setNotice(`Fulfillment marked ${fulfillmentLabel(result.fulfillment.status).toLowerCase()}.`)
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update fulfillment.')
    } finally {
      setBusy('')
    }
  }

  async function updateRequest(id: string, status: 'acknowledged' | 'resolved' | 'declined') {
    setBusy(`request:${id}:${status}`)
    clearFeedback()
    try {
      await postRequestStatus(id, status)
      setRequests((current) => current.map((request) => request.id === id ? { ...request, status } : request))
      setNotice(`Customer request marked ${REQUEST_STATUS_LABEL[status]?.toLowerCase() || status}.`)
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update the customer request.')
    } finally {
      setBusy('')
    }
  }

  function reviewRefund(amount: number | null, requestId: string | null = null) {
    clearFeedback()
    const smallestUnitAmount = amount == null
      ? refundAccess.remainingCents
      : toStripeAmount(amount, order.currency)
    if (!Number.isFinite(smallestUnitAmount) || smallestUnitAmount <= 0) {
      setError('Enter a valid refund amount.')
      return
    }
    if (smallestUnitAmount > refundAccess.remainingCents) {
      setError('Refund amount exceeds the remaining refundable amount.')
      return
    }
    setConfirmation({
      amount,
      amountLabel: formatCurrencyAmount(smallestUnitAmount, order.currency, locale),
      requestId,
    })
  }

  async function confirmRefund() {
    if (!confirmation) return
    setBusy('refund')
    clearFeedback()
    try {
      const response = await requestRefund('/api/orders/refund', {
        orderId: order.id,
        ...(confirmation.amount == null ? {} : { amount: confirmation.amount }),
      })
      const result = (await response.json().catch(() => ({}))) as {
        error?: string
        status?: string
        refundedCents?: number
      }
      if (!response.ok) throw new Error(result.error || 'Could not process the refund.')

      setOrder((current) => ({
        ...current,
        status: result.status || current.status,
        refundedCents: result.refundedCents ?? current.refundedCents,
      }))

      let resolutionWarning = ''
      if (confirmation.requestId) {
        try {
          await postRequestStatus(confirmation.requestId, 'resolved')
          setRequests((current) => current.map((request) => request.id === confirmation.requestId ? { ...request, status: 'resolved' } : request))
        } catch {
          resolutionWarning = 'The refund succeeded, but the customer request still needs to be marked resolved.'
        }
      }

      setNotice(`${confirmation.amountLabel} refund recorded.`)
      if (resolutionWarning) setError(resolutionWarning)
      setConfirmation(null)
      setRefundAmount('')
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not process the refund.')
    } finally {
      setBusy('')
    }
  }

  async function postRequestStatus(id: string, status: 'acknowledged' | 'resolved' | 'declined') {
    const response = await fetch('/api/orders/request-status', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, status }),
    })
    const result = (await response.json().catch(() => ({}))) as { error?: string }
    if (!response.ok) throw new Error(result.error || 'Could not update the customer request.')
  }

  function clearFeedback() {
    setError('')
    setNotice('')
  }

  const openRequests = requests.filter((request) => request.status === 'open' || request.status === 'acknowledged')

  return (
    <section aria-labelledby="order-operations-title" className="rounded-[var(--r-card)] border border-[var(--line-soft)] bg-[var(--glass)] p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--line-soft)] pb-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--fg-muted-2)]">Manage order</p>
          <h2 id="order-operations-title" className="mt-1 text-lg font-semibold text-[var(--fg)]">Fulfillment and refunds</h2>
          <p className="mt-1 text-sm text-[var(--fg-muted)]">Update fulfillment, issue refunds, and respond to customer requests. Stripe continues to control the payment status.</p>
        </div>
        {openRequests.length ? (
          <span className="rounded-full border border-[var(--amber)]/30 bg-[var(--amber)]/10 px-3 py-1.5 text-xs font-medium text-[var(--amber)]">
            {openRequests.length} need{openRequests.length === 1 ? 's' : ''} attention
          </span>
        ) : null}
      </div>

      {error ? <p role="alert" className="mt-4 rounded-[var(--radius)] border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-300">{error}</p> : null}
      {notice ? <p role="status" className="mt-4 rounded-[var(--radius)] border border-[var(--ready)]/30 bg-[var(--ready)]/10 px-4 py-3 text-sm text-[var(--ready)]">{notice}</p> : null}

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <article className="rounded-[var(--radius)] border border-[var(--line-soft)] bg-[var(--fill-1)] p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold text-[var(--fg)]"><PackageCheck className="size-4 text-[var(--settings-emphasis)]" aria-hidden="true" /> Fulfillment</p>
              <p className="mt-2 text-sm leading-6 text-[var(--fg-muted)]">{fulfillmentDescription(fulfillment?.status)}</p>
            </div>
            <span className="whitespace-nowrap rounded-full border border-[var(--line-soft)] px-2.5 py-1 text-xs text-[var(--fg-muted)]">{fulfillmentLabel(fulfillment?.status)}</span>
          </div>
          {fulfillmentAccess.enabled ? (
            <div className="mt-4 flex flex-wrap gap-2" aria-label="Update fulfillment state">
              {(['not_started', 'in_progress', 'fulfilled'] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  disabled={busy !== '' || fulfillment?.status === status}
                  onClick={() => updateFulfillment(status)}
                  className="inline-flex min-h-10 items-center gap-2 rounded-[var(--radius)] border border-[var(--line-soft)] px-3 py-2 text-xs font-medium text-[var(--fg)] hover:bg-[var(--fill-2)] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {busy === `fulfillment:${status}` ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : status === 'fulfilled' ? <CheckCircle2 className="size-3.5" aria-hidden="true" /> : null}
                  {fulfillmentLabel(status)}
                </button>
              ))}
            </div>
          ) : <p className="mt-4 text-xs leading-5 text-[var(--amber)]">{fulfillmentAccess.reason}</p>}
        </article>

        <article className="rounded-[var(--radius)] border border-[var(--line-soft)] bg-[var(--fill-1)] p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold text-[var(--fg)]"><RefreshCcw className="size-4 text-[var(--settings-emphasis)]" aria-hidden="true" /> Refund</p>
              <p className="mt-2 text-sm text-[var(--fg-muted)]">{formatCurrencyAmount(refundAccess.remainingCents, order.currency, locale)} remains refundable.</p>
            </div>
          </div>
          <p className="mt-3 text-xs leading-5 text-[var(--fg-muted-2)]">{refundConsequence(order.channel)}</p>
          {refundAccess.enabled ? (
            <div className="mt-4 space-y-3">
              <label className="block text-xs font-medium text-[var(--fg-muted)]">
                Partial amount ({order.currency.toUpperCase()})
                <input
                  inputMode="decimal"
                  value={refundAmount}
                  onChange={(event) => setRefundAmount(event.target.value)}
                  placeholder={String(toMajorAmount(refundAccess.remainingCents, order.currency))}
                  className="mt-1.5 min-h-11 w-full rounded-[var(--radius)] border border-[var(--line-soft)] bg-[var(--bg)] px-3 text-sm text-[var(--fg)] outline-none focus:border-[var(--settings-focus)]"
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={busy !== ''} onClick={() => reviewRefund(Number(refundAmount), null)} className="min-h-10 rounded-[var(--radius)] border border-[var(--line-soft)] px-3 py-2 text-xs font-medium text-[var(--fg)] hover:bg-[var(--fill-2)] disabled:opacity-45">Review partial refund</button>
                <button type="button" disabled={busy !== ''} onClick={() => reviewRefund(null)} className="min-h-10 rounded-[var(--radius)] border border-red-400/30 bg-red-400/10 px-3 py-2 text-xs font-semibold text-red-300 hover:bg-red-400/20 disabled:opacity-45">Refund full remainder</button>
              </div>
            </div>
          ) : <p className="mt-4 text-xs leading-5 text-[var(--fg-muted-2)]">{refundAccess.reason}</p>}
        </article>
      </div>

      {confirmation ? (
        <div className="mt-4 rounded-[var(--radius)] border border-[var(--amber)]/30 bg-[var(--amber)]/10 p-4" role="group" aria-label="Confirm refund">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--amber)]" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold text-[var(--fg)]">Confirm {confirmation.amountLabel} refund</p>
              <p className="mt-1 text-xs leading-5 text-[var(--fg-muted)]">This moves money through Stripe and cannot be undone in Nexez. {refundConsequence(order.channel)}</p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 pl-7">
            <button type="button" disabled={busy !== ''} onClick={confirmRefund} className="inline-flex min-h-10 items-center gap-2 rounded-[var(--radius)] bg-red-500 px-4 py-2 text-xs font-semibold text-white hover:bg-red-400 disabled:opacity-50">
              {busy === 'refund' ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : null} Confirm refund
            </button>
            <button type="button" disabled={busy !== ''} onClick={() => setConfirmation(null)} className="min-h-10 rounded-[var(--radius)] border border-[var(--line-soft)] px-4 py-2 text-xs text-[var(--fg)] disabled:opacity-50">Cancel</button>
          </div>
        </div>
      ) : null}

      {requests.length ? (
        <div className="mt-5 border-t border-[var(--line-soft)] pt-5">
          <h3 className="text-sm font-semibold text-[var(--fg)]">Customer requests</h3>
          <div className="mt-3 space-y-3">
            {requests.map((request) => {
              const closed = request.status === 'resolved' || request.status === 'declined'
              const requestBusy = busy.startsWith(`request:${request.id}:`)
              return (
                <article key={request.id} className="rounded-[var(--radius)] border border-[var(--line-soft)] bg-[var(--fill-1)] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-[var(--fg)]">{REQUEST_KIND_LABEL[request.kind]}</p>
                    <span className="rounded-full border border-[var(--line-soft)] px-2.5 py-1 text-xs text-[var(--fg-muted)]">{REQUEST_STATUS_LABEL[request.status] || request.status}</span>
                  </div>
                  {request.message ? <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[var(--fg-muted)]">{request.message}</p> : null}
                  <p className="mt-3 text-xs text-[var(--fg-muted-2)]">Filed {formatDisplayDateTime(request.createdAt, locale)}{request.buyerEmail ? ` by ${request.buyerEmail}` : ''}</p>
                  {!closed ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {request.status === 'open' ? <button type="button" disabled={busy !== ''} onClick={() => updateRequest(request.id, 'acknowledged')} className="min-h-10 rounded-[var(--radius)] border border-[var(--line-soft)] px-3 py-2 text-xs text-[var(--fg)] hover:bg-[var(--fill-2)] disabled:opacity-45">{requestBusy ? 'Updating...' : 'Mark reviewing'}</button> : null}
                      {request.kind === 'refund_request' && refundAccess.enabled ? <button type="button" disabled={busy !== ''} onClick={() => reviewRefund(null, request.id)} className="min-h-10 rounded-[var(--radius)] border border-red-400/30 bg-red-400/10 px-3 py-2 text-xs font-semibold text-red-300 hover:bg-red-400/20 disabled:opacity-45">Refund full remainder and resolve</button> : null}
                      <button type="button" disabled={busy !== ''} onClick={() => updateRequest(request.id, 'resolved')} className="min-h-10 rounded-[var(--radius)] border border-[var(--ready)]/30 bg-[var(--ready)]/10 px-3 py-2 text-xs font-semibold text-[var(--ready)] hover:bg-[var(--ready)]/20 disabled:opacity-45">Resolve</button>
                      <button type="button" disabled={busy !== ''} onClick={() => updateRequest(request.id, 'declined')} className="min-h-10 px-2 py-2 text-xs text-[var(--fg-muted-2)] hover:text-[var(--fg)] disabled:opacity-45">Decline</button>
                    </div>
                  ) : null}
                </article>
              )
            })}
          </div>
        </div>
      ) : null}
    </section>
  )
}
