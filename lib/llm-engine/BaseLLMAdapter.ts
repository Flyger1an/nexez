/**
 * Base LLM Adapter for pluggable negotiation intelligence.
 * All providers (Gemini primary, Grok, Claude, OpenAI) implement the same interface.
 * This enables easy swapping via LLM_PROVIDER env without changing business logic.
 */

export type NegotiationAction = 'accept' | 'counter' | 'reject' | 'clarify' | 'review';

export interface NegotiationDecision {
  action: NegotiationAction;
  reasoning: string; // High-quality explanation for the agent and owner
  counter?: {
    priceCents?: number;
    price?: string;
    proposedDate?: string;
    scopeNotes?: string;
    // Phase 2 extension: structured scope adjustments proposed by LLM (clamped + displayed)
    scope?: {
      included?: string;
      excluded?: string;
      maxRevisions?: number;
      maxProjectWeeks?: number;
    };
  };
  clarificationQuestions?: string[];
  internalNotes?: string; // Private for business owner (never sent to agent)
  // Phase 2: surfaced scheduling link (e.g. Calendly scheduling_url from imported offers) for slot picking / booking
  schedulingLink?: string;
  // Optional structured scope at decision root (for accept/clarify cases with scope notes)
  scope?: {
    included?: string;
    excluded?: string;
    maxRevisions?: number;
    maxProjectWeeks?: number;
  };
}

export interface LLMAdapter {
  /**
   * Core method: evaluate proposal + full history against offer rules.
   * Must use the exact system prompt + function calling as specified.
   * History is passed so LLM has perfect memory of the entire conversation.
   */
  negotiate(
    rules: any, // Offer rules (minPrice, maxDiscount, blackouts, scope, autoAccept etc.)
    proposal: any, // Current incoming proposal (price, timeline, query, terms)
    history: any[] // Full prior conversation turns for context/memory
  ): Promise<NegotiationDecision>;

  readonly provider: string;
  readonly model: string;
}

export abstract class BaseLLMAdapter implements LLMAdapter {
  abstract readonly provider: string;
  model: string = 'default';

  abstract negotiate(rules: any, proposal: any, history: any[]): Promise<NegotiationDecision>;
}

/**
 * Common error for when provider is misconfigured or call fails.
 */
export class LLMAdapterError extends Error {
  constructor(message: string, public readonly provider: string) {
    super(message);
    this.name = 'LLMAdapterError';
  }
}

/**
 * LLM tool output is an external input boundary. Counter amounts are always
 * integer app-minor units; numeric strings, decimals, and legacy major-unit
 * fields are rejected rather than guessed.
 */
export function requireCounterPriceCents(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 50) {
    throw new Error('Counter tool output requires integer price_cents of at least 50.')
  }
  return value as number
}
