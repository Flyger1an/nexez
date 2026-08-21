import 'server-only';
import { randomUUID } from 'crypto';
import { supabase } from './supabase';
import { createAdminClient, hasSupabaseAdminEnv } from '../utils/supabase/admin';
import { bearerTokenColumns, hashBearerToken, recoverBearerToken } from './server/bearer-token';
import { createLLMAdapter, NegotiationDecision, NegotiationAction } from './llm-engine/index';
import { evaluateProposal } from './offer-rules';
import { AgentPage, getCheckoutOffer, getBaseUrl } from './agent-page';
import { getAutoSettleCeilingCents, classifySettlement, SettlementState } from './settlement';
import { captureError } from './observability';
import { sanitizeSchedulingLink } from './scheduling-allowlist';
import { tagCalendlyTracking } from './calendly-tracking';
import { isTerminalNegotiationStatus, type NegotiationStatus } from './negotiations';
import { parseMoney } from './checkout';
import { normalizeCurrency } from './currency';
import { parseBuyerIdentity } from './buyer-identity';
import { notifyBuyerOfNegotiationDecision } from './server/negotiation-notifications';

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
   * decision. Does NOT call the LLM - that runs in runDecision() after the
   * response. Returns the negotiation id + status token (the agent's credential)
   * so the caller can hand back a statusUrl to poll.
   */
  async submitProposal(params: {
    slug: string;
    offerKey: string;
    buyerProposal: any; // { proposedPriceCents?, query, timeline, contact, ... }
    negotiationId?: string;
    statusToken?: string;
    idempotencyKeyHash?: string;
    idempotencyRequestHash?: string;
  }): Promise<{
    negotiationId: string;
    status: string;
    decisionPending: true;
    persistentLink: string;
    statusToken?: string;
    replayed: boolean;
  }> {
    const {
      slug,
      offerKey,
      buyerProposal,
      negotiationId,
      statusToken,
      idempotencyKeyHash,
      idempotencyRequestHash,
    } = params;

    const page = await this.loadPublishedPage(slug);
    if (!page) throw new Error('Page not found or not published');

    const offer = getCheckoutOffer(page, offerKey);
    if (!offer) throw new Error('Offer not found');

    let negotiation: any;
    if (negotiationId) {
      // Token-as-credential check (throws a 404-shaped error on mismatch).
      negotiation = await this.loadNegotiation(negotiationId, statusToken);
      if (idempotencyKeyHash) {
        const replayMessage = await this.loadBuyerMessageByIdempotencyHash(negotiation.id, idempotencyKeyHash);
        if (replayMessage) {
          this.assertIdempotencyRequest(replayMessage.idempotency_request_hash, idempotencyRequestHash);
          return this.proposalResult(negotiation, true);
        }
      }
      // One decision at a time: a follow-up while the prior one is still being
      // produced would race two LLM turns against the same history. Make the
      // agent poll for the in-flight decision first.
      if (negotiation?.decision_pending) {
        const err = new Error('A decision is already in progress for this negotiation. Poll statusUrl, then submit your follow-up.') as Error & { status: number };
        err.status = 409;
        throw err;
      }
      // A buyer continuation may only re-open an actively-negotiating deal. Once a
      // negotiation is funded (held), settled (complete), or terminal (declined /
      // expired / refunded / disputed) it is closed: re-driving it back to
      // agreement_proposed would divorce the live agreement amount from the held /
      // captured PaymentIntent and let a buyer renegotiate a paid deal downward.
      if (negotiation && (negotiation.status === 'held' || isTerminalNegotiationStatus(negotiation.status as NegotiationStatus))) {
        const err = new Error('This negotiation is closed and cannot be reopened.') as Error & { status: number };
        err.status = 409;
        throw err;
      }
      if (negotiation?.status === 'paused') {
        const err = new Error('This negotiation is paused by the seller and cannot accept buyer turns yet.') as Error & { status: number };
        err.status = 409;
        throw err;
      }
    }

    if (!negotiation && idempotencyKeyHash) {
      const replay = await this.loadNegotiationByIdempotencyHash(idempotencyKeyHash);
      if (replay) {
        this.assertIdempotencyRequest(replay.idempotency_request_hash, idempotencyRequestHash);
        return this.proposalResult(replay, true);
      }
    }

    // Content-based retry collapse: an agent that mints a FRESH Idempotency-Key per
    // retry (or sends none at all) defeats the key-hash replay above and forks a
    // duplicate negotiation per attempt (observed in production: one buyer agent,
    // four byte-identical proposals in three minutes, four open negotiations, none
    // funded). If an OPEN negotiation with the byte-identical request (same slug +
    // offer + request hash) was created inside the replay window, hand back THAT
    // negotiation - replayed, with its original status token - instead of forking,
    // so the retrying agent recovers its credential and can resume polling / paying.
    if (!negotiation && idempotencyRequestHash) {
      const dup = await this.loadOpenDuplicateByRequestHash(slug, offerKey, idempotencyRequestHash);
      if (dup) return this.proposalResult(dup, true);
    }

    if (!negotiation) {
      // Fresh negotiation + first buyer turn are created in one DB transaction.
      negotiation = await this.createNewNegotiation(
        page,
        offer,
        offerKey,
        buyerProposal,
        idempotencyKeyHash,
        idempotencyRequestHash,
      );
      if (negotiation.__replayed) return this.proposalResult(negotiation, true);
    } else {
      // Continuation queue + buyer turn are atomic. A failed message insert leaves
      // the row non-pending, so cron can never decide against stale history.
      const requestedAt = new Date().toISOString();
      const { data, error } = await this.db().rpc('nz_queue_negotiation_buyer_turn', {
        p_negotiation_id: negotiation.id,
        p_content: buyerProposal,
        p_idempotency_key_hash: idempotencyKeyHash ?? null,
        p_idempotency_request_hash: idempotencyRequestHash ?? null,
        p_requested_at: requestedAt,
      });
      if (error) {
        if (idempotencyKeyHash && (error as any)?.code === '23505') {
          const replayMessage = await this.loadBuyerMessageByIdempotencyHash(negotiation.id, idempotencyKeyHash);
          this.assertIdempotencyRequest(replayMessage?.idempotency_request_hash, idempotencyRequestHash);
          return this.proposalResult(negotiation, true);
        }
        throw error;
      }
      negotiation = { ...negotiation, ...(data || {}), decision_pending: true, decision_requested_at: requestedAt };
    }

    return this.proposalResult(negotiation, false);
  }

  /**
   * Phase 2 (async): produce the LLM decision for a pending negotiation. Safe to
   * call from both `after()` and the backstop cron - the atomic claim guarantees
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
      // leave the agent polling forever - write a deterministic review turn so the
      // thread has an answer - and surface the failure.
      captureError(err instanceof Error ? err : new Error(String(err)), { negotiationId, phase: 'runDecision' });
      await this.writeFallbackTurn(claimed).catch(() => {});
    }
  }

  /** A claim lease longer than the LLM ever takes (p95 ~6s, maxDuration 60s). */
  private static readonly CLAIM_LEASE_MS = 90_000;

  /** Identical-content retries collapse onto the same open negotiation inside this window. */
  private static readonly DUPLICATE_REPLAY_WINDOW_MS = 60 * 60_000;

  /**
   * Atomically claim a pending decision via a short LEASE. The conditional UPDATE
   * stamps decision_claimed_at only when the row is pending AND unleased (or its
   * lease expired). Postgres serializes the two concurrent updates (after() vs.
   * cron): the winner's WHERE matches and returns the row; the loser sees the
   * fresh lease and matches zero rows. decision_pending stays TRUE - agents keep
   * seeing "responding" - until persistDecision clears it. A crashed worker's
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
      .select('id, slug, offer_key, status, status_token_encrypted, amount_cents, decision_seq, metadata, buyer_email, offer_name');

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
    if (page?.llm_opt_in === true) {
      try {
        llmDecision = await this.getLLM().negotiate(rules, proposalForLLM, history);
      } catch {
        // Provider outage / bad key - fall back to the deterministic rules decision
        // so a polling agent still gets an answer.
        llmDecision = this.fallbackDecision(rulesEval, proposalForLLM, rules);
      }
    } else {
      // No per-page LLM consent → deterministic decision only. Every other LLM
      // surface (simulate-llm / public-simulate) gates on llm_opt_in; without this
      // an anonymous POST /api/negotiations spent a paid LLM completion per request
      // against any published page, opted-in or not.
      llmDecision = this.fallbackDecision(rulesEval, proposalForLLM, rules);
    }

    // Rules always win.
    llmDecision = this.clampWithRules(llmDecision, rulesEval, proposalForLLM, rules);
    // Never let an LLM-emitted scheduling link reach the agent unless it points at a
    // known provider (or the owner's own configured link) - blocks a prompt injection
    // from planting a phishing <a href> in the rendered decision. Falls back to the
    // owner-derived link when the candidate is missing or off-allowlist.
    llmDecision.schedulingLink = sanitizeSchedulingLink(llmDecision.schedulingLink, schedulingLink);
    // Tag a Calendly link with this negotiation's id so a later booking is
    // linkable back here (Calendly echoes utm_content on the invitee webhook),
    // enabling exact cancel-on-refund. No-op for non-Calendly links.
    llmDecision.schedulingLink = tagCalendlyTracking(llmDecision.schedulingLink, negotiation.id);

    // Never persist the offer's private pricing rules into the durable message log
    // (owner-private Phase 1 invariant) - they were attached for LLM context only.
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
    const applied = await this.persistDecision(negotiation.id, newStatus, sellerTurn, llmDecision, rulesEval, agreedAmountCents, settlementState, nextSeq);
    if (!applied) return;

    // Push the buyer's device(s) that the seller responded - the async loop that
    // makes Nexie useful. Best-effort + isolated: a push failure must never affect
    // the decision that just persisted.
    try {
      await notifyBuyerOfNegotiationDecision(negotiation, llmDecision.action);
    } catch (e) {
      captureError(e instanceof Error ? e : new Error(String(e)), { negotiationId: negotiation.id, phase: 'notifyBuyerDecision' });
    }
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
  ): Promise<boolean> {
    const content = {
      ...sellerTurn.content,
      ...(sellerTurn.decision ? { decision: sellerTurn.decision } : {}),
    };
    const expectedSeq = Math.max(0, decisionSeq - 1);
    const result = await this.withRetry('persist automated negotiation decision', { negotiationId, newStatus }, () =>
      this.db().rpc('nz_persist_automated_negotiation_decision', {
        p_negotiation_id: negotiationId,
        p_expected_seq: expectedSeq,
        p_status: newStatus,
        p_content: content,
        p_decision: decision,
        p_rules_evaluation: rulesEval,
        p_amount_cents: agreedAmountCents != null && agreedAmountCents > 0 ? agreedAmountCents : null,
        p_settlement_state: settlementState,
        p_updated_at: new Date().toISOString(),
      }),
    );
    return (result.data as { applied?: boolean } | null)?.applied !== false;
  }

  /**
   * Run a DB write with a small bounded retry; on final failure, surface it via
   * captureError (the reconcile-escrow cron is the money-side backstop for drift).
   */
  private async withRetry<T extends { error: unknown }>(
    label: string,
    ctx: Record<string, unknown>,
    run: () => PromiseLike<T>,
  ): Promise<T> {
    let result: T | null = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      result = await run();
      if (!result.error) return result;
      if (attempt < 3) await new Promise((r) => setTimeout(r, 150 * attempt));
    }
    captureError(new Error(`${label} failed after retries`), {
      ...ctx,
      dbError: (result?.error as { message?: string } | null)?.message,
    });
    const failure = result?.error;
    if (failure instanceof Error) throw failure;
    const error = new Error(`${label} failed after retries`) as Error & { cause?: unknown };
    error.cause = failure;
    throw error;
  }

  private async loadPublishedPage(slug: string) {
    // Reads owner-private offer `rules` (the floor clamp depends on minPrice), so it
    // must use the service-role client - anon can no longer read the pages base table,
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
    // Owner-only under RLS, so continuation lookups need the service-role client -
    // with the anon client this read returned nothing and every follow-up forked a
    // brand-new negotiation instead of resuming the thread.
    const query = this.db().from('agent_negotiations').select('*').eq('id', id);
    const { data } = await query.single();
    if (!data) return null;

    // The status token is the credential for continuing a negotiation: it is issued
    // once at creation (status URL + persistent link) and must be presented to resume.
    // Without this check, anyone who learned the id could append turns and receive
    // the stored token back in the response. Fail closed: a row with a missing/empty
    // stored token is NOT continuable (the old `data.status_token && …` form skipped
    // the credential check entirely for any tokenless row).
    // Compare against the blind index, not the plaintext, so this keeps working once
    // the plaintext column is dropped. Fail closed on a row with no hash on file.
    const presented = hashBearerToken(token ?? null);
    if (!data.status_token_sha256 || !presented || data.status_token_sha256 !== presented) {
      const err = new Error('Negotiation not found.') as Error & { status: number };
      err.status = 404;
      throw err;
    }
    return data;
  }

  private async loadNegotiationByIdempotencyHash(idempotencyKeyHash: string) {
    const { data } = await this.db()
      .from('agent_negotiations')
      .select('*')
      .eq('idempotency_key_hash', idempotencyKeyHash)
      .maybeSingle();
    return data || null;
  }

  /**
   * Find a recent OPEN negotiation created from a byte-identical request
   * (slug + offer + request hash). Used to collapse agent retry loops that
   * rotate their Idempotency-Key (or send none) - see submitProposal. Backed by
   * the partial index idx_agent_negotiations_replay. Scoped to OPEN statuses so
   * a buyer can legitimately re-propose after a decline / expiry, and to the
   * replay window so a genuine identical re-order later is never swallowed.
   */
  private async loadOpenDuplicateByRequestHash(slug: string, offerKey: string, requestHash: string) {
    const cutoff = new Date(Date.now() - NegotiationService.DUPLICATE_REPLAY_WINDOW_MS).toISOString();
    const { data } = await this.db()
      .from('agent_negotiations')
      .select('*')
      .eq('slug', slug)
      .eq('offer_key', offerKey)
      .eq('idempotency_request_hash', requestHash)
      .in('status', ['negotiation', 'agreement_proposed'])
      .gte('created_at', cutoff)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return data || null;
  }

  private async loadBuyerMessageByIdempotencyHash(negotiationId: string, idempotencyKeyHash: string) {
    const { data } = await this.db()
      .from('negotiation_messages')
      .select('id, idempotency_request_hash')
      .eq('negotiation_id', negotiationId)
      .eq('idempotency_key_hash', idempotencyKeyHash)
      .maybeSingle();
    return data || null;
  }

  private async createNewNegotiation(
    page: any,
    offer: any,
    offerKey: string,
    proposal: any,
    idempotencyKeyHash?: string,
    idempotencyRequestHash?: string,
  ) {
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
      // Settlement currency for the whole negotiation - inherit the page's currency
      // (was relying on the DB default 'usd', so non-USD pages mis-recorded + charged
      // the buyer in USD). amount_cents stays 2-decimal minor units; the charge site
      // converts to Stripe's smallest unit per this currency.
      currency: normalizeCurrency(page.currency),
      buyer_agent: proposal.buyerAgent || 'Unknown Agent',
      buyer_query: proposal.query || null,
      requested_terms: proposal.requestedTerms || {},
      budget_text: proposal.budget || proposal.proposedPrice || null,
      timeline_text: proposal.timeline || null,
      contact: proposal.contact || null,
      // Persist the buyer email at CREATE when the contact is email-shaped (normalized +
      // lowercased via parseBuyerIdentity), so a pending/unfunded negotiation is already
      // linkable by the buyer's account email (findOrdersByEmail → "find my orders" +
      // the Nexie Orders endpoint). The funding webhook later sets the Stripe-verified
      // email if one is collected.
      buyer_email: parseBuyerIdentity({ buyerEmail: proposal.contact }).email,
      status: 'negotiation',
      escrow_mode: process.env.STRIPE_SECRET_KEY ? 'manual_capture_ready' : 'not_configured',
      amount_cents: null,
      // The plaintext column is gone: the app writes the blind index (for lookups)
      // and the ciphertext (the only recoverable copy). The ciphertext is the half
      // only the app can produce, since the key is in env and never in the database, and
      // it is what lets find-my-orders and the owner deep link rebuild this token
      // once the plaintext column goes away. Null when no key is configured.
      ...bearerTokenColumns(statusToken, 'status_token'),
      ...(idempotencyKeyHash ? { idempotency_key_hash: idempotencyKeyHash } : {}),
      ...(idempotencyRequestHash ? { idempotency_request_hash: idempotencyRequestHash } : {}),
      // Created already awaiting an async decision (runDecision will claim it).
      decision_pending: true,
      decision_requested_at: new Date().toISOString(),
      metadata: {
        conversation: [],
        source: 'intelligent_negotiation_v2',
        ...(proposal.agentClient ? { agent_client: proposal.agentClient } : {}),
      },
    };

    const { data, error } = await this.db().rpc('nz_create_negotiation_with_buyer_turn', {
      p_negotiation: negotiation,
      p_message: {
        role: 'buyer',
        content: proposal,
        ...(idempotencyKeyHash ? { idempotency_key_hash: idempotencyKeyHash } : {}),
        ...(idempotencyRequestHash ? { idempotency_request_hash: idempotencyRequestHash } : {}),
      },
    });
    if (error) {
      if (idempotencyKeyHash && error.code === '23505') {
        const replay = await this.loadNegotiationByIdempotencyHash(idempotencyKeyHash);
        if (replay) {
          this.assertIdempotencyRequest(replay.idempotency_request_hash, idempotencyRequestHash);
          return { ...replay, __replayed: true };
        }
      }
      throw error;
    }

    // Carry the plaintext in memory only, for the caller that has to hand it to the
    // agent once. It is deliberately NOT a column any more.
    return { ...negotiation, ...(data || {}), __statusTokenPlaintext: statusToken };
  }

  private proposalResult(negotiation: any, replayed: boolean) {
    // A freshly created negotiation carries its plaintext in memory; a replayed or
    // reloaded one has to be decrypted from the ciphertext, which is now the only
    // stored copy. Prefer the in-memory value so a create still returns a token even
    // if the encryption key is unavailable.
    const token =
      negotiation.__statusTokenPlaintext ||
      recoverBearerToken({ encrypted: negotiation.status_token_encrypted }) ||
      undefined;
    return {
      negotiationId: negotiation.id,
      status: negotiation.status || 'negotiation',
      decisionPending: true as const,
      persistentLink: this.buildPersistentLink(negotiation.id, token ?? null),
      statusToken: token,
      replayed,
    };
  }

  private assertIdempotencyRequest(storedHash?: string | null, suppliedHash?: string) {
    if (storedHash && suppliedHash && storedHash === suppliedHash) return;
    const conflict = new Error('This Idempotency-Key was already used for a different negotiation action.') as Error & {
      status: number;
      code: string;
    };
    conflict.status = 409;
    conflict.code = 'idempotency_conflict';
    throw conflict;
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
    // Rules are absolute. Never allow the LLM to accept below floor.
    const { floorCents, misconfigured } = this.computeFloor(rules);

    // A configured-but-unparseable floor (e.g. "abc") must FAIL CLOSED: never
    // silently disable the clamp and auto-accept. Hold for owner review instead.
    if (decision.action === 'accept' && misconfigured) {
      decision.action = 'review';
      decision.reasoning = (decision.reasoning || '') + ' (Seller minimum is misconfigured - held for owner review instead of auto-accepting.)';
      return decision;
    }

    if (decision.action === 'accept' && floorCents != null && proposal.proposedPriceCents != null && proposal.proposedPriceCents < floorCents) {
      decision.action = 'counter';
      decision.counter = decision.counter || { priceCents: floorCents };
      decision.reasoning = (decision.reasoning || '') + ' (Clamped to seller minimum rules.)';
    }

    if (decision.action === 'counter' && decision.counter?.priceCents != null && floorCents != null) {
      decision.counter.priceCents = Math.max(decision.counter.priceCents, floorCents);
    }

    return decision;
  }

  /**
   * Resolve the seller's hard price floor from rules.minPrice. Uses the SAME
   * money parser as evaluateProposal (parseMoney) so the clamp and the
   * deterministic gate can never diverge - the old parseFloat() kept the "-" sign
   * (a "-100" floor became -10000 cents, so the clamp never fired) and NaN'd on
   * natural "$200" / "1,000" inputs (silently disabling the floor entirely).
   * Distinguishes three cases:
   *   - unset/empty       -> no floor (auto-accept allowed by other rules)
   *   - explicit 0/$0     -> no floor (owner's deliberate "any price" waiver)
   *   - set-but-garbage   -> misconfigured: fail closed, never auto-accept
   */
  private computeFloor(rules: any): { floorCents: number | null; misconfigured: boolean } {
    const raw = rules?.minPrice;
    if (raw == null || String(raw).trim() === '') return { floorCents: null, misconfigured: false };
    const dollars = parseMoney(String(raw));
    if (dollars == null) return { floorCents: null, misconfigured: true };
    if (dollars <= 0) return { floorCents: null, misconfigured: false };
    return { floorCents: Math.round(dollars * 100), misconfigured: false };
  }

  private decisionToStatus(action: NegotiationAction, current: string): string {
    // Never move a funded (held) or terminal negotiation backward to
    // agreement_proposed - that state must only ever be reached from an active
    // negotiating state. Defense-in-depth behind the submitProposal reopen guard.
    if (current === 'held' || isTerminalNegotiationStatus(current as NegotiationStatus)) return current;
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
