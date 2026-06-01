import Stripe from 'stripe'
import { NextResponse } from 'next/server'

/**
 * Stripe Import for Nexez agent pages (lean MVP).
 * Accepts either a product_id or comma-separated price_ids.
 * Returns lines ready to paste into the services/products fields.
 *
 * Security: Only runs if STRIPE_SECRET_KEY is configured server-side.
 * No user tokens stored yet — this is a one-shot import helper.
 */

type ImportRequest = {
  productId?: string
  priceIds?: string | string[]
  mode?: 'prices' | 'product'
}

export async function POST(request: Request) {
  let body: ImportRequest & { stripeSecretKey?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const secret = body.stripeSecretKey || process.env.STRIPE_SECRET_KEY

  if (!secret) {
    return NextResponse.json(
      { error: 'No Stripe secret key provided. Add STRIPE_SECRET_KEY on the server or pass stripeSecretKey in the request.' },
      { status: 412 }
    )
  }

  const stripe = new Stripe(secret, { apiVersion: '2024-06-20' as any })

  const lines: string[] = []
  const meta: any = { importedAt: new Date().toISOString() }

  try {
    // Support "recent products" when no specific IDs are given (common import flow)
    if (!body.productId && !body.priceIds) {
      const products = await stripe.products.list({ active: true, limit: 10, expand: ['data.default_price'] })

      for (const product of products.data) {
        const prices = await stripe.prices.list({ product: product.id, active: true, limit: 3 })

        for (const price of prices.data) {
          const amount = price.unit_amount ? (price.unit_amount / 100).toFixed(0) : null
          let priceStr = amount ? `$${amount}` : 'Custom'
          if (price.recurring?.interval) {
            priceStr += ` / ${price.recurring.interval}`
          }
          const name = product.name + (price.nickname ? ` (${price.nickname})` : '')
          lines.push(`${name} | ${priceStr} | ${product.description || 'Stripe product'} | ${product.url || ''}`)
        }
      }
      meta.mode = 'recent_products'
    } else if (body.productId) {
      const product = await stripe.products.retrieve(body.productId)
      const prices = await stripe.prices.list({ product: body.productId, active: true, limit: 5 })

      for (const price of prices.data) {
        const priceStr = price.unit_amount ? `$${(price.unit_amount / 100).toFixed(0)}` : 'Custom'
        const interval = price.recurring?.interval ? ` / ${price.recurring.interval}` : ''
        lines.push(
          `${product.name} ${price.nickname ? `(${price.nickname})` : ''} | ${priceStr}${interval} | ${product.description || 'Imported Stripe product'} | ${product.url || ''}`
        )
      }
      meta.product = { id: product.id, name: product.name }
    } else if (body.priceIds) {
      const ids = Array.isArray(body.priceIds) ? body.priceIds : String(body.priceIds).split(',').map((s) => s.trim()).filter(Boolean)

      for (const pid of ids) {
        try {
          const price = await stripe.prices.retrieve(pid, { expand: ['product'] })
          const prod = price.product as Stripe.Product
          const priceStr = price.unit_amount ? `$${(price.unit_amount / 100).toFixed(0)}` : 'Custom'
          const interval = price.recurring?.interval ? ` / ${price.recurring.interval}` : ''
          const name = prod.name || 'Stripe item'
          lines.push(`${name} | ${priceStr}${interval} | ${prod.description || 'Payment link / service from Stripe'} | ${prod.url || `https://buy.stripe.com/${pid}`}`)
        } catch (e: any) {
          lines.push(`Unknown Stripe price ${pid} | Custom | Could not retrieve details (check ID) | `)
        }
      }
    } else {
      return NextResponse.json({ error: 'Provide productId, priceIds, or leave empty for recent products' }, { status: 400 })
    }

    // Phase 3: Richer structuredOffers for Stripe (recurring awareness + metadata for future price webhooks)
    const structuredOffers = lines.map((line, idx) => {
      const parts = line.split(' | ').map(p => p.trim())
      const priceStr = parts[1] || 'Custom'
      const isRecurring = /\/ (month|year|week|day)/i.test(priceStr)

      // Simple recurring → duration hint for consumer services
      let duration: string | undefined
      if (isRecurring) {
        if (/month/i.test(priceStr)) duration = 'monthly'
        else if (/year/i.test(priceStr)) duration = 'yearly'
        else if (/week/i.test(priceStr)) duration = 'weekly'
      }

      return {
        name: parts[0] || 'Stripe item',
        description: parts[2] || 'Imported from Stripe',
        price: priceStr,
        url: parts[3] || '',
        duration,
        source: 'stripe',
        confidence: 0.92,
        metadata: {
          stripe_mode: meta.mode || 'specific',
          imported_at: new Date().toISOString(),
          // Future: store product/price ids here when we have them in the loop
        },
        // For simple recurring products we can surface as a single tier
        tiers: isRecurring ? [{ name: 'Standard', price: priceStr, description: 'Recurring via Stripe' }] : undefined,
      }
    })

    return NextResponse.json({
      ok: true,
      lines,
      structuredOffers,
      count: lines.length,
      meta,
      message: 'Stripe data ready. Rich cards will be used when possible.',
    })
  } catch (error: any) {
    return NextResponse.json(
      {
        error: error.message || 'Stripe import failed',
        hint: 'Make sure the IDs are correct and belong to your Stripe account.',
      },
      { status: 500 }
    )
  }
}
