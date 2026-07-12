import 'server-only'
import { NextResponse } from 'next/server'

// Shared server helpers for the UCP checkout-session routes. The page loaders +
// pause check are protocol-neutral, so UCP reuses the ones the ACP adapter already
// defined (single source of truth) and adds its own JSON response shape.
export { loadAcpPage as loadUcpPage, loadAcpPageName as loadUcpPageName, isMerchantPaused } from './acp-session'

/** UCP JSON response. UCP is plain REST (no mandatory API-Version echo like ACP). */
export function ucpJson(body: unknown, status: number) {
  return NextResponse.json(body, { status })
}
