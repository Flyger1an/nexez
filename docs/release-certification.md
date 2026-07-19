# Release Certification

Release certification turns the production readiness snapshot into an exact, durable verdict for one deployed Git revision. It is deliberately separate from deployment: a build can finish while a queue, webhook, artifact, or canonical host is unhealthy. A release is certified only when both source verification and live production evidence are green.

## What runs

The `Release Certification` workflow starts after the main `CI` workflow completes for a trusted push to `main`. It records a red release when source CI failed instead of silently ignoring a production candidate. It:

1. checks out the exact CI commit and verifies the source-gate conclusion;
2. waits for production machine health to report that same Git SHA;
3. verifies `nexez.ai`, `app.nexez.ai`, and `nexez.app` on their canonical roles;
4. verifies a public certification storefront plus its `agent.json`, `llms.txt`, and OpenAPI artifacts;
5. verifies the global MCP, OpenAPI, `llms.txt`, and agent index;
6. runs `npm run certify:commerce`, which never moves money;
7. posts the redacted evidence to the production certification endpoint;
8. attaches a fresh, authoritative Launch Control snapshot and inserts one append-only database row;
9. uploads `release-certification.json` as a 90-day workflow artifact and fails the workflow when the verdict is red.

The workflow never trusts a submitted green flag by itself. The server independently checks the running environment, deployed revision, required Launch Control checks, and submitted probe results.

## Required configuration

Generate one random secret with at least 32 bytes of entropy. Store the same value in:

- production environment: `NEXEZ_RELEASE_CERT_SECRET`;
- GitHub repository Actions secret: `NEXEZ_RELEASE_CERT_SECRET`.

Do not expose it through a `NEXT_PUBLIC_` variable, logs, workflow output, or client code.

The production project must expose system deployment variables so the server can read:

- `VERCEL_GIT_COMMIT_SHA`;
- `VERCEL_DEPLOYMENT_ID`;
- `VERCEL_URL`;
- `VERCEL_ENV` or `VERCEL_TARGET_ENV`.

The release fails closed when the revision is absent, does not match the CI commit, or the server is not running in `production`.

## Database rollout

Apply both database migrations before deploying the API routes:

- `supabase/migrations/20260718184018_release_certifications.sql` creates the ledger, policies, indexes, and append-only trigger;
- `supabase/migrations/20260718190912_harden_release_certifications_acl.sql` removes Supabase's default mutation grants and restores only the two server permissions the ledger needs.

The resulting table:

- enables RLS;
- grants no client access;
- grants only `SELECT` and `INSERT` to `service_role`;
- rejects updates and deletes through an append-only trigger;
- deduplicates workflow retries with `idempotency_key`.

Launch Control reads only a compact history projection. Raw secrets are never stored. Probe details are length-bounded and the ingress endpoint accepts only authenticated, schema-valid evidence from approved HTTPS hosts.

## Manual recovery run

Use the GitHub `Release Certification` workflow's manual dispatch. Manual runs execute lint, palette, TypeScript, all tests, and a production build before probing production.

For local diagnosis, pull the production-safe environment and run:

```bash
NEXEZ_CI_CONCLUSION=success \
NEXEZ_COMMIT_SHA="$(git rev-parse HEAD)" \
npm run certify:release
```

This command writes an ignored `release-certification.json`. A local run still fails unless the exact commit is serving in production and the production endpoint accepts the evidence.

## Failure policy

A release is red when any of these is true:

- source CI is not proven successful;
- production does not serve the expected Git revision within ten minutes;
- any canonical host or required artifact fails;
- the non-money-moving commerce gauntlet fails;
- any required Launch Control check is `attention`, `blocked`, or `unknown`;
- the evidence cannot be written durably.

A red record is evidence, not an automatic rollback. Review the failed check in Launch Control and the workflow artifact, then roll back or repair deliberately. Automatic rollback can be added only after the certificate has proven stable across normal production releases; transient third-party failures must not create rollback loops.

## Safety boundary

Release automation never creates a charge, subscription, Checkout Session, negotiation, refund, payout, or price mutation. Live money lifecycle evidence is established deliberately and remains visible in Launch Control. The recurring workflow verifies that the code, public contracts, workers, and durable ledgers still represent that certified state.
