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
  const hasVerifiedWebsite = pages.some((p) => Boolean(p.website_verified_at))
  const hasCustomDomain = pages.some((p) => Boolean(p.custom_domain_verified))

  return [
    {
      id: 'create',
      title: 'Create your first listing',
      description: 'Talk it through with the intake interview, import your site, or start from a template.',
      href: '/create',
      cta: 'Create listing',
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
      title: 'Publish a listing',
      description: 'Make it live and crawlable by AI agents (GPTBot, ClaudeBot, Perplexity…).',
      href: editorHref,
      cta: 'Publish',
      done: hasPublished,
    },
    {
      id: 'website',
      title: 'Verify your existing website',
      description: 'Prove you own your site and get the copy-paste Agent-Ready Kit - make the site you already have agent-legible.',
      href: settingsHref,
      cta: 'Verify website',
      done: hasVerifiedWebsite,
    },
    {
      id: 'domain',
      title: 'Connect a custom domain',
      description: 'Host your listing on your own brand domain, white-labeled.',
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
