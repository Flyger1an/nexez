// Derive in-app notifications from current dashboard state. Pure + tested.
// (Outbound webhooks already fire on real booking events; email is gated on a
// provider. This powers the dashboard notifications panel.)
import { AgentPage } from './agent-page'
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
  openNegotiations: number
}): Notification[] {
  const notifications: Notification[] = []
  const { pages, openNegotiations } = input

  if (openNegotiations > 0) {
    notifications.push({
      id: 'negotiations',
      severity: 'action',
      message: `${openNegotiations} negotiation${openNegotiations === 1 ? '' : 's'} need${openNegotiations === 1 ? 's' : ''} your response`,
      cta: 'Open inbox',
      href: '/dashboard/negotiations',
    })
  }

  const stale = pages.filter((p) => isStale(p as Parameters<typeof isStale>[0]) && (p as { website_url?: string }).website_url)
  if (stale.length > 0) {
    notifications.push({
      id: 'stale',
      severity: 'action',
      message: `${stale.length} published page${stale.length === 1 ? '' : 's'} may be stale — consider re-syncing`,
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
      message: `${unpublishedWithOffers.length} page${unpublishedWithOffers.length === 1 ? '' : 's'} with offers ${unpublishedWithOffers.length === 1 ? 'is' : 'are'} still in draft`,
      cta: 'Publish',
      href: unpublishedWithOffers[0]?.id ? `/dashboard/${unpublishedWithOffers[0].id}` : '/dashboard',
    })
  }

  return notifications
}
