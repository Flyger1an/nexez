import { describe, expect, it } from 'vitest'
import { listCommerceTemplates } from './registry'
import {
  commerceBenchmarkTransactionFixtures,
  type CommerceBenchmarkTransactionFixture,
} from './benchmark-transaction-fixtures'
import {
  runCommerceBenchmarkTransactionFixture,
  runCommerceBenchmarkTransactionFixtures,
} from './benchmark-transaction-runner'

function fixture(id: string): CommerceBenchmarkTransactionFixture {
  const found = commerceBenchmarkTransactionFixtures.find((candidate) => candidate.id === id)
  if (!found) throw new Error(`Missing transaction benchmark fixture ${id}`)
  return JSON.parse(JSON.stringify(found)) as CommerceBenchmarkTransactionFixture
}

function stage(
  result: ReturnType<typeof runCommerceBenchmarkTransactionFixture>,
  name: 'offer-configuration' | 'deterministic-pricing',
) {
  const found = result.stages.find((candidate) => candidate.stage === name)
  if (!found) throw new Error(`Missing ${name} stage`)
  return found
}

describe('commerce benchmark transaction fixtures', () => {
  it('covers every active pilot template and passes through production configuration + pricing', () => {
    const templates = listCommerceTemplates({ status: 'active' })
    const results = runCommerceBenchmarkTransactionFixtures(
      commerceBenchmarkTransactionFixtures,
      templates,
    )

    expect(commerceBenchmarkTransactionFixtures).toHaveLength(templates.length)
    expect(new Set(commerceBenchmarkTransactionFixtures.map((item) => `${item.template.id}@${item.template.version}`)).size)
      .toBe(templates.length)
    expect(results).toHaveLength(templates.length)
    expect(results.every((result) => result.status === 'pass')).toBe(true)
    expect(results.every((result) => result.stages.every((entry) => entry.status === 'pass'))).toBe(true)
  })

  it('canonicalizes set-like buyer configuration before pricing', () => {
    const result = runCommerceBenchmarkTransactionFixture(
      fixture('home.recurring-home-cleaning.transaction'),
      listCommerceTemplates({ status: 'active' }),
    )

    expect(result.status).toBe('pass')
    expect(stage(result, 'offer-configuration').status).toBe('pass')
    expect(stage(result, 'deterministic-pricing').status).toBe('pass')
  })

  it('fails configuration and skips pricing when buyer data violates merchant schema', () => {
    const mutated = fixture('automotive.mobile-auto-detailing.transaction')
    mutated.rawConfiguration['vehicle-class'] = 'aircraft-carrier'

    const result = runCommerceBenchmarkTransactionFixture(
      mutated,
      listCommerceTemplates({ status: 'active' }),
    )

    expect(result.status).toBe('fail')
    expect(stage(result, 'offer-configuration').diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'configuration_invalid_value' }),
      ]),
    )
    expect(stage(result, 'deterministic-pricing').diagnostics).toEqual([
      expect.objectContaining({ code: 'pricing_skipped_configuration_failed' }),
    ])
  })

  it('fails closed when a price-affecting field loses its merchant-authored rule', () => {
    const mutated = fixture('automotive.mobile-auto-detailing.transaction')
    const field = mutated.offer.customerInputs?.find((candidate) => candidate.key === 'vehicle-class')
    if (!field) throw new Error('Missing vehicle class fixture field')
    delete field.pricing

    const result = runCommerceBenchmarkTransactionFixture(
      mutated,
      listCommerceTemplates({ status: 'active' }),
    )

    expect(stage(result, 'offer-configuration').status).toBe('pass')
    expect(stage(result, 'deterministic-pricing')).toMatchObject({ status: 'fail' })
    expect(stage(result, 'deterministic-pricing').diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'pricing_rule_unresolved' }),
      ]),
    )
  })

  it('fails closed when expected final amount drifts from production pricing', () => {
    const mutated = fixture('automotive.mobile-auto-detailing.transaction')
    mutated.expected.pricing.finalAmount += 100

    const result = runCommerceBenchmarkTransactionFixture(
      mutated,
      listCommerceTemplates({ status: 'active' }),
    )

    expect(stage(result, 'offer-configuration').status).toBe('pass')
    expect(stage(result, 'deterministic-pricing')).toMatchObject({ status: 'fail' })
    expect(stage(result, 'deterministic-pricing').diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'pricing_final_mismatch' }),
      ]),
    )
  })

  it('fails closed when a transaction fixture points at a non-canonical template ref', () => {
    const mutated = fixture('automotive.mobile-auto-detailing.transaction')
    mutated.template = { id: 'automotive.not-a-template', version: 1 }

    const result = runCommerceBenchmarkTransactionFixture(
      mutated,
      listCommerceTemplates({ status: 'active' }),
    )

    expect(stage(result, 'offer-configuration')).toMatchObject({ status: 'fail' })
    expect(stage(result, 'offer-configuration').diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'fixture_template_not_found' }),
      ]),
    )
  })

  it('returns deterministic JSON-safe transaction results', () => {
    const result = runCommerceBenchmarkTransactionFixture(
      fixture('professional.business-strategy-session.transaction'),
      listCommerceTemplates({ status: 'active' }),
    )

    expect(() => JSON.stringify(result)).not.toThrow()
    expect(JSON.parse(JSON.stringify(result))).toEqual(result)
  })
})
