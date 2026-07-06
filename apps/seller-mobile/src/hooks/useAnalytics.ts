import { getAgentVisits, getCheckoutEvents, getSellerPages } from '@/src/lib/data'
import { getReadinessScore } from '@/src/lib/agent-page'
import { useAsyncData } from './useAsyncData'
import { useSession } from './useSession'

export function useAnalytics() {
  const { user } = useSession()
  return useAsyncData(async () => {
    if (!user) throw new Error('Sign in required.')
    const [pages, visits, events] = await Promise.all([
      getSellerPages(user.id),
      getAgentVisits(user.id),
      getCheckoutEvents(user.id, 500),
    ])
    const agentVisits = visits.filter((visit) => visit.is_ai_agent)
    const typeCounts = new Map<string, number>()
    for (const visit of agentVisits) typeCounts.set(visit.agent_type || 'Unknown agent', (typeCounts.get(visit.agent_type || 'Unknown agent') ?? 0) + 1)
    const pageCounts = new Map<string, number>()
    for (const visit of agentVisits) pageCounts.set(visit.page_id, (pageCounts.get(visit.page_id) ?? 0) + 1)

    return {
      pages,
      visits,
      events,
      agentVisits,
      humanVisits: visits.filter((visit) => !visit.is_ai_agent),
      conversions: events.filter((event) => event.event_type === 'stripe_session_created' && event.metadata?.dry_run !== true),
      topAgentTypes: [...typeCounts.entries()].map(([label, total]) => ({ label, total })).sort((a, b) => b.total - a.total),
      topPages: [...pageCounts.entries()]
        .map(([pageId, total]) => {
          const page = pages.find((item) => item.id === pageId)
          return { pageId, total, name: page?.name || 'Unknown listing', readiness: page ? getReadinessScore(page) : 0 }
        })
        .sort((a, b) => b.total - a.total),
    }
  }, [user?.id])
}
