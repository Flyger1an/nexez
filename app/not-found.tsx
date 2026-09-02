import { Compass, House, ScanSearch } from 'lucide-react'
import { marketingUrl } from '../lib/site'
import { MARKETPLACE_DISCOVERY_ENABLED } from '../lib/marketplace-discovery'

// Branded root 404 (unknown listing slugs, dead links). Recaptures the visit with
// links into the two public funnels instead of Next's unbranded default.
export const metadata = {
  title: 'Page not found', // root template appends ' · Nexez'
}

export default function NotFound() {
  return (
    <main className="flex min-h-[70vh] items-center justify-center px-6">
      <div className="max-w-md text-center">
        <div className="eyebrow justify-center">404</div>
        <h1 className="display mt-3">This page doesn&rsquo;t exist.</h1>
        <p className="lede mt-4">
          The link may be outdated, or the listing was unpublished.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          {MARKETPLACE_DISCOVERY_ENABLED ? (
            <a href={marketingUrl('/discovery')} className="btn-primary inline-flex items-center gap-2">
              <Compass className="size-4" /> Browse the directory
            </a>
          ) : (
            <a href={marketingUrl('/')} className="btn-primary inline-flex items-center gap-2">
              <House className="size-4" /> Nexez home
            </a>
          )}
          <a href={marketingUrl('/scan')} className="btn-secondary inline-flex items-center gap-2">
            <ScanSearch className="size-4" /> Scan your website
          </a>
        </div>
      </div>
    </main>
  )
}
