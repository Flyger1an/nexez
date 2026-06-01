import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const { url } = await request.json()

  if (!url) {
    return NextResponse.json({ error: 'Website URL is required' }, { status: 400 })
  }

  try {
    let response = await fetch(url, {
      headers: { 'User-Agent': 'Nexez Site Importer Bot/1.0' },
    })

    if (!response.ok) {
      return NextResponse.json({ error: 'Could not fetch the website' }, { status: 400 })
    }

    const html = await response.text()

    const titleMatch = html.match(/<title>(.*?)<\/title>/i)
    const title = titleMatch ? titleMatch[1].trim() : 'Imported Business'

    const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
    const description = descMatch ? descMatch[1] : ''

    let extractedOffers: any[] = []

    // JSON-LD Schema.org
    const jsonLdMatches = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>(.*?)<\/script>/gis) || []
    for (const match of jsonLdMatches) {
      try {
        const json = JSON.parse(match.replace(/<script[^>]*>|<\/script>/gi, ''))
        const items = Array.isArray(json) ? json : [json]
        items.forEach((item: any) => {
          if (item['@type'] === 'Service' || item['@type'] === 'Offer') {
            const name = item.name || item.itemOffered?.name
            const price = item.price || item.offers?.price
            if (name) {
              extractedOffers.push({
                name: String(name).substring(0, 80),
                price: price ? String(price) : 'Custom',
                description: item.description || 'Book this service directly.',
                url: item.url || url
              })
            }
          }
        })
      } catch (e) {}
    }

    // Heuristic fallback
    if (extractedOffers.length < 4) {
      const serviceKeywords = ['book', 'schedule', 'appointment', 'session', 'package', 'pricing', 'starting at', 'from $']
      const headingMatches = html.match(/<(h1|h2|h3|h4)[^>]*>(.*?)<\/\1>/gi) || []
      const listMatches = html.match(/<li[^>]*>(.*?)<\/li>/gi) || []

      const allText = [...headingMatches, ...listMatches]
        .map(tag => tag.replace(/<[^>]+>/g, '').trim())
        .filter(text => text.length > 4 && text.length < 140)

      const potential = allText.filter(text =>
        serviceKeywords.some(kw => text.toLowerCase().includes(kw)) || /\$\d+/.test(text)
      )

      const unique = [...new Set(potential)].slice(0, 10)
      unique.forEach(text => {
        let price = 'Custom'
        let name = text
        const priceMatch = text.match(/\$[\d,]+(?:\.\d{2})?|\$?\d+/i)
        if (priceMatch) {
          price = priceMatch[0]
          name = text.replace(priceMatch[0], '').trim()
        }
        name = name.replace(/^(book|schedule|reserve|get)\s*/i, '').trim()
        extractedOffers.push({
          name: name.substring(0, 80),
          price,
          description: 'Book this service directly.',
          url: url
        })
      })
    }

    if (extractedOffers.length === 0) {
      extractedOffers = [
        { name: 'Main Service', price: 'Starting at $150', description: `Core offering from ${title}.`, url },
        { name: 'Consultation', price: '$75', description: 'Initial discovery call.', url }
      ]
    }

    const servicesText = extractedOffers
      .map(o => `${o.name} | ${o.price} | ${o.description} | ${o.url}`)
      .join('\n')

    return NextResponse.json({
      ok: true,
      suggestedPage: {
        name: title,
        description: description || `Professional services from ${title}.`,
        website_url: url,
        services: servicesText,
      },
      structuredOffers: extractedOffers,
      message: 'Website analyzed. Review and edit the generated offers below.',
    })
  } catch (error: any) {
    console.error('Site import error:', error)
    return NextResponse.json({ 
      error: 'Failed to analyze the website. Please try again or create the page manually.' 
    }, { status: 500 })
  }
}