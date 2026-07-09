import Stripe from 'stripe'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '../../../../../utils/supabase/server'
import { gateIntegrationImport } from '../../../../../lib/server/integration-importers'

/**
 * Stripe Import for Nexez agent pages (lean MVP).
 * Accepts either a product_id or comma-separated price_ids.
 * Returns lines ready to paste into the services/products fields.
 *
 * Security: Only runs if STRIPE_SECRET_KEY is configured server-side.
 * No user tokens stored yet - this is a one-shot import helper.
 */

type ImportRequest = {
  productId?: string
  priceIds?: string | string[]
  mode?: 'prices' | 'product'
}

export async function POST(request: Request) {
  // Require auth + `integrations` (Pro) ON THE EFFECTIVE OWNER. In production this
  // route lists products with the platform STRIPE_SECRET_KEY, so an anonymous caller
  // could otherwise enumerate the platform's Stripe catalog. When a `pageId` is
  // supplied an editor-collaborator may import into the owner's page (gate on the
  // owner's plan); the page-less create flow self-gates. Free/Launch owners build
  // manually or via CSV (free); live Stripe sync is Pro.
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Sign in to import from Stripe.' }, { status: 401 })
  }

  let body: ImportRequest & { stripeSecretKey?: string; pageId?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  // Stripe's fetch/parse stays route-local (it uses the PLATFORM key, not a
  // caller token, so it isn't exposed to the interview's /ingest) — but the
  // authorize step is the shared one.
  const gate = await gateIntegrationImport({
    supabase,
    user,
    pageId: body.pageId,
    proMessage: 'Importing from Stripe is a Pro feature. Upgrade to sync products, or add offers manually / upload a CSV (free).',
  })
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const requestSecret = body.stripeSecretKey?.trim()
  const secret = process.env.STRIPE_SECRET_KEY || (process.env.NODE_ENV !== 'production' ? requestSecret : '')

  if (!secret) {
    return NextResponse.json(
      { error: 'Stripe import is not enabled for this workspace yet. Finish the Stripe connection in Integrations, then try again.' },
      { status: 412 }
    )
  }

  const stripe = new Stripe(secret, { apiVersion: '2024-06-20' as any })

  const lines: string[] = []
  const meta: {
    importedAt: string
    mode?: string
    product?: { id: string; name: string }
    stripe_samples: Array<{ product_id: string; price_id: string }>
  } = { importedAt: new Date().toISOString(), stripe_samples: [] }

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
	          meta.stripe_samples.push({ product_id: product.id, price_id: price.id })
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
	        meta.stripe_samples.push({ product_id: product.id, price_id: price.id })
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
	          meta.stripe_samples.push({ product_id: prod.id, price_id: price.id })
	        } catch (e: any) {
	          lines.push(`Unknown Stripe price ${pid} | Custom | Could not retrieve details (check ID) | `)
	        }
      }
    } else {
      return NextResponse.json({ error: 'Provide productId, priceIds, or leave empty for recent products' }, { status: 400 })
    }

    // Phase 3: Richer structuredOffers for Stripe - stable IDs for the now-active price webhook sync (price.updated mutates offers) + manual re-sync
    const structuredOffers = lines.map((line, idx) => {
      const parts = line.split(' | ').map(p => p.trim())
      const priceStr = parts[1] || 'Custom'
      const isRecurring = /\/ (month|year|week|day)/i.test(priceStr)

	      let duration: string | undefined
      if (isRecurring) {
        if (/month/i.test(priceStr)) duration = 'monthly'
        else if (/year/i.test(priceStr)) duration = 'yearly'
        else if (/week/i.test(priceStr)) duration = 'weekly'
      }

      // Attach real Stripe identifiers when possible (from meta or best-effort)
	      const stripeIds: Record<string, string> = {}
	      const sample = meta.stripe_samples[idx]
	      if (meta.product?.id) stripeIds.stripe_product_id = meta.product.id
	      if (sample?.product_id) stripeIds.stripe_product_id = sample.product_id
	      if (sample?.price_id) stripeIds.stripe_price_id = sample.price_id

	      return {
        name: parts[0] || 'Stripe item',
        description: parts[2] || 'Imported from Stripe',
        price: priceStr,
        url: parts[3] || '',
        duration,
        source: 'stripe',
        confidence: 0.93,
        metadata: {
          stripe_mode: meta.mode || 'specific',
	          imported_at: new Date().toISOString(),
	          ...stripeIds,
	        },
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
    // Never reflect the Stripe SDK message - auth errors embed a redacted form
    // of the PLATFORM secret key, and other messages are an object-ID oracle.
    console.warn('[Stripe Import] failed:', error?.message || error)
    return NextResponse.json(
      {
        error: 'Stripe import failed',
        hint: 'Make sure the IDs are correct and belong to your Stripe account.',
      },
      { status: 500 }
    )
  }
}
