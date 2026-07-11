import { handleShopifyProxy } from '../../../../lib/server/shopify-proxy'

/**
 * Shopify App Proxy handler: lets a storefront serve its live Nexez agent
 * artifacts under the shop's own domain (the Shopify equivalent of the WordPress
 * request-interception, since a theme extension can't). Verifies the App-Proxy
 * signature, resolves shop → linked Nexez listing, and redirects to the live
 * artifact on the runtime host. INERT (404) until SHOPIFY_API_KEY/SECRET are set.
 */
export async function GET(request: Request) {
  return handleShopifyProxy(request)
}
