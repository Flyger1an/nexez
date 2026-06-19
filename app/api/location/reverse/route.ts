import { NextResponse } from 'next/server'
import { enforceRateLimit } from '../../../../lib/rate-limit'

export const dynamic = 'force-dynamic'

type NominatimResponse = {
  display_name?: string
  address?: {
    city?: string
    town?: string
    village?: string
    hamlet?: string
    municipality?: string
    suburb?: string
    county?: string
    state?: string
    region?: string
    country?: string
    country_code?: string
    postcode?: string
  }
}

export async function GET(request: Request) {
  const limited = await enforceRateLimit(request, 'location-reverse', 20, 10 * 60_000)
  if (limited) return limited

  const url = new URL(request.url)
  const lat = Number(url.searchParams.get('lat'))
  const lng = Number(url.searchParams.get('lng'))

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return NextResponse.json({ error: 'Valid latitude and longitude are required.' }, { status: 400 })
  }

  try {
    const result = await reverseGeocode(lat, lng)
    if (!result.query) {
      return NextResponse.json({ error: 'Could not resolve that location.' }, { status: 404, headers: { 'Cache-Control': 'no-store' } })
    }
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json(
      { error: 'Location lookup is temporarily unavailable. Enter your city or region manually.' },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}

async function reverseGeocode(lat: number, lng: number) {
  const endpoint = new URL('https://nominatim.openstreetmap.org/reverse')
  endpoint.searchParams.set('format', 'jsonv2')
  endpoint.searchParams.set('lat', String(lat))
  endpoint.searchParams.set('lon', String(lng))
  endpoint.searchParams.set('zoom', '10')
  endpoint.searchParams.set('addressdetails', '1')

  const res = await fetch(endpoint.toString(), {
    headers: {
      'User-Agent': 'Nexez location filter (https://nexez.ai)',
      'Accept-Language': 'en',
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(4500),
  })

  if (!res.ok) throw new Error(`Reverse geocoding failed with ${res.status}`)

  const data = (await res.json()) as NominatimResponse
  const address = data.address ?? {}
  const locality = address.city || address.town || address.village || address.hamlet || address.municipality || address.suburb || address.county || ''
  const region = address.state || address.region || ''
  const countryCode = address.country_code?.toUpperCase() || ''
  const country = address.country || ''
  const query = [locality, region].filter(Boolean).join(', ') || [region, countryCode || country].filter(Boolean).join(', ')
  const label = query || data.display_name?.split(',').slice(0, 3).join(', ').trim() || ''

  return {
    ok: true,
    query: query || label,
    label,
    city: locality || null,
    region: region || null,
    country: country || null,
    country_code: countryCode || null,
    coordinates: { lat, lng },
  }
}
