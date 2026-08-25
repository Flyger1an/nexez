'use client'

import type { ComponentPropsWithoutRef, FormEvent } from 'react'
import { useRef, useState } from 'react'
import {
  ApprovalBoundActionError,
  createActionIdempotencyKey,
  executeApprovalBoundAction,
  type ApprovalActionResponse,
} from '../lib/approval-bound-action'
import type { OfferCheckoutPath } from '../lib/agent-offer-configuration'

type ApprovedActionFormProps = Omit<ComponentPropsWithoutRef<'form'>, 'action' | 'method' | 'onSubmit'> & {
  action: OfferCheckoutPath | '/api/negotiations'
  onNavigate?: (url: string) => void
}

/** Client enhancement for approval-token-bound checkout and negotiation actions. */
export function ApprovedActionForm({ action, children, onNavigate, ...formProps }: ApprovedActionFormProps) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  // Reuse this key after an uncertain network result so a retry cannot duplicate
  // a checkout session or negotiation that the server already accepted.
  const idempotencyKey = useRef(createActionIdempotencyKey())

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return

    setSubmitting(true)
    setError('')
    const navigate = onNavigate ?? ((url: string) => window.location.assign(url))

    try {
      const submitter = (event.nativeEvent as SubmitEvent).submitter
      const formData = submitter instanceof HTMLElement
        ? new FormData(event.currentTarget, submitter)
        : new FormData(event.currentTarget)
      const input = formDataToActionInput(formData)
      const { result } = await executeApprovalBoundAction({
        url: action,
        input,
        idempotencyKey: idempotencyKey.current,
      })
      const destination = actionDestination(result)

      if (!destination) {
        throw new Error('The action completed but no next step was returned.')
      }
      navigate(destination)
    } catch (caught) {
      // Preserve the prior checkout behavior: when no payment destination exists,
      // the API returns the checkout page URL with its inline setup explanation.
      if (caught instanceof ApprovalBoundActionError && caught.status === 409) {
        const recoveryUrl = actionDestination(caught.response)
        if (recoveryUrl) {
          navigate(recoveryUrl)
          return
        }
      }
      setError(caught instanceof Error ? caught.message : 'The action could not be completed. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form {...formProps} action={action} method="post" onSubmit={handleSubmit} aria-busy={submitting}>
      <fieldset disabled={submitting} className="contents">
        {children}
      </fieldset>
      {submitting ? (
        <p role="status" className="text-sm text-[var(--fg-muted)] [grid-column:1/-1]">
          Confirming details and continuing...
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-lg border border-red-400/25 bg-red-500/10 px-3 py-2 text-sm text-red-200 [grid-column:1/-1]">
          {error}
        </p>
      ) : null}
    </form>
  )
}

function formDataToActionInput(formData: FormData) {
  const input: Record<string, unknown> = {}
  const offerConfiguration: Record<string, unknown> = {}
  const requestedTerms: Record<string, unknown> = {}
  for (const [key, value] of formData.entries()) {
    if (typeof value !== 'string') continue
    const configurationField = parseOfferConfigurationFieldName(key)
    if (configurationField) {
      const normalized = normalizeOfferConfigurationFormValue(configurationField.valueType, value)
      if (configurationField.valueType === 'multi-select') {
        const current = offerConfiguration[configurationField.key]
        offerConfiguration[configurationField.key] = [
          ...(Array.isArray(current) ? current : []),
          ...(typeof normalized === 'string' && normalized ? [normalized] : []),
        ]
      } else {
        offerConfiguration[configurationField.key] = normalized
      }
      continue
    }
    const negotiationTerm = parseNegotiationTermFieldName(key)
    if (negotiationTerm) {
      if (value.trim()) {
        requestedTerms[negotiationTerm.key] = negotiationTerm.numeric && /^\d+$/.test(value.trim())
          ? Number(value.trim())
          : value
      }
      continue
    }
    input[key] = value
  }

  if (Object.keys(offerConfiguration).length) input.offerConfiguration = offerConfiguration

  if (typeof input.requestedTerms === 'string') {
    try {
      input.requestedTerms = JSON.parse(input.requestedTerms)
    } catch {
      input.requestedTerms = { note: input.requestedTerms }
    }
  }
  if (Object.keys(requestedTerms).length) {
    const existing = input.requestedTerms && typeof input.requestedTerms === 'object' && !Array.isArray(input.requestedTerms)
      ? input.requestedTerms as Record<string, unknown>
      : {}
    input.requestedTerms = { ...existing, ...requestedTerms }
  }
  return input
}

const NEGOTIATION_TERM_FORM_FIELD = /^requestedTerms\.(scope|deliverables|revisionCount|projectWeeks)$/

function parseNegotiationTermFieldName(name: string) {
  const match = NEGOTIATION_TERM_FORM_FIELD.exec(name)
  if (!match) return null
  return {
    key: match[1],
    numeric: match[1] === 'revisionCount' || match[1] === 'projectWeeks',
  }
}

const OFFER_CONFIGURATION_FORM_FIELD = /^offerConfiguration\.(text|number|boolean|single-select|multi-select|quantity|date|date-time|location|asset)\.([a-z0-9][a-z0-9_-]{0,63})$/

function parseOfferConfigurationFieldName(name: string) {
  const match = OFFER_CONFIGURATION_FORM_FIELD.exec(name)
  return match ? { valueType: match[1], key: match[2] } : null
}

function normalizeOfferConfigurationFormValue(valueType: string, value: string) {
  if (valueType === 'number' || valueType === 'quantity') {
    return value.trim() === '' ? '' : Number(value)
  }
  if (valueType === 'boolean') return value === 'true'
  return value
}

function actionDestination(result: ApprovalActionResponse) {
  const raw = [result.url, result.negotiationUrl, result.persistentLink, result.statusUrl]
    .find((value) => typeof value === 'string' && value.trim())
  if (typeof raw !== 'string') return null
  const value = raw.trim()
  if (value.startsWith('/') && !value.startsWith('//')) return value

  try {
    const url = new URL(value, typeof window === 'undefined' ? 'https://nexez.app' : window.location.origin)
    return ['http:', 'https:', 'mailto:', 'tel:'].includes(url.protocol) ? url.toString() : null
  } catch {
    return null
  }
}
