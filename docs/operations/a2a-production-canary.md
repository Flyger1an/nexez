# A2A production canary and observability

## Cadence and safety

`A2A Production Canary` runs once per day and can also be dispatched manually.
The job is serialized for the shared credential and verifies the exact production
revision before it exercises the protocol. It creates two non-transactional tasks:

- one direct immediate-return task, followed by `GetTask` and an identical replay
- one blocking send through `@a2a-js/sdk@1.1.0`

The prompts explicitly prohibit tools and transactions. The canary does not perform
checkout, booking, negotiation execution, payment, approval submission, customer
inventory mutation, or arbitrary remote fetches. Missing credentials fail closed.

The existing `A2A Production Certification` workflow remains the manual full matrix
for owner isolation, stream resume, cancellation, approval boundaries, and optional
revoked or non-Pro credentials.

## Evidence and retention

Workflow reports contain operational results, task IDs, response classes, and
timings only. A second workflow step rejects reports containing Nexez API key or
Bearer material. GitHub retains the canary report artifact for 90 days.

Canary-created message receipts have one of these prefixes:

- `a2a-canary-immediate-`
- `a2a-canary-sdk-`

Those prefixes and the two dedicated certification owner IDs are the required joint
scope for any future task-payload cleanup. Age alone is never sufficient. Database
task and event deletion remains disabled until the product retention requirement is
approved. Durable release-certification records are retained as the longer-lived
audit trail.

## Runtime event contract

All A2A events use a fixed allowlist of dimensions. They may include environment,
route, method, task state, result class, error class, deployment revision, event
sequence, and bounded timings. They never include prompts, model output, API keys,
key hashes, email, owner identity, approval payloads, provider bodies, or arbitrary
caller metadata.

The production observability webhook receives normal structured events. Critical
invariant failures also use the shared error fan-out, which reaches the configured
webhook and Sentry sinks.

| Operational condition | Signal |
| --- | --- |
| Message accepted, replayed, or conflicted | `a2a.v1.message.*` |
| Claim timing or lost claim race | `a2a.v1.task.claimed`, `a2a.v1.task.claim_lost` |
| Submitted work does not complete | Daily canary `immediate-task` failure |
| Working lease expires | Alert-level `a2a.v1.task.reconciled` |
| Reconciliation repeats unexpectedly | Any additional alert-level reconciliation signal |
| Event sequence write fails | Alert-level `a2a.v1.event.persistence_failed` |
| Terminal or cancellation write loses | Alert-level `a2a.v1.task.terminal_write_conflict` |
| Task completion, input, failure, or cancellation | `a2a.v1.task.state_changed`, `a2a.v1.task.canceled` |
| SSE connection, resume, cursor, or disconnect | `a2a.v1.sse.*` |
| Authentication or entitlement surge | Threshold `a2a.v1.auth.denied` by `errorClass` |
| IP, owner, or turn throttling | `a2a.v1.rate_limited` by `scope` |
| Scheduled execution fails | Alert-level `a2a.v1.scheduled_execution.failed` |
| Daily direct or official SDK canary fails | Failed `A2A Production Canary` workflow |

The alert-level events are intentionally generic errors. Their error messages and
contexts contain only the event name and allowlisted operational dimensions.
