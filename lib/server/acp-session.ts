import 'server-only'
import { NextResponse } from 'next/server'
import { AgentPage, SERVER_PAGE_SELECT } from '../agent-page'
import { supabase } from '../supabase'
import { createAdminClient, hasSupabaseAdminEnv } from '../../utils/supabase/admin'
import { getOwnerBillingState } from './plan'
import type { AcpError } from '../acp/wire'

// Shared server helpers for the ACP checkout_session routes (A2). Keeps the four
// route files thin + consistent: one JSON+header shape, one page loader (with the
// owner-private `rules` the core needs), one merchant-pause check.

/** ACP JSON response with the negotiated API-Version echoed back. */
export function acpJson(body: unknown, status: number, apiVersion: string) {
  return NextResponse.json(body, { status, headers: { 'API-Version': apiVersion } })
}

/** Error response — the body IS the ACP error object {type,code,message,param}. */
export function acpErrorResponse(error: AcpError, status: number, apiVersion: string) {
  return acpJson(error, status, apiVersion)
}

/** Load a published listing with owner-private fields (rules, owner_id) the session
 * core + settlement need. Service-role when available (anon can't read `pages`). */
export async function loadAcpPage(slug: string): Promise<AgentPage | null> {
  const db = hasSupabaseAdminEnv() ? createAdminClient() : supabase
  const { data } = await db
    .from('pages')
    .select(SERVER_PAGE_SELECT)
    .eq('slug', slug)
    .eq('is_published', true)
    .single<AgentPage>()
  return data ?? null
}

/** Light public read of a listing's display name (for GET / cancel rehydrate, where
 * re-pricing against the full page isn't needed). */
export async function loadAcpPageName(slug: string): Promise<string | null> {
  const { data } = await supabase
    .from('pages_public')
    .select('name')
    .eq('slug', slug)
    .eq('is_published', true)
    .maybeSingle<{ name: string | null }>()
  return data?.name ?? null
}

/** Compatibility hook for an explicit operational suspension. Billing and
 * promotional expiry return a merchant to Free instead of taking them offline. */
export async function isMerchantPaused(ownerId: string | null | undefined): Promise<boolean> {
  if (!ownerId || !hasSupabaseAdminEnv()) return false
  const billing = await getOwnerBillingState(createAdminClient(), ownerId)
  return billing.isPaused
}
