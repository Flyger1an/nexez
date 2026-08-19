import { describe, expect, it } from 'vitest'
import { commerceBenchmark } from './benchmark'
import {
  commerceBenchmarkBuyerPreflightFixtures,
  type CommerceBenchmarkBuyerPreflightFixture,
} from './benchmark-buyer-preflight-fixtures'
import { runCommerceBenchmarkBuyerPreflight } from './benchmark-buyer-preflight-runner'
import { listCommerceTemplates } from './registry'

function fixtures(): CommerceBenchmarkBuyerPreflightFixture[] {
  return JSON.parse(JSON.stringify(commerceBenchmarkBuyerPreflightFixtures)) as CommerceBenchmarkBuyerPreflightFixture[]
}

describe('commerce benchmark buyer preflight', () => {
  it('rejects every authored mustNot adversarial claim through production preflight', () => {
    const run = runCommerceBenchmarkBuyerPreflight(
      commerceBenchmark,
      listCommerceTemplates({ status: 'active' }),
    )

    expect(run.coverageComplete).toBe(true)
    expect(run.assertionCount).toBe(14)
    expect(run.passedAssertions).toBe(14)
    expect(run.failedAssertions).toBe(0)
    expect(run.cases.every((result) => result.status === 'pass')).toBe(true)
  })

  it('fails coverage when a canonical mustNot loses its adversarial fixture', () => {
    const mutated = fixtures()
    const cleaning = mutated.find((fixture) => fixture.caseId === 'home.recurring-home-cleaning.direct')
    if (!cleaning) throw new Error('Missing cleaning buyer preflight fixture')
    cleaning.assertions = cleaning.assertions.filter((assertion) => assertion.mustNot !== 'invent merchant price')

    const run = runCommerceBenchmarkBuyerPreflight(
      commerceBenchmark,
      listCommerceTemplates({ status: 'active' }),
      mutated,
    )
    const result = run.cases.find((candidate) => candidate.caseId === cleaning.caseId)

    expect(run.coverageComplete).toBe(false)
    expect(result?.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'missing_guardrail_fixture', mustNot: 'invent merchant price' }),
      ]),
    )
  })

  it('fails when a forbidden claim becomes supported by the supplied evidence', () => {
    const mutated = fixtures()
    const tutoring = mutated.find((fixture) => fixture.caseId === 'education.private-tutoring.direct')
    const assertion = tutoring?.assertions.find((item) => item.mustNot === 'invent student grade')
    if (!assertion) throw new Error('Missing tutoring student grade guardrail')
    assertion.claim.value = 'tenth grader'

    const run = runCommerceBenchmarkBuyerPreflight(
      commerceBenchmark,
      listCommerceTemplates({ status: 'active' }),
      mutated,
    )
    const result = run.cases.find((candidate) => candidate.caseId === tutoring?.caseId)

    expect(run.coverageComplete).toBe(false)
    expect(result?.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'guardrail_not_enforced', mustNot: 'invent student grade' }),
      ]),
    )
  })

  it('fails when the preflight rejection reason drifts from the authored expectation', () => {
    const mutated = fixtures()
    const detailing = mutated.find((fixture) => fixture.caseId === 'automotive.mobile-auto-detailing.direct')
    const assertion = detailing?.assertions.find((item) => item.mustNot === 'assume SUV surcharge')
    if (!assertion) throw new Error('Missing SUV surcharge guardrail')
    assertion.expectedCode = 'evidence_value_mismatch'

    const run = runCommerceBenchmarkBuyerPreflight(
      commerceBenchmark,
      listCommerceTemplates({ status: 'active' }),
      mutated,
    )
    const result = run.cases.find((candidate) => candidate.caseId === detailing?.caseId)

    expect(run.coverageComplete).toBe(false)
    expect(result?.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'unexpected_preflight_failure', mustNot: 'assume SUV surcharge' }),
      ]),
    )
  })

  it('fails closed on orphan benchmark fixtures', () => {
    const mutated = fixtures()
    mutated.push({
      benchmarkOnly: true,
      caseId: 'not.a.real.case',
      assertions: [],
    })

    const run = runCommerceBenchmarkBuyerPreflight(
      commerceBenchmark,
      listCommerceTemplates({ status: 'active' }),
      mutated,
    )

    expect(run.coverageComplete).toBe(false)
    expect(run.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'orphan_case_fixture' })]),
    )
  })

  it('returns deterministic JSON-safe buyer preflight reports', () => {
    const run = runCommerceBenchmarkBuyerPreflight(
      commerceBenchmark,
      listCommerceTemplates({ status: 'active' }),
    )

    expect(JSON.parse(JSON.stringify(run))).toEqual(run)
  })
})
