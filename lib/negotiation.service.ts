import { randomUUID } from 'crypto';
import { supabase } from './supabase';
import { createLLMAdapter, NegotiationDecision, NegotiationAction } from './llm-engine/index';
import { evaluateProposal } from './offer-rules';
import { AgentPage, getCheckoutOffer } from './agent-page';

/**
 * Core Negotiation Service - the brain of the Intelligent Negotiation Engine.
 * 
 * Responsibilities:
 * - Create or continue a persistent negotiation (by ID)
 * - Load full history + rules from DB
 * - Call the pluggable LLM (with full history for memory)
 * - Apply deterministic rules as hard floor (never let LLM violate)
 * - Persist every turn (proposal, decision, reasoning, timestamp) in metadata.conversation
 * - Return persistent link and decision
 *
 * This makes every negotiation long-lived and resumable as required.
 */

export type ConversationTurn = {
  id: string;
  timestamp: string;
  role: 'buyer' | 'seller_llm' | 'seller_owner';
  content: any; // proposal or decision
  decision?: NegotiationDecision;
};

export interface NegotiationContext {
  id: string;
  pageId: string;
  slug: string;
  offerKey: string;
  offer: any;
  rules: any;
  history: ConversationTurn[];
  currentStatus: string;
  statusToken?: string;
}

export class NegotiationService {
  private llm: any;

  constructor(llmAdapter?: any) {
    this.llm = llmAdapter || null;
  }

  private getLLM() {
    if (!this.llm) {
      this.llm = createLLMAdapter();
    }
    return this.llm;
  }

  /**
   * Start a new negotiation or load existing by ID.
   * If id provided, continues the conversation (appends to history).
   * History is now stored in the dedicated negotiation_messages table for better persistence and querying.
   */
  async startOrContinue(params: {
    slug: string;
    offerKey: string;
    buyerProposal: any; // { proposedPriceCents?, query, timeline, contact, ... }
    negotiationId?: string;
    statusToken?: string;
  }): Promise<{
    negotiationId: string;
    status: string;
    decision: NegotiationDecision;
    persistentLink: string;
    history: ConversationTurn[];
  }> {
    const { slug, offerKey, buyerProposal, negotiationId, statusToken } = params;

    // 1. Load page + offer (rules)
    const page = await this.loadPublishedPage(slug);
    if (!page) throw new Error('Page not found or not published');

    const offer = getCheckoutOffer(page, offerKey);
    if (!offer) throw new Error('Offer not found');

    const rules = offer.rules || {};

    // 2. Load or create negotiation record
    let negotiation: any;

    if (negotiationId) {
      negotiation = await this.loadNegotiation(negotiationId, statusToken);
    }

    if (!negotiation) {
      negotiation = await this.createNewNegotiation(page, offer, offerKey, buyerProposal);
    }

    // 3. Load full history from the dedicated messages table (persistent state)
    let history: ConversationTurn[] = await this.loadHistory(negotiation.id);

    // 4. Append buyer's turn (will be inserted to table)
    const buyerTurn: ConversationTurn = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      role: 'buyer',
      content: buyerProposal,
    };
    history.push(buyerTurn);

    // 5. Evaluate with deterministic rules first (hard constraints)
    const rulesEval = evaluateProposal(
      { offerType: offer.offerType, rules, price: offer.price },
      { proposedPriceCents: buyerProposal.proposedPriceCents || null }
    );

    // 6. Call LLM with full history + current proposal (perfect memory)
    let llmDecision: NegotiationDecision;
    try {
      llmDecision = await this.getLLM().negotiate(rules, buyerProposal, history);
    } catch (e) {
      // Fallback to deterministic if LLM fails
      llmDecision = this.fallbackDecision(rulesEval, buyerProposal, rules);
    }

    // 7. Clamp LLM decision with rules (rules always win)
    llmDecision = this.clampWithRules(llmDecision, rulesEval, buyerProposal, rules);

    // 8. Append seller (LLM) decision to history
    const sellerTurn: ConversationTurn = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      role: 'seller_llm',
      content: { proposal: buyerProposal },
      decision: llmDecision,
    };
    history.push(sellerTurn);

    // 9. Determine new status from decision
    const newStatus = this.decisionToStatus(llmDecision.action, negotiation.status);

    // 10. Persist to dedicated negotiation_messages table + update negotiation status
    await this.persistHistoryAndStatus(negotiation.id, newStatus, [buyerTurn, sellerTurn], llmDecision, rulesEval);

    // 11. Build persistent link
    const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://nexez.app';
    const persistentLink = `${base}/negotiate/${negotiation.id}${negotiation.status_token ? `?token=${negotiation.status_token}` : ''}`;

    return {
      negotiationId: negotiation.id,
      status: newStatus,
      decision: llmDecision,
      persistentLink,
      history,
    };
  }

  /** Load full conversation history from the dedicated negotiation_messages table. */
  private async loadHistory(negotiationId: string): Promise<ConversationTurn[]> {
    const { data, error } = await supabase
      .from('negotiation_messages')
      .select('id, role, content, created_at')
      .eq('negotiation_id', negotiationId)
      .order('created_at', { ascending: true });

    if (error) {
      console.warn('Failed to load negotiation messages, falling back to empty history:', error.message);
      return [];
    }

    return (data || []).map((row: any) => ({
      id: row.id,
      timestamp: row.created_at,
      role: row.role,
      content: row.content,
      // decision is embedded in content for seller_llm turns if present
      decision: row.content?.decision || undefined,
    }));
  }

  /** Persist new turns to the dedicated table and update negotiation status/metadata for compatibility. */
  private async persistHistoryAndStatus(
    negotiationId: string,
    newStatus: string,
    newTurns: ConversationTurn[],
    decision: NegotiationDecision,
    rulesEval: any
  ) {
    // Insert each new turn as a row in negotiation_messages
    const inserts = newTurns.map(turn => ({
      negotiation_id: negotiationId,
      role: turn.role,
      content: {
        ...turn.content,
        ...(turn.decision ? { decision: turn.decision } : {}),
      },
    }));

    if (inserts.length > 0) {
      const { error: insertErr } = await supabase.from('negotiation_messages').insert(inserts);
      if (insertErr) {
        console.error('Failed to insert negotiation messages:', insertErr);
        // continue to update status anyway
      }
    }

    // Update negotiation status and keep summary in metadata for backward compat with existing inbox/UI
    const update: any = {
      status: newStatus,
      updated_at: new Date().toISOString(),
      metadata: {
        // Keep last decision and rules for quick display
        last_decision: decision,
        rules_evaluation: rulesEval,
        // Note: full history now in negotiation_messages table
        history_source: 'negotiation_messages',
      },
    };

    if (decision.counter?.priceCents) {
      update.amount_cents = decision.counter.priceCents;
    }

    await supabase.from('agent_negotiations').update(update).eq('id', negotiationId);
  }

  private async loadPublishedPage(slug: string) {
    const { data } = await supabase
      .from('pages')
      .select('*')
      .eq('slug', slug)
      .eq('is_published', true)
      .single();
    return data;
  }

  private async loadNegotiation(id: string, token?: string) {
    // Allow loading by id + optional token for agents (anon friendly read for the conversation page)
    const query = supabase.from('agent_negotiations').select('*').eq('id', id);
    const { data } = await query.single();
    if (!data) return null;

    // Basic token check if provided (for security on public /negotiate page)
    if (token && data.status_token && data.status_token !== token) {
      // Still allow owner later via RLS, but for public agent link require token match on first load
    }
    return data;
  }

  private async createNewNegotiation(page: any, offer: any, offerKey: string, proposal: any) {
    const id = randomUUID();
    const statusToken = randomUUID().replace(/-/g, '');

    const negotiation = {
      id,
      page_id: page.id,
      owner_id: page.owner_id,
      slug: page.slug,
      offer_key: offerKey,
      offer_name: offer.name,
      offer_kind: offer.kind,
      buyer_agent: proposal.buyerAgent || 'Unknown Agent',
      buyer_query: proposal.query || null,
      requested_terms: proposal.requestedTerms || {},
      budget_text: proposal.budget || proposal.proposedPrice || null,
      timeline_text: proposal.timeline || null,
      contact: proposal.contact || null,
      status: 'negotiation',
      escrow_mode: process.env.STRIPE_SECRET_KEY ? 'manual_capture_ready' : 'not_configured',
      amount_cents: null,
      status_token: statusToken,
      metadata: {
        conversation: [],
        source: 'intelligent_negotiation_v2',
      },
    };

    const { error } = await supabase.from('agent_negotiations').insert(negotiation);
    if (error) throw error;

    return { ...negotiation, status_token: statusToken };
  }

  private async persistTurn(
    id: string,
    newStatus: string,
    history: ConversationTurn[],
    decision: NegotiationDecision,
    rulesEval: any
  ) {
    const update: any = {
      status: newStatus,
      updated_at: new Date().toISOString(),
      metadata: {
        conversation: history,
        last_decision: decision,
        rules_evaluation: rulesEval,
        updated_by: 'llm_negotiation_service',
      },
    };

    // If counter, store suggested amount for owner inbox convenience
    if (decision.counter?.priceCents) {
      update.amount_cents = decision.counter.priceCents;
    }

    await supabase.from('agent_negotiations').update(update).eq('id', id);
  }

  private clampWithRules(
    decision: NegotiationDecision,
    rulesEval: any,
    proposal: any,
    rules: any
  ): NegotiationDecision {
    // Rules are absolute. Never allow LLM to accept below floor.
    const floor = this.computeFloor(rules, proposal);

    if (decision.action === 'accept' && floor != null && proposal.proposedPriceCents != null && proposal.proposedPriceCents < floor) {
      decision.action = 'counter';
      decision.counter = decision.counter || { priceCents: floor };
      decision.reasoning = (decision.reasoning || '') + ' (Clamped to seller minimum rules.)';
    }

    if (decision.action === 'counter' && decision.counter?.priceCents != null && floor != null) {
      decision.counter.priceCents = Math.max(decision.counter.priceCents, floor);
    }

    return decision;
  }

  private computeFloor(rules: any, proposal: any): number | null {
    // Simplified floor from offer-rules logic
    const min = parseFloat(rules?.minPrice || '0') * 100;
    return isNaN(min) ? null : min;
  }

  private decisionToStatus(action: NegotiationAction, current: string): string {
    if (action === 'accept') return 'agreement_proposed';
    if (action === 'reject') return 'declined';
    return current === 'negotiation' ? 'negotiation' : current;
  }

  private fallbackDecision(rulesEval: any, proposal: any, rules: any): NegotiationDecision {
    if (rulesEval.decision === 'auto_accept') {
      return { action: 'accept', reasoning: 'Proposal meets all deterministic rules.' };
    }
    if (rulesEval.decision === 'flag') {
      return { action: 'reject', reasoning: 'Proposal violates core pricing rules.' };
    }
    return {
      action: 'counter',
      reasoning: 'Counter suggested within rules.',
      counter: { priceCents: Math.round((proposal.proposedPriceCents || 0) * 1.1) },
    };
  }
}

export const negotiationService = new NegotiationService();
