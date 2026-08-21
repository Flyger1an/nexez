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
  name: 'offer-configuration' | 'deterministic-pricing' | 'conditional-fulfillment' | 'staged-settlement' | 'reservable-resources',
) {
  const found = result.stages.find((candidate) => candidate.stage === name)
  if (!found) throw new Error(`Missing ${name} stage`)
  return found
}

describe('commerce benchmark transaction fixtures', () => {
  it('covers every active template and passes through production transaction behavior', () => {
    const templates = listCommerceTemplates({ status: 'active' })
    const results = runCommerceBenchmarkTransactionFixtures(
      commerceBenchmarkTransactionFixtures,
      templates,
    )

    const coveredTemplates = new Set(commerceBenchmarkTransactionFixtures.map((item) => `${item.template.id}@${item.template.version}`))
    expect(coveredTemplates.size).toBe(templates.length)
    expect(templates.every((template) => coveredTemplates.has(`${template.id}@${template.version}`))).toBe(true)
    expect(results).toHaveLength(commerceBenchmarkTransactionFixtures.length)
    expect(results.every((result) => result.status === 'pass')).toBe(true)
    expect(results.every((result) => result.stages.every((entry) => entry.status === 'pass'))).toBe(true)
  })

  it('proves Party Rentals through separate inventory-hold and staged-payment paths', () => {
    const templates = listCommerceTemplates({ status: 'active' })
    const inventory = runCommerceBenchmarkTransactionFixture(
      fixture('events.party-rentals.inventory-transaction'),
      templates,
    )
    const staged = runCommerceBenchmarkTransactionFixture(
      fixture('events.party-rentals.staged-transaction'),
      templates,
    )

    expect(inventory.status).toBe('pass')
    expect(stage(inventory, 'conditional-fulfillment')).toMatchObject({ status: 'pass' })
    expect(stage(inventory, 'reservable-resources')).toMatchObject({ status: 'pass' })
    expect(stage(inventory, 'staged-settlement')).toMatchObject({ status: 'pass' })

    expect(staged.status).toBe('pass')
    expect(stage(staged, 'conditional-fulfillment')).toMatchObject({ status: 'pass' })
    expect(stage(staged, 'staged-settlement')).toMatchObject({ status: 'pass' })
    expect(stage(staged, 'reservable-resources')).toMatchObject({ status: 'pass' })
  })

  it('fails a Party Rentals resource benchmark when requested quantities drift', () => {
    const mutated = fixture('events.party-rentals.inventory-transaction')
    if (!mutated.expected.resources) throw new Error('Missing Party Rentals resource expectation')
    mutated.expected.resources.requirements[0]!.resolvedQuantity = 79

    const result = runCommerceBenchmarkTransactionFixture(
      mutated,
      listCommerceTemplates({ status: 'active' }),
    )

    expect(result.status).toBe('fail')
    expect(stage(result, 'reservable-resources').diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'resource_resolution_mismatch' })]),
    )
  })

  it('fails a Party Rentals staged benchmark when payment allocation drifts', () => {
    const mutated = fixture('events.party-rentals.staged-transaction')
    if (!mutated.expected.stagedSettlement) throw new Error('Missing Party Rentals staged expectation')
    mutated.expected.stagedSettlement.stages[0]!.amountCents += 100

    const result = runCommerceBenchmarkTransactionFixture(
      mutated,
      listCommerceTemplates({ status: 'active' }),
    )

    expect(result.status).toBe('fail')
    expect(stage(result, 'staged-settlement').diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'staged_settlement_snapshot_mismatch' })]),
    )
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

  it('treats quote-required unresolved pricing as a passing fail-closed outcome', () => {
    const result = runCommerceBenchmarkTransactionFixture(
      fixture('professional.web-design-project.transaction'),
      listCommerceTemplates({ status: 'active' }),
    )

    expect(result.status).toBe('pass')
    expect(stage(result, 'offer-configuration').status).toBe('pass')
    expect(stage(result, 'deterministic-pricing')).toEqual({
      stage: 'deterministic-pricing',
      status: 'pass',
      diagnostics: [],
    })
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
    if (mutated.expected.pricing.outcome !== 'priced') throw new Error('Expected priced detailing fixture')
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

  it('fails when a quote-required fixture stops matching its expected block reason', () => {
    const mutated = fixture('professional.web-design-project.transaction')
    if (mutated.expected.pricing.outcome !== 'blocked') throw new Error('Expected blocked web design fixture')
    mutated.expected.pricing.code = 'pricing_base_unavailable'

    const result = runCommerceBenchmarkTransactionFixture(
      mutated,
      listCommerceTemplates({ status: 'active' }),
    )

    expect(stage(result, 'offer-configuration').status).toBe('pass')
    expect(stage(result, 'deterministic-pricing')).toMatchObject({ status: 'fail' })
    expect(stage(result, 'deterministic-pricing').diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'pricing_block_code_mismatch' }),
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
