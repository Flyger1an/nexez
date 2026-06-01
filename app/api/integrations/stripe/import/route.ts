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
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json(
      { error: 'Stripe is not configured on this Nexez instance. Add STRIPE_SECRET_KEY to enable imports.' },
      { status: 412 }
    )
  }

  let body: ImportRequest
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' as any })

  const lines: string[] = []
  const meta: any = { importedAt: new Date().toISOString() }

  try {
    if (body.productId) {
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
      return NextResponse.json({ error: 'Provide productId or priceIds' }, { status: 400 })
    }

    return NextResponse.json({
      ok: true,
      lines,
      count: lines.length,
      meta,
      message: 'Copy these lines into the Services or Products field in the builder.',
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
