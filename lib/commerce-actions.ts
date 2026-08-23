import {
  normalizeCheckoutCommerceRecord,
  normalizeNegotiatedCommerceRecord,
  type CheckoutCommerceSource,
  type CheckoutFulfillmentSource,
  type CommerceRecord,
  type NegotiatedCommerceSource,
} from './commerce-record'
import type { AgentNegotiation } from './negotiations'
import { getNegotiationQueueState } from './negotiation-report'

export type CommerceBuyerRequestSource = {
  id: string
  order_kind: 'checkout' | 'negotiation'
  order_id: string
  kind: 'refund_request' | 'problem_report'
  status: 'open' | 'acknowledged'
  updated_at: string
}

export type CommerceFulfillmentActionSource = CheckoutFulfillmentSource & {
  updated_at: string
}

export type NegotiatedCommerceActionSource = NegotiatedCommerceSource & {
  status: AgentNegotiation['status']
  settlement_state: AgentNegotiation['settlement_state']
  decision_pending?: boolean
  metadata: AgentNegotiation['metadata']
}

export type CommerceActionItem = {
  key: 'payment_dispute' | 'refund_request' | 'problem_report' | 'fulfillment' | 'negotiation'
  label: string
  detail: string
  priority: number
  urgent: boolean
  updatedAt: string
}

export type CommerceActionRecord = {
  key: string
  record: CommerceRecord
  actions: CommerceActionItem[]
  primaryAction: CommerceActionItem
  urgent: boolean
}

function compareActions(left: CommerceActionItem, right: CommerceActionItem) {
  if (right.priority !== left.priority) return right.priority - left.priority
  return Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
}

function createActionRecord(
  record: CommerceRecord,
  actions: CommerceActionItem[],
): CommerceActionRecord | null {
  if (!actions.length) return null
  const sorted = [...actions].sort(compareActions)
  return {
    key: record.key,
    record,
    actions: sorted,
    primaryAction: sorted[0],
    urgent: sorted.some((action) => action.urgent),
  }
}

function buyerRequestAction(request: CommerceBuyerRequestSource): CommerceActionItem {
  const acknowledged = request.status === 'acknowledged'
  if (request.kind === 'refund_request') {
    return {
      key: 'refund_request',
      label: acknowledged ? 'Resolve refund request' : 'Review refund request',
      detail: acknowledged
        ? 'The buyer request is acknowledged but not resolved.'
        : 'A buyer submitted a refund request.',
      priority: acknowledged ? 94 : 96,
      urgent: false,
      updatedAt: request.updated_at,
    }
  }
  return {
    key: 'problem_report',
    label: acknowledged ? 'Resolve buyer issue' : 'Review buyer issue',
    detail: acknowledged
      ? 'The buyer issue is acknowledged but not resolved.'
      : 'A buyer reported a problem with this commerce record.',
    priority: acknowledged ? 90 : 92,
    urgent: false,
    updatedAt: request.updated_at,
  }
}

export function checkoutCommerceActionRecord(
  row: CheckoutCommerceSource,
  fulfillment: CommerceFulfillmentActionSource | null,
  requests: CommerceBuyerRequestSource[],
): CommerceActionRecord | null {
  const actions = requests.map(buyerRequestAction)

  if (row.status === 'disputed') {
    actions.push({
      key: 'payment_dispute',
      label: 'Review payment dispute',
      detail: 'A checkout chargeback needs attention.',
      priority: 100,
      urgent: true,
      updatedAt: row.updated_at,
    })
  }

  const fulfillmentCanMove = ['paid', 'dispute_won'].includes(row.status)
    && row.channel !== 'staged_settlement'
  if (fulfillment && fulfillmentCanMove && fulfillment.status !== 'fulfilled') {
    actions.push({
      key: 'fulfillment',
      label: fulfillment.status === 'in_progress' ? 'Complete fulfillment' : 'Start fulfillment',
      detail: fulfillment.status === 'in_progress'
        ? 'This order has recorded work in progress.'
        : 'This paid order has a fulfillment record ready to begin.',
      priority: fulfillment.status === 'in_progress' ? 45 : 55,
      urgent: false,
      updatedAt: fulfillment.updated_at,
    })
  }

  return createActionRecord(
    normalizeCheckoutCommerceRecord(row, fulfillment),
    actions,
  )
}

export function negotiatedCommerceActionRecord(
  row: NegotiatedCommerceActionSource,
  requests: CommerceBuyerRequestSource[],
  now = Date.now(),
): CommerceActionRecord | null {
  const actions = requests.map(buyerRequestAction)
  const queue = getNegotiationQueueState(row, now)
  if (queue.ownerAction) {
    actions.push({
      key: 'negotiation',
      label: queue.label,
      detail: queue.detail,
      priority: queue.priority,
      urgent: queue.urgent,
      updatedAt: row.updated_at,
    })
  }
  return createActionRecord(normalizeNegotiatedCommerceRecord(row), actions)
}

export function mergeCommerceActionRecords(
  records: Array<CommerceActionRecord | null>,
  limit: number,
) {
  return records
    .filter((record): record is CommerceActionRecord => Boolean(record))
    .sort((left, right) => {
      const priority = right.primaryAction.priority - left.primaryAction.priority
      if (priority !== 0) return priority
      const updated = Date.parse(right.primaryAction.updatedAt) - Date.parse(left.primaryAction.updatedAt)
      if (Number.isFinite(updated) && updated !== 0) return updated
      return right.key.localeCompare(left.key)
    })
    .slice(0, Math.max(0, limit))
}
