import type { AgentPage } from './agent-page'
import { commerceTemplateRefFromSource } from './commerce-templates/intake'
import { getCommerceTemplate } from './commerce-templates/registry'
import type { IntakeSource } from './intake/types'

export const COMMERCE_TEMPLATE_LINEAGE_SOURCE = 'owner_selected_intake' as const

export type CommerceTemplateLineage = {
  commerce_template_id: string
  commerce_template_version: number
  commerce_template_adopted_at: string
  commerce_template_source: typeof COMMERCE_TEMPLATE_LINEAGE_SOURCE
}

export type CommerceTemplateLineageSummary = {
  templateId: string
  templateVersion: number
  title: string
  adoptedAt: string
  referenceAvailable: boolean
}

type PageWithCommerceTemplateLineage = Pick<
  AgentPage,
  | 'commerce_template_id'
  | 'commerce_template_version'
  | 'commerce_template_adopted_at'
  | 'commerce_template_source'
>

/**
 * Resolve the latest deliberately selected, versioned template source into a
 * trusted insert payload. Template context is retained only when the exact
 * code-owned version still exists and the intake timestamp is valid.
 */
export function commerceTemplateLineageFromSources(
  sources: IntakeSource[],
): CommerceTemplateLineage | null {
  for (let index = sources.length - 1; index >= 0; index -= 1) {
    const source = sources[index]
    const ref = commerceTemplateRefFromSource(source)
    if (!ref) continue

    if (!getCommerceTemplate(ref) || !Number.isFinite(Date.parse(source.addedAt))) return null

    return {
      commerce_template_id: ref.id,
      commerce_template_version: ref.version,
      commerce_template_adopted_at: source.addedAt,
      commerce_template_source: COMMERCE_TEMPLATE_LINEAGE_SOURCE,
    }
  }

  return null
}

/**
 * Build the small owner-facing summary passed into the listing editor. A
 * reference that is no longer registered keeps its historical ID and version
 * without being presented as current guidance.
 */
export function commerceTemplateLineageSummary(
  page: PageWithCommerceTemplateLineage,
): CommerceTemplateLineageSummary | null {
  const templateId = page.commerce_template_id
  const templateVersion = page.commerce_template_version
  const adoptedAt = page.commerce_template_adopted_at

  if (
    !templateId
    || !Number.isInteger(templateVersion)
    || (templateVersion ?? 0) < 1
    || !adoptedAt
    || !Number.isFinite(Date.parse(adoptedAt))
    || page.commerce_template_source !== COMMERCE_TEMPLATE_LINEAGE_SOURCE
  ) {
    return null
  }

  const exactTemplate = getCommerceTemplate({ id: templateId, version: templateVersion as number })

  return {
    templateId,
    templateVersion: templateVersion as number,
    title: exactTemplate?.title ?? 'Previous setup guide',
    adoptedAt,
    referenceAvailable: Boolean(exactTemplate),
  }
}
