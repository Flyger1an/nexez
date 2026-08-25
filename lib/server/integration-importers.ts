import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '../../utils/supabase/admin'
import { ownerAllows } from './plan'
import { resolveFeatureOwner } from './page-access'
import type { OfferItem } from '../agent-page'
import { mapSquareCatalogToOffers, mapAcuityTypesToOffers } from '../integrations'
import { SHOPIFY_API_VERSION } from './shopify'
import {
  resolvedWooCommerceSiteError,
  SQUARE_API_VERSION,
  squareApiBaseUrl,
  type WooCommerceCredential,
} from './merchant-connectors'

const PROVIDER_READ_ATTEMPTS = 2
const PROVIDER_RETRY_BASE_MS = 100
const RETRYABLE_PROVIDER_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504])

function providerRetryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers?.get?.('retry-after')
  const seconds = Number(retryAfter)
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(1_000, Math.max(PROVIDER_RETRY_BASE_MS, seconds * 1_000))
  }
  const retryAt = retryAfter ? Date.parse(retryAfter) : Number.NaN
  if (Number.isFinite(retryAt)) {
    return Math.min(1_000, Math.max(PROVIDER_RETRY_BASE_MS, retryAt - Date.now()))
  }
  return PROVIDER_RETRY_BASE_MS * (attempt + 1)
}

async function fetchProviderRead(
  input: string | URL,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  let lastError: unknown = new Error('Provider request failed.')
  for (let attempt = 0; attempt < PROVIDER_READ_ATTEMPTS; attempt += 1) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch(input, { ...init, redirect: 'error', signal: controller.signal })
      if (!RETRYABLE_PROVIDER_STATUSES.has(response.status) || attempt === PROVIDER_READ_ATTEMPTS - 1) {
        return response
      }
      await response.body?.cancel().catch(() => undefined)
      await new Promise((resolve) => setTimeout(resolve, providerRetryDelay(response, attempt)))
    } catch (error) {
      lastError = error
      if (attempt === PROVIDER_READ_ATTEMPTS - 1) throw error
      await new Promise((resolve) => setTimeout(resolve, PROVIDER_RETRY_BASE_MS * (attempt + 1)))
    } finally {
      clearTimeout(timer)
    }
  }
  throw lastError
}

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
  | {
      ok: true
      offers: OfferItem[]
      note: string
      lines?: string[]
      catalogComplete?: boolean
      connectionMetadata?: Record<string, unknown>
    }
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
    const userRes = await fetchProviderRead('https://api.calendly.com/users/me', {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    }, 9_000)
    if (!userRes.ok) return { ok: false, status: 401, error: 'Invalid Calendly token or API error' }
    const userData = await userRes.json()
    const userUri = userData.resource.uri

    const eventsRes = await fetchProviderRead(
      `https://api.calendly.com/event_types?user=${encodeURIComponent(userUri)}&active=true`,
      { headers: { Authorization: `Bearer ${token}` } },
      9_000,
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
  try {
    const offers: OfferItem[] = []
    let after: string | null = null
    let currencyCode = 'USD'
    let catalogComplete = false

    while (offers.length < safeLimit) {
      const first = Math.min(50, safeLimit - offers.length)
      const res = await fetchProviderRead(`https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
        method: 'POST',
        headers: { 'X-Shopify-Access-Token': opts.accessToken, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          query: SHOPIFY_PRODUCTS_QUERY,
          variables: { first, after, query: 'status:active published_status:published' },
        }),
        // The token must never follow a redirect off *.myshopify.com.
      }, 12_000)
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
  }
}

/** Live Square catalog plus seller booking context. Catalog import remains
 * useful when the seller does not use Square Appointments. When Bookings is
 * enabled, the seller's canonical booking URL is attached to every imported
 * service so an agent hands off to the real booking surface. */
export async function importSquareOffers(accessToken: string): Promise<ProviderOffers> {
  try {
    const headers = { Authorization: `Bearer ${accessToken}`, 'Square-Version': SQUARE_API_VERSION, Accept: 'application/json' }
    const [catalogResponse, bookingResponse, teamResponse, bookingsResponse] = await Promise.all([
      fetchProviderRead(`${squareApiBaseUrl()}/v2/catalog/list?types=ITEM`, { headers }, 9_000),
      fetchProviderRead(`${squareApiBaseUrl()}/v2/bookings/business-booking-profile`, { headers }, 9_000),
      fetchProviderRead(`${squareApiBaseUrl()}/v2/bookings/team-member-booking-profiles?limit=100`, { headers }, 9_000),
      fetchProviderRead(`${squareApiBaseUrl()}/v2/bookings?limit=100`, { headers }, 9_000),
    ])
    if (!catalogResponse.ok) {
      return { ok: false, status: 502, error: 'Could not reach Square. Check the connection and Catalog read permission.', upstreamStatus: catalogResponse.status }
    }
    const catalog = await catalogResponse.json()
    const rawOffers = mapSquareCatalogToOffers(Array.isArray(catalog?.objects) ? catalog.objects : [])
    const booking = bookingResponse.ok ? await bookingResponse.json() : null
    const bookingSiteUrl = typeof booking?.business_booking_profile?.booking_site_url === 'string'
      ? booking.business_booking_profile.booking_site_url
      : ''
    const team = teamResponse.ok ? await teamResponse.json() : null
    const bookableTeamMembers = Array.isArray(team?.team_member_booking_profiles)
      ? team.team_member_booking_profiles.filter((member: { is_bookable?: boolean }) => member?.is_bookable).length
      : 0
    const bookings = bookingsResponse.ok ? await bookingsResponse.json() : null
    const bookingCount = Array.isArray(bookings?.bookings) ? bookings.bookings.length : 0
    const offers = rawOffers.map((offer) => ({
      ...offer,
      url: offer.url || bookingSiteUrl,
      metadata: {
        ...(offer.metadata ?? {}),
        square_booking_site_url: bookingSiteUrl || null,
        square_bookable_team_members: bookableTeamMembers,
        commerce_provider: 'square',
      },
    }))
    return {
      ok: true,
      offers,
      catalogComplete: true,
      note: bookingSiteUrl
        ? `Imported ${offers.length} Square item(s) with the live Square booking path.`
        : `Imported ${offers.length} Square item(s). Square Appointments is not enabled or was not granted booking access.`,
      connectionMetadata: {
        bookingApiReadable: bookingResponse.ok,
        bookingsReadable: bookingsResponse.ok,
        bookingCount,
        bookingSiteUrl: bookingSiteUrl || null,
        bookableTeamMembers,
      },
    }
  } catch {
    return { ok: false, status: 502, error: 'Could not reach Square. Check the connection and try again.' }
  }
}

/** Legacy compatibility for the original token import route. */
export async function fetchSquareCatalog(accessToken: string): Promise<OfferItem[] | null> {
  const result = await importSquareOffers(accessToken)
  return result.ok && result.offers.length ? result.offers : null
}

function cleanProviderText(value: unknown, fallback = ''): string {
  return String(value ?? fallback)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

type WooProduct = {
  id?: number
  name?: string
  description?: string
  short_description?: string
  price?: string
  regular_price?: string
  permalink?: string
  sku?: string
  stock_status?: string
  stock_quantity?: number | null
  variations?: number[]
}

function wooProductUrl(permalink: unknown, siteUrl: string): string {
  if (typeof permalink !== 'string') return siteUrl
  try {
    const candidate = new URL(permalink)
    return candidate.origin === new URL(siteUrl).origin ? candidate.toString() : siteUrl
  } catch {
    return siteUrl
  }
}

function wooProductToOffer(product: WooProduct, siteUrl: string, currency: string): OfferItem | null {
  const name = cleanProviderText(product.name).slice(0, 120)
  if (!name) return null
  const amount = Number(product.price || product.regular_price)
  const price = Number.isFinite(amount)
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount)
    : 'See options'
  const stock = product.stock_status === 'outofstock' ? 'sold_out' : product.stock_status === 'onbackorder' ? 'limited' : 'available'
  return {
    name,
    description: cleanProviderText(product.short_description || product.description, 'WooCommerce product').slice(0, 300),
    price,
    url: wooProductUrl(product.permalink, siteUrl),
    source: 'woocommerce',
    confidence: 0.98,
    availability: stock,
    prefer_original_for_this: true,
    metadata: {
      woocommerce_product_id: product.id ?? null,
      woocommerce_sku: product.sku || null,
      woocommerce_stock_quantity: product.stock_quantity ?? null,
      woocommerce_variation_ids: Array.isArray(product.variations) ? product.variations.slice(0, 50) : [],
      woocommerce_site: siteUrl,
      commerce_provider: 'woocommerce',
    },
  }
}

export async function importWooCommerceOffers(credentials: WooCommerceCredential): Promise<ProviderOffers> {
  const endpointError = await resolvedWooCommerceSiteError(credentials.siteUrl)
  if (endpointError) return { ok: false, status: 400, error: endpointError }
  const auth = Buffer.from(`${credentials.consumerKey}:${credentials.consumerSecret}`).toString('base64')
  const headers = { Authorization: `Basic ${auth}`, Accept: 'application/json' }
  try {
    const productsUrl = new URL('/wp-json/wc/v3/products', credentials.siteUrl)
    productsUrl.searchParams.set('status', 'publish')
    productsUrl.searchParams.set('per_page', '100')
    productsUrl.searchParams.set('page', '1')
    const ordersUrl = new URL('/wp-json/wc/v3/orders', credentials.siteUrl)
    ordersUrl.searchParams.set('per_page', '1')
    ordersUrl.searchParams.set('page', '1')
    const currencyUrl = new URL('/wp-json/wc/v3/settings/general/woocommerce_currency', credentials.siteUrl)
    const [productsResponse, ordersResponse, currencyResponse] = await Promise.all([
      fetchProviderRead(productsUrl, { headers }, 12_000),
      fetchProviderRead(ordersUrl, { headers }, 12_000),
      fetchProviderRead(currencyUrl, { headers }, 12_000),
    ])
    if (!productsResponse.ok || !ordersResponse.ok || !currencyResponse.ok) {
      return {
        ok: false,
        status: 502,
        error: 'WooCommerce rejected the read-only catalog, orders, or store-currency request. Reconnect with a user who can read WooCommerce data.',
        upstreamStatus: !productsResponse.ok
          ? productsResponse.status
          : !ordersResponse.ok
            ? ordersResponse.status
            : currencyResponse.status,
      }
    }
    const products = await productsResponse.json()
    const currencySettings = await currencyResponse.json() as { value?: unknown }
    const currency = String(currencySettings.value || '').toUpperCase()
    if (!/^[A-Z]{3}$/.test(currency)) {
      return { ok: false, status: 502, error: 'WooCommerce did not return a valid store currency.' }
    }
    const mapped = (Array.isArray(products) ? products : [])
      .map((product: WooProduct) => wooProductToOffer(product, credentials.siteUrl, currency))
      .filter((offer: OfferItem | null): offer is OfferItem => offer !== null)
    const totalProducts = Number(productsResponse.headers.get('x-wp-total') || mapped.length)
    const totalOrders = Number(ordersResponse.headers.get('x-wp-total') || 0)
    return {
      ok: true,
      offers: mapped,
      catalogComplete: Number.isFinite(totalProducts) && totalProducts <= mapped.length,
      note: `Imported ${mapped.length} published WooCommerce product(s). Read access to orders is active.`,
      connectionMetadata: {
        siteUrl: credentials.siteUrl,
        totalProducts: Number.isFinite(totalProducts) ? totalProducts : mapped.length,
        totalOrders: Number.isFinite(totalOrders) ? totalOrders : null,
        ordersReadable: true,
        currency,
      },
    }
  } catch {
    return { ok: false, status: 502, error: 'Could not reach the WooCommerce REST API.' }
  }
}

type ServiceM8JobTemplate = {
  uuid?: string
  name?: string
  template_name?: string
  job_description?: string
  description?: string
  active?: number | string
}

export async function importServiceM8Offers(accessToken: string): Promise<ProviderOffers> {
  try {
    const templateUrl = new URL('https://api.servicem8.com/api_1.0/jobtemplate.json')
    templateUrl.searchParams.set('$filter', 'active eq 1')
    const jobsUrl = new URL('https://api.servicem8.com/api_1.0/job.json')
    jobsUrl.searchParams.set('$filter', 'active eq 1')
    const headers = { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' }
    const [templatesResponse, jobsResponse] = await Promise.all([
      fetchProviderRead(templateUrl, { headers }, 10_000),
      fetchProviderRead(jobsUrl, { headers }, 10_000),
    ])
    if (!templatesResponse.ok || !jobsResponse.ok) {
      return {
        ok: false,
        status: 502,
        error: 'ServiceM8 rejected the job-template or jobs request. Reconnect and grant read_jobs.',
        upstreamStatus: !templatesResponse.ok ? templatesResponse.status : jobsResponse.status,
      }
    }
    const templates = await templatesResponse.json()
    const jobs = await jobsResponse.json()
    const offers = (Array.isArray(templates) ? templates : [])
      .map((template: ServiceM8JobTemplate): OfferItem | null => {
        const description = cleanProviderText(template.job_description || template.description)
        const name = cleanProviderText(template.name || template.template_name || description).slice(0, 120)
        if (!name) return null
        return {
          name,
          description: (description || 'ServiceM8 job template').slice(0, 300),
          price: 'Quote required',
          url: '',
          source: 'servicem8',
          confidence: 0.96,
          metadata: {
            servicem8_job_template_uuid: template.uuid || null,
            servicem8_create_from_template: Boolean(template.uuid),
            commerce_provider: 'servicem8',
          },
        }
      })
      .filter((offer: OfferItem | null): offer is OfferItem => offer !== null)
    const activeJobs = Array.isArray(jobs) ? jobs.length : 0
    return {
      ok: true,
      offers,
      catalogComplete: true,
      note: `Imported ${offers.length} ServiceM8 job template(s). Live job read access is active.`,
      connectionMetadata: { activeJobs, jobTemplates: offers.length, jobsReadable: true },
    }
  } catch {
    return { ok: false, status: 502, error: 'Could not reach ServiceM8.' }
  }
}

export type AcuityAuthentication =
  | { accessToken: string; userId?: never; apiKey?: never }
  | { accessToken?: never; userId: string; apiKey: string }

/** Live Acuity appointment types to offers, or null when authorization, network,
 * or the remote catalog is unavailable. OAuth is the managed multi-merchant
 * path; Basic credentials remain supported for legacy and one-time imports. */
export async function fetchAcuityTypes(authentication: AcuityAuthentication): Promise<OfferItem[] | null> {
  try {
    const authorization = authentication.accessToken
      ? `Bearer ${authentication.accessToken}`
      : `Basic ${Buffer.from(`${authentication.userId}:${authentication.apiKey}`).toString('base64')}`
    const res = await fetchProviderRead('https://acuityscheduling.com/api/v1/appointment-types', {
      headers: { Authorization: authorization, Accept: 'application/json' },
    }, 9_000)
    if (!res.ok) return null
    const data = await res.json()
    const offers = mapAcuityTypesToOffers(Array.isArray(data) ? data : [])
    return offers.length ? offers : null
  } catch {
    return null
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
  | ({ provider: 'acuity' } & AcuityAuthentication)
  | { provider: 'woocommerce'; credentials: WooCommerceCredential }
  | { provider: 'servicem8'; accessToken: string }

export const INGESTABLE_PROVIDERS = ['calendly', 'shopify', 'square', 'acuity', 'woocommerce', 'servicem8'] as const

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
      return importSquareOffers(input.accessToken)
    }
    case 'acuity': {
      const authentication: AcuityAuthentication = typeof input.accessToken === 'string'
        ? { accessToken: input.accessToken }
        : { userId: input.userId, apiKey: input.apiKey }
      const offers = await fetchAcuityTypes(authentication)
      if (!offers?.length) return { ok: false, status: 502, error: 'Could not reach Acuity (check the User ID and API key).' }
      return { ok: true, offers, note: `Imported ${offers.length} appointment type(s) from Acuity.` }
    }
    case 'woocommerce':
      return importWooCommerceOffers(input.credentials)
    case 'servicem8':
      return importServiceM8Offers(input.accessToken)
  }
}
