# Agent action safety

Nexez uses three independent controls for buyer-agent actions:

1. **Dry-run validation** resolves the live page and offer, applies seller rules, and returns a preview without starting a payment or creating a negotiation turn.
2. **Commercial action binding** can issue a short-lived HMAC token for the validated seller, offer, query, budget, timeline, requested terms, and negotiation thread. Buyer identity fields are intentionally excluded so contact details can remain local until the buyer consents.
3. **Idempotency** collapses retries. Checkout keys are scoped and hashed before Stripe receives them. Negotiation keys are scoped and stored only as SHA-256 hashes.

These controls help compliant agent hosts preserve user intent. They do not authenticate a person or prove that a human clicked an approval control. Agent hosts must still render the exact action and collect explicit consent. Nexez API authorization and payment-provider authentication remain separate security boundaries.

## Environment variables

Generate a dedicated secret with at least 32 random bytes:

```bash
openssl rand -base64 48
```

Set the result as:

```text
NEXEZ_ACTION_APPROVAL_SECRET=<random secret>
```

The API will then return `approvalToken` and `approvalExpiresAt` on matching checkout and negotiation dry runs. Live actions accept these tokens immediately, but enforcement remains optional during client rollout.

After TypeScript SDK `0.3.0`, Python SDK `0.3.0`, and OpenClaw plugin `0.2.0` are published and adopted, enable fail-closed enforcement:

```text
NEXEZ_REQUIRE_ACTION_APPROVAL_TOKEN=true
```

Do not enable enforcement before the upgraded clients are available. If enforcement is true while the secret is missing, live actions return `503 approval_not_configured`.

## Client sequence

1. Search and select a current offer key.
2. Call `validateCheckout` or `validateNegotiation` with the commercial terms.
3. Render the seller, offer, price, terms, destination, and any buyer data that will be shared.
4. Wait for explicit approval.
5. Call the approved action with the returned `approvalToken` and a new stable `Idempotency-Key`.
6. Reuse that idempotency key only when retrying the same action.

Approval tokens expire after ten minutes. If terms change or the token expires, validate again and request approval again.

## Database migration

Apply `20260715152652_add_agent_action_idempotency.sql` before clients begin sending negotiation idempotency keys. The migration adds nullable hash columns and partial unique indexes to existing RLS-protected negotiation tables. Raw idempotency keys are never stored.
