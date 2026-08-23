import type { DashboardOrder } from './server/dashboard-orders'

export type OrderEconomics = {
  grossCents: number
  refundedCents: number
  retainedFeeCents: number
  netCents: number
}

export function getOrderEconomics(order: DashboardOrder): OrderEconomics {
  const grossCents = Math.max(0, Number(order.amount_cents) || 0)
  const recordedRefund = Math.max(0, Number(order.refunded_cents) || 0)
  const refundedCents = order.status === 'disputed'
    ? grossCents
    : order.status === 'refunded' && recordedRefund === 0
      ? grossCents
      : Math.min(grossCents, recordedRefund)
  const remainingCents = Math.max(0, grossCents - refundedCents)
  const snapshotFee = Number(order.application_fee_cents)
  const originalFeeCents = order.application_fee_cents != null && Number.isFinite(snapshotFee)
    ? Math.max(0, snapshotFee)
    : Math.round(grossCents * commissionRate(order))
  const retainedFeeCents = grossCents > 0
    ? Math.round((originalFeeCents * remainingCents) / grossCents)
    : 0

  return {
    grossCents,
    refundedCents,
    retainedFeeCents,
    netCents: Math.max(0, remainingCents - retainedFeeCents),
  }
}

function commissionRate(order: DashboardOrder) {
  const bps = Number(order.commission_bps)
  if (order.commission_bps != null && Number.isFinite(bps)) return Math.max(0, bps) / 10_000
  const percent = Number(order.commission_percent)
  if (order.commission_percent != null && Number.isFinite(percent)) return Math.max(0, percent) / 100
  return 0
}

export function getOrderDisplayStatus(order: Pick<DashboardOrder, 'status' | 'refunded_cents'>) {
  if (order.status === 'paid' && Number(order.refunded_cents) > 0) return 'Partial refund'
  return order.status.replace(/_/g, ' ').replace(/^./, (character) => character.toUpperCase())
}

export function getOrderChannelLabel(channel: string | null | undefined) {
  const labels: Record<string, string> = {
    agent_checkout: 'Agent checkout',
    acp: 'ACP',
    ucp: 'UCP',
    negotiation: 'Negotiated',
    nexie: 'Nexie',
    recurring_service: 'Recurring service',
    staged_settlement: 'Staged settlement',
    reservable_resource: 'Reserved resource',
  }
  return channel ? labels[channel] ?? channel.replace(/_/g, ' ') : 'Direct checkout'
}

export function shortOrderReference(id: string) {
  return id.slice(-8).toUpperCase()
}

export function orderStatusTone(order: Pick<DashboardOrder, 'status' | 'refunded_cents'>) {
  if (order.status === 'disputed') return 'danger'
  if (order.status === 'paid' && Number(order.refunded_cents) > 0) return 'attention'
  if (order.status === 'paid' || order.status === 'dispute_won') return 'ready'
  return 'muted'
}
