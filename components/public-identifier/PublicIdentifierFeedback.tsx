'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, Loader2 } from 'lucide-react'
import type { PublicIdentifierNamespace } from '../../lib/public-identifier'

type AvailabilityResult = {
  value: string
  available: boolean
  reason: string
  message: string
  grandfathered?: boolean
  suggestions?: string[]
}

export function usePublicIdentifierAvailability(input: {
  namespace: PublicIdentifierNamespace
  value: string
  subjectId?: string | null
  enabled?: boolean
}) {
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState<AvailabilityResult | null>(null)

  useEffect(() => {
    if (input.enabled === false || !input.value) {
      setChecking(false)
      setResult(null)
      return
    }
    setChecking(true)
    setResult(null)
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          namespace: input.namespace,
          value: input.value,
        })
        if (input.subjectId) params.set('subjectId', input.subjectId)
        const response = await fetch(`/api/public-identifiers/availability?${params}`, {
          signal: controller.signal,
        })
        const body = (await response.json().catch(() => null)) as AvailabilityResult | null
        setResult(response.ok && body ? body : null)
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) setResult(null)
      } finally {
        if (!controller.signal.aborted) setChecking(false)
      }
    }, 300)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [input.enabled, input.namespace, input.subjectId, input.value])

  return { checking, result }
}

export function PublicIdentifierFeedback({
  checking,
  result,
  localMessage,
  onSuggestion,
}: {
  checking: boolean
  result: AvailabilityResult | null
  localMessage?: string | null
  onSuggestion: (value: string) => void
}) {
  if (localMessage) {
    return <p className="mt-1.5 text-xs text-[var(--amber)]">{localMessage}</p>
  }
  if (checking) {
    return (
      <p className="mt-1.5 flex items-center gap-1.5 text-xs text-zinc-400">
        <Loader2 className="size-3 animate-spin" /> Checking availability
      </p>
    )
  }
  if (!result) return null
  return (
    <div className="mt-1.5 text-xs">
      <p className={result.available ? 'flex items-center gap-1.5 text-[var(--ready)]' : 'text-[var(--amber)]'}>
        {result.available ? <CheckCircle2 className="size-3" /> : null}
        {result.message}
        {result.grandfathered ? ' You can keep it, but a new name must use at least 5 characters.' : null}
      </p>
      {!result.available && result.suggestions?.length ? (
        <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-zinc-500">
          Try:
          {result.suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => onSuggestion(suggestion)}
              className="rounded-full border border-white/10 px-2 py-0.5 font-mono text-[var(--signal)] hover:border-[var(--signal)]/40"
            >
              {suggestion}
            </button>
          ))}
        </p>
      ) : null}
    </div>
  )
}
