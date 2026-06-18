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
    // Very aggressive but safe: if it looks like it contains our system instructions, nuke it.
    if (val.includes('You are Nexez') || val.includes('NEGOTIATION_SAFETY_PREAMBLE') || val.includes('clampWithRules')) {
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
  if (safe.reasoning) safe.reasoning = (safe.reasoning as string).length > 1200 ? (safe.reasoning as string).slice(0, 1200) + '…' : safe.reasoning
  if (safe.scope_notes) safe.scope_notes = (safe.scope_notes as string).length > 800 ? (safe.scope_notes as string).slice(0, 800) + '…' : safe.scope_notes
  if (safe.internal_notes) delete safe.internal_notes
  return safe
}
