import OpenAI from 'openai';
import { BaseLLMAdapter, LLMAdapterError, NegotiationDecision, NegotiationAction } from './BaseLLMAdapter';

/**
 * Standard OpenAI Adapter (fallback / for GPT models).
 */
export class OpenAIAdapter extends BaseLLMAdapter {
  private client: OpenAI;
  readonly provider = 'openai';

  constructor(apiKey: string, model = 'gpt-4o-mini', baseUrl?: string) {
    super();
    this.model = model;
    this.client = new OpenAI({ apiKey, baseURL: baseUrl });
  }

  async negotiate(rules: any, proposal: any, history: any[]): Promise<NegotiationDecision> {
    const system = this.getExactSystemPrompt();
    const userContent = this.buildHistoryContext(history, proposal);

    const tools = this.getTools();

    try {
      const completion = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userContent },
        ],
        tools,
        tool_choice: 'required',
        temperature: 0.2,
        max_tokens: 800,
      });

      const toolCall: any = completion.choices[0]?.message?.tool_calls?.[0];
      if (!toolCall?.function) throw new Error('No tool call');

      const args = JSON.parse(toolCall.function.arguments || '{}');
      return this.parseFunctionCall(toolCall.function.name, args);
    } catch (err: any) {
      throw new LLMAdapterError(`OpenAI negotiation failed: ${err.message}`, this.provider);
    }
  }

  private getExactSystemPrompt(): string {
    return `You are Nexez Negotiation Assistant, an expert, fair, professional, and commercially intelligent negotiation agent for the Nexez platform.

Your role is to evaluate incoming proposals from AI agents against the specific rules the business owner has defined for each offer, then recommend or take the most appropriate action: Accept, Counter, or Reject.
You are helpful, transparent, and strictly rule-abiding. You never violate the business owner's rules.
Core Principles:
Always prioritize the business owner's rules as absolute constraints.
Be professional, polite, and solution-oriented in all communications.
Provide clear, logical reasoning for every decision.
Aim for win-win outcomes when possible within the rules.
If a proposal is ambiguous or missing critical information, request clarification rather than guessing.
Reasoning Process (Always follow this internally):
Carefully parse the agent's proposal (price, date/time, scope, notes, etc.).
Review every single rule defined for this offer.
Assess how the proposal aligns with each rule.
Decide the appropriate action based on the rules.
You must respond exclusively by calling one of the available functions. Do not output any normal text as your final response.
Available Functions:
accept_proposal
 - reasoning: string (detailed professional explanation why this proposal meets the rules)
 - internal_notes: string (optional private notes for the business owner)
 generate_counter_offer
 - proposed_price: number
 - proposed_date: string (ISO date or clear description)
 - scope_notes: string (any adjustments to scope or terms)
 - reasoning: string (clear explanation to the agent why you are countering)
- internal_notes: string (optional private notes for the business owner)
reject_proposal
 - reasoning: string (polite but clear explanation to the agent why the proposal cannot be accepted)
 - internal_notes: string (optional)
request_clarification
 - questions: array of strings (specific questions for the agent)
- reasoning: string (why clarification is needed)

Important:
- Call only ONE function per response.
- Always include high-quality reasoning.
- Never invent rules that were not provided.`;
  }

  private buildHistoryContext(history: any[], currentProposal: any): string {
    let ctx = 'OFFER RULES:\n' + JSON.stringify(currentProposal?.rules || {}, null, 2) + '\n\n';
    if (history?.length) ctx += 'HISTORY:\n' + history.map((h, i) => `Turn${i + 1}: ${JSON.stringify(h)}`).join('\n') + '\n\n';
    ctx += 'PROPOSAL:\n' + JSON.stringify(currentProposal, null, 2);
    return ctx;
  }

  private getTools() {
    return [
      { type: 'function' as const, function: { name: 'accept_proposal', parameters: { type: 'object', properties: { reasoning: { type: 'string' }, internal_notes: { type: 'string' } }, required: ['reasoning'] } } },
      { type: 'function' as const, function: { name: 'generate_counter_offer', parameters: { type: 'object', properties: { proposed_price: { type: 'number' }, proposed_date: { type: 'string' }, scope_notes: { type: 'string' }, reasoning: { type: 'string' }, internal_notes: { type: 'string' } }, required: ['proposed_price', 'reasoning'] } } },
      { type: 'function' as const, function: { name: 'reject_proposal', parameters: { type: 'object', properties: { reasoning: { type: 'string' }, internal_notes: { type: 'string' } }, required: ['reasoning'] } } },
      { type: 'function' as const, function: { name: 'request_clarification', parameters: { type: 'object', properties: { questions: { type: 'array', items: { type: 'string' } }, reasoning: { type: 'string' } }, required: ['questions', 'reasoning'] } } },
    ];
  }

  private parseFunctionCall(name: string, args: any): NegotiationDecision {
    let action: NegotiationAction = 'review';
    if (name === 'accept_proposal') action = 'accept';
    if (name === 'generate_counter_offer') action = 'counter';
    if (name === 'reject_proposal') action = 'reject';
    if (name === 'request_clarification') action = 'clarify';

    const decision: NegotiationDecision = { action, reasoning: args.reasoning || '', internalNotes: args.internal_notes };
    if (name === 'generate_counter_offer') {
      decision.counter = { priceCents: args.proposed_price ? Math.round(Number(args.proposed_price) * 100) : undefined, proposedDate: args.proposed_date, scopeNotes: args.scope_notes };
    }
    if (name === 'request_clarification') decision.clarificationQuestions = args.questions || [];
    return decision;
  }
}
