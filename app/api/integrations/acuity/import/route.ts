import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '../../../../../utils/supabase/server'
import { createAdminClient } from '../../../../../utils/supabase/admin'
import { ownerAllows } from '../../../../../lib/server/plan'
import { resolveFeatureOwner } from '../../../../../lib/server/page-access'
import { formatOfferLines, type OfferItem } from '../../../../../lib/agent-page'
import { mapAcuityTypesToOffers } from '../../../../../lib/integrations'

/**
 * Acuity Scheduling integration (Phase 3 consumer track).
 *
 * Real path: POST { userId, apiKey } → live Acuity API
 * (GET /api/v1/appointment-types, HTTP Basic auth) mapped to rich OfferItem[].
 * Falls back to sample data when credentials are absent or the call fails.
 */

type AcuityImportRequest = {
  userId?: string
  apiKey?: string
  pageId?: string        // when importing INTO an existing page (collaboration)
}

async function fetchAcuityTypes(userId: string, apiKey: string): Promise<OfferItem[] | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 9000)
  try {
    const auth = Buffer.from(`${userId}:${apiKey}`).toString('base64')
    const res = await fetch('https://acuityscheduling.com/api/v1/appointment-types', {
      headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
      signal: controller.signal,
    })
    if (!res.ok) return null
    const data = await res.json()
    const offers = mapAcuityTypesToOffers(Array.isArray(data) ? data : [])
    return offers.length ? offers : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

function sampleOffers(): OfferItem[] {
  return [
    {
      name: 'Discovery Call (30 min)',
      description: 'Free initial call to explore fit for a coaching or consulting engagement.',
      price: '$0',
      url: '',
      duration: '30 min',
      source: 'acuity',
      confidence: 0.95,
    },
    {
      name: 'Strategy Session',
      description: 'Deep-dive strategy session for business or personal development goals.',
      price: '$250',
      url: '',
      duration: '90 min',
      source: 'acuity',
      confidence: 0.93,
    },
    {
      name: 'Personal Training (In Studio)',
      description: 'One-on-one personal training session tailored to your goals.',
      price: '$85',
      url: '',
      duration: '60 min',
      serviceArea: 'Studio only',
      isMobile: false,
      source: 'acuity',
      confidence: 0.91,
      tiers: [
        { name: 'Single Session', price: '$85' },
        { name: '5-Pack', price: '$375', description: '$75 per session' },
      ],
    },
  ]
}

export async function POST(request: Request) {
  // Require auth + `integrations` (Pro) ON THE EFFECTIVE OWNER: authenticated outbound
  // call with a caller-supplied API key - not anonymously abusable, and live sync is
  // Pro. A `pageId` lets an editor-collaborator import into the owner's page (gate on
  // the owner's plan); the page-less create flow self-gates.
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Sign in to import from Acuity.' }, { status: 401 })
  }

  let body: AcuityImportRequest
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const access = await resolveFeatureOwner({
    pageId: body.pageId,
    userId: user.id,
    userEmail: user.email,
    userEmailConfirmedAt: user.email_confirmed_at,
  })
  if (!access.ok) {
    return NextResponse.json(
      { error: access.status === 503 ? 'Server is not configured for this action.' : 'You do not have edit access to this page.' },
      { status: access.status },
    )
  }
  if (!(await ownerAllows(access.scoped ? createAdminClient() : supabase, access.ownerId, 'integrations'))) {
    return NextResponse.json(
      { error: 'Connecting Acuity is a Pro feature. Upgrade to sync appointment types, or add offers manually / upload a CSV (free).' },
      { status: 402 },
    )
  }

  const userId = (body?.userId || '').trim()
  const apiKey = (body?.apiKey || '').trim()

  if (userId && apiKey) {
    const live = await fetchAcuityTypes(userId, apiKey)
    if (live && live.length) {
      return NextResponse.json({
        success: true,
        source: 'acuity',
        connected: true,
        structuredOffers: live,
        lines: formatOfferLines(live),
        note: `Imported ${live.length} appointment type(s) live from Acuity.`,
      })
    }
  }

  const offers = sampleOffers()
  return NextResponse.json({
    success: true,
    source: 'acuity',
    connected: false,
    structuredOffers: offers,
    lines: formatOfferLines(offers),
    note:
      userId && apiKey
        ? 'Could not reach Acuity (check the User ID and API key). Showing sample data.'
        : 'Sample Acuity appointment types. POST { userId, apiKey } to import live.',
  })
}

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    message: 'Acuity import. POST { userId, apiKey } to sync live appointment types, or POST {} for sample data.',
  })
}
