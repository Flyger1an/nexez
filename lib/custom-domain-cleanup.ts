export type CustomDomainRemovalResult = { ok: true } | { ok: false; error: string }

/**
 * Detach a saved hostname through the authoritative server boundary. Callers
 * must complete this before clearing/replacing pages.custom_domain so the
 * provider lookup can still resolve and authorize the owning listing.
 */
export async function removeManagedCustomDomain(input: {
  domain: string
  pageId: string
  fetchImpl?: typeof fetch
}): Promise<CustomDomainRemovalResult> {
  const fetchImpl = input.fetchImpl ?? fetch
  try {
    const res = await fetchImpl('/api/custom-domain', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'remove', domain: input.domain, pageId: input.pageId }),
    })
    const data = await res.json().catch(() => ({})) as { removed?: boolean; error?: string }
    return res.ok && data.removed === true
      ? { ok: true }
      : { ok: false, error: data.error || 'The domain could not be detached.' }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'network error' }
  }
}
