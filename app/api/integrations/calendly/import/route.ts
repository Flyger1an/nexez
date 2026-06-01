import { NextResponse } from 'next/server'

/**
 * Calendly Integration for Nexez
 * Allows users to import their booking/event types as structured offers.
 *
 * Flow (lean MVP):
 * 1. User generates a Personal Access Token in Calendly (https://calendly.com/integrations/api_webhooks)
 * 2. They paste it here.
 * 3. We fetch their event types and return them as offer lines.
 */

type CalendlyEventType = {
  attributes: {
    name: string
    slug: string
    duration: number
    kind: string
    active: boolean
  }
  relationships: {
    scheduling_url: { href: string }
  }
}

export async function POST(request: Request) {
  const { token } = await request.json()

  if (!token) {
    return NextResponse.json({ error: 'Calendly Personal Access Token is required' }, { status: 400 })
  }

  try {
    // Fetch current user to get their URI
    const userRes = await fetch('https://api.calendly.com/users/me', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    })

    if (!userRes.ok) {
      return NextResponse.json({ error: 'Invalid Calendly token or API error' }, { status: 401 })
    }

    const userData = await userRes.json()
    const userUri = userData.resource.uri

    // Fetch event types
    const eventsRes = await fetch(`https://api.calendly.com/event_types?user=${encodeURIComponent(userUri)}&active=true`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    })

    const eventsData = await eventsRes.json()

    if (!eventsData.collection || eventsData.collection.length === 0) {
      return NextResponse.json({ 
        lines: [], 
        message: 'No active event types found in your Calendly account.' 
      })
    }

    const lines: string[] = []

    for (const event of eventsData.collection as CalendlyEventType[]) {
      const name = event.attributes.name
      const duration = event.attributes.duration
      const kind = event.attributes.kind === 'solo' ? '1:1' : 'Group'
      const url = event.relationships.scheduling_url?.href || ''

      const price = 'Custom' // Calendly doesn't expose price via basic API
      const description = `${kind} call lasting ${duration} minutes. Book directly via Calendly.`

      lines.push(`${name} | ${price} | ${description} | ${url}`)
    }

    return NextResponse.json({
      ok: true,
      count: lines.length,
      lines,
      message: `Imported ${lines.length} Calendly event types as bookable offers.`,
    })

  } catch (error: any) {
    console.error('Calendly import error:', error)
    return NextResponse.json({ 
      error: 'Failed to fetch from Calendly. Please check your token.' 
    }, { status: 500 })
  }
}
