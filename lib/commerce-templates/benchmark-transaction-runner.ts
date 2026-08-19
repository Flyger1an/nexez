import { priceOfferConfiguration } from '../offer-configuration-pricing'
import { validateOfferInputField } from '../offer-configuration'
import {
  validateOfferTransactionConfiguration,
  type OfferTransactionConfiguration,
} from '../offer-transaction-configuration'
import type { CommerceTemplate, CommerceTemplateRef } from './schema'
import type { CommerceBenchmarkTransactionFixture } from './benchmark-transaction-fixtures'

export type CommerceBenchmarkTransactionStage =
  | 'offer-configuration'
  | 'deterministic-pricing'

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

  const priced = priceOfferConfiguration(fixture.offer, normalized, fixture.currency)
  if (!priced.ok) {
    diagnostics.push(
      diagnostic(stage, priced.code, `${fixture.id}: ${priced.error}`),
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

  const expected = fixture.expected.pricing
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
  const stages = [configuration.result, pricing]

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
