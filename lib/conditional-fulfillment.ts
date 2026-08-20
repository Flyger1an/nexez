import type { OfferInputField, OfferInputValueType } from './offer-configuration'
import type { OfferTransactionConfiguration } from './offer-transaction-configuration'

export const CONDITIONAL_FULFILLMENT_SCHEMA_VERSION = 1 as const
export const MAX_FULFILLMENT_RULES = 25

export type ConditionalFulfillmentDecision = 'eligible' | 'requires-review' | 'ineligible'
export type ConditionalFulfillmentBlockingDecision = Exclude<ConditionalFulfillmentDecision, 'eligible'>
export type ConditionalFulfillmentNextAction = 'contact-merchant' | 'send-proposal'
export type ConditionalFulfillmentOperator =
  | 'equals'
  | 'in'
  | 'contains'
  | 'contains-any'
  | 'contains-all'
  | 'lt'
  | 'lte'
  | 'gt'
  | 'gte'
  | 'present'
  | 'before'
  | 'on-or-before'
  | 'on-or-after'
  | 'after'

export type ConditionalFulfillmentLiteral = string | number | boolean | string[]

export type OfferFulfillmentRule = {
  id: string
  inputKey: string
  operator: ConditionalFulfillmentOperator
  value?: ConditionalFulfillmentLiteral
  decision: ConditionalFulfillmentBlockingDecision
  reasonCode: string
  message: string
  nextAction?: ConditionalFulfillmentNextAction
}

export type ConditionalFulfillmentReason = {
  ruleId: string
  inputKey: string
  decision: ConditionalFulfillmentBlockingDecision
  reasonCode: string
  message: string
  nextAction?: ConditionalFulfillmentNextAction
}

export type ConditionalFulfillmentEvaluation = {
  schemaVersion: typeof CONDITIONAL_FULFILLMENT_SCHEMA_VERSION
  decision: ConditionalFulfillmentDecision
  matchedRuleIds: string[]
  reasons: ConditionalFulfillmentReason[]
}

export type ConditionalFulfillmentValidation<T> =
  | { ok: true; value: T }
  | { ok: false; error: string }

const KEY_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/
const REASON_RE = /^[a-z0-9][a-z0-9_.-]{0,79}$/
const DECISIONS = new Set<ConditionalFulfillmentBlockingDecision>(['requires-review', 'ineligible'])
const NEXT_ACTIONS = new Set<ConditionalFulfillmentNextAction>(['contact-merchant', 'send-proposal'])
const OPERATORS = new Set<ConditionalFulfillmentOperator>([
  'equals', 'in', 'contains', 'contains-any', 'contains-all',
  'lt', 'lte', 'gt', 'gte', 'present',
  'before', 'on-or-before', 'on-or-after', 'after',
])

const OPERATORS_BY_TYPE: Record<OfferInputValueType, readonly ConditionalFulfillmentOperator[]> = {
  boolean: ['equals'],
  'single-select': ['equals', 'in'],
  'multi-select': ['contains', 'contains-any', 'contains-all'],
  number: ['equals', 'lt', 'lte', 'gt', 'gte'],
  quantity: ['equals', 'lt', 'lte', 'gt', 'gte'],
  text: ['present'],
  location: ['present'],
  asset: ['present'],
  date: ['before', 'on-or-before', 'on-or-after', 'after'],
  'date-time': ['before', 'on-or-before', 'on-or-after', 'after'],
}

function record(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function requiredText(value: unknown, field: string, max: number): ConditionalFulfillmentValidation<string> {
  if (typeof value !== 'string' || !value.trim()) return { ok: false, error: `${field} must be a non-empty string.` }
  const normalized = value.trim()
  if (normalized.length > max) return { ok: false, error: `${field} must be at most ${max} characters.` }
  return { ok: true, value: normalized }
}

function canonicalDateLiteral(value: unknown, valueType: 'date' | 'date-time'): ConditionalFulfillmentValidation<string> {
  if (typeof value !== 'string' || !value.trim()) return { ok: false, error: `${valueType} rule value must be a non-empty string.` }
  const normalized = value.trim()
  if (valueType === 'date') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return { ok: false, error: 'date rule value must use YYYY-MM-DD.' }
    const parsed = new Date(`${normalized}T00:00:00.000Z`)
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized) return { ok: false, error: 'date rule value must be a real calendar date.' }
    return { ok: true, value: normalized }
  }
  const timestamp = Date.parse(normalized)
  if (!Number.isFinite(timestamp)) return { ok: false, error: 'date-time rule value must be a valid ISO date-time.' }
  return { ok: true, value: new Date(timestamp).toISOString() }
}

function normalizeRuleLiteral(
  value: unknown,
  field: OfferInputField,
  operator: ConditionalFulfillmentOperator,
): ConditionalFulfillmentValidation<ConditionalFulfillmentLiteral | undefined> {
  if (operator === 'present') {
    if (value !== undefined && value !== null && value !== '') return { ok: false, error: 'present rules must not declare a value.' }
    return { ok: true, value: undefined }
  }

  if (field.valueType === 'boolean') {
    if (typeof value !== 'boolean') return { ok: false, error: `${field.label} rule value must be boolean.` }
    return { ok: true, value }
  }

  if (field.valueType === 'number' || field.valueType === 'quantity') {
    if (typeof value !== 'number' || !Number.isFinite(value)) return { ok: false, error: `${field.label} rule value must be a finite number.` }
    if (field.valueType === 'quantity' && (!Number.isInteger(value) || value < 1 || value > 1_000_000)) {
      return { ok: false, error: `${field.label} quantity rule value must be a whole number between 1 and 1000000.` }
    }
    return { ok: true, value }
  }

  if (field.valueType === 'date' || field.valueType === 'date-time') {
    return canonicalDateLiteral(value, field.valueType)
  }

  const optionValues = new Map((field.options ?? []).map((option, index) => [option.value, index] as const))
  if (field.valueType === 'single-select') {
    if (operator === 'in') {
      if (!Array.isArray(value) || value.length < 1 || value.length > 25) return { ok: false, error: `${field.label} in-rule needs 1 to 25 declared option values.` }
      const unique = new Set<string>()
      for (const raw of value) {
        if (typeof raw !== 'string' || !optionValues.has(raw)) return { ok: false, error: `${field.label} rule references an undeclared option.` }
        unique.add(raw)
      }
      return { ok: true, value: [...unique].sort((a, b) => (optionValues.get(a) ?? 0) - (optionValues.get(b) ?? 0)) }
    }
    if (typeof value !== 'string' || !optionValues.has(value)) return { ok: false, error: `${field.label} rule value must be a declared option.` }
    return { ok: true, value }
  }

  if (field.valueType === 'multi-select') {
    const many = operator === 'contains-any' || operator === 'contains-all'
    if (many) {
      if (!Array.isArray(value) || value.length < 1 || value.length > 25) return { ok: false, error: `${field.label} rule needs 1 to 25 declared option values.` }
      const unique = new Set<string>()
      for (const raw of value) {
        if (typeof raw !== 'string' || !optionValues.has(raw)) return { ok: false, error: `${field.label} rule references an undeclared option.` }
        unique.add(raw)
      }
      return { ok: true, value: [...unique].sort((a, b) => (optionValues.get(a) ?? 0) - (optionValues.get(b) ?? 0)) }
    }
    if (typeof value !== 'string' || !optionValues.has(value)) return { ok: false, error: `${field.label} rule value must be a declared option.` }
    return { ok: true, value }
  }

  return { ok: false, error: `${field.label} does not support ${operator} conditional fulfillment.` }
}

export function fulfillmentOperatorsForInput(field: Pick<OfferInputField, 'valueType'>) {
  return [...OPERATORS_BY_TYPE[field.valueType]]
}

export function validateOfferFulfillmentRules(
  value: unknown,
  inputs: OfferInputField[],
): ConditionalFulfillmentValidation<OfferFulfillmentRule[]> {
  if (value == null) return { ok: true, value: [] }
  if (!Array.isArray(value) || value.length > MAX_FULFILLMENT_RULES) {
    return { ok: false, error: `fulfillment rules must be an array with at most ${MAX_FULFILLMENT_RULES} rules.` }
  }

  const inputsByKey = new Map(inputs.map((input) => [input.key, input] as const))
  const seenIds = new Set<string>()
  const rules: OfferFulfillmentRule[] = []

  for (const raw of value) {
    const item = record(raw)
    if (!item) return { ok: false, error: 'each fulfillment rule must be an object.' }

    const id = requiredText(item.id, 'rule.id', 64)
    if (!id.ok) return id
    if (!KEY_RE.test(id.value)) return { ok: false, error: 'rule.id must use lowercase letters, numbers, underscores, or hyphens.' }
    if (seenIds.has(id.value)) return { ok: false, error: `duplicate fulfillment rule id ${JSON.stringify(id.value)}.` }
    seenIds.add(id.value)

    const inputKey = requiredText(item.inputKey, 'rule.inputKey', 64)
    if (!inputKey.ok) return inputKey
    const field = inputsByKey.get(inputKey.value)
    if (!field) return { ok: false, error: `fulfillment rule ${id.value} references unknown buyer input ${JSON.stringify(inputKey.value)}.` }
    if (!field.required) return { ok: false, error: `fulfillment rule ${id.value} must reference a required buyer input.` }

    if (typeof item.operator !== 'string' || !OPERATORS.has(item.operator as ConditionalFulfillmentOperator)) {
      return { ok: false, error: `fulfillment rule ${id.value} has an unsupported operator.` }
    }
    const operator = item.operator as ConditionalFulfillmentOperator
    if (!OPERATORS_BY_TYPE[field.valueType].includes(operator)) {
      return { ok: false, error: `operator ${operator} is not valid for ${field.valueType} buyer input ${field.key}.` }
    }
    const literal = normalizeRuleLiteral(item.value, field, operator)
    if (!literal.ok) return literal

    if (typeof item.decision !== 'string' || !DECISIONS.has(item.decision as ConditionalFulfillmentBlockingDecision)) {
      return { ok: false, error: `fulfillment rule ${id.value} decision must be requires-review or ineligible.` }
    }
    const reasonCode = requiredText(item.reasonCode, 'rule.reasonCode', 80)
    if (!reasonCode.ok) return reasonCode
    if (!REASON_RE.test(reasonCode.value)) return { ok: false, error: 'rule.reasonCode must use lowercase letters, numbers, dots, underscores, or hyphens.' }
    const message = requiredText(item.message, 'rule.message', 500)
    if (!message.ok) return message

    let nextAction: ConditionalFulfillmentNextAction | undefined
    if (item.nextAction != null && item.nextAction !== '') {
      if (typeof item.nextAction !== 'string' || !NEXT_ACTIONS.has(item.nextAction as ConditionalFulfillmentNextAction)) {
        return { ok: false, error: `fulfillment rule ${id.value} nextAction must be contact-merchant or send-proposal.` }
      }
      nextAction = item.nextAction as ConditionalFulfillmentNextAction
    }

    rules.push({
      id: id.value,
      inputKey: field.key,
      operator,
      ...(literal.value !== undefined ? { value: literal.value } : {}),
      decision: item.decision as ConditionalFulfillmentBlockingDecision,
      reasonCode: reasonCode.value,
      message: message.value,
      ...(nextAction ? { nextAction } : {}),
    })
  }

  return { ok: true, value: rules }
}

function matches(rule: OfferFulfillmentRule, actual: OfferTransactionConfiguration[string]): boolean {
  const expected = rule.value
  switch (rule.operator) {
    case 'present':
      return actual !== undefined && actual !== null && actual !== '' && (!Array.isArray(actual) || actual.length > 0)
    case 'equals':
      return actual === expected
    case 'in':
      return typeof actual === 'string' && Array.isArray(expected) && expected.includes(actual)
    case 'contains':
      return Array.isArray(actual) && typeof expected === 'string' && actual.includes(expected)
    case 'contains-any':
      return Array.isArray(actual) && Array.isArray(expected) && expected.some((item) => actual.includes(item))
    case 'contains-all':
      return Array.isArray(actual) && Array.isArray(expected) && expected.every((item) => actual.includes(item))
    case 'lt':
      return typeof actual === 'number' && typeof expected === 'number' && actual < expected
    case 'lte':
      return typeof actual === 'number' && typeof expected === 'number' && actual <= expected
    case 'gt':
      return typeof actual === 'number' && typeof expected === 'number' && actual > expected
    case 'gte':
      return typeof actual === 'number' && typeof expected === 'number' && actual >= expected
    case 'before':
      return typeof actual === 'string' && typeof expected === 'string' && actual < expected
    case 'on-or-before':
      return typeof actual === 'string' && typeof expected === 'string' && actual <= expected
    case 'on-or-after':
      return typeof actual === 'string' && typeof expected === 'string' && actual >= expected
    case 'after':
      return typeof actual === 'string' && typeof expected === 'string' && actual > expected
  }
}

export function evaluateConditionalFulfillment(
  rules: OfferFulfillmentRule[],
  configuration: OfferTransactionConfiguration,
): ConditionalFulfillmentEvaluation {
  const reasons: ConditionalFulfillmentReason[] = []
  for (const rule of rules) {
    if (!matches(rule, configuration[rule.inputKey])) continue
    reasons.push({
      ruleId: rule.id,
      inputKey: rule.inputKey,
      decision: rule.decision,
      reasonCode: rule.reasonCode,
      message: rule.message,
      ...(rule.nextAction ? { nextAction: rule.nextAction } : {}),
    })
  }

  const decision: ConditionalFulfillmentDecision = reasons.some((reason) => reason.decision === 'ineligible')
    ? 'ineligible'
    : reasons.some((reason) => reason.decision === 'requires-review')
      ? 'requires-review'
      : 'eligible'

  return {
    schemaVersion: CONDITIONAL_FULFILLMENT_SCHEMA_VERSION,
    decision,
    matchedRuleIds: reasons.map((reason) => reason.ruleId),
    reasons,
  }
}

export function conditionalFulfillmentBlockingMessage(evaluation: ConditionalFulfillmentEvaluation): string | null {
  if (evaluation.decision === 'eligible') return null
  return evaluation.reasons[0]?.message ?? (
    evaluation.decision === 'requires-review'
      ? 'This request needs merchant review before checkout.'
      : 'This offer is not eligible for the supplied buyer configuration.'
  )
}
