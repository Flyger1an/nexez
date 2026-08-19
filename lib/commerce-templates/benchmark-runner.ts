import {
  commerceBenchmark,
  compileCommerceBenchmark,
  type CommerceBenchmarkCase,
  type CommerceBenchmarkCorpus,
} from './benchmark'
import {
  commerceBenchmarkTransactionFixtures,
  type CommerceBenchmarkTransactionFixture,
} from './benchmark-transaction-fixtures'
import {
  runCommerceBenchmarkTransactionFixtures,
  type CommerceBenchmarkTransactionFixtureResult,
  type CommerceBenchmarkTransactionStage,
} from './benchmark-transaction-runner'
import { routeCommerceBuyerIntent } from './buyer-router'
import { resolveCommerceTemplateIntelligence } from './intelligence'
import { matchCommerceTemplates, type CommerceTemplateMatchInput } from './matcher'
import { listCommerceTemplates } from './registry'
import type { CommerceTemplate, CommerceTemplateRef } from './schema'

export const COMMERCE_BENCHMARK_RUNNER_VERSION = 3 as const

export type CommerceBenchmarkExecutableStage =
  | 'template-contract'
  | 'buyer-intent-routing'
  | 'seller-template-matching'
  | 'template-intelligence'
  | CommerceBenchmarkTransactionStage

export type CommerceBenchmarkCoverageStage =
  | CommerceBenchmarkExecutableStage
  | 'must-not-behavior'

export type CommerceBenchmarkCoverage = {
  stage: CommerceBenchmarkCoverageStage
  status: 'exercised' | 'not-exercised'
  reason: string
}

export type CommerceBenchmarkDiagnostic = {
  stage: CommerceBenchmarkExecutableStage
  code: string
  message: string
}

export type CommerceBenchmarkStageResult = {
  stage: CommerceBenchmarkExecutableStage
  status: 'pass' | 'fail'
  diagnostics: CommerceBenchmarkDiagnostic[]
}

export type CommerceBenchmarkCaseResult = {
  id: string
  template: CommerceTemplateRef
  status: 'pass' | 'fail'
  stages: CommerceBenchmarkStageResult[]
}

export type CommerceBenchmarkRun = {
  runnerVersion: typeof COMMERCE_BENCHMARK_RUNNER_VERSION
  corpusFormatVersion: CommerceBenchmarkCorpus['formatVersion']
  ok: boolean
  completeLifecycleCoverage: false
  transactionTemplateCoverageComplete: boolean
  coverage: CommerceBenchmarkCoverage[]
  summary: {
    caseCount: number
    passedCases: number
    failedCases: number
    transactionFixtureCount: number
    passedTransactionFixtures: number
    failedTransactionFixtures: number
    exercisedStageCount: number
    notExercisedStageCount: number
  }
  cases: CommerceBenchmarkCaseResult[]
  transactionFixtures: CommerceBenchmarkTransactionFixtureResult[]
}

export type CommerceBenchmarkRunOptions = {
  corpus?: CommerceBenchmarkCorpus
  templates?: CommerceTemplate[]
  transactionFixtures?: CommerceBenchmarkTransactionFixture[]
}

function versionedKey(ref: CommerceTemplateRef): string {
  return `${ref.id}@${ref.version}`
}

function transactionFixturesForCorpus(
  corpus: CommerceBenchmarkCorpus,
  fixtures: CommerceBenchmarkTransactionFixture[],
): CommerceBenchmarkTransactionFixture[] {
  const corpusTemplates = new Set(corpus.templates.map(versionedKey))
  return fixtures.filter((fixture) => corpusTemplates.has(versionedKey(fixture.template)))
}

function hasCompleteTransactionTemplateCoverage(
  corpus: CommerceBenchmarkCorpus,
  fixtures: CommerceBenchmarkTransactionFixture[],
): boolean {
  if (!corpus.templates.length) return false
  const fixtureTemplates = new Set(fixtures.map((fixture) => versionedKey(fixture.template)))
  return corpus.templates.every((template) => fixtureTemplates.has(versionedKey(template)))
}

function coverageFor(
  transactionTemplateCoverageComplete: boolean,
): CommerceBenchmarkCoverage[] {
  return [
    {
      stage: 'template-contract',
      status: 'exercised',
      reason: 'Checks each benchmark expectation against the exact versioned CommerceTemplate definition.',
    },
    {
      stage: 'buyer-intent-routing',
      status: 'exercised',
      reason: 'Runs the production deterministic buyer request router against each CommerceEval request and requires an unambiguous owning-template result.',
    },
    {
      stage: 'seller-template-matching',
      status: 'exercised',
      reason: 'Runs the production deterministic seller/intake matcher against canonical merchant-facing evidence from the owning template.',
    },
    {
      stage: 'template-intelligence',
      status: 'exercised',
      reason: 'Runs the production intelligence resolver and verifies scenario-required facts are surfaced from the expected template.',
    },
    {
      stage: 'must-not-behavior',
      status: 'not-exercised',
      reason: 'CommerceEval mustNot entries are behavioral guardrails; the current corpus does not define an executable buyer-agent response fixture.',
    },
    {
      stage: 'offer-configuration',
      status: transactionTemplateCoverageComplete ? 'exercised' : 'not-exercised',
      reason: transactionTemplateCoverageComplete
        ? 'Runs benchmark-only merchant offer schemas and raw buyer answers through the production configuration validator for every template in the corpus.'
        : 'At least one template in the corpus lacks a benchmark-only configured transaction fixture.',
    },
    {
      stage: 'deterministic-pricing',
      status: transactionTemplateCoverageComplete ? 'exercised' : 'not-exercised',
      reason: transactionTemplateCoverageComplete
        ? 'Runs normalized benchmark buyer configurations through production merchant-authored deterministic pricing and verifies exact amount/provenance snapshots.'
        : 'Deterministic pricing coverage is incomplete because at least one corpus template lacks a benchmark-only configured transaction fixture.',
    },
  ]
}

/**
 * Build matcher input from merchant-facing canonical fields, not from the
 * matchHints answer key itself. This makes the runner capable of detecting
 * drift between authored template identity/content and its matching hints.
 */
function canonicalSellerEvidence(template: CommerceTemplate): CommerceTemplateMatchInput {
  return {
    industry: template.industry,
    description: template.description,
    offerNames: template.offerBlueprints.map((offer) => offer.name),
  }
}

function diagnostic(
  stage: CommerceBenchmarkExecutableStage,
  code: string,
  message: string,
): CommerceBenchmarkDiagnostic {
  return { stage, code, message }
}

function runTemplateContractStage(
  benchmarkCase: CommerceBenchmarkCase,
  template: CommerceTemplate | undefined,
): CommerceBenchmarkStageResult {
  const stage: CommerceBenchmarkExecutableStage = 'template-contract'
  const diagnostics: CommerceBenchmarkDiagnostic[] = []

  if (!template) {
    diagnostics.push(
      diagnostic(
        stage,
        'template_not_found',
        `Benchmark case references missing template ${versionedKey(benchmarkCase.template)}.`,
      ),
    )
    return { stage, status: 'fail', diagnostics }
  }

  if (benchmarkCase.expected.templateId !== benchmarkCase.template.id) {
    diagnostics.push(
      diagnostic(
        stage,
        'expected_template_mismatch',
        `Expected template ${benchmarkCase.expected.templateId} does not match corpus ref ${benchmarkCase.template.id}.`,
      ),
    )
  }

  const factKeys = new Set(
    [...template.requiredFacts, ...template.qualityFacts, ...template.opportunityFacts]
      .map((fact) => fact.key),
  )
  for (const factKey of benchmarkCase.expected.requiredFactKeys) {
    if (!factKeys.has(factKey)) {
      diagnostics.push(
        diagnostic(
          stage,
          'expected_fact_not_declared',
          `Scenario-required fact ${factKey} is not declared by ${versionedKey(benchmarkCase.template)}.`,
        ),
      )
    }
  }

  const capabilityTags = new Set(template.capabilityTags)
  for (const capabilityTag of benchmarkCase.expected.capabilityTags) {
    if (!capabilityTags.has(capabilityTag)) {
      diagnostics.push(
        diagnostic(
          stage,
          'capability_not_declared',
          `Expected capability ${capabilityTag} is not declared by ${versionedKey(benchmarkCase.template)}.`,
        ),
      )
    }
  }

  return { stage, status: diagnostics.length === 0 ? 'pass' : 'fail', diagnostics }
}

function runBuyerIntentRoutingStage(
  benchmarkCase: CommerceBenchmarkCase,
  templates: CommerceTemplate[],
): CommerceBenchmarkStageResult {
  const stage: CommerceBenchmarkExecutableStage = 'buyer-intent-routing'
  const diagnostics: CommerceBenchmarkDiagnostic[] = []
  const route = routeCommerceBuyerIntent(templates, benchmarkCase.request)
  const strongest = route.matches[0]

  if (route.status === 'unmatched' || !strongest) {
    diagnostics.push(
      diagnostic(
        stage,
        'buyer_route_unmatched',
        `Buyer request produced no CommerceTemplate route for expected ${versionedKey(benchmarkCase.template)}.`,
      ),
    )
    return { stage, status: 'fail', diagnostics }
  }

  if (route.status === 'ambiguous') {
    diagnostics.push(
      diagnostic(
        stage,
        'buyer_route_ambiguous',
        `Buyer request was ambiguous between ${route.matches.map((match) => versionedKey(match.template)).join(', ')}.`,
      ),
    )
  }

  if (
    strongest.template.id !== benchmarkCase.template.id
    || strongest.template.version !== benchmarkCase.template.version
  ) {
    diagnostics.push(
      diagnostic(
        stage,
        'wrong_buyer_route',
        `Buyer request routed to ${versionedKey(strongest.template)} instead of ${versionedKey(benchmarkCase.template)}.`,
      ),
    )
  }

  return { stage, status: diagnostics.length === 0 ? 'pass' : 'fail', diagnostics }
}

function runSellerMatcherStage(
  benchmarkCase: CommerceBenchmarkCase,
  template: CommerceTemplate | undefined,
  templates: CommerceTemplate[],
): CommerceBenchmarkStageResult {
  const stage: CommerceBenchmarkExecutableStage = 'seller-template-matching'
  if (!template) {
    return {
      stage,
      status: 'fail',
      diagnostics: [
        diagnostic(stage, 'template_not_found', 'Seller matcher cannot run because the benchmark template is missing.'),
      ],
    }
  }

  const matches = matchCommerceTemplates(templates, canonicalSellerEvidence(template), {
    limit: 3,
    minimumScore: 12,
  })
  const strongest = matches[0]
  const diagnostics: CommerceBenchmarkDiagnostic[] = []

  if (!strongest) {
    diagnostics.push(
      diagnostic(stage, 'no_seller_match', `Canonical seller evidence produced no match for ${versionedKey(benchmarkCase.template)}.`),
    )
  } else if (strongest.template.id !== template.id || strongest.template.version !== template.version) {
    diagnostics.push(
      diagnostic(
        stage,
        'wrong_seller_match',
        `Canonical seller evidence matched ${strongest.template.id}@${strongest.template.version} instead of ${versionedKey(benchmarkCase.template)}.`,
      ),
    )
  }

  return { stage, status: diagnostics.length === 0 ? 'pass' : 'fail', diagnostics }
}

function runIntelligenceStage(
  benchmarkCase: CommerceBenchmarkCase,
  template: CommerceTemplate | undefined,
  templates: CommerceTemplate[],
): CommerceBenchmarkStageResult {
  const stage: CommerceBenchmarkExecutableStage = 'template-intelligence'
  if (!template) {
    return {
      stage,
      status: 'fail',
      diagnostics: [
        diagnostic(stage, 'template_not_found', 'Template intelligence cannot run because the benchmark template is missing.'),
      ],
    }
  }

  const intelligence = resolveCommerceTemplateIntelligence(
    templates,
    canonicalSellerEvidence(template),
    { matchLimit: 3, minimumScore: 12, includeOpportunity: true },
  )
  const strongest = intelligence.matches[0]
  const diagnostics: CommerceBenchmarkDiagnostic[] = []

  if (!strongest) {
    diagnostics.push(
      diagnostic(stage, 'no_intelligence_match', `Template intelligence produced no match for ${versionedKey(benchmarkCase.template)}.`),
    )
  } else if (strongest.template.id !== template.id || strongest.template.version !== template.version) {
    diagnostics.push(
      diagnostic(
        stage,
        'wrong_intelligence_match',
        `Template intelligence ranked ${strongest.template.id}@${strongest.template.version} above ${versionedKey(benchmarkCase.template)}.`,
      ),
    )
  }

  const factsByKey = new Map(
    intelligence.facts.map((resolved) => [resolved.fact.key, resolved] as const),
  )
  for (const factKey of benchmarkCase.expected.requiredFactKeys) {
    const resolved = factsByKey.get(factKey)
    if (!resolved) {
      diagnostics.push(
        diagnostic(stage, 'expected_fact_missing', `Template intelligence did not surface scenario-required fact ${factKey}.`),
      )
      continue
    }

    const expectedSource = resolved.sources.some(
      (source) => source.ref.id === template.id && source.ref.version === template.version,
    )
    if (!expectedSource) {
      diagnostics.push(
        diagnostic(
          stage,
          'expected_fact_source_missing',
          `Template intelligence surfaced ${factKey} without provenance from ${versionedKey(benchmarkCase.template)}.`,
        ),
      )
    }
  }

  return { stage, status: diagnostics.length === 0 ? 'pass' : 'fail', diagnostics }
}

function runCase(
  benchmarkCase: CommerceBenchmarkCase,
  templateByKey: Map<string, CommerceTemplate>,
  templates: CommerceTemplate[],
): CommerceBenchmarkCaseResult {
  const template = templateByKey.get(versionedKey(benchmarkCase.template))
  const stages = [
    runTemplateContractStage(benchmarkCase, template),
    runBuyerIntentRoutingStage(benchmarkCase, templates),
    runSellerMatcherStage(benchmarkCase, template, templates),
    runIntelligenceStage(benchmarkCase, template, templates),
  ]

  return {
    id: benchmarkCase.id,
    template: { ...benchmarkCase.template },
    status: stages.every((stage) => stage.status === 'pass') ? 'pass' : 'fail',
    stages,
  }
}

/**
 * Execute every deterministic benchmark stage that has a truthful fixture today.
 * CommerceTemplate remains knowledge-only: configured offer schemas and prices
 * live in the separate benchmark-only transaction fixture layer.
 */
export function runCommerceBenchmark(options?: CommerceBenchmarkRunOptions): CommerceBenchmarkRun {
  const templates = options?.templates ?? listCommerceTemplates({ status: 'active' })
  const corpus = options?.corpus
    ?? (options?.templates ? compileCommerceBenchmark(templates) : commerceBenchmark)
  const templateByKey = new Map(
    templates.map((template) => [versionedKey(template), template] as const),
  )
  const cases = corpus.cases.map((benchmarkCase) => runCase(benchmarkCase, templateByKey, templates))
  const failedCases = cases.filter((benchmarkCase) => benchmarkCase.status === 'fail').length

  const fixtureSource = options?.transactionFixtures ?? commerceBenchmarkTransactionFixtures
  const selectedFixtures = transactionFixturesForCorpus(corpus, fixtureSource)
  const transactionTemplateCoverageComplete = hasCompleteTransactionTemplateCoverage(corpus, selectedFixtures)
  const transactionFixtures = runCommerceBenchmarkTransactionFixtures(selectedFixtures, templates)
  const failedTransactionFixtures = transactionFixtures.filter((fixture) => fixture.status === 'fail').length
  const coverage = coverageFor(transactionTemplateCoverageComplete)

  return {
    runnerVersion: COMMERCE_BENCHMARK_RUNNER_VERSION,
    corpusFormatVersion: corpus.formatVersion,
    ok: failedCases === 0 && failedTransactionFixtures === 0 && transactionTemplateCoverageComplete,
    completeLifecycleCoverage: false,
    transactionTemplateCoverageComplete,
    coverage,
    summary: {
      caseCount: cases.length,
      passedCases: cases.length - failedCases,
      failedCases,
      transactionFixtureCount: transactionFixtures.length,
      passedTransactionFixtures: transactionFixtures.length - failedTransactionFixtures,
      failedTransactionFixtures,
      exercisedStageCount: coverage.filter((entry) => entry.status === 'exercised').length,
      notExercisedStageCount: coverage.filter((entry) => entry.status === 'not-exercised').length,
    },
    cases,
    transactionFixtures,
  }
}
