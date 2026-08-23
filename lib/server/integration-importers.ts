import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '../../utils/supabase/admin'
import { ownerAllows } from './plan'
import { resolveFeatureOwner } from './page-access'
import type { OfferItem } from '../agent-page'
import { mapSquareCatalogToOffers, mapAcuityTypesToOffers } from '../integrations'
import { SHOPIFY_API_VERSION } from './shopify'

// Shared cores behind the integration IMPORT routes (Calendly / Shopify / Square /
// Acuity) so the interview's /ingest can pull the same live catalogs the manual
// importers do - one fetch+parse per provider, one authorize step. Stripe's
// import stays route-local (platform-key semantics + a different response shape).

// ── authorize ───────────────────────────────────────────────────────────────

export type IntegrationGate = { ok: true; ownerId: string } | { ok: false; status: number; error: string }

/**
 * The shared authorize step for every integration import: resolve the EFFECTIVE
 * page owner (editor-collaborator aware via `pageId`, or self-gate when absent)
 * and require the Pro `integrations` capability on that owner. AUTH (cookie vs
 * mobile bearer) is the caller's job - this only does ownership + entitlement,
 * so it's reusable by both the web import routes and the intake threads API.
 * `proMessage` is the exact 402 copy so each caller keeps its own wording.
 */
export async function gateIntegrationImport(opts: {
  supabase: SupabaseClient
  user: { id: string; email?: string | null; email_confirmed_at?: string | null }
  pageId?: string
  proMessage: string
}): Promise<IntegrationGate> {
  const access = await resolveFeatureOwner({
    pageId: opts.pageId,
    userId: opts.user.id,
    userEmail: opts.user.email,
    userEmailConfirmedAt: opts.user.email_confirmed_at,
  })
  if (!access.ok) {
    return {
      ok: false,
      status: access.status,
      error: access.status === 503 ? 'Server is not configured for this action.' : 'You do not have edit access to this page.',
    }
  }
  const db = access.scoped ? createAdminClient() : opts.supabase
  if (!(await ownerAllows(db, access.ownerId, 'integrations'))) {
    return { ok: false, status: 402, error: opts.proMessage }
  }
  return { ok: true, ownerId: access.ownerId }
}

// ── provider cores (fetch + parse → offers) ──────────────────────────────────

export type ProviderOffers =
  // `lines` (the legacy pipe-format array) is only produced + consumed by the
  // Calendly route; every other caller reads `offers` + `note`.
  | { ok: true; offers: OfferItem[]; note: string; lines?: string[]; catalogComplete?: boolean }
  | { ok: false; status: number; error: string; upstreamStatus?: number }

// Calendly's v2 API returns event-type fields at the resource top level
// (uri/name/duration/scheduling_url). An older shape nested them under
// attributes/relationships; normalize both so a real token and the existing
// fixtures both resolve - and so the event-type URI is captured for single-use
// scheduling links.
type CalendlyEventTypeRaw = {
  uri?: string
  name?: string
  duration?: number
  kind?: string
  active?: boolean
  scheduling_url?: string
  resource?: { uri?: string }
  attributes?: { name?: string; slug?: string; duration?: number; kind?: string; active?: boolean }
  relationships?: { scheduling_url?: { href?: string } }
}

type NormalizedEventType = { name: string; duration: number; kind: string; schedulingUrl: string; uri: string }

function normalizeCalendlyEventType(event: CalendlyEventTypeRaw): NormalizedEventType {
  const attrs = event.attributes ?? event
  return {
    name: attrs.name ?? '',
    duration: Number(attrs.duration ?? 0),
    kind: attrs.kind ?? 'solo',
    schedulingUrl: event.relationships?.scheduling_url?.href ?? event.scheduling_url ?? '',
    uri: event.uri ?? event.resource?.uri ?? '',
  }
}

/** Live Calendly event types → bookable offers (moved verbatim from the route). */
export async function importCalendlyOffers(token: string): Promise<ProviderOffers> {
  try {
    const userRes = await fetch('https://api.calendly.com/users/me', {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    })
    if (!userRes.ok) return { ok: false, status: 401, error: 'Invalid Calendly token or API error' }
    const userData = await userRes.json()
    const userUri = userData.resource.uri

    const eventsRes = await fetch(
      `https://api.calendly.com/event_types?user=${encodeURIComponent(userUri)}&active=true`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    if (!eventsRes.ok) {
      // A permission failure is not "no event types" - surface it (status only;
      // the upstream body is never reflected).
      return { ok: false, status: 502, error: 'Calendly rejected the event-types request. Check the token permissions.', upstreamStatus: eventsRes.status }
    }
    const eventsData = await eventsRes.json()
    if (!eventsData.collection || eventsData.collection.length === 0) {
      return { ok: true, offers: [], lines: [], note: 'No active event types found in your Calendly account.' }
    }

    const lines: string[] = []
    const offers: OfferItem[] = []
    for (const raw of eventsData.collection as CalendlyEventTypeRaw[]) {
      const event = normalizeCalendlyEventType(raw)
      const name = event.name
      const durationMinutes = event.duration
      const kind = event.kind === 'solo' ? '1:1' : 'Group'
      const url = event.schedulingUrl
      const price = 'Custom'
      const description = `${kind} call lasting ${durationMinutes} minutes. Book directly via Calendly.`
      lines.push(`${name} | ${price} | ${description} | ${url}`)
      // Stash the event-type URI so checkout can mint a single-use booking link
      // for this exact event type (the reusable scheduling_url stays as fallback).
      const metadata = event.uri ? { calendly_event_type: event.uri } : undefined
      offers.push({ name, description, price, url, duration: `${durationMinutes} min`, source: 'calendly', confidence: 0.92, ...(metadata ? { metadata } : {}) })
    }
    return { ok: true, offers, lines, note: `Imported ${lines.length} Calendly event types as bookable offers.` }
  } catch (error) {
    console.error('Calendly import error:', error)
    return { ok: false, status: 500, error: 'Failed to fetch from Calendly. Please check your token.' }
  }
}

/**
 * Resolve a Shopify store to a strictly-validated *.myshopify.com host. The old
 * substring check let an attacker point the Admin-API call (carrying the caller's
 * token) at any host - pin the authority to a real Shopify subdomain first.
 */
export function resolveShopDomain(shop: string): string | null {
  let host = (shop || '').trim().toLowerCase()
  if (host.includes('://')) {
    try {
      host = new URL(host).hostname
    } catch {
      return null
    }
  }
  host = host.replace(/[/?#].*$/, '') // strip any path/query/fragment
  if (!host.includes('.')) host = `${host}.myshopify.com`
  return /^[a-z0-9][a-z0-9-]{0,59}\.myshopify\.com$/.test(host) ? host : null
}

type ShopifyVariantNode = {
  id: string
  title: string
  price: string
  availableForSale: boolean
  sellableOnlineQuantity: number
}

type ShopifyProductNode = {
  id: string
  title: string
  description: string
  handle: string
  onlineStoreUrl: string | null
  variants: { nodes: ShopifyVariantNode[] }
}

type ShopifyCatalogResponse = {
  data?: {
    shop?: { currencyCode?: string }
    products?: {
      nodes?: ShopifyProductNode[]
      pageInfo?: { hasNextPage?: boolean; endCursor?: string | null }
    }
  }
  errors?: Array<{ message?: string }>
}

const SHOPIFY_PRODUCTS_QUERY = `
  query NexezProducts($first: Int!, $after: String, $query: String!) {
    shop { currencyCode }
    products(first: $first, after: $after, query: $query, sortKey: TITLE) {
      nodes {
        id
        title
        description
        handle
        onlineStoreUrl
        variants(first: 50) {
          nodes {
            id
            title
            price
            availableForSale
            sellableOnlineQuantity
          }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`

function formatShopifyMoney(amount: string, currencyCode: string): string {
  const value = Number(amount)
  if (!Number.isFinite(value)) return 'See options'
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currencyCode,
    }).format(value)
  } catch {
    return `${amount} ${currencyCode}`
  }
}

function shopifyProductToOffer(product: ShopifyProductNode, shopDomain: string, currencyCode: string): OfferItem {
  const variants = Array.isArray(product.variants?.nodes) ? product.variants.nodes : []
  const priced = variants
    .map((variant) => ({ variant, amount: Number(variant.price) }))
    .filter((entry) => Number.isFinite(entry.amount))
    .sort((a, b) => a.amount - b.amount)
  const min = priced[0]
  const max = priced[priced.length - 1]
  const price = min
    ? `${max && max.amount !== min.amount ? 'From ' : ''}${formatShopifyMoney(min.variant.price, currencyCode)}`
    : 'See options'
  const availableCount = variants.filter((variant) => variant.availableForSale).length
  const availability: OfferItem['availability'] =
    variants.length > 0 && availableCount === 0 ? 'sold_out' : availableCount < variants.length ? 'limited' : 'available'
  const tiers = variants.length > 1
    ? variants.slice(0, 10).map((variant) => ({
        name: variant.title || 'Option',
        price: formatShopifyMoney(variant.price, currencyCode),
      }))
    : undefined
  const primaryVariant = priced.find((entry) => entry.variant.availableForSale)?.variant ?? min?.variant ?? variants[0]

  return {
    name: product.title,
    description: (product.description || 'Shopify product').replace(/\s+/g, ' ').trim().slice(0, 280),
    price,
    url: product.onlineStoreUrl || `https://${shopDomain}/products/${encodeURIComponent(product.handle)}`,
    source: 'shopify',
    confidence: 0.98,
    availability,
    tiers,
    prefer_original_for_this: true,
    metadata: {
      shopify_product_id: product.id,
      shopify_variant_id: primaryVariant?.id ?? null,
      shopify_currency: currencyCode.toLowerCase(),
      shopify_shop: shopDomain,
      shopify_sellable_quantity: variants.reduce((sum, variant) => sum + Math.max(0, Number(variant.sellableOnlineQuantity) || 0), 0),
      commerce_provider: 'shopify',
    },
  }
}

/** Live Shopify GraphQL Admin catalog → published, agent-readable offers. */
export async function importShopifyOffers(opts: { shop: string; accessToken: string; limit?: number }): Promise<ProviderOffers> {
  const shopDomain = resolveShopDomain(opts.shop)
  if (!shopDomain) return { ok: false, status: 400, error: 'Invalid Shopify store domain (expected your-store.myshopify.com).' }
  const safeLimit = Math.min(Math.max(1, Number(opts.limit) || 50), 250)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 12_000)
  try {
    const offers: OfferItem[] = []
    let after: string | null = null
    let currencyCode = 'USD'
    let catalogComplete = false

    while (offers.length < safeLimit) {
      const first = Math.min(50, safeLimit - offers.length)
      const res = await fetch(`https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
        method: 'POST',
        headers: { 'X-Shopify-Access-Token': opts.accessToken, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          query: SHOPIFY_PRODUCTS_QUERY,
          variables: { first, after, query: 'status:active published_status:published' },
        }),
        // The token must never follow a redirect off *.myshopify.com.
        redirect: 'error',
        signal: controller.signal,
      })
      if (!res.ok) {
        // Never reflect the upstream body (a read-SSRF exfil channel) - status only.
        return { ok: false, status: 502, error: 'Failed to fetch from Shopify', upstreamStatus: res.status }
      }
      const json = (await res.json()) as ShopifyCatalogResponse
      if (json.errors?.length || !json.data?.products) {
        return { ok: false, status: 502, error: 'Shopify rejected the catalog query.' }
      }
      currencyCode = String(json.data.shop?.currencyCode || currencyCode).toUpperCase()
      const nodes = Array.isArray(json.data.products.nodes) ? json.data.products.nodes : []
      offers.push(...nodes.slice(0, safeLimit - offers.length).map((product) => shopifyProductToOffer(product, shopDomain, currencyCode)))
      const pageInfo = json.data.products.pageInfo
      if (!pageInfo?.hasNextPage) {
        catalogComplete = true
        break
      }
      if (!pageInfo.endCursor || nodes.length === 0) {
        return { ok: false, status: 502, error: 'Shopify returned incomplete catalog pagination.' }
      }
      after = pageInfo.endCursor
    }
    return {
      ok: true,
      offers,
      catalogComplete,
      note: `${catalogComplete ? 'Imported' : 'Imported the first'} ${offers.length} active storefront products from Shopify in ${currencyCode}.`,
    }
  } catch (error) {
    console.error('Shopify import error:', error)
    return { ok: false, status: 500, error: 'Shopify import failed' }
  } finally {
    clearTimeout(timer)
  }
}

/** Live Square catalog → offers, or null (moved verbatim from the route). The
 *  routes keep their own sample fallback when this is null. */
export async function fetchSquareCatalog(accessToken: string): Promise<OfferItem[] | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 9000)
  try {
    const res = await fetch('https://connect.squareup.com/v2/catalog/list?types=ITEM', {
      headers: { Authorization: `Bearer ${accessToken}`, 'Square-Version': '2024-06-04', Accept: 'application/json' },
      signal: controller.signal,
    })
    if (!res.ok) return null
    const data = await res.json()
    const offers = mapSquareCatalogToOffers(Array.isArray(data?.objects) ? data.objects : [])
    return offers.length ? offers : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** Live Acuity appointment types → offers, or null (moved verbatim from the route). */
export async function fetchAcuityTypes(userId: string, apiKey: string): Promise<OfferItem[] | null> {
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

// ── uniform dispatcher (for intake /ingest) ──────────────────────────────────

/** Providers the interview can ingest from - each pulls the seller's OWN live
 *  catalog with a caller-supplied credential (never the platform's). Stripe is
 *  excluded (its import uses the platform key). */
export type IntegrationIngestInput =
  | { provider: 'calendly'; token: string }
  | { provider: 'shopify'; shop: string; accessToken: string; limit?: number }
  | { provider: 'square'; accessToken: string }
  | { provider: 'acuity'; userId: string; apiKey: string }

export const INGESTABLE_PROVIDERS = ['calendly', 'shopify', 'square', 'acuity'] as const

/**
 * One entry point that returns REAL live offers or a clear error - NEVER sample
 * data (the interview must not fold invented offers into a draft; that's the
 * invention firewall). Square/Acuity: a null/empty live result becomes an error
 * so the interviewer asks instead of pretending it connected.
 */
export async function importIntegrationOffers(input: IntegrationIngestInput): Promise<ProviderOffers> {
  switch (input.provider) {
    case 'calendly':
      return importCalendlyOffers(input.token)
    case 'shopify':
      return importShopifyOffers({ shop: input.shop, accessToken: input.accessToken, limit: input.limit })
    case 'square': {
      const offers = await fetchSquareCatalog(input.accessToken)
      if (!offers?.length) return { ok: false, status: 502, error: 'Could not reach Square (check the access token and Catalog read permission).' }
      return { ok: true, offers, note: `Imported ${offers.length} item(s) from your Square catalog.` }
    }
    case 'acuity': {
      const offers = await fetchAcuityTypes(input.userId, input.apiKey)
      if (!offers?.length) return { ok: false, status: 502, error: 'Could not reach Acuity (check the User ID and API key).' }
      return { ok: true, offers, note: `Imported ${offers.length} appointment type(s) from Acuity.` }
    }
  }
}
