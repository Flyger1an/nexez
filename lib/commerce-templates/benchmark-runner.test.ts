import { describe, expect, it } from 'vitest'
import { commerceBenchmark, type CommerceBenchmarkCorpus } from './benchmark'
import { runCommerceBenchmark } from './benchmark-runner'
import { listCommerceTemplates } from './registry'
import type { CommerceTemplate } from './schema'

function oneCaseCorpus(caseId: string): CommerceBenchmarkCorpus {
  const benchmarkCase = commerceBenchmark.cases.find((item) => item.id === caseId)
  if (!benchmarkCase) throw new Error(`Missing benchmark fixture ${caseId}`)
  return {
    formatVersion: commerceBenchmark.formatVersion,
    templates: [{ ...benchmarkCase.template }],
    cases: [benchmarkCase],
  }
}

function replaceTemplate(templates: CommerceTemplate[], replacement: CommerceTemplate): CommerceTemplate[] {
  return templates.map((template) =>
    template.id === replacement.id && template.version === replacement.version
      ? replacement
      : template,
  )
}

describe('runCommerceBenchmark', () => {
  it('executes every active corpus case against matcher and intelligence primitives', () => {
    const run = runCommerceBenchmark()

    expect(run.ok).toBe(true)
    expect(run.summary.caseCount).toBe(commerceBenchmark.cases.length)
    expect(run.summary.passedCases).toBe(commerceBenchmark.cases.length)
    expect(run.summary.failedCases).toBe(0)
    expect(run.cases.every((benchmarkCase) => benchmarkCase.stages.length === 3)).toBe(true)
    expect(run.cases.every((benchmarkCase) => benchmarkCase.stages.every((stage) => stage.status === 'pass'))).toBe(true)
  })

  it('reports lifecycle gaps instead of claiming unsupported buyer/configuration/pricing coverage', () => {
    const run = runCommerceBenchmark()
    const coverage = Object.fromEntries(run.coverage.map((entry) => [entry.stage, entry.status]))

    expect(run.completeLifecycleCoverage).toBe(false)
    expect(coverage['template-contract']).toBe('exercised')
    expect(coverage['seller-template-matching']).toBe('exercised')
    expect(coverage['template-intelligence']).toBe('exercised')
    expect(coverage['buyer-intent-routing']).toBe('not-exercised')
    expect(coverage['must-not-behavior']).toBe('not-exercised')
    expect(coverage['offer-configuration']).toBe('not-exercised')
    expect(coverage['deterministic-pricing']).toBe('not-exercised')
    expect(run.summary.exercisedStageCount).toBe(3)
    expect(run.summary.notExercisedStageCount).toBe(4)
  })

  it('fails closed when an eval expects a capability the owning template no longer declares', () => {
    const caseId = 'automotive.mobile-auto-detailing.complex'
    const corpus = oneCaseCorpus(caseId)
    const templates = listCommerceTemplates({ status: 'active' })
    const target = templates.find((template) => template.id === corpus.cases[0].template.id)
    if (!target) throw new Error('Missing mobile detailing template')

    const capability = corpus.cases[0].expected.capabilityTags[0]
    const mutated: CommerceTemplate = {
      ...target,
      capabilityTags: target.capabilityTags.filter((tag) => tag !== capability),
    }
    const run = runCommerceBenchmark({
      corpus,
      templates: replaceTemplate(templates, mutated),
    })

    expect(run.ok).toBe(false)
    expect(run.summary.failedCases).toBe(1)
    expect(run.cases[0].stages[0]).toMatchObject({
      stage: 'template-contract',
      status: 'fail',
    })
    expect(run.cases[0].stages[0].diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'capability_not_declared' }),
      ]),
    )
  })

  it('fails closed when canonical merchant evidence no longer matches the owning template', () => {
    const caseId = 'automotive.mobile-auto-detailing.direct'
    const corpus = oneCaseCorpus(caseId)
    const templates = listCommerceTemplates({ status: 'active' })
    const target = templates.find((template) => template.id === corpus.cases[0].template.id)
    if (!target) throw new Error('Missing mobile detailing template')

    const mutated: CommerceTemplate = {
      ...target,
      matchHints: {
        industries: ['Unrelated Industry'],
        keywords: ['zzzx unmatched phrase'],
        offerTerms: ['zzzx unmatched offer'],
      },
    }
    const run = runCommerceBenchmark({
      corpus,
      templates: replaceTemplate(templates, mutated),
    })

    expect(run.ok).toBe(false)
    expect(run.cases[0].stages[1]).toMatchObject({
      stage: 'seller-template-matching',
      status: 'fail',
    })
    expect(run.cases[0].stages[1].diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'no_seller_match' }),
      ]),
    )
    expect(run.cases[0].stages[2].diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'no_intelligence_match' }),
      ]),
    )
  })

  it('fails closed when required merchant intelligence disappears from a template', () => {
    const caseId = 'automotive.mobile-auto-detailing.direct'
    const corpus = oneCaseCorpus(caseId)
    const templates = listCommerceTemplates({ status: 'active' })
    const target = templates.find((template) => template.id === corpus.cases[0].template.id)
    if (!target) throw new Error('Missing mobile detailing template')

    const factKey = corpus.cases[0].expected.requiredFactKeys[0]
    const mutated: CommerceTemplate = {
      ...target,
      requiredFacts: target.requiredFacts.filter((fact) => fact.key !== factKey),
    }
    const run = runCommerceBenchmark({
      corpus,
      templates: replaceTemplate(templates, mutated),
    })

    expect(run.ok).toBe(false)
    expect(run.cases[0].stages[0].diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'required_fact_not_required' }),
      ]),
    )
    expect(run.cases[0].stages[2].diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'required_fact_missing' }),
      ]),
    )
  })

  it('returns a JSON-safe machine-readable report', () => {
    const run = runCommerceBenchmark()
    expect(() => JSON.stringify(run)).not.toThrow()
    expect(JSON.parse(JSON.stringify(run))).toEqual(run)
  })
})
