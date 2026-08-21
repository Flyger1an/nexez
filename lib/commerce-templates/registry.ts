import type { CommerceTemplate, CommerceTemplateRef } from './schema'
import { pilotCommerceTemplates } from './templates/pilot'
import { postPilotCommerceTemplates } from './templates/post-pilot'
import { validateCommerceTemplate } from './validate'

/**
 * V1 registry is deliberately code-owned and version controlled. Runtime/admin
 * publication can be added later without making the database the authoring
 * source of truth prematurely.
 */
export const commerceTemplates: CommerceTemplate[] = [
  ...pilotCommerceTemplates,
  ...postPilotCommerceTemplates,
]

const byVersionedKey = new Map<string, CommerceTemplate>()
const latestById = new Map<string, CommerceTemplate>()
const registryEvalIds = new Set<string>()

for (const template of commerceTemplates) {
  const issues = validateCommerceTemplate(template)
  if (issues.length) {
    throw new Error(`Commerce template registry contains invalid template ${template.id}@${template.version}.`)
  }

  const key = `${template.id}@${template.version}`
  if (byVersionedKey.has(key)) throw new Error(`Duplicate commerce template registry key: ${key}`)
  byVersionedKey.set(key, template)

  for (const evaluation of template.evals) {
    if (registryEvalIds.has(evaluation.id)) throw new Error(`Duplicate commerce eval id across registry: ${evaluation.id}`)
    registryEvalIds.add(evaluation.id)
  }

  const currentLatest = latestById.get(template.id)
  if (!currentLatest || template.version > currentLatest.version) latestById.set(template.id, template)
}

export function getCommerceTemplate(ref: CommerceTemplateRef): CommerceTemplate | null {
  return byVersionedKey.get(`${ref.id}@${ref.version}`) ?? null
}

export function getLatestCommerceTemplate(id: string): CommerceTemplate | null {
  return latestById.get(id) ?? null
}

export function listCommerceTemplates(options?: { status?: CommerceTemplate['status']; domain?: CommerceTemplate['domain'] }): CommerceTemplate[] {
  return commerceTemplates.filter((template) => {
    if (options?.status && template.status !== options.status) return false
    if (options?.domain && template.domain !== options.domain) return false
    return true
  })
}
