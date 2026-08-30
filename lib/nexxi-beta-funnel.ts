export const NEXXI_BETA_MILESTONES = [
  'appOpened',
  'onboardingCompleted',
  'agentTurnCompleted',
  'checkoutStarted',
  'liveTransactionCompleted',
] as const

export type NexxiBetaMilestone = (typeof NEXXI_BETA_MILESTONES)[number]

export type NexxiBetaEventRow = {
  user_id: string
  event_name: string
  created_at: string
  app_version?: string | null
  build_version?: string | null
}

export type NexxiBetaOrderRow = {
  buyer_reference: string | null
  status: string
  stripe_livemode: boolean
  created_at: string
}

export type NexxiBetaFunnelStep = {
  key: NexxiBetaMilestone
  label: string
  users: number
  conversionFromPrevious: number | null
}

const LABELS: Record<NexxiBetaMilestone, string> = {
  appOpened: 'Opened beta app',
  onboardingCompleted: 'Completed onboarding',
  agentTurnCompleted: 'Completed an agent turn',
  checkoutStarted: 'Started checkout',
  liveTransactionCompleted: 'Completed a live transaction',
}

function idsForEvent(events: NexxiBetaEventRow[], name: string) {
  return new Set(events.filter((event) => event.event_name === name).map((event) => event.user_id))
}

function intersect(previous: Set<string>, current: Set<string>) {
  return new Set([...previous].filter((userId) => current.has(userId)))
}

export function summarizeNexxiBetaFunnel(
  events: NexxiBetaEventRow[],
  orders: NexxiBetaOrderRow[],
): NexxiBetaFunnelStep[] {
  const opened = idsForEvent(events, 'app_opened')
  const onboarded = intersect(opened, idsForEvent(events, 'onboarding_completed'))
  const turned = intersect(onboarded, idsForEvent(events, 'agent_turn_completed'))
  const checkout = intersect(turned, idsForEvent(events, 'checkout_started'))
  const paidUsers = new Set(
    orders
      .filter((order) => order.stripe_livemode && ['paid', 'complete', 'completed'].includes(order.status.toLowerCase()))
      .map((order) => order.buyer_reference)
      .filter((value): value is string => Boolean(value)),
  )
  const paid = intersect(checkout, paidUsers)
  const sets: Record<NexxiBetaMilestone, Set<string>> = {
    appOpened: opened,
    onboardingCompleted: onboarded,
    agentTurnCompleted: turned,
    checkoutStarted: checkout,
    liveTransactionCompleted: paid,
  }

  return NEXXI_BETA_MILESTONES.map((key, index) => {
    const users = sets[key].size
    const previous = index > 0 ? sets[NEXXI_BETA_MILESTONES[index - 1]!].size : null
    return {
      key,
      label: LABELS[key],
      users,
      conversionFromPrevious: previous == null ? null : previous === 0 ? 0 : users / previous,
    }
  })
}
