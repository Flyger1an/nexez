import { priceOfferConfiguration } from '../offer-configuration-pricing'
import { validateOfferInputField } from '../offer-configuration'
import {
  getOfferFulfillmentRules,
  getOfferReservableResourceTerms,
  getOfferStagedSettlementTerms,
} from '../configured-offer'
import type { ConditionalFulfillmentEvaluation } from '../conditional-fulfillment'
import { resolveResourceRequirementQuantities } from '../reservable-resource'
import { resolveStagedSettlement } from '../staged-settlement'
import {
  validateOfferTransactionConfiguration,
  type OfferTransactionConfiguration,
} from '../offer-transaction-configuration'
import type { CommerceTemplate, CommerceTemplateRef } from './schema'
import type { CommerceBenchmarkTransactionFixture } from './benchmark-transaction-fixtures'

export type CommerceBenchmarkTransactionStage =
  | 'offer-configuration'
  | 'deterministic-pricing'
  | 'conditional-fulfillment'
  | 'staged-settlement'
  | 'reservable-resources'

export type CommerceBenchmarkTransactionDiagnostic = {
  stage: CommerceBenchmarkTransactionStage
  code: string
  message: string
}

export type CommerceBenchmarkTransactionStageResult = {
  stage: CommerceBenchmarkTransactionStage
  status: 'pass' | 'fail'
  diagnostics: CommerceBenchmarkTransactionDiagnostic[]
}

export type CommerceBenchmarkTransactionFixtureResult = {
  id: string
  template: CommerceTemplateRef
  status: 'pass' | 'fail'
  stages: CommerceBenchmarkTransactionStageResult[]
}

function versionedKey(ref: CommerceTemplateRef): string {
  return `${ref.id}@${ref.version}`
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value != null && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'undefined'
}

function diagnostic(
  stage: CommerceBenchmarkTransactionStage,
  code: string,
  message: string,
): CommerceBenchmarkTransactionDiagnostic {
  return { stage, code, message }
}

function configurationStage(
  fixture: CommerceBenchmarkTransactionFixture,
  templateByKey: Map<string, CommerceTemplate>,
): {
  result: CommerceBenchmarkTransactionStageResult
  normalized: OfferTransactionConfiguration | null
  fulfillment: ConditionalFulfillmentEvaluation | null
} {
  const stage: CommerceBenchmarkTransactionStage = 'offer-configuration'
  const diagnostics: CommerceBenchmarkTransactionDiagnostic[] = []

  if (!fixture.benchmarkOnly) {
    diagnostics.push(diagnostic(stage, 'fixture_not_benchmark_only', `${fixture.id} is not explicitly benchmark-only.`))
  }

  if (!templateByKey.has(versionedKey(fixture.template))) {
    diagnostics.push(
      diagnostic(
        stage,
        'fixture_template_not_found',
        `${fixture.id} references missing template ${versionedKey(fixture.template)}.`,
      ),
    )
  }

  for (const [index, field] of (fixture.offer.customerInputs ?? []).entries()) {
    const validated = validateOfferInputField(field)
    if (!validated.ok) {
      diagnostics.push(
        diagnostic(
          stage,
          'fixture_offer_schema_invalid',
          `${fixture.id} customerInputs[${index}] is invalid: ${validated.error}`,
        ),
      )
    }
  }

  const validation = validateOfferTransactionConfiguration(fixture.offer, fixture.rawConfiguration)
  if (!validation.ok) {
    for (const error of validation.errors) {
      diagnostics.push(
        diagnostic(
          stage,
          `configuration_${error.code}`,
          `${fixture.id}${error.key ? ` field ${error.key}` : ''}: ${error.message}`,
        ),
      )
    }
    return {
      result: { stage, status: 'fail', diagnostics },
      normalized: null,
      fulfillment: null,
    }
  }

  if (canonical(validation.value) !== canonical(fixture.expected.normalizedConfiguration)) {
    diagnostics.push(
      diagnostic(
        stage,
        'configuration_normalization_mismatch',
        `${fixture.id} normalized buyer configuration does not match the benchmark expectation.`,
      ),
    )
  }

  return {
    result: { stage, status: diagnostics.length === 0 ? 'pass' : 'fail', diagnostics },
    normalized: validation.value,
    fulfillment: validation.fulfillment,
  }
}

function pricingStage(
  fixture: CommerceBenchmarkTransactionFixture,
  normalized: OfferTransactionConfiguration | null,
  configurationPassed: boolean,
): CommerceBenchmarkTransactionStageResult {
  const stage: CommerceBenchmarkTransactionStage = 'deterministic-pricing'
  const diagnostics: CommerceBenchmarkTransactionDiagnostic[] = []

  if (!configurationPassed || !normalized) {
    diagnostics.push(
      diagnostic(
        stage,
        'pricing_skipped_configuration_failed',
        `${fixture.id} cannot price because offer configuration validation failed.`,
      ),
    )
    return { stage, status: 'fail', diagnostics }
  }

  const expected = fixture.expected.pricing
  const priced = priceOfferConfiguration(fixture.offer, normalized, fixture.currency)

  if (!priced.ok) {
    if (expected.outcome === 'blocked') {
      if (priced.code !== expected.code) {
        diagnostics.push(
          diagnostic(
            stage,
            'pricing_block_code_mismatch',
            `${fixture.id} blocked with ${priced.code}; expected ${expected.code}.`,
          ),
        )
      }
      if (canonical(priced.fields) !== canonical(expected.fields)) {
        diagnostics.push(
          diagnostic(
            stage,
            'pricing_block_fields_mismatch',
            `${fixture.id} blocked on different fields than the benchmark expectation.`,
          ),
        )
      }
      return { stage, status: diagnostics.length === 0 ? 'pass' : 'fail', diagnostics }
    }

    diagnostics.push(
      diagnostic(stage, priced.code, `${fixture.id}: ${priced.error}`),
    )
    return { stage, status: 'fail', diagnostics }
  }

  if (expected.outcome === 'blocked') {
    diagnostics.push(
      diagnostic(
        stage,
        'pricing_unexpectedly_resolved',
        `${fixture.id} produced a deterministic price but the benchmark expects pricing to fail closed.`,
      ),
    )
    return { stage, status: 'fail', diagnostics }
  }

  if (!priced.pricing) {
    diagnostics.push(
      diagnostic(
        stage,
        'pricing_snapshot_missing',
        `${fixture.id} produced no configured pricing snapshot.`,
      ),
    )
    return { stage, status: 'fail', diagnostics }
  }

  if (priced.pricing.baseAmount !== expected.baseAmount) {
    diagnostics.push(
      diagnostic(stage, 'pricing_base_mismatch', `${fixture.id} base amount was ${priced.pricing.baseAmount}; expected ${expected.baseAmount}.`),
    )
  }
  if (priced.pricing.adjustmentAmount !== expected.adjustmentAmount) {
    diagnostics.push(
      diagnostic(
        stage,
        'pricing_adjustment_mismatch',
        `${fixture.id} adjustment amount was ${priced.pricing.adjustmentAmount}; expected ${expected.adjustmentAmount}.`,
      ),
    )
  }
  if (priced.amountCents !== expected.finalAmount || priced.pricing.finalAmount !== expected.finalAmount) {
    diagnostics.push(
      diagnostic(
        stage,
        'pricing_final_mismatch',
        `${fixture.id} final amount was ${priced.amountCents}; expected ${expected.finalAmount}.`,
      ),
    )
  }

  const actualAdjustments = priced.pricing.adjustments.map((adjustment) => ({
    fieldKey: adjustment.fieldKey,
    amount: adjustment.amount,
  }))
  if (canonical(actualAdjustments) !== canonical(expected.adjustments)) {
    diagnostics.push(
      diagnostic(
        stage,
        'pricing_adjustment_detail_mismatch',
        `${fixture.id} pricing adjustment provenance does not match the benchmark expectation.`,
      ),
    )
  }

  return { stage, status: diagnostics.length === 0 ? 'pass' : 'fail', diagnostics }
}

function fulfillmentStage(
  fixture: CommerceBenchmarkTransactionFixture,
  fulfillment: ConditionalFulfillmentEvaluation | null,
  configurationPassed: boolean,
): CommerceBenchmarkTransactionStageResult {
  const stage: CommerceBenchmarkTransactionStage = 'conditional-fulfillment'
  const diagnostics: CommerceBenchmarkTransactionDiagnostic[] = []
  const rules = getOfferFulfillmentRules(fixture.offer)
  const expected = fixture.expected.fulfillment

  if (!configurationPassed || !fulfillment) {
    diagnostics.push(diagnostic(stage, 'fulfillment_skipped_configuration_failed', `${fixture.id} cannot evaluate fulfillment because offer configuration validation failed.`))
    return { stage, status: 'fail', diagnostics }
  }
  if (rules.length > 0 && !expected) {
    diagnostics.push(diagnostic(stage, 'fulfillment_expectation_missing', `${fixture.id} has merchant-authored fulfillment rules but no benchmark expectation.`))
  }
  if (rules.length === 0 && expected) {
    diagnostics.push(diagnostic(stage, 'fulfillment_rules_missing', `${fixture.id} expects conditional fulfillment without merchant-authored rules.`))
  }
  if (!expected) return { stage, status: diagnostics.length === 0 ? 'pass' : 'fail', diagnostics }

  if (fulfillment.decision !== expected.decision) {
    diagnostics.push(diagnostic(stage, 'fulfillment_decision_mismatch', `${fixture.id} resolved ${fulfillment.decision}; expected ${expected.decision}.`))
  }
  if (canonical(fulfillment.matchedRuleIds) !== canonical(expected.matchedRuleIds)) {
    diagnostics.push(diagnostic(stage, 'fulfillment_rules_mismatch', `${fixture.id} matched different fulfillment rules than expected.`))
  }
  return { stage, status: diagnostics.length === 0 ? 'pass' : 'fail', diagnostics }
}

function stagedSettlementStage(
  fixture: CommerceBenchmarkTransactionFixture,
  normalized: OfferTransactionConfiguration | null,
  configurationPassed: boolean,
  pricingPassed: boolean,
): CommerceBenchmarkTransactionStageResult {
  const stage: CommerceBenchmarkTransactionStage = 'staged-settlement'
  const diagnostics: CommerceBenchmarkTransactionDiagnostic[] = []
  const terms = getOfferStagedSettlementTerms(fixture.offer)
  const expected = fixture.expected.stagedSettlement

  if (!terms && !expected) return { stage, status: 'pass', diagnostics }
  if (terms && !expected) {
    diagnostics.push(diagnostic(stage, 'staged_settlement_expectation_missing', `${fixture.id} has merchant-authored staged terms but no benchmark expectation.`))
    return { stage, status: 'fail', diagnostics }
  }
  if (!terms && expected) {
    diagnostics.push(diagnostic(stage, 'staged_settlement_terms_missing', `${fixture.id} expects staged settlement without valid merchant-authored terms.`))
    return { stage, status: 'fail', diagnostics }
  }
  if (!configurationPassed || !pricingPassed || !normalized || !terms || !expected) {
    diagnostics.push(diagnostic(stage, 'staged_settlement_prerequisite_failed', `${fixture.id} cannot resolve staged settlement because configuration or pricing failed.`))
    return { stage, status: 'fail', diagnostics }
  }

  const priced = priceOfferConfiguration(fixture.offer, normalized, fixture.currency)
  if (!priced.ok || !priced.pricing) {
    diagnostics.push(diagnostic(stage, 'staged_settlement_price_unresolved', `${fixture.id} needs one authoritative fixed total before staged allocation.`))
    return { stage, status: 'fail', diagnostics }
  }
  const resolved = resolveStagedSettlement({ terms, totalAmount: priced.amountCents, currency: fixture.currency })
  if (!resolved.ok) {
    diagnostics.push(diagnostic(stage, resolved.code, `${fixture.id}: ${resolved.error}`))
    return { stage, status: 'fail', diagnostics }
  }

  const actual = {
    totalAmount: resolved.value.totalAmount,
    currency: resolved.value.currency,
    stages: resolved.value.stages.map(({ id, amountCents }) => ({ id, amountCents })),
  }
  if (canonical(actual) !== canonical(expected)) {
    diagnostics.push(diagnostic(stage, 'staged_settlement_snapshot_mismatch', `${fixture.id} resolved a different staged payment snapshot than expected.`))
  }
  return { stage, status: diagnostics.length === 0 ? 'pass' : 'fail', diagnostics }
}

function reservableResourcesStage(
  fixture: CommerceBenchmarkTransactionFixture,
  normalized: OfferTransactionConfiguration | null,
  configurationPassed: boolean,
): CommerceBenchmarkTransactionStageResult {
  const stage: CommerceBenchmarkTransactionStage = 'reservable-resources'
  const diagnostics: CommerceBenchmarkTransactionDiagnostic[] = []
  const terms = getOfferReservableResourceTerms(fixture.offer)
  const expected = fixture.expected.resources

  if (!terms && !expected) return { stage, status: 'pass', diagnostics }
  if (terms && !expected) {
    diagnostics.push(diagnostic(stage, 'resource_expectation_missing', `${fixture.id} has merchant-authored resource terms but no benchmark expectation.`))
    return { stage, status: 'fail', diagnostics }
  }
  if (!terms && expected) {
    diagnostics.push(diagnostic(stage, 'resource_terms_missing', `${fixture.id} expects resources without valid merchant-authored terms.`))
    return { stage, status: 'fail', diagnostics }
  }
  if (!configurationPassed || !normalized || !terms || !expected) {
    diagnostics.push(diagnostic(stage, 'resource_prerequisite_failed', `${fixture.id} cannot resolve resource quantities because configuration failed.`))
    return { stage, status: 'fail', diagnostics }
  }

  const resolved = resolveResourceRequirementQuantities(terms, normalized)
  if (!resolved.ok) {
    diagnostics.push(diagnostic(stage, resolved.code, `${fixture.id}: ${resolved.error}`))
    return { stage, status: 'fail', diagnostics }
  }
  const actual = {
    requirements: resolved.value.map(({ poolId, windowId, resolvedQuantity }) => ({
      poolId,
      ...(windowId ? { windowId } : {}),
      resolvedQuantity,
    })),
  }
  if (canonical(actual) !== canonical(expected)) {
    diagnostics.push(diagnostic(stage, 'resource_resolution_mismatch', `${fixture.id} resolved different resource quantities than expected.`))
  }
  return { stage, status: diagnostics.length === 0 ? 'pass' : 'fail', diagnostics }
}

export function runCommerceBenchmarkTransactionFixture(
  fixture: CommerceBenchmarkTransactionFixture,
  templates: CommerceTemplate[],
): CommerceBenchmarkTransactionFixtureResult {
  const templateByKey = new Map(
    templates.map((template) => [versionedKey(template), template] as const),
  )
  const configuration = configurationStage(fixture, templateByKey)
  const pricing = pricingStage(
    fixture,
    configuration.normalized,
    configuration.result.status === 'pass',
  )
  const fulfillment = fulfillmentStage(
    fixture,
    configuration.fulfillment,
    configuration.result.status === 'pass',
  )
  const stagedSettlement = stagedSettlementStage(
    fixture,
    configuration.normalized,
    configuration.result.status === 'pass',
    pricing.status === 'pass',
  )
  const reservableResources = reservableResourcesStage(
    fixture,
    configuration.normalized,
    configuration.result.status === 'pass',
  )
  const stages = [configuration.result, pricing, fulfillment, stagedSettlement, reservableResources]

  return {
    id: fixture.id,
    template: { ...fixture.template },
    status: stages.every((stage) => stage.status === 'pass') ? 'pass' : 'fail',
    stages,
  }
}

export function runCommerceBenchmarkTransactionFixtures(
  fixtures: CommerceBenchmarkTransactionFixture[],
  templates: CommerceTemplate[],
): CommerceBenchmarkTransactionFixtureResult[] {
  return fixtures.map((fixture) => runCommerceBenchmarkTransactionFixture(fixture, templates))
}
