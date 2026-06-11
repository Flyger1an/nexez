import { randomUUID } from 'crypto';
import { supabase } from './supabase';
import { createAdminClient, hasSupabaseAdminEnv } from '../utils/supabase/admin';
import { createLLMAdapter, NegotiationDecision, NegotiationAction } from './llm-engine/index';
import { evaluateProposal } from './offer-rules';
import { AgentPage, getCheckoutOffer } from './agent-page';
import { getAutoSettleCeilingCents, classifySettlement, SettlementState } from './settlement';
import { captureError } from './observability';

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
   * Client for agent_negotiations / negotiation_messages reads and writes.
   * These rows are owner-only under RLS, but the negotiation flow runs on behalf
   * of anonymous agents whose credential is the status token (enforced in
   * loadNegotiation, mirroring /api/negotiations/status). With the anon client
   * the status update matched 0 rows and history inserts were rejected, so
   * negotiations silently lost their state. Falls back to the anon client when
   * no service-role env is configured (tests / minimal deployments).
   */
  private db() {
    return hasSupabaseAdminEnv() ? createAdminClient() : supabase;
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
    statusToken?: string;
    amountCents?: number | null;
    settlementState?: SettlementState | null;
  }> {
    const { slug, offerKey, buyerProposal, negotiationId, statusToken } = params;

    // 1. Load page + offer (rules)
    const page = await this.loadPublishedPage(slug);
    if (!page) throw new Error('Page not found or not published');

    const offer = getCheckoutOffer(page, offerKey);
    if (!offer) throw new Error('Offer not found');

    const rules = offer.rules || {};

    // Phase 2 extension: surface any Calendly/scheduling link from the offer (imported offers carry url or metadata.scheduling_url)
    // This enables LLM to suggest concrete slot picking and richer status for agents.
    const schedulingLink: string | undefined =
      (offer.url && /calendly|acuity|cal\.com|schedule|booking/i.test(offer.url)) ? offer.url :
      (offer.metadata && (offer.metadata.scheduling_url || offer.metadata.bookingUrl || offer.metadata.url)) || undefined;

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

    // Attach schedulingLink (if any) + full rules (so scope fields like includedScope etc. are visible in the JSON context the adapters build)
    // This makes Phase 2 scope + Calendly link first-class for the LLM without changing every adapter.
    const proposalForLLM = {
      ...buyerProposal,
      rules,
      ...(schedulingLink ? { schedulingLink } : {}),
    };

    // 5. Evaluate with deterministic rules first (hard constraints)
    const rulesEval = evaluateProposal(
      { offerType: offer.offerType, rules, price: offer.price },
      { proposedPriceCents: buyerProposal.proposedPriceCents || null }
    );

    // 6. Call LLM with full history + current proposal (perfect memory). proposalForLLM carries schedulingLink for Phase 2.
    let llmDecision: NegotiationDecision;
    try {
      llmDecision = await this.getLLM().negotiate(rules, proposalForLLM, history);
    } catch (e) {
      // Fallback to deterministic if LLM fails
      llmDecision = this.fallbackDecision(rulesEval, proposalForLLM, rules);
    }

    // 7. Clamp LLM decision with rules (rules always win). Also propagate schedulingLink if LLM or we detected one.
    llmDecision = this.clampWithRules(llmDecision, rulesEval, proposalForLLM, rules);
    if (!llmDecision.schedulingLink && schedulingLink) {
      llmDecision.schedulingLink = schedulingLink;
    }

    // 8. Append seller (LLM) decision to history.
    // Do NOT persist the offer's private pricing rules (minPrice etc.) into the
    // durable conversation log — they were attached to proposalForLLM only as
    // LLM context. Pricing rules are owner-private (Phase 1 invariant); keeping
    // them out of negotiation_messages means the thread is safe to surface to
    // the buying agent on /negotiate even if a row is ever exported or re-read.
    const { rules: _omitRules, ...proposalForLog } = proposalForLLM;
    const sellerTurn: ConversationTurn = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      role: 'seller_llm',
      content: { proposal: proposalForLog },
      decision: llmDecision,
    };
    history.push(sellerTurn);

    // 9. Determine new status from decision
    const newStatus = this.decisionToStatus(llmDecision.action, negotiation.status);

    // The agreed amount: a counter sets its own price; an accept locks in the
    // buyer's proposed price. Without this, accepted negotiations had no
    // amount_cents, so the escrow hold (which requires a valid agreed amount)
    // could never run. Null leaves any previously-agreed amount untouched.
    const agreedAmountCents =
      llmDecision.counter?.priceCents ??
      (llmDecision.action === 'accept' && buyerProposal.proposedPriceCents > 0
        ? buyerProposal.proposedPriceCents
        : null);

    // Hybrid settlement: at agreement time, classify into the autonomous (low-value)
    // path or the owner-approval (high-value) path. Only set when an agreement is
    // reached with a concrete amount; otherwise left null so it isn't clobbered.
    let settlementState: SettlementState | null = null;
    if (newStatus === 'agreement_proposed' && agreedAmountCents != null && agreedAmountCents > 0) {
      settlementState = classifySettlement(agreedAmountCents, getAutoSettleCeilingCents(offer));
    }

    // 10. Persist to dedicated negotiation_messages table + update negotiation status
    await this.persistHistoryAndStatus(negotiation.id, newStatus, [buyerTurn, sellerTurn], llmDecision, rulesEval, agreedAmountCents, settlementState);

    // 11. Build persistent link
    const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://nexez.app';
    const persistentLink = `${base}/negotiate/${negotiation.id}${negotiation.status_token ? `?token=${negotiation.status_token}` : ''}`;

    return {
      negotiationId: negotiation.id,
      status: newStatus,
      decision: llmDecision,
      persistentLink,
      history,
      // The token persisted on the row — the credential for /api/negotiations/status
      // and the /negotiate page. Safe to return: the caller either just created the
      // negotiation or proved possession of the token in loadNegotiation.
      statusToken: negotiation.status_token || undefined,
      // The agreed amount in cents once accepted/countered (else the prior value, or null).
      amountCents: agreedAmountCents ?? negotiation.amount_cents ?? null,
      // Settlement path once an agreement is reached: 'auto' | 'awaiting_approval' (else null).
      settlementState,
    };
  }

  /** Load full conversation history from the dedicated negotiation_messages table. */
  private async loadHistory(negotiationId: string): Promise<ConversationTurn[]> {
    const { data, error } = await this.db()
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
    rulesEval: any,
    agreedAmountCents: number | null = null,
    settlementState: SettlementState | null = null
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
      await this.withRetry('insert negotiation_messages', { negotiationId }, () =>
        this.db().from('negotiation_messages').insert(inserts),
      );
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

    // Lock in the agreed amount (counter price, or the accepted proposal). Left
    // null for non-pricing turns so a prior agreed amount is never clobbered.
    if (agreedAmountCents != null && agreedAmountCents > 0) {
      update.amount_cents = agreedAmountCents;
    }

    // Persist the settlement path so the buyer pay endpoint + inbox know whether
    // the agreement is autonomous or awaiting owner approval.
    if (settlementState) {
      update.settlement_state = settlementState;
    }

    await this.withRetry('update negotiation status', { negotiationId, newStatus }, () =>
      this.db().from('agent_negotiations').update(update).eq('id', negotiationId),
    );
  }

  /**
   * Run a DB write with a small bounded retry; on final failure, surface it via
   * captureError (the reconcile-escrow cron is the money-side backstop for drift).
   */
  private async withRetry(
    label: string,
    ctx: Record<string, unknown>,
    run: () => PromiseLike<{ error: unknown }>,
  ): Promise<{ error: unknown }> {
    let result: { error: unknown } = { error: null };
    for (let attempt = 1; attempt <= 3; attempt++) {
      result = await run();
      if (!result.error) return result;
      if (attempt < 3) await new Promise((r) => setTimeout(r, 150 * attempt));
    }
    captureError(new Error(`${label} failed after retries`), {
      ...ctx,
      dbError: (result.error as { message?: string } | null)?.message,
    });
    return result;
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
    // Owner-only under RLS, so continuation lookups need the service-role client —
    // with the anon client this read returned nothing and every follow-up forked a
    // brand-new negotiation instead of resuming the thread.
    const query = this.db().from('agent_negotiations').select('*').eq('id', id);
    const { data } = await query.single();
    if (!data) return null;

    // The status token is the credential for continuing a negotiation: it is issued
    // once at creation (status URL + persistent link) and must be presented to resume.
    // Without this check, anyone who learned the id could append turns and receive
    // the stored token back in the response.
    if (data.status_token && data.status_token !== token) {
      const err = new Error('Negotiation not found.') as Error & { status: number };
      err.status = 404;
      throw err;
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

    const { error } = await this.db().from('agent_negotiations').insert(negotiation);
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

    await this.db().from('agent_negotiations').update(update).eq('id', id);
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
      return { action: 'accept', reasoning: 'Proposal meets all deterministic rules.', schedulingLink: proposal?.schedulingLink };
    }
    if (rulesEval.decision === 'flag') {
      return { action: 'reject', reasoning: 'Proposal violates core pricing rules.', schedulingLink: proposal?.schedulingLink };
    }
    return {
      action: 'counter',
      reasoning: 'Counter suggested within rules.',
      counter: { priceCents: Math.round((proposal.proposedPriceCents || 0) * 1.1) },
      schedulingLink: proposal?.schedulingLink,
    };
  }
}

export const negotiationService = new NegotiationService();
