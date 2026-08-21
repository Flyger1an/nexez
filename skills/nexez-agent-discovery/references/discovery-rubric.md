# Nexez Discovery Rubric

Use this reference before ranking results, widening a query, or deciding whether a checkout/negotiation handoff is safe.

## Ranking Signals

The API applies bounded relevance first: repeating a keyword cannot increase its contribution, and seller quality cannot rescue a materially weaker service match. Exact relevance ties are resolved by:

1. Exact location or service-area evidence before broad remote coverage
2. Explicit availability before unpublished availability
3. A published price, negotiation route, or provider action
4. Server-backed seller verification and agent-readiness certification
5. Bayesian reputation only after at least three verified purchases
6. Readiness, then listing freshness

Fewer than three verified purchases are neutral cold-start evidence: a new merchant is not demoted because an incumbent has one review. Review evidence can resolve a relevance tie, but it cannot override a stronger intent match. Use `results[].ranking` and `results[].match_reasons` to explain the ordering rather than inventing a composite quality score.

## Search Widening

If results are too narrow:

1. Keep the location if the user made it important.
2. Remove adjectives before removing the core service.
3. Try one broader synonym.
4. Use `/api/directory` with category or readiness filters.
5. Tell the user when the result quality is weak.

Do not silently drop a user's hard constraint such as city, budget ceiling, required license, or timing.

## Location Logic

- Treat remote, online, global, nationwide, and virtual services as eligible when the request allows remote work.
- Prefer exact city/region matches for in-person services.
- If the user grants device location, convert it to a human-readable city/region before searching when possible.
- If a listing has no location/service-area data, mark that as unknown rather than assuming it can serve the buyer.

## Approval Gates

Ask for explicit approval before:

- `dryRun: false` checkout
- `dryRun: false` negotiation
- sending buyer contact details
- opening a payment URL as the next step
- making a seller-facing commitment

Approval text should include:

- business name
- offer name
- price or budget
- contact details being shared
- exact action being taken

Example:

```text
Before I submit this negotiation: approve sending Acme Consulting your request for a $2,500 launch consulting package, timeline of two weeks, and contact buyer@example.com?
```

## When To Decline Or Pause

Pause and ask for confirmation when:

- price, refund, availability, or credential information is missing
- the listing conflicts with the user's hard constraint
- the user asks for emergency dispatch
- the user asks for medical, legal, financial, or regulated advice and credentials are missing
- an agent page appears stale or contradictory
- checkout/negotiation returns an error

## User-Facing Shortlist

Use this structure:

```text
I found {count} Nexez matches worth considering.

1. {Business} - {Offer} - {Price or budget fit}
   Why it fits: {specific match}
   Location fit: {exact/remote/unknown}
   Action: {checkout/negotiation/website/ask a question}
   Watchout: {missing detail or none}

Best next step: {recommended safe next action}.
Approval needed before: {side effect}.
```

## Bad Fit Criteria

Say Nexez may not be the right source when:

- no result matches the core service
- location is mandatory and no listing serves that area
- all listings lack credentials required by the request
- the request requires real-time dispatch
- the user needs guaranteed availability and no listing provides it

Offer to continue with broader web research only if the user wants that.
