import type { FinanceRollup } from './finance-report'
import type { NegotiationRollup } from './negotiation-report'
import type { OwnerAnalyticsRollup } from './server/analytics-rollup'

export type CommercialActionTone = 'critical' | 'attention' | 'accuracy' | 'growth'

export type CommercialAction = {
  id:
    | 'disputes'
    | 'buyer_requests'
    | 'stale_holds'
    | 'negotiations'
    | 'commerce_payment_dispute'
    | 'commerce_refund_request'
    | 'commerce_problem_report'
    | 'commerce_fulfillment'
    | 'commerce_negotiation'
    | 'estimated_economics'
    | 'readiness'
  label: string
  detail: string
  count: number
  href: string
  cta: string
  tone: CommercialActionTone
}

export type CommercialMoneyRow = {
  currency: string
  grossCents: number
  netCents: number
  directTransactions: number
  negotiatedDeals: number
}

export type CommercialCommandCenter = {
  availability: {
    analytics: boolean
    negotiations: boolean
    finance: boolean
    commerce: boolean
  }
  demand: {
    aiVisits: number
    discoveryClicks: number
    checkoutStarts: number
    paidOrders: number
    checkoutToPaidRate: number | null
  }
  deals: {
    needsAction: number
    waiting: number
    staleOpen: number
    disputed: number
  }
  commerce: {
    visibleActions: number
    urgentActions: number
    isTruncated: boolean
    complete: boolean
  }
  money: CommercialMoneyRow[]
  primaryMoney: CommercialMoneyRow
  actions: CommercialAction[]
  status: 'ready' | 'attention' | 'critical' | 'incomplete'
}

export type CommercialCommerceInput = {
  records: Array<{
    id: string
    href: string
    railLabel: string
    offerName: string
    actionLabel: string
    actions: Array<{
      key: 'payment_dispute' | 'refund_request' | 'problem_report' | 'fulfillment' | 'negotiation'
      priority: number
      urgent: boolean
    }>
  }>
  urgentCount: number
  isTruncated: boolean
  complete: boolean
}

type CommercialCommandCenterInput = {
  analytics?: OwnerAnalyticsRollup | null
  negotiations?: NegotiationRollup | null
  finance?: FinanceRollup | null
  commerce?: CommercialCommerceInput | null
  readinessAlerts?: number
}

const EMPTY_MONEY: CommercialMoneyRow = {
  currency: 'usd',
  grossCents: 0,
  netCents: 0,
  directTransactions: 0,
  negotiatedDeals: 0,
}

export function buildCommercialCommandCenter({
  analytics,
  negotiations,
  finance,
  commerce,
  readinessAlerts = 0,
}: CommercialCommandCenterInput): CommercialCommandCenter {
  const moneyByCurrency = new Map<string, CommercialMoneyRow>()

  for (const row of finance?.currencies ?? []) {
    const currency = normalizeCurrency(row.currency)
    const current = moneyByCurrency.get(currency) ?? { ...EMPTY_MONEY, currency }
    current.grossCents += row.grossCents
    current.netCents += row.netCents
    current.directTransactions += row.transactions
    moneyByCurrency.set(currency, current)
  }

  for (const row of finance?.negotiatedWindow ?? []) {
    const currency = normalizeCurrency(row.currency)
    const current = moneyByCurrency.get(currency) ?? { ...EMPTY_MONEY, currency }
    current.grossCents += row.capturedCents
    current.netCents += row.netCents
    current.negotiatedDeals += row.deals
    moneyByCurrency.set(currency, current)
  }

  const money = [...moneyByCurrency.values()].sort(
    (a, b) => b.grossCents - a.grossCents || a.currency.localeCompare(b.currency),
  )
  const primaryMoney = money[0] ?? EMPTY_MONEY
  const counts = analytics?.counts
  const checkoutToPaidRate = counts?.checkoutStarts && counts.paidDirectOrders <= counts.checkoutStarts
    ? counts.paidDirectOrders / counts.checkoutStarts
    : null
  const operations = finance?.operations
  const disputed = operations
    ? operations.disputedOrders + operations.disputedNegotiations
    : negotiations?.counts.disputed ?? 0
  const actions: CommercialAction[] = []

  if (commerce) {
    actions.push(...commerceActionCategories(commerce))
  } else if (disputed > 0) {
    actions.push({
      id: 'disputes',
      label: `${disputed} open ${disputed === 1 ? 'dispute' : 'disputes'}`,
      detail: 'Review the payment details and choose how to respond.',
      count: disputed,
      href: '/dashboard/finance#operations',
      cta: 'Review disputes',
      tone: 'critical',
    })
  }
  if (!commerce && (operations?.openRequests ?? 0) > 0) {
    const count = operations?.openRequests ?? 0
    actions.push({
      id: 'buyer_requests',
      label: `${count} customer ${count === 1 ? 'request' : 'requests'}`,
      detail: 'Refund requests and reported problems are waiting for a response.',
      count,
      href: '/dashboard/finance#buyer-requests',
      cta: 'Open requests',
      tone: 'attention',
    })
  }
  if (!commerce && (operations?.staleHeldNegotiations ?? 0) > 0) {
    const count = operations?.staleHeldNegotiations ?? 0
    actions.push({
      id: 'stale_holds',
      label: `${count} overdue ${count === 1 ? 'payment hold' : 'payment holds'}`,
      detail: 'Choose whether to capture or release the held funds.',
      count,
      href: '/dashboard/negotiations?queue=needs_action',
      cta: 'Review held funds',
      tone: 'critical',
    })
  }
  if (!commerce && (negotiations?.counts.needsAction ?? 0) > 0) {
    const count = negotiations?.counts.needsAction ?? 0
    actions.push({
      id: 'negotiations',
      label: `${count} ${count === 1 ? 'deal needs' : 'deals need'} action`,
      detail: negotiations?.counts.staleOpen
        ? `${negotiations.counts.staleOpen} open ${negotiations.counts.staleOpen === 1 ? 'deal is' : 'deals are'} stale.`
        : 'Review proposals, approvals, held funds, and paused deals.',
      count,
      href: '/dashboard/negotiations?queue=needs_action',
      cta: 'Review deals',
      tone: 'attention',
    })
  }
  if ((operations?.estimatedEconomics ?? 0) > 0) {
    const count = operations?.estimatedEconomics ?? 0
    actions.push({
      id: 'estimated_economics',
      label: `${count} ${count === 1 ? 'sale has' : 'sales have'} an estimated fee`,
      detail: 'These older sales use your current plan rate because the original fee was not saved.',
      count,
      href: '/dashboard/finance#operations',
      cta: 'Review sales',
      tone: 'accuracy',
    })
  }
  if (readinessAlerts > 0) {
    actions.push({
      id: 'readiness',
      label: `${readinessAlerts} ${readinessAlerts === 1 ? 'listing is' : 'listings are'} below 80%`,
      detail: 'Add clearer offer details and the information customers need to trust your listing.',
      count: readinessAlerts,
      href: '/dashboard/listings',
      cta: 'Improve listings',
      tone: 'growth',
    })
  }

  const status: CommercialCommandCenter['status'] = commerce
    ? commerce.urgentCount > 0
      ? 'critical'
      : !analytics
        || !negotiations
        || !finance
        || !commerce.complete
        || (commerce.isTruncated && commerce.records.length === 0)
        ? 'incomplete'
        : actions.length > 0
          ? 'attention'
          : 'ready'
    : disputed > 0 || (operations?.staleHeldNegotiations ?? 0) > 0
      ? 'critical'
      : !analytics || !negotiations || !finance
        ? 'incomplete'
        : actions.length > 0
          ? 'attention'
          : 'ready'

  return {
    availability: {
      analytics: Boolean(analytics),
      negotiations: Boolean(negotiations),
      finance: Boolean(finance),
      commerce: Boolean(commerce),
    },
    demand: {
      aiVisits: counts?.aiVisits ?? 0,
      discoveryClicks: counts?.discoveryClicks ?? 0,
      checkoutStarts: counts?.checkoutStarts ?? 0,
      paidOrders: counts?.paidOrders ?? 0,
      checkoutToPaidRate,
    },
    deals: {
      needsAction: negotiations?.counts.needsAction ?? 0,
      waiting: negotiations?.counts.waiting ?? 0,
      staleOpen: negotiations?.counts.staleOpen ?? 0,
      disputed,
    },
    commerce: {
      visibleActions: commerce?.records.length ?? 0,
      urgentActions: commerce?.urgentCount ?? 0,
      isTruncated: commerce?.isTruncated ?? false,
      complete: commerce?.complete ?? false,
    },
    money,
    primaryMoney,
    actions,
    status,
  }
}

export function commercialSnapshotCsv(snapshot: CommercialCommandCenter) {
  const rows: Array<Array<string | number>> = [
    ['section', 'metric', 'value', 'unit'],
    ['availability', 'analytics', snapshot.availability.analytics ? 1 : 0, 'boolean'],
    ['availability', 'negotiations', snapshot.availability.negotiations ? 1 : 0, 'boolean'],
    ['availability', 'finance', snapshot.availability.finance ? 1 : 0, 'boolean'],
    ['availability', 'commerce', snapshot.availability.commerce ? 1 : 0, 'boolean'],
    ['demand_today', 'ai_visits', snapshot.demand.aiVisits, 'visits'],
    ['demand_today', 'discovery_clicks', snapshot.demand.discoveryClicks, 'clicks'],
    ['demand_today', 'checkout_starts', snapshot.demand.checkoutStarts, 'starts'],
    ['demand_today', 'paid_orders', snapshot.demand.paidOrders, 'orders'],
    ['deals_current', 'needs_action', snapshot.deals.needsAction, 'deals'],
    ['deals_current', 'waiting', snapshot.deals.waiting, 'deals'],
    ['deals_current', 'stale_open', snapshot.deals.staleOpen, 'deals'],
    ['commerce_current', 'visible_actions', snapshot.commerce.visibleActions, 'records'],
    ['commerce_current', 'urgent_actions', snapshot.commerce.urgentActions, 'records'],
    ['commerce_current', 'bounded', snapshot.commerce.isTruncated ? 1 : 0, 'boolean'],
    ['commerce_current', 'source_complete', snapshot.commerce.complete ? 1 : 0, 'boolean'],
  ]

  for (const row of snapshot.money) {
    rows.push(['money_30d', 'gross', row.grossCents, `${row.currency}_minor_units`])
    rows.push(['money_30d', 'net', row.netCents, `${row.currency}_minor_units`])
    rows.push(['money_30d', 'direct_transactions', row.directTransactions, row.currency])
    rows.push(['money_30d', 'negotiated_deals', row.negotiatedDeals, row.currency])
  }
  for (const action of snapshot.actions) {
    rows.push(['action_queue', action.id, action.count, action.tone])
  }

  return rows.map((row) => row.map(csvCell).join(',')).join('\n')
}

const COMMERCE_ACTION_COPY: Record<
  CommercialCommerceInput['records'][number]['actions'][number]['key'],
  {
    singular: string
    plural: string
    id: CommercialAction['id']
    tone: CommercialActionTone
  }
> = {
  payment_dispute: {
    singular: 'payment dispute',
    plural: 'payment disputes',
    id: 'commerce_payment_dispute',
    tone: 'critical',
  },
  refund_request: {
    singular: 'refund request',
    plural: 'refund requests',
    id: 'commerce_refund_request',
    tone: 'attention',
  },
  problem_report: {
    singular: 'customer issue',
    plural: 'customer issues',
    id: 'commerce_problem_report',
    tone: 'attention',
  },
  fulfillment: {
    singular: 'fulfillment task',
    plural: 'fulfillment tasks',
    id: 'commerce_fulfillment',
    tone: 'attention',
  },
  negotiation: {
    singular: 'negotiation task',
    plural: 'negotiation tasks',
    id: 'commerce_negotiation',
    tone: 'attention',
  },
}

function commerceActionCategories(commerce: CommercialCommerceInput): CommercialAction[] {
  const categories = new Map<
    CommercialCommerceInput['records'][number]['actions'][number]['key'],
    {
      priority: number
      urgent: boolean
      records: Map<string, CommercialCommerceInput['records'][number]>
    }
  >()

  for (const record of commerce.records) {
    for (const action of record.actions) {
      const category = categories.get(action.key) ?? {
        priority: action.priority,
        urgent: action.urgent,
        records: new Map(),
      }
      category.priority = Math.max(category.priority, action.priority)
      category.urgent ||= action.urgent
      category.records.set(record.id, record)
      categories.set(action.key, category)
    }
  }

  return [...categories.entries()]
    .sort((left, right) => {
      if (left[1].urgent !== right[1].urgent) return left[1].urgent ? -1 : 1
      if (right[1].priority !== left[1].priority) return right[1].priority - left[1].priority
      return left[0].localeCompare(right[0])
    })
    .slice(0, 3)
    .map(([key, category]) => {
      const copy = COMMERCE_ACTION_COPY[key]
      const records = [...category.records.values()]
      const count = records.length
      const onlyRecord = count === 1 ? records[0] : null
      return {
        id: copy.id,
        label: `${count} ${count === 1 ? copy.singular : copy.plural}`,
        detail: onlyRecord
          ? `${onlyRecord.offerName} on ${onlyRecord.railLabel.toLowerCase()}.`
          : `${count} orders or deals currently need this action.`,
        count,
        href: onlyRecord?.href ?? '/dashboard/commerce',
        cta: onlyRecord?.actionLabel ?? 'Open Commerce',
        tone: category.urgent ? 'critical' : copy.tone,
      }
    })
}

function normalizeCurrency(value: string) {
  return value.trim().toLowerCase() || 'usd'
}

function csvCell(value: string | number) {
  const text = String(value)
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}
