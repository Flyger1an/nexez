import { listCommerceTemplates } from './registry'
import { commerceTemplateRef } from './schema'
import type {
  CommerceCapability,
  CommerceEvalDifficulty,
  CommerceTemplate,
  CommerceTemplateRef,
} from './schema'

/**
 * Version of the exported benchmark-case shape. This is intentionally separate
 * from individual CommerceTemplate versions so benchmark consumers can pin the
 * transport/fixture contract while templates evolve independently.
 */
export const COMMERCE_BENCHMARK_FORMAT_VERSION = 1 as const

export type CommerceBenchmarkCase = {
  id: string
  template: CommerceTemplateRef
  difficulty: CommerceEvalDifficulty
  request: string
  expected: {
    templateId: string
    requiredFactKeys: string[]
    capabilityTags: CommerceCapability[]
    mustNot: string[]
  }
}

export type CommerceBenchmarkCorpus = {
  formatVersion: typeof COMMERCE_BENCHMARK_FORMAT_VERSION
  templates: CommerceTemplateRef[]
  cases: CommerceBenchmarkCase[]
}

export type CommerceBenchmarkQuery = {
  templateId?: string
  difficulty?: CommerceEvalDifficulty
  capabilityTag?: CommerceCapability
}

/**
 * Compile authored CommerceTemplate evaluations into a deterministic benchmark
 * corpus. The compiler copies evaluation data rather than exposing mutable
 * references to the canonical template registry.
 *
 * This is a data contract only. It deliberately does not run buyer requests
 * through the seller-side template matcher or claim transaction execution.
 */
export function compileCommerceBenchmark(templates: CommerceTemplate[]): CommerceBenchmarkCorpus {
  const orderedTemplates = [...templates].sort(
    (left, right) => left.id.localeCompare(right.id) || left.version - right.version,
  )
  const seenEvalIds = new Set<string>()
  const cases: CommerceBenchmarkCase[] = []

  for (const template of orderedTemplates) {
    for (const evaluation of [...template.evals].sort((left, right) => left.id.localeCompare(right.id))) {
      if (seenEvalIds.has(evaluation.id)) {
        throw new Error(`Duplicate commerce benchmark case id: ${evaluation.id}`)
      }
      seenEvalIds.add(evaluation.id)

      cases.push({
        id: evaluation.id,
        template: commerceTemplateRef(template),
        difficulty: evaluation.difficulty,
        request: evaluation.request,
        expected: {
          templateId: evaluation.expected.templateId,
          requiredFactKeys: [...evaluation.expected.requiredFactKeys],
          capabilityTags: [...evaluation.expected.capabilityTags],
          mustNot: [...(evaluation.expected.mustNot ?? [])],
        },
      })
    }
  }

  return {
    formatVersion: COMMERCE_BENCHMARK_FORMAT_VERSION,
    templates: orderedTemplates.map(commerceTemplateRef),
    cases,
  }
}

/** Current active-registry benchmark corpus. */
export const commerceBenchmark = compileCommerceBenchmark(
  listCommerceTemplates({ status: 'active' }),
)

export function getCommerceBenchmarkCase(id: string): CommerceBenchmarkCase | null {
  return commerceBenchmark.cases.find((benchmarkCase) => benchmarkCase.id === id) ?? null
}

export function listCommerceBenchmarkCases(query?: CommerceBenchmarkQuery): CommerceBenchmarkCase[] {
  return commerceBenchmark.cases.filter((benchmarkCase) => {
    if (query?.templateId && benchmarkCase.template.id !== query.templateId) return false
    if (query?.difficulty && benchmarkCase.difficulty !== query.difficulty) return false
    if (query?.capabilityTag && !benchmarkCase.expected.capabilityTags.includes(query.capabilityTag)) return false
    return true
  })
}
