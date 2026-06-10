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
  };
  clarificationQuestions?: string[];
  internalNotes?: string; // Private for business owner (never sent to agent)
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
