import { AgentPage, normalizeSlug } from './agent-page'

// Builds a `pages` insert payload that clones a page's CONTENT into a new
// unpublished draft. Identity / publishing / domain fields are intentionally
// dropped (new slug, no custom domain, no verification, is_published=false).
// The slug is made unique against the caller's existing slugs deterministically
// (no Math.random - keeps it pure for the React compiler + reproducible).
export function buildDuplicatePayload(page: AgentPage, ownerId: string, existingSlugs: string[]) {
  const base = normalizeSlug(`${page.name || 'page'}-copy`) || 'page-copy'
  const taken = new Set(existingSlugs)
  let slug = base
  let i = 2
  while (taken.has(slug)) {
    slug = `${base}-${i}`
    i++
  }

  return {
    owner_id: ownerId,
    name: `${page.name || 'Untitled'} (Copy)`,
    slug,
    description: page.description ?? null,
    website_url: page.website_url ?? null,
    cta_url: page.cta_url ?? null,
    cta_label: page.cta_label ?? null,
    audience: page.audience ?? null,
    location: page.location ?? null,
    contact_email: page.contact_email ?? null,
    industry: page.industry ?? null,
    prefer_original_site: page.prefer_original_site ?? false,
    products: page.products ?? null,
    services: page.services ?? null,
    faqs: page.faqs ?? null,
    branding: page.branding ?? {},
    mcp_enabled: page.mcp_enabled ?? false,
    agent_memory: page.agent_memory ?? null,
    google_calendar_id: page.google_calendar_id ?? null,
    next_available: page.next_available ?? null,
    llm_opt_in: page.llm_opt_in ?? false,
    is_published: false,
  }
}
