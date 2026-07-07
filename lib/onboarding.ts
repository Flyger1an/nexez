// Activation onboarding: derive a getting-started checklist from the user's
// actual pages. Pure + tested so the dashboard UI and tests share one source.
import { AgentPage, getOfferCount } from './agent-page'

export type OnboardingStep = {
  id: string
  title: string
  description: string
  href: string
  cta: string
  done: boolean
}

export type OnboardingExtras = {
  /** True when an intake interview reached handed_off (spec §8) - the
   *  conversational path to a created page. */
  interviewCompleted?: boolean
}

export function getOnboardingSteps(pages: AgentPage[], extras: OnboardingExtras = {}): OnboardingStep[] {
  const firstId = pages[0]?.id
  const editorHref = firstId ? `/dashboard/${firstId}` : '/create'
  const settingsHref = firstId ? `/dashboard/${firstId}/settings` : '/create'

  const hasPage = pages.length > 0
  const hasOffers = pages.some((p) => getOfferCount(p) > 0)
  const hasPublished = pages.some((p) => p.is_published)
  const hasCustomDomain = pages.some((p) => Boolean(p.custom_domain_verified))

  return [
    {
      id: 'create',
      title: 'Create your first agent page',
      description: 'Talk it through with the intake interview, import your site, or start from a template.',
      href: '/create',
      cta: 'Create page',
      done: hasPage || Boolean(extras.interviewCompleted),
    },
    {
      id: 'offers',
      title: 'Add your offers',
      description: 'List the services or products agents can understand and transact.',
      href: editorHref,
      cta: 'Add offers',
      done: hasOffers,
    },
    {
      id: 'publish',
      title: 'Publish a page',
      description: 'Make it live and crawlable by AI agents (GPTBot, ClaudeBot, Perplexity…).',
      href: editorHref,
      cta: 'Publish',
      done: hasPublished,
    },
    {
      id: 'domain',
      title: 'Connect a custom domain',
      description: 'Host your agent page on your own brand domain, white-labeled.',
      href: settingsHref,
      cta: 'Connect domain',
      done: hasCustomDomain,
    },
  ]
}

export function onboardingProgress(steps: OnboardingStep[]): {
  done: number
  total: number
  percent: number
  complete: boolean
} {
  const done = steps.filter((s) => s.done).length
  const total = steps.length
  const percent = total ? Math.round((done / total) * 100) : 0
  return { done, total, percent, complete: done === total }
}
