import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '../../../../utils/supabase/server'
import { enforceRateLimit } from '../../../../lib/rate-limit'

type SupportAssistInput = {
  category?: string
  query?: string
  targetName?: string
  pageSlug?: string
}

export async function POST(request: Request) {
  const limited = enforceRateLimit(request, 'support-assist', 30, 60_000)
  if (limited) return limited

  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  let body: SupportAssistInput
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const query = (body.query || '').trim()
  if (query.length < 8) {
    return NextResponse.json({ error: 'Describe the issue in at least 8 characters.' }, { status: 400 })
  }

  const response = buildSupportResponse({
    category: body.category || 'general',
    query,
    targetName: body.targetName || 'your workspace',
    pageSlug: body.pageSlug,
  })

  return NextResponse.json({
    ok: true,
    source: 'nexez-support-ai',
    confidence: response.confidence,
    summary: response.summary,
    steps: response.steps,
    escalationHint: response.escalationHint,
  })
}

function buildSupportResponse(input: Required<Pick<SupportAssistInput, 'category' | 'query' | 'targetName'>> & { pageSlug?: string }) {
  const q = input.query.toLowerCase()
  const target = input.pageSlug ? `${input.targetName} (/${input.pageSlug})` : input.targetName

  if (input.category === 'agent_visibility' || q.includes('crawl') || q.includes('agent') || q.includes('llms')) {
    return {
      confidence: 82,
      summary: `I’d start by checking the agent-facing files for ${target}. Most visibility issues come from publish status, missing offer detail, or stale discovery files.`,
      steps: [
        'Confirm the page is published and has at least one complete offer.',
        'Open the public page, /llms.txt, and /agent.json to confirm each responds.',
        'Run the Simulator to see whether schema, CTAs, and buyer context are parsed clearly.',
        'If the page was just changed, wait a few minutes and re-test from the public URL.',
      ],
      escalationHint: 'Create a ticket if the files load but the simulator or crawlers still miss key offers.',
    }
  }

  if (input.category === 'integrations' || q.includes('stripe') || q.includes('calendly') || q.includes('webhook')) {
    return {
      confidence: 78,
      summary: `For ${target}, integration issues usually trace back to credentials, webhook URL scope, or an imported offer that needs a re-sync.`,
      steps: [
        'Open Integrations and confirm the provider shows as connected.',
        'Re-sync the source, then review the imported offers in the builder.',
        'For webhooks, send a test event and check the latest response status.',
        'If payments are involved, confirm Stripe secret keys are configured before production checkout.',
      ],
      escalationHint: 'Create a ticket if a provider says connected but imported data or webhook events stay stale.',
    }
  }

  if (input.category === 'billing' || q.includes('plan') || q.includes('invoice') || q.includes('subscription')) {
    return {
      confidence: 74,
      summary: `Billing questions for ${target} should start in the Stripe-hosted billing portal, then move to support if account state looks wrong.`,
      steps: [
        'Open Billing and launch the billing portal.',
        'Confirm the current plan, invoice email, and payment method.',
        'If checkout fails, capture the exact error and time of the attempt.',
        'Do not retry production payments repeatedly if the same error repeats.',
      ],
      escalationHint: 'Create a ticket for invoice corrections, plan mismatch, failed portal access, or repeated checkout errors.',
    }
  }

  if (input.category === 'bug' || q.includes('error') || q.includes('broken') || q.includes('crash')) {
    return {
      confidence: 70,
      summary: `This sounds like a product issue on ${target}. The fastest path is to capture the route, action, and expected result.`,
      steps: [
        'Reload the page once and try the action again.',
        'Note the exact page URL and what you clicked before the issue appeared.',
        'Check whether the issue happens on one page or across the workspace.',
        'Create a ticket with screenshots or console text if the issue repeats.',
      ],
      escalationHint: 'Create a ticket if the same action fails twice or blocks publishing, checkout, imports, or analytics.',
    }
  }

  return {
    confidence: 68,
    summary: `For ${target}, I’d narrow this to the affected page, feature area, and the result you expected.`,
    steps: [
      'Select the exact page or workspace area where the issue appears.',
      'Check whether the page is published, recently edited, or connected to an integration.',
      'Run the closest built-in test: Simulator for parsing, Analytics for events, or Integrations for sync.',
      'If the answer still feels off, create a ticket and Nexez support gets the full context.',
    ],
    escalationHint: 'Create a ticket if the built-in test does not explain the problem or you need account-specific help.',
  }
}
