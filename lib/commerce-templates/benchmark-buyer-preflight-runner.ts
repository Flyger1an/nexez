import type { CommerceBenchmarkCase, CommerceBenchmarkCorpus } from './benchmark'
import {
  commerceBenchmarkBuyerPreflightFixtures,
  type CommerceBenchmarkBuyerPreflightFixture,
} from './benchmark-buyer-preflight-fixtures'
import { preflightCommerceBuyerClaims } from './buyer-preflight'
import type { CommerceTemplate } from './schema'

export type CommerceBenchmarkBuyerPreflightDiagnosticCode =
  | 'missing_template'
  | 'fixture_not_benchmark_only'
  | 'missing_guardrail_fixture'
  | 'unexpected_guardrail_fixture'
  | 'duplicate_guardrail_fixture'
  | 'guardrail_not_enforced'
  | 'unexpected_preflight_failure'
  | 'orphan_case_fixture'

export type CommerceBenchmarkBuyerPreflightDiagnostic = {
  code: CommerceBenchmarkBuyerPreflightDiagnosticCode
  message: string
  mustNot?: string
}

export type CommerceBenchmarkBuyerPreflightAssertionResult = {
  mustNot: string
  status: 'pass' | 'fail'
  expectedCode: string
  observedCodes: string[]
}

export type CommerceBenchmarkBuyerPreflightCaseResult = {
  caseId: string
  status: 'pass' | 'fail'
  assertionCount: number
  passedAssertions: number
  failedAssertions: number
  diagnostics: CommerceBenchmarkBuyerPreflightDiagnostic[]
  assertions: CommerceBenchmarkBuyerPreflightAssertionResult[]
}

export type CommerceBenchmarkBuyerPreflightRun = {
  coverageComplete: boolean
  assertionCount: number
  passedAssertions: number
  failedAssertions: number
  cases: CommerceBenchmarkBuyerPreflightCaseResult[]
  diagnostics: CommerceBenchmarkBuyerPreflightDiagnostic[]
}

function versionedKey(template: Pick<CommerceTemplate, 'id' | 'version'>): string {
  return `${template.id}@${template.version}`
}

function duplicateStrings(values: string[]): Set<string> {
  const seen = new Set<string>()
  const duplicates = new Set<string>()
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value)
    seen.add(value)
  }
  return duplicates
}

function runCase(
  benchmarkCase: CommerceBenchmarkCase,
  template: CommerceTemplate | undefined,
  fixture: CommerceBenchmarkBuyerPreflightFixture | undefined,
): CommerceBenchmarkBuyerPreflightCaseResult {
  const diagnostics: CommerceBenchmarkBuyerPreflightDiagnostic[] = []
  const expectedGuardrails = benchmarkCase.expected.mustNot
  const assertions = fixture?.assertions ?? []

  if (!template) {
    diagnostics.push({
      code: 'missing_template',
      message: `Buyer preflight cannot run because ${versionedKey(benchmarkCase.template as CommerceTemplate)} is missing.`,
    })
  }
  if (fixture && fixture.benchmarkOnly !== true) {
    diagnostics.push({
      code: 'fixture_not_benchmark_only',
      message: `${fixture.caseId} buyer preflight fixture is not explicitly benchmark-only.`,
    })
  }

  if (expectedGuardrails.length > 0 && !fixture) {
    diagnostics.push({
      code: 'missing_guardrail_fixture',
      message: `${benchmarkCase.id} declares mustNot behavior but has no adversarial buyer preflight fixture.`,
    })
  }
  if (expectedGuardrails.length === 0 && fixture && assertions.length > 0) {
    diagnostics.push({
      code: 'unexpected_guardrail_fixture',
      message: `${benchmarkCase.id} has adversarial buyer preflight assertions but declares no mustNot behavior.`,
    })
  }

  const duplicateMustNot = duplicateStrings(assertions.map((assertion) => assertion.mustNot))
  for (const mustNot of duplicateMustNot) {
    diagnostics.push({
      code: 'duplicate_guardrail_fixture',
      mustNot,
      message: `${benchmarkCase.id} has more than one adversarial assertion for ${mustNot}.`,
    })
  }

  const expectedSet = new Set(expectedGuardrails)
  const fixtureSet = new Set(assertions.map((assertion) => assertion.mustNot))
  for (const mustNot of expectedGuardrails) {
    if (!fixtureSet.has(mustNot)) {
      diagnostics.push({
        code: 'missing_guardrail_fixture',
        mustNot,
        message: `${benchmarkCase.id} is missing an adversarial assertion for ${mustNot}.`,
      })
    }
  }
  for (const mustNot of fixtureSet) {
    if (!expectedSet.has(mustNot)) {
      diagnostics.push({
        code: 'unexpected_guardrail_fixture',
        mustNot,
        message: `${benchmarkCase.id} has an adversarial assertion not declared by the canonical eval: ${mustNot}.`,
      })
    }
  }

  const assertionResults = assertions.map((assertion): CommerceBenchmarkBuyerPreflightAssertionResult => {
    if (!template || !expectedSet.has(assertion.mustNot) || duplicateMustNot.has(assertion.mustNot)) {
      return {
        mustNot: assertion.mustNot,
        status: 'fail',
        expectedCode: assertion.expectedCode,
        observedCodes: [],
      }
    }

    const preflight = preflightCommerceBuyerClaims(template, [assertion.claim], assertion.evidence)
    const observedCodes = preflight.claims.flatMap((claim) => claim.diagnostics.map((item) => item.code))

    if (preflight.ok || preflight.claims[0]?.status !== 'rejected') {
      diagnostics.push({
        code: 'guardrail_not_enforced',
        mustNot: assertion.mustNot,
        message: `${benchmarkCase.id} accepted adversarial claim for ${assertion.mustNot}.`,
      })
      return {
        mustNot: assertion.mustNot,
        status: 'fail',
        expectedCode: assertion.expectedCode,
        observedCodes,
      }
    }

    if (!observedCodes.includes(assertion.expectedCode)) {
      diagnostics.push({
        code: 'unexpected_preflight_failure',
        mustNot: assertion.mustNot,
        message: `${benchmarkCase.id} rejected ${assertion.mustNot}, but not for expected code ${assertion.expectedCode}.`,
      })
      return {
        mustNot: assertion.mustNot,
        status: 'fail',
        expectedCode: assertion.expectedCode,
        observedCodes,
      }
    }

    return {
      mustNot: assertion.mustNot,
      status: 'pass',
      expectedCode: assertion.expectedCode,
      observedCodes,
    }
  })

  const passedAssertions = assertionResults.filter((assertion) => assertion.status === 'pass').length
  const failedAssertions = assertionResults.length - passedAssertions

  return {
    caseId: benchmarkCase.id,
    status: diagnostics.length === 0 && failedAssertions === 0 ? 'pass' : 'fail',
    assertionCount: assertionResults.length,
    passedAssertions,
    failedAssertions,
    diagnostics,
    assertions: assertionResults,
  }
}

/**
 * Executes every authored CommerceEval `mustNot` against the production Nexez
 * reference-agent claim preflight. Passing means each synthetic forbidden claim
 * is rejected for the expected provenance failure. It does not certify that an
 * arbitrary third-party model will choose to call or obey this preflight.
 */
export function runCommerceBenchmarkBuyerPreflight(
  corpus: CommerceBenchmarkCorpus,
  templates: CommerceTemplate[],
  fixtures: CommerceBenchmarkBuyerPreflightFixture[] = commerceBenchmarkBuyerPreflightFixtures,
): CommerceBenchmarkBuyerPreflightRun {
  const templateByKey = new Map(
    templates.map((template) => [versionedKey(template), template] as const),
  )
  const caseIds = new Set(corpus.cases.map((benchmarkCase) => benchmarkCase.id))
  const fixtureByCaseId = new Map(fixtures.map((fixture) => [fixture.caseId, fixture] as const))
  const diagnostics: CommerceBenchmarkBuyerPreflightDiagnostic[] = []

  const duplicateFixtureCaseIds = duplicateStrings(fixtures.map((fixture) => fixture.caseId))
  for (const caseId of duplicateFixtureCaseIds) {
    diagnostics.push({
      code: 'duplicate_guardrail_fixture',
      message: `Multiple buyer preflight fixtures target benchmark case ${caseId}.`,
    })
  }
  for (const fixture of fixtures) {
    if (!caseIds.has(fixture.caseId)) {
      diagnostics.push({
        code: 'orphan_case_fixture',
        message: `Buyer preflight fixture references unknown benchmark case ${fixture.caseId}.`,
      })
    }
  }

  const cases = corpus.cases.map((benchmarkCase) => {
    const fixture = duplicateFixtureCaseIds.has(benchmarkCase.id)
      ? undefined
      : fixtureByCaseId.get(benchmarkCase.id)
    return runCase(
      benchmarkCase,
      templateByKey.get(versionedKey(benchmarkCase.template as CommerceTemplate)),
      fixture,
    )
  })

  const assertionCount = cases.reduce((total, result) => total + result.assertionCount, 0)
  const passedAssertions = cases.reduce((total, result) => total + result.passedAssertions, 0)
  const failedAssertions = cases.reduce((total, result) => total + result.failedAssertions, 0)
  const expectedAssertionCount = corpus.cases.reduce(
    (total, benchmarkCase) => total + benchmarkCase.expected.mustNot.length,
    0,
  )
  const coverageComplete = diagnostics.length === 0
    && cases.every((result) => result.status === 'pass')
    && assertionCount === expectedAssertionCount
    && passedAssertions === expectedAssertionCount

  return {
    coverageComplete,
    assertionCount,
    passedAssertions,
    failedAssertions,
    cases,
    diagnostics,
  }
}
