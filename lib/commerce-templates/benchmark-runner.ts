import {
  commerceBenchmark,
  compileCommerceBenchmark,
  type CommerceBenchmarkCase,
  type CommerceBenchmarkCorpus,
} from './benchmark'
import { resolveCommerceTemplateIntelligence } from './intelligence'
import { matchCommerceTemplates, type CommerceTemplateMatchInput } from './matcher'
import { listCommerceTemplates } from './registry'
import type { CommerceTemplate, CommerceTemplateRef } from './schema'

export const COMMERCE_BENCHMARK_RUNNER_VERSION = 1 as const

export type CommerceBenchmarkExecutableStage =
  | 'template-contract'
  | 'seller-template-matching'
  | 'template-intelligence'

export type CommerceBenchmarkCoverageStage =
  | CommerceBenchmarkExecutableStage
  | 'buyer-intent-routing'
  | 'must-not-behavior'
  | 'offer-configuration'
  | 'deterministic-pricing'

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
  coverage: CommerceBenchmarkCoverage[]
  summary: {
    caseCount: number
    passedCases: number
    failedCases: number
    exercisedStageCount: number
    notExercisedStageCount: number
  }
  cases: CommerceBenchmarkCaseResult[]
}

export type CommerceBenchmarkRunOptions = {
  corpus?: CommerceBenchmarkCorpus
  templates?: CommerceTemplate[]
}

const COVERAGE: CommerceBenchmarkCoverage[] = [
  {
    stage: 'template-contract',
    status: 'exercised',
    reason: 'Checks each benchmark expectation against the exact versioned CommerceTemplate definition.',
  },
  {
    stage: 'seller-template-matching',
    status: 'exercised',
    reason: 'Runs the production deterministic seller/intake matcher against canonical merchant-facing evidence from the owning template.',
  },
  {
    stage: 'template-intelligence',
    status: 'exercised',
    reason: 'Runs the production intelligence resolver and verifies required facts are surfaced from the expected template.',
  },
  {
    stage: 'buyer-intent-routing',
    status: 'not-exercised',
    reason: 'CommerceEval includes buyer request text, but Nexez does not yet expose a production buyer free-text CommerceTemplate router.',
  },
  {
    stage: 'must-not-behavior',
    status: 'not-exercised',
    reason: 'CommerceEval mustNot entries are behavioral guardrails; the current corpus does not define an executable buyer-agent response fixture.',
  },
  {
    stage: 'offer-configuration',
    status: 'not-exercised',
    reason: 'The current CommerceEval contract does not include a merchant OfferInputField fixture or normalized buyer configuration.',
  },
  {
    stage: 'deterministic-pricing',
    status: 'not-exercised',
    reason: 'The current CommerceEval contract does not include merchant-authored pricing rules, currency, base price, or expected final amount.',
  },
]

function versionedKey(ref: CommerceTemplateRef): string {
  return `${ref.id}@${ref.version}`
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

  const requiredFacts = new Map(template.requiredFacts.map((fact) => [fact.key, fact] as const))
  for (const factKey of benchmarkCase.expected.requiredFactKeys) {
    if (!requiredFacts.has(factKey)) {
      diagnostics.push(
        diagnostic(
          stage,
          'required_fact_not_required',
          `Expected required fact ${factKey} is not authored as a required fact on ${versionedKey(benchmarkCase.template)}.`,
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
        diagnostic(stage, 'required_fact_missing', `Template intelligence did not surface required fact ${factKey}.`),
      )
      continue
    }

    if (resolved.fact.importance !== 'required') {
      diagnostics.push(
        diagnostic(
          stage,
          'required_fact_wrong_importance',
          `Template intelligence surfaced ${factKey} with importance ${resolved.fact.importance} instead of required.`,
        ),
      )
    }

    const expectedSource = resolved.sources.some(
      (source) => source.ref.id === template.id && source.ref.version === template.version,
    )
    if (!expectedSource) {
      diagnostics.push(
        diagnostic(
          stage,
          'required_fact_source_missing',
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
 * Execute the portions of the CommerceEval corpus that map to production
 * deterministic primitives today. The returned coverage ledger is part of the
 * contract: a green run must never be mistaken for buyer-routing, behavioral,
 * configuration, or pricing coverage that the current corpus cannot express.
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
  const coverage = COVERAGE.map((entry) => ({ ...entry }))

  return {
    runnerVersion: COMMERCE_BENCHMARK_RUNNER_VERSION,
    corpusFormatVersion: corpus.formatVersion,
    ok: failedCases === 0,
    completeLifecycleCoverage: false,
    coverage,
    summary: {
      caseCount: cases.length,
      passedCases: cases.length - failedCases,
      failedCases,
      exercisedStageCount: coverage.filter((entry) => entry.status === 'exercised').length,
      notExercisedStageCount: coverage.filter((entry) => entry.status === 'not-exercised').length,
    },
    cases,
  }
}
