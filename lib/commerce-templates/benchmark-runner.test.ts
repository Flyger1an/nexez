import { describe, expect, it } from 'vitest'
import { commerceBenchmark, type CommerceBenchmarkCorpus } from './benchmark'
import { commerceBenchmarkBuyerPreflightFixtures } from './benchmark-buyer-preflight-fixtures'
import {
  runCommerceBenchmark,
  type CommerceBenchmarkExecutableStage,
  type CommerceBenchmarkRun,
} from './benchmark-runner'
import { commerceBenchmarkTransactionFixtures } from './benchmark-transaction-fixtures'
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

function stageResult(
  run: CommerceBenchmarkRun,
  stage: CommerceBenchmarkExecutableStage,
  caseIndex = 0,
) {
  const result = run.cases[caseIndex]?.stages.find((candidate) => candidate.stage === stage)
  if (!result) throw new Error(`Missing ${stage} benchmark stage`)
  return result
}

describe('runCommerceBenchmark', () => {
  it('executes every active corpus case plus buyer preflight and configured transaction fixtures', () => {
    const run = runCommerceBenchmark()

    expect(run.runnerVersion).toBe(4)
    expect(run.ok).toBe(true)
    expect(run.buyerBehaviorScope).toBe('nexez-reference-preflight')
    expect(run.summary.caseCount).toBe(commerceBenchmark.cases.length)
    expect(run.summary.passedCases).toBe(commerceBenchmark.cases.length)
    expect(run.summary.failedCases).toBe(0)
    expect(run.cases.every((benchmarkCase) => benchmarkCase.stages.length === 5)).toBe(true)
    expect(run.cases.every((benchmarkCase) => benchmarkCase.stages.every((stage) => stage.status === 'pass'))).toBe(true)
    expect(run.buyerPreflightCoverageComplete).toBe(true)
    expect(run.summary.guardrailAssertionCount).toBe(14)
    expect(run.summary.passedGuardrailAssertions).toBe(14)
    expect(run.summary.failedGuardrailAssertions).toBe(0)
    expect(run.transactionTemplateCoverageComplete).toBe(true)
    expect(run.summary.transactionFixtureCount).toBe(commerceBenchmarkTransactionFixtures.length)
    expect(run.summary.passedTransactionFixtures).toBe(commerceBenchmarkTransactionFixtures.length)
    expect(run.summary.failedTransactionFixtures).toBe(0)
    expect(run.transactionFixtures.every((fixture) => fixture.status === 'pass')).toBe(true)
  })

  it('reports complete declared lifecycle coverage with explicit reference-agent scope', () => {
    const run = runCommerceBenchmark()
    const coverage = Object.fromEntries(run.coverage.map((entry) => [entry.stage, entry.status]))

    expect(run.completeLifecycleCoverage).toBe(true)
    expect(coverage['template-contract']).toBe('exercised')
    expect(coverage['buyer-intent-routing']).toBe('exercised')
    expect(coverage['seller-template-matching']).toBe('exercised')
    expect(coverage['template-intelligence']).toBe('exercised')
    expect(coverage['must-not-behavior']).toBe('exercised')
    expect(coverage['offer-configuration']).toBe('exercised')
    expect(coverage['deterministic-pricing']).toBe('exercised')
    expect(run.summary.exercisedStageCount).toBe(7)
    expect(run.summary.notExercisedStageCount).toBe(0)
    expect(run.coverage.find((entry) => entry.stage === 'must-not-behavior')?.reason)
      .toContain('not arbitrary third-party model obedience')
  })

  it('does not let mustNot behavior inherit coverage without its adversarial preflight fixtures', () => {
    const corpus = oneCaseCorpus('automotive.mobile-auto-detailing.direct')
    const run = runCommerceBenchmark({ corpus, buyerPreflightFixtures: [] })
    const coverage = Object.fromEntries(run.coverage.map((entry) => [entry.stage, entry.status]))

    expect(run.ok).toBe(false)
    expect(run.buyerPreflightCoverageComplete).toBe(false)
    expect(run.summary.guardrailAssertionCount).toBe(0)
    expect(coverage['must-not-behavior']).toBe('not-exercised')
  })

  it('does not let a corpus template inherit configuration/pricing coverage without its own fixture', () => {
    const corpus = oneCaseCorpus('automotive.mobile-auto-detailing.direct')
    const run = runCommerceBenchmark({ corpus, transactionFixtures: [] })
    const coverage = Object.fromEntries(run.coverage.map((entry) => [entry.stage, entry.status]))

    expect(run.ok).toBe(false)
    expect(run.transactionTemplateCoverageComplete).toBe(false)
    expect(run.summary.transactionFixtureCount).toBe(0)
    expect(coverage['offer-configuration']).toBe('not-exercised')
    expect(coverage['deterministic-pricing']).toBe('not-exercised')
  })

  it('keeps focused corpus slices valid without inventing mustNot coverage they do not declare', () => {
    const corpus = oneCaseCorpus('automotive.mobile-auto-detailing.complex')
    const run = runCommerceBenchmark({ corpus })
    const coverage = Object.fromEntries(run.coverage.map((entry) => [entry.stage, entry.status]))

    expect(run.ok).toBe(true)
    expect(run.completeLifecycleCoverage).toBe(false)
    expect(run.buyerPreflightCoverageComplete).toBe(false)
    expect(coverage['must-not-behavior']).toBe('not-exercised')
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
    expect(stageResult(run, 'template-contract')).toMatchObject({ status: 'fail' })
    expect(stageResult(run, 'template-contract').diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'capability_not_declared' }),
      ]),
    )
  })

  it('fails closed when canonical buyer evidence no longer routes the scenario', () => {
    const caseId = 'automotive.mobile-auto-detailing.complex'
    const corpus = oneCaseCorpus(caseId)
    const templates = listCommerceTemplates({ status: 'active' })
    const target = templates.find((template) => template.id === corpus.cases[0].template.id)
    if (!target) throw new Error('Missing mobile detailing template')

    const mutated: CommerceTemplate = {
      ...target,
      customerIntents: [{ id: 'unrelated', text: 'Arrange an unrelated generic appointment.' }],
    }
    const run = runCommerceBenchmark({
      corpus,
      templates: replaceTemplate(templates, mutated),
    })

    expect(run.ok).toBe(false)
    expect(stageResult(run, 'buyer-intent-routing')).toMatchObject({ status: 'fail' })
    expect(stageResult(run, 'buyer-intent-routing').diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'buyer_route_unmatched' }),
      ]),
    )
    expect(stageResult(run, 'seller-template-matching')).toMatchObject({ status: 'pass' })
    expect(stageResult(run, 'template-intelligence')).toMatchObject({ status: 'pass' })
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
    expect(stageResult(run, 'buyer-intent-routing')).toMatchObject({ status: 'pass' })
    expect(stageResult(run, 'seller-template-matching')).toMatchObject({ status: 'fail' })
    expect(stageResult(run, 'seller-template-matching').diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'no_seller_match' }),
      ]),
    )
    expect(stageResult(run, 'template-intelligence').diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'no_intelligence_match' }),
      ]),
    )
  })

  it('allows a scenario-required fact to be globally quality-classified when it remains resolvable', () => {
    const caseId = 'automotive.mobile-auto-detailing.direct'
    const corpus = oneCaseCorpus(caseId)
    const templates = listCommerceTemplates({ status: 'active' })
    const target = templates.find((template) => template.id === corpus.cases[0].template.id)
    if (!target) throw new Error('Missing mobile detailing template')

    const factKey = corpus.cases[0].expected.requiredFactKeys[0]
    const fact = target.requiredFacts.find((candidate) => candidate.key === factKey)
    if (!fact) throw new Error(`Missing fact fixture ${factKey}`)

    const mutated: CommerceTemplate = {
      ...target,
      requiredFacts: target.requiredFacts.filter((candidate) => candidate.key !== factKey),
      qualityFacts: [...target.qualityFacts, { ...fact, importance: 'quality' }],
    }
    const run = runCommerceBenchmark({
      corpus,
      templates: replaceTemplate(templates, mutated),
    })

    expect(run.ok).toBe(true)
    expect(run.cases[0].stages.every((stage) => stage.status === 'pass')).toBe(true)
  })

  it('fails closed when scenario-required merchant intelligence disappears from a template', () => {
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
    expect(stageResult(run, 'template-contract').diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'expected_fact_not_declared' }),
      ]),
    )
    expect(stageResult(run, 'template-intelligence').diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'expected_fact_missing' }),
      ]),
    )
  })

  it('returns a JSON-safe machine-readable report', () => {
    const run = runCommerceBenchmark()
    expect(() => JSON.stringify(run)).not.toThrow()
    expect(JSON.parse(JSON.stringify(run))).toEqual(run)
  })

  it('keeps the canonical guardrail fixture count aligned with authored mustNot behavior', () => {
    const authored = commerceBenchmark.cases.reduce(
      (total, benchmarkCase) => total + benchmarkCase.expected.mustNot.length,
      0,
    )
    const fixtures = commerceBenchmarkBuyerPreflightFixtures.reduce(
      (total, fixture) => total + fixture.assertions.length,
      0,
    )

    expect(authored).toBe(14)
    expect(fixtures).toBe(authored)
  })
})
