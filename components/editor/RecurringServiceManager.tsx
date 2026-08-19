'use client'

import { useEffect, useMemo, useState } from 'react'
import type { OfferItem } from '../../lib/agent-page'
import {
  getOfferCustomerInputs,
  getOfferRecurringTerms,
  withOfferRecurringTerms,
  type ConfiguredOfferItem,
} from '../../lib/configured-offer'
import type {
  RecurringServiceCadence,
  RecurringServiceInterval,
  RecurringServiceTerms,
} from '../../lib/recurring-service'

type MappingDraft = {
  value: string
  interval: RecurringServiceInterval
  intervalCount: string
}

type Draft = {
  mode: 'fixed' | 'buyer-option'
  interval: RecurringServiceInterval
  intervalCount: string
  inputKey: string
  mappings: MappingDraft[]
}

function existingDraft(offer: OfferItem): Draft {
  const terms = getOfferRecurringTerms(offer)
  if (!terms) {
    return {
      mode: 'fixed',
      interval: 'week',
      intervalCount: '',
      inputKey: '',
      mappings: [],
    }
  }
  if (terms.schedule.mode === 'fixed') {
    return {
      mode: 'fixed',
      interval: terms.schedule.cadence.interval,
      intervalCount: String(terms.schedule.cadence.intervalCount),
      inputKey: '',
      mappings: [],
    }
  }
  return {
    mode: 'buyer-option',
    interval: 'week',
    intervalCount: '',
    inputKey: terms.schedule.inputKey,
    mappings: terms.schedule.options.map((option) => ({
      value: option.value,
      interval: option.cadence.interval,
      intervalCount: String(option.cadence.intervalCount),
    })),
  }
}

function termsFromDraft(draft: Draft): RecurringServiceTerms | null {
  const base = {
    schemaVersion: 1 as const,
    paymentModel: 'fixed-per-period' as const,
    startPolicy: 'first-successful-payment' as const,
    endPolicy: 'until-cancelled' as const,
    cancellationPolicy: 'period-end' as const,
    pausePolicy: 'unsupported' as const,
  }
  if (draft.mode === 'fixed') {
    const count = Number(draft.intervalCount)
    if (!Number.isInteger(count) || count < 1) return null
    return {
      ...base,
      schedule: {
        mode: 'fixed',
        cadence: { interval: draft.interval, intervalCount: count },
      },
    }
  }
  if (!draft.inputKey || draft.mappings.length < 1) return null
  const options: Array<{ value: string; cadence: RecurringServiceCadence }> = []
  for (const mapping of draft.mappings) {
    const count = Number(mapping.intervalCount)
    if (!Number.isInteger(count) || count < 1) return null
    options.push({
      value: mapping.value,
      cadence: { interval: mapping.interval, intervalCount: count },
    })
  }
  return {
    ...base,
    schedule: { mode: 'buyer-option', inputKey: draft.inputKey, options },
  }
}

function EligibleCadenceFields({ offer }: { offer: OfferItem }) {
  const eligible = getOfferCustomerInputs(offer).filter(
    (field) => field.required && field.valueType === 'single-select' && (field.options?.length ?? 0) > 0,
  )
  if (eligible.length) return null
  return (
    <p className="mt-2 text-[10px] leading-4 text-zinc-500">
      Buyer-selectable cadence requires an existing required single-select buyer input on this offer. Use fixed cadence until that merchant-authored input exists.
    </p>
  )
}

function OfferRecurringEditor({
  offer,
  index,
  onApply,
}: {
  offer: OfferItem
  index: number
  onApply: (index: number, offer: ConfiguredOfferItem) => void
}) {
  const current = getOfferRecurringTerms(offer)
  const [draft, setDraft] = useState<Draft>(() => existingDraft(offer))
  const [message, setMessage] = useState('')
  const cadenceFields = useMemo(
    () => getOfferCustomerInputs(offer).filter(
      (field) => field.required && field.valueType === 'single-select' && (field.options?.length ?? 0) > 0,
    ),
    [offer],
  )

  useEffect(() => {
    setDraft(existingDraft(offer))
    setMessage('')
  }, [offer])

  function selectBuyerField(inputKey: string) {
    const field = cadenceFields.find((entry) => entry.key === inputKey)
    setDraft((previous) => ({
      ...previous,
      inputKey,
      mappings: (field?.options ?? []).map((option) => {
        const existing = previous.mappings.find((mapping) => mapping.value === option.value)
        return existing ?? { value: option.value, interval: 'week', intervalCount: '' }
      }),
    }))
  }

  function apply() {
    const terms = termsFromDraft(draft)
    if (!terms) {
      setMessage('Complete every cadence field before applying the recurring contract.')
      return
    }
    const result = withOfferRecurringTerms(offer, terms)
    if (!result.ok) {
      setMessage(result.error)
      return
    }
    onApply(index, result.value)
    setMessage('Recurring service contract applied. Save the listing to publish it.')
  }

  function remove() {
    const configured = { ...(offer as ConfiguredOfferItem) }
    delete configured.recurringTerms
    onApply(index, configured)
    setDraft(existingDraft(configured))
    setMessage('Recurring service contract removed. Save the listing to publish the change.')
  }

  return (
    <div className="rounded-lg border border-white/10 bg-black/20 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-medium text-[var(--signal)]">{offer.name || `Service ${index + 1}`}</p>
          <p className="mt-0.5 text-[10px] text-zinc-500">
            {current ? 'Recurring contract configured' : 'One-time service until a recurring contract is applied'}
          </p>
        </div>
        {current ? (
          <button type="button" onClick={remove} className="rounded border border-red-400/30 px-2 py-1 text-[10px] text-red-300 hover:bg-red-500/10">
            Remove recurring
          </button>
        ) : null}
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <label className="text-[10px] text-zinc-400">
          Schedule source
          <select
            value={draft.mode}
            onChange={(event) => setDraft((previous) => ({ ...previous, mode: event.target.value as Draft['mode'] }))}
            className="mt-1 w-full rounded border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-white"
          >
            <option value="fixed">Fixed cadence</option>
            <option value="buyer-option">Buyer chooses declared cadence</option>
          </select>
        </label>

        {draft.mode === 'fixed' ? (
          <>
            <label className="text-[10px] text-zinc-400">
              Every
              <input
                inputMode="numeric"
                value={draft.intervalCount}
                onChange={(event) => setDraft((previous) => ({ ...previous, intervalCount: event.target.value }))}
                placeholder="1"
                className="mt-1 w-full rounded border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-white"
              />
            </label>
            <label className="text-[10px] text-zinc-400">
              Unit
              <select
                value={draft.interval}
                onChange={(event) => setDraft((previous) => ({ ...previous, interval: event.target.value as RecurringServiceInterval }))}
                className="mt-1 w-full rounded border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-white"
              >
                <option value="day">Day(s)</option>
                <option value="week">Week(s)</option>
                <option value="month">Month(s)</option>
                <option value="year">Year(s)</option>
              </select>
            </label>
          </>
        ) : (
          <label className="text-[10px] text-zinc-400 sm:col-span-2">
            Required buyer input
            <select
              value={draft.inputKey}
              onChange={(event) => selectBuyerField(event.target.value)}
              className="mt-1 w-full rounded border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-white"
            >
              <option value="">Select a merchant-authored single-select field</option>
              {cadenceFields.map((field) => <option key={field.key} value={field.key}>{field.label}</option>)}
            </select>
          </label>
        )}
      </div>

      {draft.mode === 'buyer-option' ? (
        <>
          <EligibleCadenceFields offer={offer} />
          {draft.mappings.length ? (
            <div className="mt-3 space-y-2">
              {draft.mappings.map((mapping, mappingIndex) => (
                <div key={mapping.value} className="grid grid-cols-[1fr_80px_110px] items-end gap-2">
                  <div className="rounded border border-white/10 bg-white/[0.02] px-2 py-1.5 text-xs text-zinc-300">{mapping.value}</div>
                  <label className="text-[9px] text-zinc-500">
                    Every
                    <input
                      inputMode="numeric"
                      value={mapping.intervalCount}
                      onChange={(event) => setDraft((previous) => ({
                        ...previous,
                        mappings: previous.mappings.map((entry, idx) => idx === mappingIndex ? { ...entry, intervalCount: event.target.value } : entry),
                      }))}
                      placeholder="1"
                      className="mt-1 w-full rounded border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-white"
                    />
                  </label>
                  <label className="text-[9px] text-zinc-500">
                    Unit
                    <select
                      value={mapping.interval}
                      onChange={(event) => setDraft((previous) => ({
                        ...previous,
                        mappings: previous.mappings.map((entry, idx) => idx === mappingIndex ? { ...entry, interval: event.target.value as RecurringServiceInterval } : entry),
                      }))}
                      className="mt-1 w-full rounded border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-white"
                    >
                      <option value="day">Day(s)</option>
                      <option value="week">Week(s)</option>
                      <option value="month">Month(s)</option>
                      <option value="year">Year(s)</option>
                    </select>
                  </label>
                </div>
              ))}
            </div>
          ) : null}
        </>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" onClick={apply} className="rounded border border-[var(--signal)]/40 bg-[var(--signal)]/10 px-3 py-1.5 text-xs font-medium text-[var(--signal)] hover:bg-[var(--signal)]/20">
          Apply recurring contract
        </button>
        <span className="text-[9px] leading-4 text-zinc-500">
          Starts after first successful payment · fixed amount per period · cancel at period end · pause unsupported in v1
        </span>
      </div>
      {message ? <p className="mt-2 text-[10px] text-zinc-400">{message}</p> : null}
    </div>
  )
}

export function RecurringServiceManager({
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
      <summary className="cursor-pointer text-sm font-medium text-zinc-200">Recurring service contracts</summary>
      <p className="mt-2 text-xs leading-5 text-zinc-500">
        Merchant-authored terms only. Nexez never infers cadence from a service name or template. Apply an exact fixed cadence, or map an existing required buyer choice to exact billing intervals.
      </p>
      <div className="mt-4 space-y-3">
        {offers.map((offer, index) => (
          <OfferRecurringEditor key={`${offer.name || 'service'}-${index}`} offer={offer} index={index} onApply={apply} />
        ))}
      </div>
    </details>
  )
}
