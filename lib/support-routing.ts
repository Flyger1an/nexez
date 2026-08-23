import {
  getBillingPlan,
  planAllows,
  type PlanId,
} from './billing'

export type SupportServiceTier = 'standard' | 'priority'

export type SupportService = {
  planId: PlanId
  tier: SupportServiceTier
  priorityRouting: boolean
  upgradePlanId: 'scale' | null
}

/**
 * Resolve the paid support service independently from incident severity.
 * Unknown or malformed values deliberately fail closed to Free/standard.
 */
export function supportServiceForPlan(planId: unknown): SupportService {
  const normalizedPlanId = typeof planId === 'string'
    ? (getBillingPlan(planId)?.id ?? 'free')
    : 'free'
  const priorityRouting = planAllows(normalizedPlanId, 'prioritySupport')

  return {
    planId: normalizedPlanId,
    tier: priorityRouting ? 'priority' : 'standard',
    priorityRouting,
    upgradePlanId: priorityRouting ? null : 'scale',
  }
}

export type SupportQueueTicket = {
  id: string
  owner_id: string
  priority: string
  created_at: string
}

export type RoutedSupportTicket<T extends SupportQueueTicket = SupportQueueTicket> = T & {
  supportService: SupportService
}

export type IncidentSeverity = 'low' | 'normal' | 'high' | 'urgent'

export type SupportQueueProjection = {
  id: string
  subject: string
  severity: IncidentSeverity
  createdAt: string
  serviceTier: SupportServiceTier
  planId: PlanId
}

/** Production incidents are severity-driven for every service tier. */
export function isSupportIncident(ticket: Pick<SupportQueueTicket, 'priority'>): boolean {
  return ticket.priority === 'urgent'
}

const SEVERITY_RANK: Record<string, number> = {
  low: 0,
  normal: 1,
  high: 2,
  urgent: 3,
}

/**
 * Build the operator queue from current plan state. Stored ticket metadata is
 * intentionally not consulted, so a client write cannot buy priority routing
 * and a downgrade takes effect on the next read.
 */
export function routeSupportQueue<T extends SupportQueueTicket>(
  tickets: readonly T[],
  plansByOwner: Readonly<Record<string, string | null | undefined>>,
): Array<RoutedSupportTicket<T>> {
  return tickets
    .map((ticket) => ({
      ...ticket,
      supportService: supportServiceForPlan(plansByOwner[ticket.owner_id]),
    }))
    .sort((left, right) => {
      const tierOrder = Number(right.supportService.priorityRouting) - Number(left.supportService.priorityRouting)
      if (tierOrder !== 0) return tierOrder

      const severityOrder = (SEVERITY_RANK[right.priority] ?? 1) - (SEVERITY_RANK[left.priority] ?? 1)
      if (severityOrder !== 0) return severityOrder

      const leftCreated = safeTimestamp(left.created_at)
      const rightCreated = safeTimestamp(right.created_at)
      return leftCreated - rightCreated || left.id.localeCompare(right.id)
    })
}

/**
 * Minimal operator-safe queue projection. The ticket body, owner identity,
 * email, page, and client-controlled metadata never enter Launch Control.
 */
export function projectSupportQueue<T extends SupportQueueTicket & { subject: string }>(
  tickets: readonly RoutedSupportTicket<T>[],
  limit = 12,
): SupportQueueProjection[] {
  const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : 12
  return tickets.slice(0, safeLimit).map((ticket) => ({
    id: ticket.id,
    subject: cleanSubject(ticket.subject),
    severity: normalizeSeverity(ticket.priority),
    createdAt: ticket.created_at,
    serviceTier: ticket.supportService.tier,
    planId: ticket.supportService.planId,
  }))
}

function safeTimestamp(value: string): number {
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER
}

function normalizeSeverity(value: string): IncidentSeverity {
  return value === 'low' || value === 'high' || value === 'urgent' ? value : 'normal'
}

function cleanSubject(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, 160)
}
