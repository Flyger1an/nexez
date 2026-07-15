# Nexez Agent Examples

Copy-paste workflows for buyer agents and agent builders.

## Flows

- Search by buyer intent.
- Search with location, industry, quality, capability, and price-band filters; optionally attach lat/lng as context metadata.
- Fetch the selected page's `agent.json`.
- Build a short ranked list for the buyer.
- Dry-run checkout or negotiation.
- Render an approval summary before side effects.
- Ask the buyer for approval before side effects.
- Submit a negotiation only after approval.
- Poll a created negotiation with the SDK's bounded wait helper.

## Python

Install the published SDK:

```bash
python -m pip install nexez-agent-sdk
```

Run:

```bash
python examples/agents/python/buyer_approval.py
python examples/agents/python/find_and_validate.py
python examples/agents/python/location_shortlist.py
python examples/agents/python/submit_negotiation.py
```

## TypeScript

Install the published SDK:

```bash
npm install @nexez/agent-sdk
```

Run the examples inside your own TypeScript runtime or adapt them into an agent tool.

```bash
npx tsx examples/agents/typescript/buyer-approval.ts
npx tsx examples/agents/typescript/find-and-validate.ts
npx tsx examples/agents/typescript/location-shortlist.ts
npx tsx examples/agents/typescript/submit-negotiation.ts
```

## Buyer Approval UX

Use the buyer approval examples before any action that spends money, sends contact details, opens checkout, books a call, or submits negotiation terms:

```bash
NEXEZ_APPROVAL_BUDGET="USD 2100" \
NEXEZ_APPROVAL_TIMELINE="next week" \
python examples/agents/python/buyer_approval.py
```

The examples output a `nexez.buyer-approval.v1` object with seller details, offer terms, dry-run results, risk notes, the exact pending contact handoff, and buyer-facing copy. A buyer agent should render that summary and wait for an explicit approval event before performing the next action. Contact details are omitted from dry-run requests and are added only to an approval-gated checkout or negotiation call.

Checkout validation may record an analytics attempt, but it does not create a checkout session, contact the seller, or move money. A validation may also return a short-lived commercial-action token. The approved action forwards that token, uses `startCheckout` / `start_checkout`, and supplies a stable idempotency key. Negotiation submission uses the same controls and bounded polling.

## Location-Aware Discovery

Use the shortlist examples when an agent needs to compare providers near a buyer before taking action:

```bash
NEXEZ_BUYER_LOCATION="Austin, TX" \
NEXEZ_BUYER_INTENT="find a productized brand strategy sprint under 5000" \
python examples/agents/python/location_shortlist.py
```

The examples deduplicate offer-level search results by seller, fetch each candidate's public manifest, rank actionability, run a safe dry-run checkout or negotiation, and stop before any buyer-approved action.

`location` is the current search filter. `lat` and `lng` are returned as buyer context only; they do not currently filter or rerank results.
