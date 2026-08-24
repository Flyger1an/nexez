// Derive in-app notifications from current dashboard state. Pure + tested.
// (Outbound webhooks already fire on real booking events; email is gated on a
// provider. This powers the dashboard notifications panel.)
import { AgentPage } from './agent-page'
import {
  commerceAttentionIsIncomplete,
  type CommerceAttentionSummary,
} from './commerce-attention'
import { isStale } from './freshness'

export type Notification = {
  id: string
  severity: 'action' | 'info'
  message: string
  cta: string
  href: string
}

export function buildNotifications(input: {
  pages: AgentPage[]
  commerceAttention: CommerceAttentionSummary | null
}): Notification[] {
  const notifications: Notification[] = []
  const { pages, commerceAttention } = input

  if (commerceAttention?.status === 'unavailable') {
    notifications.push({
      id: 'commerce-attention',
      severity: 'action',
      message: 'Commerce actions could not be checked from the available sources',
      cta: 'Review Commerce',
      href: commerceAttention.href,
    })
  } else if (commerceAttention && !commerceAttention.visibleCount && commerceAttentionIsIncomplete(commerceAttention)) {
    notifications.push({
      id: 'commerce-attention',
      severity: 'action',
      message: 'Commerce action coverage is incomplete, additional records may require attention',
      cta: 'Open queue',
      href: '/dashboard/commerce',
    })
  } else if (commerceAttention && (
    commerceAttention.visibleCount > 0 || commerceAttentionIsIncomplete(commerceAttention)
  )) {
    const incomplete = commerceAttentionIsIncomplete(commerceAttention)
    const visibleLabel = `${commerceAttention.visibleCount}${incomplete ? '+' : ''}`
    const urgentLabel = commerceAttention.urgentCount
      ? `, ${commerceAttention.urgentCount} urgent`
      : ''
    const singular = commerceAttention.visibleCount === 1 && !incomplete
    notifications.push({
      id: 'commerce-attention',
      severity: 'action',
      message: `${visibleLabel} commerce record${singular ? '' : 's'} need${singular ? 's' : ''} your attention${urgentLabel}`,
      cta: commerceAttention.href === '/dashboard/commerce' ? 'Open queue' : 'Review action',
      href: commerceAttention.href,
    })
  }

  const stale = pages.filter((p) => isStale(p as Parameters<typeof isStale>[0]) && (p as { website_url?: string }).website_url)
  if (stale.length > 0) {
    notifications.push({
      id: 'stale',
      severity: 'action',
      message: `${stale.length} published listing${stale.length === 1 ? '' : 's'} may be stale - consider re-syncing`,
      cta: 'Review',
      href: stale[0]?.id ? `/dashboard/${stale[0].id}/settings` : '/dashboard',
    })
  }

  const unpublishedWithOffers = pages.filter(
    (p) => !p.is_published && ((p.services?.length ?? 0) + (p.products?.length ?? 0) > 0),
  )
  if (unpublishedWithOffers.length > 0) {
    notifications.push({
      id: 'unpublished',
      severity: 'info',
      message: `${unpublishedWithOffers.length} listing${unpublishedWithOffers.length === 1 ? '' : 's'} with offers ${unpublishedWithOffers.length === 1 ? 'is' : 'are'} still in draft`,
      cta: 'Publish',
      href: unpublishedWithOffers[0]?.id ? `/dashboard/${unpublishedWithOffers[0].id}` : '/dashboard',
    })
  }

  return notifications
}
