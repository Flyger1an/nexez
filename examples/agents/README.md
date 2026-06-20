# Nexez Agent Examples

Copy-paste workflows for buyer agents and agent builders.

## Flows

- Search by buyer intent.
- Search with a buyer location or lat/lng filter.
- Fetch the selected page's `agent.json`.
- Build a short ranked list for the buyer.
- Dry-run checkout or negotiation.
- Ask the buyer for approval before side effects.
- Submit a negotiation only after approval.
- Poll `statusUrl` with a normal HTTP GET when a negotiation is created.

## Python

Install the published SDK:

```bash
python -m pip install nexez-agent-sdk
```

Run:

```bash
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
tsx examples/agents/typescript/find-and-validate.ts
tsx examples/agents/typescript/location-shortlist.ts
tsx examples/agents/typescript/submit-negotiation.ts
```

## Location-Aware Discovery

Use the shortlist examples when an agent needs to compare providers near a buyer before taking action:

```bash
NEXEZ_BUYER_LOCATION="Austin, TX" \
NEXEZ_BUYER_INTENT="find a productized brand strategy sprint under 5000" \
python examples/agents/python/location_shortlist.py
```

The examples fetch each candidate's public manifest, rank actionability, run a safe dry-run checkout or negotiation, and stop before any buyer-approved side effect.
