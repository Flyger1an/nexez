import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '../../../utils/supabase/server'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../utils/supabase/admin'
import { readPendingShop, shopifyApiKey, shopifyConfigured } from '../../../lib/server/shopify'
import { getInstallByShop } from '../../../lib/server/shopify-install'
import { ShopifyLinkClient } from './ShopifyLinkClient'

export const metadata = { title: 'Connect Shopify | Nexez' }

/**
 * Post-install linking page: the merchant picks which Nexez listing their
 * just-connected Shopify store maps to. The signed `shopify_pending_shop` cookie
 * (set by the OAuth callback) identifies the shop; the actual write is authorized
 * server-side in POST /api/shopify/link.
 */
export default async function ShopifyLinkPage() {
  if (!shopifyConfigured()) redirect('/dashboard')

  const jar = await cookies()
  const supabase = createClient(jar)
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/dashboard/shopify')

  const shop = readPendingShop(jar.get('shopify_pending_shop')?.value)
  const { data: pages } = await supabase
    .from('pages')
    .select('id, name, slug')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: false })

  const listings = (pages ?? []) as { id: string; name: string | null; slug: string }[]

  // If this shop is already linked to one of the owner's listings, pre-select it
  // so re-opening the app doesn't silently relink to a different listing.
  let currentPageId: string | null = null
  if (shop && hasSupabaseAdminEnv()) {
    const install = await getInstallByShop(createAdminClient(), shop)
    if (install && install.owner_id === user.id) currentPageId = install.page_id
  }
  const currentListing = currentPageId ? listings.find((l) => l.id === currentPageId) : null

  return (
    <div className="mx-auto w-full max-w-xl px-5 py-10">
      <h1 className="text-2xl font-semibold">Connect your Shopify store</h1>

      {!shop ? (
          <p className="mt-4 text-sm text-[var(--fg-muted)]">
            No pending Shopify connection. Start the install from your Shopify admin under Apps, then Nexez Agent-Ready.
        </p>
      ) : listings.length === 0 ? (
        <p className="mt-4 text-sm text-[var(--fg-muted)]">
          Create a listing first, then come back here to connect{' '}
          <span className="font-medium text-[var(--fg)]">{shop}</span>.
        </p>
      ) : (
        <>
          <p className="mt-4 text-sm text-[var(--fg-muted)]">
            <span className="font-medium text-[var(--fg)]">{shop}</span> is connected.{' '}
            {currentListing ? (
              <>
                It’s currently linked to <span className="font-medium text-[var(--fg)]">{currentListing.name || currentListing.slug}</span>. Pick a
                different listing below to change it.
              </>
            ) : (
              <>Choose the listing agents should transact against. Its live artifacts serve on your storefront through the app proxy.</>
            )}
          </p>
          <div className="mt-6">
            <ShopifyLinkClient shop={shop} listings={listings} appApiKey={shopifyApiKey()} currentPageId={currentPageId} />
          </div>
        </>
      )}
    </div>
  )
}
