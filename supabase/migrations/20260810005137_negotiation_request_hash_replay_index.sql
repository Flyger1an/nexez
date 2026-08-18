-- Supports the content-based retry collapse lookup in NegotiationService.submitProposal:
-- find a recent OPEN negotiation created from a byte-identical request.
CREATE INDEX IF NOT EXISTS idx_agent_negotiations_replay
ON public.agent_negotiations (slug, offer_key, idempotency_request_hash, created_at DESC)
WHERE idempotency_request_hash IS NOT NULL;
