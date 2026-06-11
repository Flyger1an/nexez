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
 */
export function sanitizeAgentDecision<T extends Record<string, any> | null | undefined>(decision: T): T {
  if (!decision) return decision
  const { internalNotes: _internalNotes, ...safe } = decision as Record<string, any>
  return safe as T
}
