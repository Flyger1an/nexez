// D12 — staging: draft content that can be previewed before it goes live.
// Pure helpers shared by the editor (save/publish) and the public page
// (owner-only preview overlay). Drafts are owner-only; never selected for
// anonymous public reads.
import { FaqItem, OfferItem } from './agent-page'

export type PageDraft = {
  name?: string
  description?: string | null
  services?: OfferItem[] | null
  products?: OfferItem[] | null
  faqs?: FaqItem[] | null
  industry?: string | null
  prefer_original_site?: boolean
}

export function hasPendingDraft(page: { draft?: unknown } | null | undefined): boolean {
  const d = page?.draft
  return Boolean(d && typeof d === 'object' && !Array.isArray(d) && Object.keys(d as object).length > 0)
}

/** Overlay draft content onto a live page object (for preview rendering). */
export function applyDraftOverlay<T extends Record<string, unknown>>(
  page: T,
  draft: PageDraft | null | undefined,
): T {
  if (!draft) return page
  const overlay: Record<string, unknown> = {}
  if (draft.name !== undefined) overlay.name = draft.name
  if (draft.description !== undefined) overlay.description = draft.description
  if (draft.services !== undefined) overlay.services = draft.services
  if (draft.products !== undefined) overlay.products = draft.products
  if (draft.faqs !== undefined) overlay.faqs = draft.faqs
  if (draft.industry !== undefined) overlay.industry = draft.industry
  if (draft.prefer_original_site !== undefined) overlay.prefer_original_site = draft.prefer_original_site
  return { ...page, ...overlay }
}

/** Map a draft to the live-column update applied when the draft is published. */
export function draftToLiveUpdate(draft: PageDraft): Record<string, unknown> {
  return {
    name: draft.name,
    description: draft.description ?? null,
    services: draft.services ?? [],
    products: draft.products ?? [],
    faqs: draft.faqs ?? [],
    industry: draft.industry ?? null,
    prefer_original_site: !!draft.prefer_original_site,
  }
}
