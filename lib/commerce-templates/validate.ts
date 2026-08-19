import type { CommerceFact, CommerceTemplate } from './schema'

export type TemplateValidationIssue = {
  path: string
  message: string
}

const TEMPLATE_ID_RE = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/
const FACT_KEY_RE = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/

function validateFactList(
  template: CommerceTemplate,
  name: 'requiredFacts' | 'qualityFacts' | 'opportunityFacts',
  expectedImportance: CommerceFact['importance'],
  issues: TemplateValidationIssue[],
  factKeys: Set<string>,
) {
  for (const [index, fact] of template[name].entries()) {
    const path = `${name}[${index}]`
    if (!FACT_KEY_RE.test(fact.key)) issues.push({ path: `${path}.key`, message: `Invalid fact key: ${fact.key}` })
    if (factKeys.has(fact.key)) issues.push({ path: `${path}.key`, message: `Duplicate fact key: ${fact.key}` })
    factKeys.add(fact.key)
    if (fact.importance !== expectedImportance) {
      issues.push({ path: `${path}.importance`, message: `Expected ${expectedImportance}, got ${fact.importance}` })
    }
    if (!fact.ask.trim()) issues.push({ path: `${path}.ask`, message: 'Fact must include a merchant-facing question.' })
    if (!fact.why.trim()) issues.push({ path: `${path}.why`, message: 'Fact must explain why it matters.' })
  }
}

/**
 * Runtime validation for authored template definitions. This deliberately
 * rejects internal inconsistencies before a template can enter the registry.
 */
export function validateCommerceTemplate(template: CommerceTemplate): TemplateValidationIssue[] {
  const issues: TemplateValidationIssue[] = []

  if (!TEMPLATE_ID_RE.test(template.id)) issues.push({ path: 'id', message: `Invalid template id: ${template.id}` })
  if (!Number.isInteger(template.version) || template.version < 1) {
    issues.push({ path: 'version', message: 'Template version must be a positive integer.' })
  }
  if (!template.title.trim()) issues.push({ path: 'title', message: 'Template title is required.' })
  if (!template.industry.trim()) issues.push({ path: 'industry', message: 'Template industry is required.' })
  if (template.matchHints.industries.length === 0 && template.matchHints.keywords.length === 0) {
    issues.push({ path: 'matchHints', message: 'At least one matching hint is required.' })
  }
  if (template.customerJobs.length === 0) issues.push({ path: 'customerJobs', message: 'At least one customer job is required.' })
  if (template.customerIntents.length === 0) issues.push({ path: 'customerIntents', message: 'At least one customer intent is required.' })
  if (template.requiredFacts.length === 0) issues.push({ path: 'requiredFacts', message: 'At least one required fact is required.' })
  if (template.capabilityTags.length === 0) issues.push({ path: 'capabilityTags', message: 'At least one capability tag is required.' })
  if (new Set(template.capabilityTags).size !== template.capabilityTags.length) {
    issues.push({ path: 'capabilityTags', message: 'Capability tags must be unique within a template.' })
  }
  if (template.secondaryArchetypes?.includes(template.primaryArchetype)) {
    issues.push({ path: 'secondaryArchetypes', message: 'Primary archetype must not be repeated as a secondary archetype.' })
  }
  if (template.evals.length === 0) issues.push({ path: 'evals', message: 'At least one evaluation is required.' })

  const factKeys = new Set<string>()
  validateFactList(template, 'requiredFacts', 'required', issues, factKeys)
  validateFactList(template, 'qualityFacts', 'quality', issues, factKeys)
  validateFactList(template, 'opportunityFacts', 'opportunity', issues, factKeys)

  const intentIds = new Set<string>()
  for (const [index, intent] of template.customerIntents.entries()) {
    if (intentIds.has(intent.id)) issues.push({ path: `customerIntents[${index}].id`, message: `Duplicate intent id: ${intent.id}` })
    intentIds.add(intent.id)
    if (!intent.text.trim()) issues.push({ path: `customerIntents[${index}].text`, message: 'Intent text is required.' })
  }

  const blueprintKeys = new Set<string>()
  for (const [index, blueprint] of template.offerBlueprints.entries()) {
    if (blueprintKeys.has(blueprint.key)) issues.push({ path: `offerBlueprints[${index}].key`, message: `Duplicate offer blueprint key: ${blueprint.key}` })
    blueprintKeys.add(blueprint.key)
  }

  const evalIds = new Set<string>()
  for (const [index, evaluation] of template.evals.entries()) {
    if (evalIds.has(evaluation.id)) issues.push({ path: `evals[${index}].id`, message: `Duplicate eval id: ${evaluation.id}` })
    evalIds.add(evaluation.id)
    if (evaluation.expected.templateId !== template.id) {
      issues.push({ path: `evals[${index}].expected.templateId`, message: 'Eval must point to its owning template.' })
    }
    for (const factKey of evaluation.expected.requiredFactKeys) {
      if (!factKeys.has(factKey)) {
        issues.push({ path: `evals[${index}].expected.requiredFactKeys`, message: `Unknown fact key: ${factKey}` })
      }
    }
  }

  if (template.exampleListing) {
    if (template.exampleListing.exampleOnly !== true) {
      issues.push({ path: 'exampleListing.exampleOnly', message: 'Public example blueprints must be explicitly example-only.' })
    }
    if (!template.exampleListing.disclaimer.trim()) {
      issues.push({ path: 'exampleListing.disclaimer', message: 'Public example blueprints require a disclaimer.' })
    }
    if (template.exampleListing.tryAsking.length === 0) {
      issues.push({ path: 'exampleListing.tryAsking', message: 'Public example blueprints require at least one example intent.' })
    }
  }

  return issues
}

export function assertValidCommerceTemplate(template: CommerceTemplate): CommerceTemplate {
  const issues = validateCommerceTemplate(template)
  if (issues.length > 0) {
    const details = issues.map((issue) => `${issue.path}: ${issue.message}`).join('; ')
    throw new Error(`Invalid commerce template ${template.id}@${template.version}: ${details}`)
  }
  return template
}
