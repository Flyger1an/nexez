'use client'

import { useEffect, useMemo, useState } from 'react'
import type { OfferItem } from '../../lib/agent-page'
import {
  getOfferCustomerInputs,
  getOfferFulfillmentRules,
  withOfferFulfillmentRules,
  type ConfiguredOfferItem,
} from '../../lib/configured-offer'
import {
  fulfillmentOperatorsForInput,
  type ConditionalFulfillmentBlockingDecision,
  type ConditionalFulfillmentLiteral,
  type ConditionalFulfillmentNextAction,
  type ConditionalFulfillmentOperator,
  type OfferFulfillmentRule,
} from '../../lib/conditional-fulfillment'
import type { OfferInputField } from '../../lib/offer-configuration'

type RuleDraft = Omit<OfferFulfillmentRule, 'value'> & { value?: ConditionalFulfillmentLiteral | string }

const OPERATOR_LABELS: Record<ConditionalFulfillmentOperator, string> = {
  equals: 'equals',
  in: 'is one of',
  contains: 'contains',
  'contains-any': 'contains any of',
  'contains-all': 'contains all of',
  lt: 'is less than',
  lte: 'is at most',
  gt: 'is greater than',
  gte: 'is at least',
  present: 'is provided',
  before: 'is before',
  'on-or-before': 'is on or before',
  'on-or-after': 'is on or after',
  after: 'is after',
}

function nextRuleId(rules: OfferFulfillmentRule[]) {
  const used = new Set(rules.map((rule) => rule.id))
  for (let index = 1; index < 1000; index += 1) {
    const candidate = `rule-${index}`
    if (!used.has(candidate)) return candidate
  }
  return `rule-${Date.now()}`
}

function defaultLiteral(field: OfferInputField, operator: ConditionalFulfillmentOperator): ConditionalFulfillmentLiteral | undefined {
  if (operator === 'present') return undefined
  if (field.valueType === 'boolean') return true
  if (field.valueType === 'number' || field.valueType === 'quantity') return 1
  if (field.valueType === 'single-select') {
    if (operator === 'in') return field.options?.[0] ? [field.options[0].value] : []
    return field.options?.[0]?.value ?? ''
  }
  if (field.valueType === 'multi-select') {
    if (operator === 'contains-any' || operator === 'contains-all') {
      return field.options?.[0] ? [field.options[0].value] : []
    }
    return field.options?.[0]?.value ?? ''
  }
  if (field.valueType === 'date') return new Date().toISOString().slice(0, 10)
  if (field.valueType === 'date-time') return new Date().toISOString()
  return undefined
}

function defaultRule(field: OfferInputField, rules: OfferFulfillmentRule[]): RuleDraft {
  const operator = fulfillmentOperatorsForInput(field)[0] ?? 'present'
  return {
    id: nextRuleId(rules),
    inputKey: field.key,
    operator,
    ...(defaultLiteral(field, operator) !== undefined ? { value: defaultLiteral(field, operator) } : {}),
    decision: 'requires-review',
    reasonCode: `fulfillment.${field.key}`,
    message: '',
    nextAction: 'contact-merchant',
  }
}

function parseNumber(value: string, quantity: boolean) {
  if (!value.trim()) return ''
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return value
  return quantity ? Math.trunc(parsed) : parsed
}

function RuleValueEditor({
  field,
  draft,
  onChange,
}: {
  field: OfferInputField
  draft: RuleDraft
  onChange: (value: ConditionalFulfillmentLiteral | undefined) => void
}) {
  if (draft.operator === 'present') return <span className="text-[10px] text-zinc-500">No comparison value needed.</span>

  if (field.valueType === 'boolean') {
    return (
      <select
        value={String(draft.value ?? true)}
        onChange={(event) => onChange(event.target.value === 'true')}
        className="w-full rounded border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-white"
      >
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    )
  }

  if (field.valueType === 'number' || field.valueType === 'quantity') {
    return (
      <input
        type="number"
        step={field.valueType === 'quantity' ? 1 : 'any'}
        min={field.valueType === 'quantity' ? 1 : undefined}
        value={typeof draft.value === 'number' ? String(draft.value) : String(draft.value ?? '')}
        onChange={(event) => onChange(parseNumber(event.target.value, field.valueType === 'quantity') as ConditionalFulfillmentLiteral)}
        className="w-full rounded border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-white"
      />
    )
  }

  if (field.valueType === 'date' || field.valueType === 'date-time') {
    const value = typeof draft.value === 'string' ? draft.value : ''
    return (
      <input
        type={field.valueType === 'date' ? 'date' : 'datetime-local'}
        value={field.valueType === 'date-time' && value ? value.slice(0, 16) : value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-white"
      />
    )
  }

  if (field.valueType === 'single-select' || field.valueType === 'multi-select') {
    const many = draft.operator === 'in' || draft.operator === 'contains-any' || draft.operator === 'contains-all'
    if (many) {
      const selected = Array.isArray(draft.value) ? draft.value : []
      return (
        <select
          multiple
          value={selected}
          onChange={(event) => onChange(Array.from(event.target.selectedOptions, (option) => option.value))}
          className="min-h-20 w-full rounded border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-white"
        >
          {(field.options ?? []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      )
    }
    return (
      <select
        value={typeof draft.value === 'string' ? draft.value : ''}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-white"
      >
        {(field.options ?? []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    )
  }

  return <span className="text-[10px] text-zinc-500">This field only supports presence checks.</span>
}

function OfferFulfillmentEditor({
  offer,
  index,
  onApply,
}: {
  offer: OfferItem
  index: number
  onApply: (index: number, offer: ConfiguredOfferItem) => void
}) {
  const inputs = useMemo(() => getOfferCustomerInputs(offer).filter((field) => field.required), [offer])
  const current = useMemo(() => getOfferFulfillmentRules(offer), [offer])
  const [drafts, setDrafts] = useState<RuleDraft[]>(() => current.map((rule) => ({ ...rule })))
  const [message, setMessage] = useState('')

  useEffect(() => {
    setDrafts(current.map((rule) => ({ ...rule })))
    setMessage('')
  }, [current])

  function addRule() {
    const field = inputs[0]
    if (!field) {
      setMessage('Add at least one required buyer input before authoring a fulfillment rule.')
      return
    }
    setDrafts((previous) => [...previous, defaultRule(field, [...current, ...previous as OfferFulfillmentRule[]])])
  }

  function updateRule(ruleIndex: number, patch: Partial<RuleDraft>) {
    setDrafts((previous) => previous.map((rule, idx) => idx === ruleIndex ? { ...rule, ...patch } : rule))
  }

  function selectField(ruleIndex: number, inputKey: string) {
    const field = inputs.find((entry) => entry.key === inputKey)
    if (!field) return
    const operator = fulfillmentOperatorsForInput(field)[0] ?? 'present'
    updateRule(ruleIndex, {
      inputKey,
      operator,
      value: defaultLiteral(field, operator),
      reasonCode: `fulfillment.${field.key}`,
    })
  }

  function selectOperator(ruleIndex: number, field: OfferInputField, operator: ConditionalFulfillmentOperator) {
    updateRule(ruleIndex, { operator, value: defaultLiteral(field, operator) })
  }

  function apply() {
    const result = withOfferFulfillmentRules(offer, drafts)
    if (!result.ok) {
      setMessage(result.error)
      return
    }
    onApply(index, result.value)
    setMessage('Conditional fulfillment rules applied. Save the listing to publish them.')
  }

  function removeAll() {
    const configured = { ...(offer as ConfiguredOfferItem) }
    delete configured.fulfillmentRules
    onApply(index, configured)
    setDrafts([])
    setMessage('Conditional fulfillment rules removed. Save the listing to publish the change.')
  }

  return (
    <div className="rounded-lg border border-white/10 bg-black/20 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-medium text-[var(--signal)]">{offer.name || `Service ${index + 1}`}</p>
          <p className="mt-0.5 text-[10px] text-zinc-500">
            {current.length ? `${current.length} merchant fulfillment rule${current.length === 1 ? '' : 's'} published` : 'No conditional fulfillment rules'}
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={addRule} className="rounded border border-[var(--signal)]/40 px-2 py-1 text-[10px] text-[var(--signal)] hover:bg-[var(--signal)]/10">Add rule</button>
          {current.length ? <button type="button" onClick={removeAll} className="rounded border border-red-400/30 px-2 py-1 text-[10px] text-red-300 hover:bg-red-500/10">Remove all</button> : null}
        </div>
      </div>

      {!inputs.length ? (
        <p className="mt-2 text-[10px] leading-4 text-zinc-500">
          Rules can only depend on required merchant-authored buyer inputs. Add a required buyer question first so agents never infer missing qualification data.
        </p>
      ) : null}

      <div className="mt-3 space-y-3">
        {drafts.map((draft, ruleIndex) => {
          const field = inputs.find((entry) => entry.key === draft.inputKey) ?? inputs[0]
          if (!field) return null
          const operators = fulfillmentOperatorsForInput(field)
          return (
            <div key={draft.id} className="rounded border border-white/10 bg-white/[0.02] p-3">
              <div className="grid gap-2 md:grid-cols-3">
                <label className="text-[10px] text-zinc-400">
                  Buyer field
                  <select value={draft.inputKey} onChange={(event) => selectField(ruleIndex, event.target.value)} className="mt-1 w-full rounded border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-white">
                    {inputs.map((entry) => <option key={entry.key} value={entry.key}>{entry.label}</option>)}
                  </select>
                </label>
                <label className="text-[10px] text-zinc-400">
                  Condition
                  <select value={draft.operator} onChange={(event) => selectOperator(ruleIndex, field, event.target.value as ConditionalFulfillmentOperator)} className="mt-1 w-full rounded border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-white">
                    {operators.map((operator) => <option key={operator} value={operator}>{OPERATOR_LABELS[operator]}</option>)}
                  </select>
                </label>
                <label className="text-[10px] text-zinc-400">
                  Value
                  <span className="mt-1 block"><RuleValueEditor field={field} draft={draft} onChange={(value) => updateRule(ruleIndex, { value })} /></span>
                </label>
              </div>

              <div className="mt-2 grid gap-2 md:grid-cols-3">
                <label className="text-[10px] text-zinc-400">
                  Outcome
                  <select value={draft.decision} onChange={(event) => updateRule(ruleIndex, { decision: event.target.value as ConditionalFulfillmentBlockingDecision })} className="mt-1 w-full rounded border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-white">
                    <option value="requires-review">Require merchant review</option>
                    <option value="ineligible">Ineligible</option>
                  </select>
                </label>
                <label className="text-[10px] text-zinc-400">
                  Reason code
                  <input value={draft.reasonCode} onChange={(event) => updateRule(ruleIndex, { reasonCode: event.target.value.toLowerCase().replace(/[^a-z0-9_.-]/g, '-') })} className="mt-1 w-full rounded border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-white" />
                </label>
                <label className="text-[10px] text-zinc-400">
                  Next action
                  <select value={draft.nextAction ?? ''} onChange={(event) => updateRule(ruleIndex, { nextAction: (event.target.value || undefined) as ConditionalFulfillmentNextAction | undefined })} className="mt-1 w-full rounded border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-white">
                    <option value="">None</option>
                    <option value="contact-merchant">Contact merchant</option>
                    <option value="send-proposal">Send proposal</option>
                  </select>
                </label>
              </div>

              <label className="mt-2 block text-[10px] text-zinc-400">
                Buyer/agent message
                <textarea value={draft.message} onChange={(event) => updateRule(ruleIndex, { message: event.target.value })} maxLength={500} placeholder="Explain why this combination needs review or cannot be fulfilled." className="mt-1 min-h-16 w-full rounded border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-white" />
              </label>

              <button type="button" onClick={() => setDrafts((previous) => previous.filter((_, idx) => idx !== ruleIndex))} className="mt-2 text-[10px] text-red-300 hover:text-red-200">Remove rule</button>
            </div>
          )
        })}
      </div>

      {drafts.length ? (
        <button type="button" onClick={apply} className="mt-3 rounded border border-[var(--signal)]/40 bg-[var(--signal)]/10 px-3 py-1.5 text-xs font-medium text-[var(--signal)] hover:bg-[var(--signal)]/20">
          Apply fulfillment rules
        </button>
      ) : null}
      {message ? <p className="mt-2 text-[10px] text-zinc-400">{message}</p> : null}
    </div>
  )
}

export function ConditionalFulfillmentManager({
  offers,
  onChange,
}: {
  offers: OfferItem[]
  onChange: (offers: OfferItem[]) => void
}) {
  if (!offers.length) return null

  function apply(index: number, updated: ConfiguredOfferItem) {
    const next = [...offers]
    next[index] = updated
    onChange(next)
  }

  return (
    <details className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
      <summary className="cursor-pointer text-sm font-medium text-zinc-200">Conditional fulfillment</summary>
      <p className="mt-2 text-xs leading-5 text-zinc-500">
        Turn merchant qualification policy into deterministic machine-readable gates. Rules only inspect required buyer answers; Nexez and agents never invent missing facts. Matching rules either require merchant review or make the request ineligible before payment.
      </p>
      <div className="mt-4 space-y-3">
        {offers.map((offer, index) => <OfferFulfillmentEditor key={`${offer.name || 'service'}-${index}`} offer={offer} index={index} onApply={apply} />)}
      </div>
    </details>
  )
}
