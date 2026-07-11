import { handleShopifyProxy } from '../../../../../lib/server/shopify-proxy'

type RouteContext = {
  params: Promise<{ artifact: string[] }>
}

/** Shopify appends child storefront paths to the configured proxy URL. */
export async function GET(request: Request, context: RouteContext) {
  const { artifact } = await context.params
  return handleShopifyProxy(request, artifact.join('/'))
}
