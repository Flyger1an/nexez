import { NextResponse } from 'next/server'
import { enforceRateLimit } from '../../../../lib/rate-limit'
import { appUrl } from '../../../../lib/site'
import { hasSecretCryptoKey } from '../../../../lib/server/secret-crypto'
import { shopifyApiKey, shopifyConfigured, verifyShopifySessionToken } from '../../../../lib/server/shopify'
import { ensureShopifySessionInstall, getShopifyInstallCredentialsByShop, issueShopifyLinkToken } from '../../../../lib/server/shopify-install'
import { ensureShopifySalesChannel } from '../../../../lib/server/shopify-channel'
import { shopifyPartnerBillingConfigured, shopifyPricingUrl, verifyShopifyBilling } from '../../../../lib/server/shopify-billing'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../../utils/supabase/admin'

function bearerToken(request: Request): string {
  const authorization = request.headers.get('authorization') || ''
  return authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || ''
}

function json(body: Record<string, unknown>, status = 200) {
  const response = NextResponse.json(body, { status })
  response.headers.set('cache-control', 'no-store')
  return response
}

/**
 * Embedded app bootstrap. App Bridge automatically attaches a one-minute ID
 * token to this fetch. The server verifies it, establishes rotating offline API
 * credentials through token exchange, and returns only that shop's link state.
 */
export async function POST(request: Request) {
  if (!shopifyConfigured()) return json({ error: 'Shopify app is not configured.' }, 404)
  if (!hasSupabaseAdminEnv() || !hasSecretCryptoKey()) {
    return json({ error: 'Shopify credential storage is unavailable.' }, 503)
  }

  const subjectToken = bearerToken(request)
  const session = verifyShopifySessionToken(subjectToken)
  if (!session) return json({ error: 'Invalid or expired Shopify session.' }, 401)

  const limited = await enforceRateLimit(request, `shopify-session:${session.shop}`, 120, 60_000)
  if (limited) return limited

  try {
    const admin = createAdminClient()
    const install = await ensureShopifySessionInstall(admin, session.shop, subjectToken)
    if (install.mapping_transition_token) {
      return json({ error: 'This Shopify listing change is still finishing. Try again shortly.' }, 409)
    }

    let listing: { id: string; name: string | null; slug: string } | null = null
    if (install.page_id) {
      const { data } = await admin
        .from('pages')
        .select('id, name, slug')
        .eq('id', install.page_id)
        .maybeSingle<{ id: string; name: string | null; slug: string }>()
      listing = data ?? null
    }

    const returnedPlanHandle = new URL(request.url).searchParams.get('plan_handle')
    let billing = {
      provider: 'shopify' as const,
      pricingUrl: shopifyPricingUrl(session.shop),
      planHandle: install.shopify_plan_handle ?? null,
      status: install.shopify_billing_status ?? (shopifyPartnerBillingConfigured() ? 'checking' : 'attention'),
      verifiedAt: install.shopify_billing_verified_at ?? null,
    }
    let channel = install.channel_id
      ? {
          id: install.channel_id,
          handle: install.channel_handle,
          specificationHandle: install.channel_specification_handle,
          connectedAt: install.channel_connected_at,
        }
      : null
    const credentials = listing
      ? await getShopifyInstallCredentialsByShop(admin, session.shop)
      : null
    if (listing && credentials) {
      if (!channel) {
        channel = await ensureShopifySalesChannel(admin, install, credentials, {
          pageId: listing.id,
          accountName: listing.name || listing.slug,
        })
      }
      if (shopifyPartnerBillingConfigured()) {
        const verified = await verifyShopifyBilling(admin, install, credentials, returnedPlanHandle)
        billing = {
          provider: 'shopify',
          pricingUrl: verified.pricingUrl,
          planHandle: verified.planHandle,
          status: verified.status,
          verifiedAt: verified.verifiedAt,
        }
      }
    }

    let connectUrl: string | null = null
    if (!listing) {
      const token = await issueShopifyLinkToken(admin, session.shop)
      connectUrl = appUrl(`/api/shopify/claim?token=${encodeURIComponent(token)}`)
    }

    return json({
      ok: true,
      shop: session.shop,
      state: listing ? 'linked' : 'link_required',
      listing,
      connectUrl,
      billing,
      channel,
      themeEditorUrl: `https://${session.shop}/admin/themes/current/editor?context=apps&template=index&activateAppId=${encodeURIComponent(shopifyApiKey())}/agent-ready`,
      storefrontArtifactUrl: `https://${session.shop}/apps/nexez/agent.json`,
      sync: {
        lastSyncedAt: install.last_synced_at ?? null,
        pending: Boolean(install.catalog_sync_pending_at),
        attempts: Number(install.catalog_sync_attempts || 0),
        error: install.catalog_sync_error ?? null,
      },
    })
  } catch (error) {
    console.error('[shopify-session] bootstrap failed', {
      shop: session.shop,
      error: error instanceof Error ? error.message : String(error),
    })
    return json({ error: 'Nexez could not open this Shopify connection. Try again shortly.' }, 503)
  }
}
