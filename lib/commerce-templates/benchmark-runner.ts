import {
  commerceBenchmark,
  compileCommerceBenchmark,
  type CommerceBenchmarkCase,
  type CommerceBenchmarkCorpus,
} from './benchmark'
import {
  commerceBenchmarkBuyerPreflightFixtures,
  type CommerceBenchmarkBuyerPreflightFixture,
} from './benchmark-buyer-preflight-fixtures'
import {
  runCommerceBenchmarkBuyerPreflight,
  type CommerceBenchmarkBuyerPreflightCaseResult,
  type CommerceBenchmarkBuyerPreflightRun,
} from './benchmark-buyer-preflight-runner'
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

export const COMMERCE_BENCHMARK_RUNNER_VERSION = 4 as const
export const COMMERCE_BUYER_BEHAVIOR_SCOPE = 'nexez-reference-preflight' as const

export type CommerceBenchmarkExecutableStage =
  | 'template-contract'
  | 'buyer-intent-routing'
  | 'seller-template-matching'
  | 'template-intelligence'
  | 'must-not-behavior'
  | CommerceBenchmarkTransactionStage

export type CommerceBenchmarkCoverageStage = CommerceBenchmarkExecutableStage

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
  completeLifecycleCoverage: boolean
  buyerBehaviorScope: typeof COMMERCE_BUYER_BEHAVIOR_SCOPE
  buyerPreflightCoverageComplete: boolean
  transactionTemplateCoverageComplete: boolean
  coverage: CommerceBenchmarkCoverage[]
  summary: {
    caseCount: number
    passedCases: number
    failedCases: number
    guardrailAssertionCount: number
    passedGuardrailAssertions: number
    failedGuardrailAssertions: number
    transactionFixtureCount: number
    passedTransactionFixtures: number
    failedTransactionFixtures: number
    exercisedStageCount: number
    notExercisedStageCount: number
  }
  cases: CommerceBenchmarkCaseResult[]
  buyerPreflight: CommerceBenchmarkBuyerPreflightRun
  transactionFixtures: CommerceBenchmarkTransactionFixtureResult[]
}

export type CommerceBenchmarkRunOptions = {
  corpus?: CommerceBenchmarkCorpus
  templates?: CommerceTemplate[]
  buyerPreflightFixtures?: CommerceBenchmarkBuyerPreflightFixture[]
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

function buyerPreflightFixturesForCorpus(
  corpus: CommerceBenchmarkCorpus,
  fixtures: CommerceBenchmarkBuyerPreflightFixture[],
): CommerceBenchmarkBuyerPreflightFixture[] {
  const caseIds = new Set(corpus.cases.map((benchmarkCase) => benchmarkCase.id))
  return fixtures.filter((fixture) => caseIds.has(fixture.caseId))
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
  guardrailsRequired: boolean,
  buyerPreflightCoverageComplete: boolean,
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
      status: guardrailsRequired && buyerPreflightCoverageComplete ? 'exercised' : 'not-exercised',
      reason: guardrailsRequired
        ? buyerPreflightCoverageComplete
          ? 'Runs every authored mustNot guardrail through the production Nexez reference-agent claim preflight and requires each adversarial unsourced or altered claim to fail for the expected provenance reason. This certifies Nexez reference preflight behavior, not arbitrary third-party model obedience.'
          : 'At least one authored mustNot guardrail lacks a passing Nexez reference-agent adversarial preflight assertion.'
        : 'This corpus slice declares no mustNot behavior to exercise.',
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
        ? 'Runs normalized benchmark buyer configurations through production pricing and verifies exact priced snapshots or the exact expected fail-closed pricing outcome.'
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

function runMustNotStage(
  preflight: CommerceBenchmarkBuyerPreflightCaseResult | undefined,
): CommerceBenchmarkStageResult {
  const stage: CommerceBenchmarkExecutableStage = 'must-not-behavior'
  if (!preflight) {
    return {
      stage,
      status: 'fail',
      diagnostics: [
        diagnostic(stage, 'buyer_preflight_result_missing', 'Buyer must-not preflight result is missing for this benchmark case.'),
      ],
    }
  }

  return {
    stage,
    status: preflight.status,
    diagnostics: preflight.diagnostics.map((item) =>
      diagnostic(stage, item.code, item.mustNot ? `${item.message} Guardrail: ${item.mustNot}` : item.message),
    ),
  }
}

function runCase(
  benchmarkCase: CommerceBenchmarkCase,
  templateByKey: Map<string, CommerceTemplate>,
  templates: CommerceTemplate[],
  buyerPreflightByCaseId: Map<string, CommerceBenchmarkBuyerPreflightCaseResult>,
): CommerceBenchmarkCaseResult {
  const template = templateByKey.get(versionedKey(benchmarkCase.template))
  const stages = [
    runTemplateContractStage(benchmarkCase, template),
    runBuyerIntentRoutingStage(benchmarkCase, templates),
    runSellerMatcherStage(benchmarkCase, template, templates),
    runIntelligenceStage(benchmarkCase, template, templates),
    runMustNotStage(buyerPreflightByCaseId.get(benchmarkCase.id)),
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
 * CommerceTemplate remains knowledge-only: configured offer schemas, synthetic
 * prices, and adversarial buyer claims live in separate benchmark-only fixtures.
 */
export function runCommerceBenchmark(options?: CommerceBenchmarkRunOptions): CommerceBenchmarkRun {
  const templates = options?.templates ?? listCommerceTemplates({ status: 'active' })
  const corpus = options?.corpus
    ?? (options?.templates ? compileCommerceBenchmark(templates) : commerceBenchmark)
  const templateByKey = new Map(
    templates.map((template) => [versionedKey(template), template] as const),
  )

  const guardrailsRequired = corpus.cases.some((benchmarkCase) => benchmarkCase.expected.mustNot.length > 0)
  const buyerPreflightFixtureSource = options?.buyerPreflightFixtures ?? commerceBenchmarkBuyerPreflightFixtures
  const selectedBuyerPreflightFixtures = buyerPreflightFixturesForCorpus(corpus, buyerPreflightFixtureSource)
  const buyerPreflight = runCommerceBenchmarkBuyerPreflight(
    corpus,
    templates,
    selectedBuyerPreflightFixtures,
  )
  const buyerPreflightCoverageComplete = guardrailsRequired && buyerPreflight.coverageComplete
  const buyerPreflightByCaseId = new Map(
    buyerPreflight.cases.map((result) => [result.caseId, result] as const),
  )

  const cases = corpus.cases.map((benchmarkCase) =>
    runCase(benchmarkCase, templateByKey, templates, buyerPreflightByCaseId),
  )
  const failedCases = cases.filter((benchmarkCase) => benchmarkCase.status === 'fail').length

  const fixtureSource = options?.transactionFixtures ?? commerceBenchmarkTransactionFixtures
  const selectedFixtures = transactionFixturesForCorpus(corpus, fixtureSource)
  const transactionTemplateCoverageComplete = hasCompleteTransactionTemplateCoverage(corpus, selectedFixtures)
  const transactionFixtures = runCommerceBenchmarkTransactionFixtures(selectedFixtures, templates)
  const failedTransactionFixtures = transactionFixtures.filter((fixture) => fixture.status === 'fail').length
  const coverage = coverageFor(
    transactionTemplateCoverageComplete,
    guardrailsRequired,
    buyerPreflightCoverageComplete,
  )
  const buyerCoverageSatisfied = !guardrailsRequired || buyerPreflightCoverageComplete
  const ok = failedCases === 0
    && failedTransactionFixtures === 0
    && transactionTemplateCoverageComplete
    && buyerCoverageSatisfied
  const completeLifecycleCoverage = ok && coverage.every((entry) => entry.status === 'exercised')

  return {
    runnerVersion: COMMERCE_BENCHMARK_RUNNER_VERSION,
    corpusFormatVersion: corpus.formatVersion,
    ok,
    completeLifecycleCoverage,
    buyerBehaviorScope: COMMERCE_BUYER_BEHAVIOR_SCOPE,
    buyerPreflightCoverageComplete,
    transactionTemplateCoverageComplete,
    coverage,
    summary: {
      caseCount: cases.length,
      passedCases: cases.length - failedCases,
      failedCases,
      guardrailAssertionCount: buyerPreflight.assertionCount,
      passedGuardrailAssertions: buyerPreflight.passedAssertions,
      failedGuardrailAssertions: buyerPreflight.failedAssertions,
      transactionFixtureCount: transactionFixtures.length,
      passedTransactionFixtures: transactionFixtures.length - failedTransactionFixtures,
      failedTransactionFixtures,
      exercisedStageCount: coverage.filter((entry) => entry.status === 'exercised').length,
      notExercisedStageCount: coverage.filter((entry) => entry.status === 'not-exercised').length,
    },
    cases,
    buyerPreflight,
    transactionFixtures,
  }
}
