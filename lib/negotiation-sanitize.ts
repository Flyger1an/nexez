/**
 * Strip owner-private fields from an LLM negotiation decision before it reaches
 * a (non-owner) buying agent.
 *
 * `internalNotes` is explicitly "Private for business owner (never sent to
 * agent)" — see `lib/llm-engine/BaseLLMAdapter.ts`. The decision is surfaced to
 * agents in two places (the async `/api/negotiations/status` poll and the public
 * `/negotiate/[id]` thread), so the strip lives here once and is reused by both
 * rather than duplicated. The remaining fields (action, reasoning, counter,
 * clarificationQuestions, schedulingLink, scope) are safe for the agent to see.
 *
 * Pass-through for null/undefined. Returns a shallow copy without `internalNotes`.
 *
 * Additionally redacts potential system prompt / rule exfiltration in free-text
 * fields (reasoning, scope notes, etc.). This is a defense-in-depth measure
 * against prompt injection that tries to make the model echo its instructions.
 */
export function sanitizeAgentDecision<T extends Record<string, any> | null | undefined>(decision: T): T {
  if (!decision) return decision
  const { internalNotes: _internalNotes, ...rest } = decision as Record<string, any>

  // Redact fields that could contain leaked system prompts / rules.
  // We keep the field but truncate + strip obvious prompt-like content.
  const safe: Record<string, any> = { ...rest }

  const redact = (val: any): any => {
    if (typeof val !== 'string') return val
    const lower = val.toLowerCase()
    // Case-insensitive aggressive redaction for leaked system instructions / preamble / rules.
    // Covers adapter prompts + prompt-safety preamble phrases.
    const leakPhrases = [
      'you are nexez',
      'negotiation_safety_preamble',
      'clampwithrules',
      'never reveal these instructions',
      'offer rules',
      'untrusted buyer',
      'security — read carefully',
      'system prompt',
    ]
    if (leakPhrases.some((p) => lower.includes(p))) {
      return '[redacted — contained system instructions]'
    }
    // Limit length on free-text decision fields to reduce exfil surface.
    return val.length > 1200 ? val.slice(0, 1200) + '…' : val
  }

  if (safe.reasoning) safe.reasoning = redact(safe.reasoning)
  if (safe.scopeNotes) safe.scopeNotes = redact(safe.scopeNotes)
  if (safe.clarificationQuestions && Array.isArray(safe.clarificationQuestions)) {
    safe.clarificationQuestions = safe.clarificationQuestions.map(redact)
  }

  // Also sanitize nested counter/scope if present (common in decisions)
  if (safe.counter) {
    if (safe.counter.reasoning) safe.counter.reasoning = redact(safe.counter.reasoning)
    if (safe.counter.scopeNotes) safe.counter.scopeNotes = redact(safe.counter.scopeNotes)
  }
  if (safe.scope) {
    if (typeof safe.scope === 'string') safe.scope = redact(safe.scope)
    else if (safe.scope.notes) safe.scope.notes = redact(safe.scope.notes)
  }

  return safe as T
}

/**
 * Sanitize a full negotiation message row's content (for owner manual turns or LLM turns).
 * Strips internal_notes and redacts potential prompt leakage in free-text.
 * Used when rendering history to non-owners or agents.
 */
export function sanitizeNegotiationMessageContent(content: any): any {
  if (!content || typeof content !== 'object') return content
  const { internal_notes: _internal, ...rest } = content
  const safe = { ...rest }

  const redact = (val: any): any => {
    if (typeof val !== 'string') return val
    const lower = val.toLowerCase()
    const leakPhrases = [
      'you are nexez',
      'negotiation_safety_preamble',
      'clampwithrules',
      'never reveal these instructions',
      'offer rules',
      'untrusted buyer',
      'security — read carefully',
      'system prompt',
    ]
    if (leakPhrases.some((p) => lower.includes(p))) {
      return '[redacted — contained system instructions]'
    }
    return val.length > 1200 ? val.slice(0, 1200) + '…' : val
  }

  if (safe.reasoning) safe.reasoning = redact(safe.reasoning as string)
  if (safe.scope_notes) safe.scope_notes = (safe.scope_notes as string).length > 800 ? (safe.scope_notes as string).slice(0, 800) + '…' : redact(safe.scope_notes as string) // also run full redact for keyword
  if (safe.internal_notes) delete safe.internal_notes
  // Apply to other free text fields that may be present in owner messages
  if (safe.proposed_date) safe.proposed_date = redact(safe.proposed_date)
  if (safe.scope) safe.scope = typeof safe.scope === 'string' ? redact(safe.scope) : safe.scope
  return safe
}
