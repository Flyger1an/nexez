import { randomUUID } from 'crypto';
import { supabase } from './supabase';
import { createAdminClient, hasSupabaseAdminEnv } from '../utils/supabase/admin';
import { createLLMAdapter, NegotiationDecision, NegotiationAction } from './llm-engine/index';
import { evaluateProposal } from './offer-rules';
import { AgentPage, getCheckoutOffer, getBaseUrl } from './agent-page';
import { getAutoSettleCeilingCents, classifySettlement, SettlementState } from './settlement';
import { captureError } from './observability';
import { sanitizeSchedulingLink } from './scheduling-allowlist';

/**
 * Core Negotiation Service - the brain of the Intelligent Negotiation Engine.
 *
 * Burst 3a split the work into two phases so the LLM never blocks the POST:
 *   - submitProposal()  (sync, on the request): create/continue the negotiation,
 *     persist the buyer's turn, mark the row decision_pending. Returns immediately.
 *   - runDecision()     (async, from next/server `after` + a backstop cron): claim
 *     the pending row atomically (exactly-once), run the LLM with full history,
 *     clamp to the rules floor (rules always win), persist the seller turn + the
 *     new status/amount/settlement, and bump decision_seq so polling agents detect
 *     the new turn via /api/negotiations/status.
 *
 * Every negotiation stays long-lived and resumable: history lives in the dedicated
 * negotiation_messages table and the status token is the agent's credential.
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
   * Phase 1 (sync, on the POST): record the buyer's proposal and queue an LLM
   * decision. Does NOT call the LLM — that runs in runDecision() after the
   * response. Returns the negotiation id + status token (the agent's credential)
   * so the caller can hand back a statusUrl to poll.
   */
  async submitProposal(params: {
    slug: string;
    offerKey: string;
    buyerProposal: any; // { proposedPriceCents?, query, timeline, contact, ... }
    negotiationId?: string;
    statusToken?: string;
  }): Promise<{
    negotiationId: string;
    status: string;
    decisionPending: true;
    persistentLink: string;
    statusToken?: string;
  }> {
    const { slug, offerKey, buyerProposal, negotiationId, statusToken } = params;

    const page = await this.loadPublishedPage(slug);
    if (!page) throw new Error('Page not found or not published');

    const offer = getCheckoutOffer(page, offerKey);
    if (!offer) throw new Error('Offer not found');

    let negotiation: any;
    if (negotiationId) {
      // Token-as-credential check (throws a 404-shaped error on mismatch).
      negotiation = await this.loadNegotiation(negotiationId, statusToken);
      // One decision at a time: a follow-up while the prior one is still being
      // produced would race two LLM turns against the same history. Make the
      // agent poll for the in-flight decision first.
      if (negotiation?.decision_pending) {
        const err = new Error('A decision is already in progress for this negotiation. Poll statusUrl, then submit your follow-up.') as Error & { status: number };
        err.status = 409;
        throw err;
      }
    }

    if (!negotiation) {
      // Fresh negotiations are created already pending (saves a round-trip).
      negotiation = await this.createNewNegotiation(page, offer, offerKey, buyerProposal);
    } else {
      // Continuation: re-arm the pending flag for the new buyer turn.
      await this.withRetry('queue decision', { negotiationId: negotiation.id }, () =>
        this.db()
          .from('agent_negotiations')
          .update({
            decision_pending: true,
            decision_requested_at: new Date().toISOString(),
            // Clear any prior lease so the new turn can be claimed.
            decision_claimed_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', negotiation.id),
      );
    }

    // Persist the buyer's turn now; the seller (LLM) turn is appended by runDecision.
    await this.withRetry('insert buyer turn', { negotiationId: negotiation.id }, () =>
      this.db()
        .from('negotiation_messages')
        .insert([{ negotiation_id: negotiation.id, role: 'buyer', content: buyerProposal }]),
    );

    return {
      negotiationId: negotiation.id,
      status: negotiation.status || 'negotiation',
      decisionPending: true,
      persistentLink: this.buildPersistentLink(negotiation.id, negotiation.status_token),
      statusToken: negotiation.status_token || undefined,
    };
  }

  /**
   * Phase 2 (async): produce the LLM decision for a pending negotiation. Safe to
   * call from both `after()` and the backstop cron — the atomic claim guarantees
   * exactly one of them does the work. A no-op if the row was already decided.
   */
  async runDecision(negotiationId: string): Promise<void> {
    const claimed = await this.claimPendingDecision(negotiationId);
    if (!claimed) return; // lost the race, or nothing pending

    try {
      const page = await this.loadPublishedPage(claimed.slug);
      if (!page) throw new Error('Page not found or not published');
      const offer = getCheckoutOffer(page, claimed.offer_key);
      if (!offer) throw new Error('Offer not found');
      await this.produceDecision(claimed, page, offer);
    } catch (err) {
      // Catastrophic (page unpublished / offer removed / DB down mid-flight). Don't
      // leave the agent polling forever — write a deterministic review turn so the
      // thread has an answer — and surface the failure.
      captureError(err instanceof Error ? err : new Error(String(err)), { negotiationId, phase: 'runDecision' });
      await this.writeFallbackTurn(claimed).catch(() => {});
    }
  }

  /** A claim lease longer than the LLM ever takes (p95 ~6s, maxDuration 60s). */
  private static readonly CLAIM_LEASE_MS = 90_000;

  /**
   * Atomically claim a pending decision via a short LEASE. The conditional UPDATE
   * stamps decision_claimed_at only when the row is pending AND unleased (or its
   * lease expired). Postgres serializes the two concurrent updates (after() vs.
   * cron): the winner's WHERE matches and returns the row; the loser sees the
   * fresh lease and matches zero rows. decision_pending stays TRUE — agents keep
   * seeing "responding" — until persistDecision clears it. A crashed worker's
   * lease expires so the backstop cron can re-drive it. Null = lost / not pending.
   */
  private async claimPendingDecision(id: string): Promise<any | null> {
    const leaseCutoff = new Date(Date.now() - NegotiationService.CLAIM_LEASE_MS).toISOString();
    const { data, error } = await this.db()
      .from('agent_negotiations')
      .update({ decision_claimed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('decision_pending', true)
      .or(`decision_claimed_at.is.null,decision_claimed_at.lt.${leaseCutoff}`)
      .select('id, slug, offer_key, status, status_token, amount_cents, decision_seq, metadata');

    if (error) {
      captureError(new Error('claim decision failed'), { negotiationId: id, dbError: (error as { message?: string }).message });
      return null;
    }
    const rows = Array.isArray(data) ? data : data ? [data] : [];
    return rows[0] || null;
  }

  /**
   * Run the LLM against full history, clamp to the rules floor, and persist the
   * seller turn + new status/amount/settlement. Mirrors the prior synchronous
   * flow minus the buyer-turn insert (submitProposal already wrote it).
   */
  private async produceDecision(negotiation: any, page: any, offer: any): Promise<void> {
    const rules = offer.rules || {};

    // Surface any Calendly/scheduling link from the offer so the LLM can direct
    // the agent to concrete slot selection (Phase 2 behavior, unchanged).
    const schedulingLink: string | undefined =
      offer.url && /calendly|acuity|cal\.com|schedule|booking/i.test(offer.url)
        ? offer.url
        : (offer.metadata && (offer.metadata.scheduling_url || offer.metadata.bookingUrl || offer.metadata.url)) || undefined;

    // Full history (includes the buyer turn submitProposal persisted). The latest
    // buyer turn is the proposal this decision answers.
    const history: ConversationTurn[] = await this.loadHistory(negotiation.id);
    const lastBuyer = [...history].reverse().find((t) => t.role === 'buyer');
    const buyerProposal = (lastBuyer?.content as any) || {};

    // Attach full rules + schedulingLink for the LLM only (stripped before logging).
    const proposalForLLM = {
      ...buyerProposal,
      rules,
      ...(schedulingLink ? { schedulingLink } : {}),
    };

    const rulesEval = evaluateProposal(
      { offerType: offer.offerType, rules, price: offer.price },
      { proposedPriceCents: buyerProposal.proposedPriceCents || null },
    );

    let llmDecision: NegotiationDecision;
    try {
      llmDecision = await this.getLLM().negotiate(rules, proposalForLLM, history);
    } catch {
      // Provider outage / bad key — fall back to the deterministic rules decision
      // so a polling agent still gets an answer.
      llmDecision = this.fallbackDecision(rulesEval, proposalForLLM, rules);
    }

    // Rules always win.
    llmDecision = this.clampWithRules(llmDecision, rulesEval, proposalForLLM, rules);
    // Never let an LLM-emitted scheduling link reach the agent unless it points at a
    // known provider (or the owner's own configured link) — blocks a prompt injection
    // from planting a phishing <a href> in the rendered decision. Falls back to the
    // owner-derived link when the candidate is missing or off-allowlist.
    llmDecision.schedulingLink = sanitizeSchedulingLink(llmDecision.schedulingLink, schedulingLink);

    // Never persist the offer's private pricing rules into the durable message log
    // (owner-private Phase 1 invariant) — they were attached for LLM context only.
    const { rules: _omitRules, ...proposalForLog } = proposalForLLM;
    const sellerTurn: ConversationTurn = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      role: 'seller_llm',
      content: { proposal: proposalForLog },
      decision: llmDecision,
    };

    const newStatus = this.decisionToStatus(llmDecision.action, negotiation.status);

    // The agreed amount: a counter sets its own price; an accept locks in the
    // buyer's proposed price (so the escrow hold has a valid amount).
    const agreedAmountCents =
      llmDecision.counter?.priceCents ??
      (llmDecision.action === 'accept' && buyerProposal.proposedPriceCents > 0 ? buyerProposal.proposedPriceCents : null);

    // Hybrid settlement: classify into the autonomous (low-value) or owner-approval
    // (high-value) path only when an agreement is reached with a concrete amount.
    let settlementState: SettlementState | null = null;
    if (newStatus === 'agreement_proposed' && agreedAmountCents != null && agreedAmountCents > 0) {
      settlementState = classifySettlement(agreedAmountCents, getAutoSettleCeilingCents(offer));
    }

    const nextSeq = (Number(negotiation.decision_seq) || 0) + 1;
    await this.persistDecision(negotiation.id, newStatus, sellerTurn, llmDecision, rulesEval, agreedAmountCents, settlementState, nextSeq);
  }

  /** Last-resort seller turn when the decision couldn't be produced at all. */
  private async writeFallbackTurn(claimed: any): Promise<void> {
    const decision: NegotiationDecision = {
      action: 'review',
      reasoning: 'This proposal could not be processed automatically and is pending seller review.',
    };
    const sellerTurn: ConversationTurn = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      role: 'seller_llm',
      content: { proposal: {} },
      decision,
    };
    const newStatus = this.decisionToStatus('review', claimed?.status || 'negotiation');
    const nextSeq = (Number(claimed?.decision_seq) || 0) + 1;
    await this.persistDecision(claimed.id, newStatus, sellerTurn, decision, { decision: 'review' }, null, null, nextSeq);
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

  /**
   * Persist the seller turn + update the negotiation status/amount/settlement and
   * bump decision_seq. decision_pending was already cleared by the atomic claim.
   */
  private async persistDecision(
    negotiationId: string,
    newStatus: string,
    sellerTurn: ConversationTurn,
    decision: NegotiationDecision,
    rulesEval: any,
    agreedAmountCents: number | null,
    settlementState: SettlementState | null,
    decisionSeq: number,
  ) {
    await this.withRetry('insert seller turn', { negotiationId }, () =>
      this.db()
        .from('negotiation_messages')
        .insert([
          {
            negotiation_id: negotiationId,
            role: sellerTurn.role,
            content: {
              ...sellerTurn.content,
              ...(sellerTurn.decision ? { decision: sellerTurn.decision } : {}),
            },
          },
        ]),
    );

    const update: any = {
      status: newStatus,
      updated_at: new Date().toISOString(),
      decision_seq: decisionSeq,
      // The decision is now durably written — clear the pending flag (agents stop
      // seeing "responding") and release the lease.
      decision_pending: false,
      decision_claimed_at: null,
      metadata: {
        last_decision: decision,
        rules_evaluation: rulesEval,
        history_source: 'negotiation_messages',
      },
    };

    // Lock in the agreed amount (counter price, or accepted proposal); left null
    // for non-pricing turns so a prior agreed amount is never clobbered.
    if (agreedAmountCents != null && agreedAmountCents > 0) {
      update.amount_cents = agreedAmountCents;
    }
    if (settlementState) {
      update.settlement_state = settlementState;
    }

    await this.withRetry('update negotiation decision', { negotiationId, newStatus }, () =>
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
    // Reads owner-private offer `rules` (the floor clamp depends on minPrice), so it
    // must use the service-role client — anon can no longer read the pages base table,
    // and the public view strips `rules`. Falls back to anon only when no admin env
    // is configured (tests / minimal deploys, where the page read is mocked anyway).
    const { data } = await this.db()
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
      // Created already awaiting an async decision (runDecision will claim it).
      decision_pending: true,
      decision_requested_at: new Date().toISOString(),
      metadata: {
        conversation: [],
        source: 'intelligent_negotiation_v2',
      },
    };

    const { error } = await this.db().from('agent_negotiations').insert(negotiation);
    if (error) throw error;

    return { ...negotiation, status_token: statusToken };
  }

  private buildPersistentLink(id: string, statusToken?: string | null): string {
    // Single source of truth for the agent-runtime base (honors
    // NEXT_PUBLIC_AGENT_RUNTIME_URL, then NEXT_PUBLIC_SITE_URL) so this agent-bookmarked
    // link never diverges from the other agent artifacts.
    const base = getBaseUrl();
    return `${base}/negotiate/${id}${statusToken ? `?token=${statusToken}` : ''}`;
  }

  private clampWithRules(
    decision: NegotiationDecision,
    rulesEval: any,
    proposal: any,
    rules: any,
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
