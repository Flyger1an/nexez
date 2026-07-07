import { NextResponse } from 'next/server'
import { supabase } from '../../../../lib/supabase'
import { enforceRateLimit } from '../../../../lib/rate-limit'
import { getPagePrivateMeta } from '../../../../lib/server/page-private-meta'

type ClickPayload = {
  slug?: string
  href?: string
  action?: string
  surface?: string
  offerKey?: string
  offerName?: string
  offerKind?: 'services' | 'products'
  query?: string | null
}

const allowedActions = new Set(['public_page', 'agent_json', 'checkout', 'analyze', 'favorite', 'similar_page', 'storefront'])
const allowedSurfaces = new Set(['directory', 'marketplace'])

export async function POST(request: Request) {
  // Unauthenticated metric write - cap it so it can't be used to mass-forge a
  // page's discovery-click analytics (red-team gauntlet finding).
  const limited = await enforceRateLimit(request, 'directory-click', 30, 60_000)
  if (limited) return limited

  const payload = await readPayload(request)
  const slug = payload.slug?.trim()

  if (!slug) {
    return NextResponse.json({ error: 'slug is required' }, { status: 400 })
  }

  const action = allowedActions.has(payload.action || '') ? payload.action! : 'public_page'
  const surface = allowedSurfaces.has(payload.surface || '') ? payload.surface! : 'directory'
  const offerKind = payload.offerKind === 'products' ? 'products' : 'services'

  const { data: page, error: pageError } = await supabase
    .from('pages_public')
    .select('id, slug, name, is_published')
    .eq('slug', slug)
    .eq('is_published', true)
    .single()

  if (pageError || !page) {
    return NextResponse.json({ error: 'Published page not found.' }, { status: 404 })
  }
  const privateMeta = await getPagePrivateMeta(page.id)

  const { error } = await supabase.from('checkout_events').insert({
    page_id: page.id,
    owner_id: privateMeta.ownerId,
    slug: page.slug,
    offer_key: payload.offerKey || 'page',
    offer_name: payload.offerName || page.name,
    offer_kind: offerKind,
    event_type: 'directory_click',
    agent_user_agent: request.headers.get('user-agent'),
    referrer: request.headers.get('referer'),
    query: payload.query || null,
    checkout_url: payload.href || null,
    provider_url: null,
    metadata: {
      surface,
      action,
      href: payload.href || null,
      source: 'directory_discovery',
    },
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, event_type: 'directory_click', surface, action })
}

async function readPayload(request: Request): Promise<ClickPayload> {
  const raw = await request.text()
  if (!raw) return {}

  try {
    return JSON.parse(raw) as ClickPayload
  } catch {
    return {}
  }
}
