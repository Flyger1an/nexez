import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { enforceRateLimit } from '../../../../lib/rate-limit'
import {
  normalizePublicIdentifier,
  publicIdentifierSuggestions,
  validatePublicIdentifier,
  type PublicIdentifierNamespace,
} from '../../../../lib/public-identifier'
import { getPublicIdentifierAvailability } from '../../../../lib/server/public-identifier'
import { createClient } from '../../../../utils/supabase/server'

const NAMESPACES = new Set<PublicIdentifierNamespace>(['page_slug', 'storefront_handle'])

function unavailableMessage(reason: string): string {
  if (reason === 'too_short') return 'Use at least 5 characters.'
  if (reason === 'too_long') return 'Use no more than 63 characters.'
  if (reason === 'invalid_format') return 'Use lowercase letters, numbers, and single hyphens only.'
  if (reason === 'reserved') return 'That public name is reserved. Choose another.'
  if (reason === 'taken') return 'That public name is already taken. Try another.'
  return 'That public name is not available.'
}

export async function GET(request: Request) {
  const supabase = createClient(await cookies())
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const limited = await enforceRateLimit(request, 'public-identifier-availability', 60, 60_000, {
    subject: user.id,
  })
  if (limited) return limited

  const url = new URL(request.url)
  const namespace = url.searchParams.get('namespace') as PublicIdentifierNamespace | null
  const raw = url.searchParams.get('value') ?? ''
  const subjectId = url.searchParams.get('subjectId')?.trim() || null
  if (!namespace || !NAMESPACES.has(namespace)) {
    return NextResponse.json({ error: 'Unknown public name type.' }, { status: 400 })
  }

  let current: string | null = null
  if (subjectId) {
    const table = namespace === 'page_slug' ? 'pages' : 'storefronts'
    const field = namespace === 'page_slug' ? 'slug' : 'handle'
    const { data } = await supabase
      .from(table)
      .select(field)
      .eq('id', subjectId)
      .eq('owner_id', user.id)
      .maybeSingle<Record<string, string | null>>()
    if (!data) return NextResponse.json({ error: 'Public name owner not found.' }, { status: 404 })
    current = data[field] ?? null
  }

  const value = normalizePublicIdentifier(raw)
  const validation = validatePublicIdentifier(value, { current })
  if (!validation.ok) {
    return NextResponse.json({
      value,
      available: false,
      reason: validation.issue,
      message: validation.message,
      suggestions: publicIdentifierSuggestions(value),
    })
  }

  try {
    const result = await getPublicIdentifierAvailability({
      namespace,
      identifier: value,
      ownerId: user.id,
      subjectId,
    })
    const candidates = result.available ? [] : publicIdentifierSuggestions(value)
    const checked = await Promise.all(
      candidates.map(async (candidate) => ({
        candidate,
        result: await getPublicIdentifierAvailability({
          namespace,
          identifier: candidate,
          ownerId: user.id,
          subjectId,
        }),
      })),
    )
    return NextResponse.json({
      value,
      available: result.available,
      reason: result.reason,
      message: result.available ? (result.reason === 'owned' ? 'This is your current public name.' : 'Available') : unavailableMessage(result.reason),
      grandfathered: validation.grandfathered,
      suggestions: checked.filter(({ result: item }) => item.available).map(({ candidate }) => candidate),
    })
  } catch {
    return NextResponse.json({ error: 'Public name availability is temporarily unavailable.' }, { status: 503 })
  }
}
