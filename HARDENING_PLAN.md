# Hardening plan

Nine items, in priority order. Each one records what was verified, where the
evidence lives, and what shipping it means. Written 2026-08-16 against `main`
at 42fabc2, production project `pvsotrzgnjpqrsndhgmu`.

Status legend: `[ ]` not started, `[~]` in progress, `[x]` done.

---

## 1. Freeze the buyer-approved amount on ACP/UCP sessions

`[x]` Migration applied to production 2026-08-17 as `20260817054006`. Code merged
and reviewed. Vitest cases still need their first real run in CI.

**Verified.** Both completion routes re-price at settlement time:

```ts
const session = updateSession(rowToSession(row, page.name), { page, buyer: buyer ?? undefined })
```

`app/api/ucp/checkout-sessions/[id]/complete/route.ts:84` and
`app/api/acp/checkout_sessions/[id]/complete/route.ts:92`. Per the doc comment on
`updateSession` (`lib/commerce/checkout-session-core.ts:311`), omitting `items`
re-prices the existing line items against the possibly-changed page. The
recomputed `session.totals` is what gets charged.

There is no persisted approved amount, no cart hash, and no reapproval step.
`isSessionPayable` only checks `status === 'ready'`, which an upward price change
does not disturb. The only bound on the drift window is session expiry.

**Built:**

- `approved_amount_cents`, `approved_currency`, `approved_cart_fingerprint` on
  `checkout_sessions`, migration
  `20260817120000_checkout_session_approved_amount.sql`.
- Frozen at the first `ready` by `createSession`/`updateSession`, carried untouched
  through a re-price, re-frozen only when an agent supplies a new cart.
- `checkApprovalDrift` compares at settlement. Both complete routes call it after
  the re-price and before `resolveSettlementContext`, returning 409 with
  `amount_increased` / `currency_changed` / `cart_changed`.

**Deviation from the original sketch:** the fingerprint covers offer keys and
quantities but deliberately NOT unit price. Including price would make a price DROP
register as a changed cart and refuse a settlement that should be allowed. Price
movement is judged solely by the amount comparison.

**DEPLOY ORDER: migration first, strictly.** The store writes the three columns on
every insert and update, so shipping the code against a database without them fails
every session create and update with PGRST204. The reverse order is safe: the
columns are additive and nullable, and code that has not shipped yet never reads
them.

**Files:** `lib/commerce/checkout-session-core.ts`,
`lib/server/checkout-session-store.ts`, both `[id]/complete/route.ts`, the
migration, and four test files.

---

## 2. Branch settlement on the credential kind

`[~]` ACP and the fail-closed default are done. The UCP Google Pay branch is
deliberately NOT implemented; it refuses instead. See "What is still open" below.

**Verified.** `DelegatedPayment.kind` is declared with three values
(`lib/commerce/checkout-session-core.ts:376`) and set correctly by both adapters:
`shared_payment_token` for ACP, `google_pay` for UCP. The identifier `kind` then
appears nowhere in `lib/commerce/settlement-bridge.ts`. Line 70 is
`payment_method: payment.token`, unconditionally.

The type's own comment concedes that the `payment_method` kind exists to prove
the path "against a Stripe test method before the real delegated-token swap."
The swap was never done. Consequence: this fails at Stripe rather than
mischarging, which means neither protocol's real settlement path has ever
completed end to end.

**Evidence that nothing real ever settled.** `checkout_orders` holds exactly one
`acp` and one `ucp` order, both `stripe_livemode = false`, both $1.00, created ten
seconds apart on 2026-07-15 sharing a PaymentIntent prefix. That is the raw-`pm_`
proof run the type comment described, not a delegated-credential settlement.

**Built:**

- `resolveCredentialParams` switches on `payment.kind` and returns either the
  parameters for that credential or a refusal. It runs after the
  readiness/amount/connect gates, so a refusal never masks a more basic problem.
- `payment_method`: unchanged, `payment_method` + `off_session`.
- `shared_payment_token`: `payment_method_data[shared_payment_granted_token]`, per
  Stripe's seller docs, with the `2026-04-22.preview` API version pinned per
  request. `off_session` is deliberately omitted (the delegation is the mandate and
  the documented sample does not send it). Stripe clones the customer's underlying
  method and populates `payment_method` itself.
- Unknown kinds fail closed with `unsupported_credential`.
- Both routes map `unsupported_credential` to 400/invalid_request rather than
  402/processing_error, so an agent retries with a different instrument instead of
  reading it as a decline.

**Two corrections to the record.** The SPT id prefix is `spt_`, not the `vt_` the
type comment and the ACP test fixture claimed; both fixed. And SDK 22.2.0 does not
type `shared_payment_granted_token` at all, so that branch casts through `unknown`.
Delete the cast when SPT leaves preview rather than widening it.

**Still open: the UCP Google Pay branch.** It refuses with `unsupported_credential`
instead of charging. Google's UCP payment-handler docs describe the credential as an
ECv2 payload (`{"signature":...,"protocolVersion":"ECv2"}`) whose concrete form
depends on Google Pay gateway configuration this codebase does not have, and Stripe
documents no server-side path accepting a raw ECv2 payload on a PaymentIntent.
Guessing the parameter would be guessing at a money-moving call. To finish: register
a Google Pay gateway configuration naming Stripe, confirm what `credential.token`
then actually contains (most likely a Stripe `tok_`), and add that branch.

**Consequence to know about:** a UCP smoke test that feeds a raw `pm_` id through
the protocol's credential field now gets a 400, because the route hardcodes
`kind: 'google_pay'`. That is how the one existing UCP order was created. If you
want that path back for testing, the honest fix is a test-only kind, not loosening
the branch.

**Files:** `lib/commerce/settlement-bridge.ts`,
`lib/commerce/checkout-session-core.ts`, both `[id]/complete/route.ts`,
`lib/__tests__/settlement-bridge.test.ts`.

---

## 3. Kill intentional migration drift

`[x]` Closed 2026-08-17 without code changes. Decision: MCP `apply_migration`
stays the source of truth. Investigation showed the premise was already false.

**Verified, with a caveat that changes the shape of the work.**
`.github/workflows/supabase-migrations.yml` checks only for duplicate version
prefixes. Its header documents why there is no replay: MCP `apply_migration` is
the source of truth, `schema_migrations` intentionally drifts from the files, and
a prior `supabase db push` job was removed as perpetually failing and a
clobbering risk.

So this is not a missing CI job. It is a reversal of the source-of-truth model.
Separately, replay currently fails on the pre-existing `custom_domain` ordering
bug, unrelated to whatever PR is being tested.

**Outcome: no work needed, and the premise was wrong twice over.**

**1. Replay is not broken.** PR #43 (merged 2026-08-16) renumbered the two
offending migrations: `add_domain_path_multipage` to `20260610000100` and
`revoke_anon_read_negotiation_messages` to `20260614120100`. A from-scratch replay
now succeeds. Evidence: PR #43's Supabase preview branch `ejsgwgochlpgsqqqzgfo`
reported Migrations, Seeding, Configurations and Edge Functions all green.

**2. The red "Supabase Preview" check is not about migrations.** That same PR ran
TWO preview branches. The second, `jhhgtatutdlmwulmxruz`, is the one the GitHub
check points at, and it dies at the **Configurations** step with repeated
`unexpected status 400: {"message":"Resource has been removed"}` plus
`unexpected enable webhook status 400`. Its Migrations row reads paused, never
failed, because it never gets that far. Separately, the `main` branch record on the
Nexez project has sat at `MIGRATIONS_FAILED` since 2026-08-11.

So the source files already replay cleanly, which was the actual goal. Making them
authoritative was rejected: the MCP apply path stays the source of truth.

**Remaining, and it is an owner action in the Supabase dashboard, not code.** Most
likely one integration whose first preview branch was removed mid-run, with a retry
creating the second branch that went green while the GitHub check stayed bound to
the dead one. Evidence against a second connection: only one "Supabase Preview"
check name appears, and on a non-migration PR (#44) it skips and links to the real
project's integration settings. So the order is: clear the `main` branch's stuck
`MIGRATIONS_FAILED` state, confirm the connection count under Settings ->
Integrations, then re-run a migration PR and see whether the failure reproduces.
Until it is resolved, every migration PR carries a red check unrelated to its own
changes, which is exactly what makes CI unreadable.

---

## 4. Move release certification before promotion

`[~]` Gauntlet is green as of 2026-08-17: 7 passed, 0 failed, 0 skipped, run against
production. Making certification an actual promotion gate is still open.

**Verified.** `scripts/certify-commerce.mjs:9` requires slug
`nexez-agent-negotiation-lab` (overridable via `NEXEZ_COMMERCE_CERT_SLUG`).
Production contains exactly two published pages, `kismetpros` and
`pawra-pet-cares`. The gauntlet is registered `required: true`
(`scripts/certify-release.mjs:116`), so it fetches a 404 and fails every run.

The workflow marks the certify step `continue-on-error` and then exits 1, so it
goes red without blocking anything: it is a `workflow_run` triggered after CI,
while Vercel promotes on push independently.

**The merchant was never missing.** `nexez-agent-negotiation-lab` existed the whole
time, owner `5320a9ef`, created 2026-06-20, with `is_published = false`. Its
`services-0` was already exactly what the gauntlet wants: "AI Agent Negotiation
Sprint", $2,500, `offerType: negotiable`, `minPrice` $2,000, `autoAcceptWithinPercent`
20. The gauntlet's `budget: 'USD 2100'` sits deliberately inside that band. Nothing
needed seeding; it needed republishing.

**Done 2026-08-17:** flipped `is_published` to true. The sync trigger populated
`pages_public` with `serving = true`, and the offer's `rules` (including the $2,000
negotiation floor) were stripped from the public projection as designed.

`npm run certify:release`'s commerce leg now passes against production:

```
Commerce certification: 7 passed, 0 failed, 0 skipped
```

Discovery exclusion verified live: the slug appears zero times in `sitemap.xml`,
`agent-pages.json`, `llms.txt`, `acp/feed.json` and `ucp/feed.json`. Its direct URL
works, which is what the gauntlet needs.

**Still open: certification does not gate promotion.** `release-certification.yml`
triggers on `workflow_run` after CI, while Vercel promotes on push, so a red
certification still cannot stop a deploy. Options: a Vercel deploy hook that waits
on the certification conclusion, or promoting from a staged deployment only after
certification passes. That is a deployment-topology change and has not been made.

---

## 5. Turn the public projection into an allowlist

`[x]` Applied to production 2026-08-17 as `20260817122215`. Verified live: no private
keys in the projection or the manifest, and the booking constraints the old denylist
had silently suppressed are now served to agents.

**Verified.** `private.nz_public_offer_array` is
`select jsonb_agg(arr.elem - 'rules' ...)`, a denylist
(`supabase/migrations/20260627001000_launch_hardening_public_projection.sql:16`).
`verification_details` is copied verbatim into the anon-readable projection, and
`grant select on public.pages_public to anon` is table-wide.

Two present-tense risks, both currently latent at zero rows:

- `CredentialRecord` (`lib/agent-page.ts:205`) carries `file_path`, `mime`,
  `public`, and a `verdict` blob with `issuer`, `holder`, `expiry`, `confidence`
  and free-text `reason`. `/api/credentials/view` gates the file, not the record.
  So documents the owner did not mark public, plus pending and rejected ones,
  ship their metadata to anon the moment a merchant uploads one.
- `OfferItem.metadata?: Record<string, any>` (`lib/agent-page.ts:117`) is an
  untyped bag fed by Stripe, Shopify and Calendly sync, projected verbatim.

The allowlist pattern already exists twice in this codebase and was simply not
applied here: `private.nz_public_last_booking` and `publicBookingConstraints`
(`lib/offer-rules.ts:118`).

**Built and applied.** Six `private` functions, all revoked from browser roles:
`nz_public_offer_rules`, `nz_public_offer_metadata`, `nz_public_offer_tiers`,
`nz_public_offer`, `nz_public_credential`, `nz_public_verification`.
`nz_public_offer_array` kept its name and signature, so only its body changed and the
sync trigger needed no edit for offers. The trigger was edited only to route
`verification_details` through its allowlist. Existing rows were backfilled from base
`pages`, which is also the rollback path: the projection is fully derivable, so
re-running the old function bodies rebuilds it.

**One design change forced by the code.** `offer.metadata` cannot be dropped
wholesale: `lib/location-filter.ts` reads `metadata.service_area`, and discovery,
agent-search and directory all feed it from `pages_public`. Metadata therefore has
its own nested allowlist keeping exactly `service_area`.

**Staged verification, before applying.** A read-only dry run computed the diff for
every row: zero keys removed from any merchant offer, one key added (`rules`, public
subset only, on the cert lab). On `verification_details` the only drops were
`scenario` and `seeded_by`, internal seeding metadata that should never have been
public.

**After applying:** 3 rows intact, 0 metadata leaks, 0 private-rule leaks, 0 seed
metadata leaks, 0 offers missing core fields. A no-op page write confirmed the
trigger path produces the same result. Live manifest contains no `minPrice`,
`autoSettleMax`, `maxDiscountPercent`, `seeded_by`, `scenario` or `file_path`.
Commerce gauntlet still 7/7, agent-search still returns results (the `service_area`
path).

**The denylist was also costing something.** `/nexez-agent-negotiation-lab/agent.json`
now emits `min_notice_hours: 24` and `max_bookings_per_week: 5`. Those were absent
before, because stripping the whole `rules` object starved `publicBookingConstraints`.
Agents could not see booking constraints that were always meant to be public.

**Original sketch, for reference:**

- Add `private.nz_public_offer(jsonb)` and `private.nz_public_verification(jsonb)`
  as `jsonb_build_object` allowlists modeled on `nz_public_last_booking`.
- Nest a per-key `rules` allowlist matching `publicBookingConstraints`. `rules` is
  not uniformly private: `minNoticeHours`, `blackoutDates`, `maxBookingsPerWeek`,
  `includedScope`, `excludedScope`, `maxRevisions`, `maxProjectWeeks` are
  documented public-safe. Only `minPrice`, `maxDiscountPercent` and
  `autoAcceptWithinPercent` are private.
- Wire into `private.nz_sync_pages_public`, backfill, and extend
  `lib/__tests__/pages-public-parity.test.ts` to fail on unlisted keys inside
  projected blobs, not just on missing columns.

**Side benefit:** the booking-constraint chip at `app/[slug]/page.tsx:819` is
currently dead on published pages, because the whole `rules` object is stripped
and the published path reads `pages_public`. A per-key allowlist restores it.

---

## 6. Hash the bearer tokens at rest

`[x]` DONE 2026-08-17, verified end to end against production. The plaintext columns
are gone; a database dump is no longer a set of live buyer credentials.

**Shipped as:** migrations `20260817130715` (columns, blind-index backfill, hash-sync
trigger) and `20260817160000` (preserve trigger, drop plaintext), plus PRs #49, #50,
#51 and #52. The last two were corrections, see "what went wrong" below.

**End-to-end verification** on the live site, after the final deploy:

| step | result |
| --- | --- |
| negotiation dry run | 200, approval token issued |
| live create | 200, token returned, persistentLink carries it |
| status by token | 200, resolves via the blind index |
| wrong token | 404 |
| buyer portal `/orders/<token>` | 200, renders the offer |
| `/negotiate/<id>?token=` | 200, renders the thread |
| bogus token | 404 |
| the new DB row | 64-char blind index, `v1.` ciphertext, no plaintext column |

Commerce gauntlet 7/7. Backfill: 54/54 rows, every ciphertext decrypting back to
exactly its plaintext, 0 mismatches.

**What went wrong, worth keeping.** The drop was applied while deployed code still
read the plaintext (#51), and then while it still WROTE it (#52). The write bug took
negotiation creation to 500 in production. Neither typecheck nor 2456 passing tests
caught it: the insert row is an object literal handed to PostgREST, so a key naming
a dropped column is valid TypeScript and only fails against the real schema. The
end-to-end found it on the first live call. After a destructive schema change, run
the e2e BEFORE assuming the code half is complete.

**Verified.** `checkout_orders.access_token` is two concatenated UUIDs stored in
plaintext with a unique index
(`supabase/migrations/20260626000400_buyer_order_portal.sql:28`).
`agent_negotiations.status_token` is the same shape and NOT NULL since
`20260618000100`. Both are used as bearer credentials.

The pattern to copy already exists: `api_keys` stores `key_hash` plus `prefix`
(`supabase/migrations/20260603190000_add_api_keys.sql:7`). Square, Acuity and
Shopify credentials use AES-256-GCM encrypted columns with select revoked from
`authenticated`.

**Design correction: hashing alone does not fit these two tokens.** The server has
to rebuild the buyer's link AFTER issuance in three flows that do not have the
plaintext in scope:

1. The Stripe webhook emails `/orders/<token>`, reading the token back from the row
   (it is minted by a column DEFAULT, so the app never held it), and must still
   work on redelivery.
2. `findOrdersByEmail` (`lib/server/load-order.ts:376`, three callers: the
   order-portal lookup, the Nexie orders agent, and the magic-link landing page)
   returns a per-row token for every order AND negotiation matching a buyer email,
   for a buyer with no session.
3. The owner dashboard deep-links to `/negotiate/{id}?token=...`.

So the shape is a **blind index plus a ciphertext**, not one or the other:
`*_sha256` (deterministic, replaces the plaintext equality lookups and inherits the
unique index) and `*_encrypted` (AES-256-GCM, for the recovery cases). The GCM
payload uses a random IV and is therefore unsearchable, which is exactly why the
hash column has to exist alongside it.

Plain SHA-256 rather than HMAC, so the migration can backfill the index in SQL and
lookups cut over without waiting on an application backfill. Inputs are 128+ bits of
CSPRNG output, so there is no dictionary to attack.

**Confirmed prerequisite:** `INTEGRATION_SECRET_KEY` is configured in production.
One `shopify_installs` row and one `page_secrets` row hold `v1.` ciphertext. It is
NOT in local `.env.local`, so the ciphertext backfill cannot be run from a dev
machine.

**Written, not applied:**

- `supabase/migrations/20260817140000_bearer_token_at_rest.sql`: four columns, SQL
  backfill of both blind indexes, two unique indexes. Additive, no behaviour change.
- `lib/server/bearer-token.ts`: `hashBearerToken`, `bearerTokenColumns`,
  `recoverBearerToken` (ciphertext first, plaintext fallback), `canEncryptBearerTokens`.

**Done:**

1. A `BEFORE INSERT OR UPDATE` trigger maintains `*_sha256` from the plaintext, in
   the database rather than in application code. This is what makes the cutover safe
   for `access_token`, which is DB-DEFAULT-minted, so the app never sees the value
   and could not hash it however carefully each writer was written. Verified: an
   insert with no token supplied produced a 64-character DEFAULT-minted token and a
   correct hash alongside it.
2. All seven lookups match the blind index. Zero `.eq('access_token'|'status_token')`
   remain anywhere in `app/` or `lib/`. The in-app comparison in
   `negotiation.service.ts` compares hashes and fails closed on a row with no hash.
3. Five link rebuilds go through `recoverBearerToken` (ciphertext, then plaintext):
   both webhook receipt paths, the webhook's negotiation buyer email,
   `findOrdersByEmail`, and the negotiate page's owner resume form.
   `findOrdersByEmail` drops an unrecoverable row rather than rendering a dead link.
4. Ciphertext is written on all three order write paths by `ensureBearerCiphertext`,
   AFTER the upsert. It cannot be written during: all three are UPSERTs that
   deliberately omit `access_token`, because including it would let a redelivery mint
   a fresh token and invalidate a link already emailed to the buyer.
5. `scripts/backfill-bearer-ciphertext.mjs` for the pre-existing rows. It refuses to
   run without a valid key rather than writing nulls that would look like success.

**Verified:** Node's `createHash('sha256')` and Postgres's `encode(digest(...),'hex')`
produce identical output, so the blind index resolves. Had they differed, every
lookup would have silently returned nothing. The script's duplicated `encryptSecret`
round-trips through the app's exact decrypt logic including its IV and tag guards.

**Unplanned win:** the owner dashboard is a client component and cannot decrypt, but
`/negotiate/[id]` already authorizes owners by session under RLS and never needed a
token. The `?token=` came out of that link entirely, so a live bearer credential is
no longer rendered into a URL in the owner's browser.

**Remaining:**

1. Run the backfill in the deployment (`INTEGRATION_SECRET_KEY` is set there, not
   locally). Re-run until both tables report 0.
2. Only then, a migration dropping `access_token`, `status_token`, the column
   DEFAULT, and the two hash triggers.

**Original sketch, for reference:**

- Add `*_hash` columns, dual-write, migrate lookups to hash comparison, drop the
  plaintext columns. The existing unique index transfers directly, since lookup
  is already by exact value.
- While in here: `page_secrets.calendly_webhook_secret` is plaintext and could
  take the same encrypted-column treatment as Square and Acuity.

---

## 7. Make approved Nexie actions crash-recoverable

`[ ]`

**Verified.** Statuses are `PENDING | APPROVED | REJECTED | EXECUTED | FAILED`.
There is no `EXECUTING` state. The `PENDING -> APPROVED` compare-and-swap at
`lib/agents/nexie.ts:512` is correct and does prevent double execution.

But a crash after the CAS and before the terminal update strands the row in
`APPROVED` permanently, and because the CAS requires `status = 'PENDING'`,
nothing can reclaim it. No cron job references `APPROVED`.

Mitigating factor: the idempotency key is deterministic
(`nexie:${approval.id}:approved-action`), so replay is safe.

**Do:**

- Cron sweep for `agent_action_approvals` in `APPROVED` with `decided_at` older
  than a few minutes and no `completed_at`. Re-invoke using the same idempotency
  key, or mark `FAILED` with a retry affordance.
- Optionally add a real `EXECUTING` state to distinguish "claimed" from
  "decided," which makes the reaper's query unambiguous.

---

## 8. CI on Node 24, and run the smoke suite automatically

`[ ]`

**Verified.** `.github/workflows/ci.yml` pins `node-version: 22`, as does
`release-certification.yml`. Production runs Node 24, so CI has never executed
the runtime that serves traffic. `.github/workflows/e2e.yml` is
`workflow_dispatch` only, so the Playwright suite that already exists never runs
on its own.

**Do:**

- Bump `node-version` to 24 in `ci.yml` and `release-certification.yml`.
- Add `pull_request` and a nightly `schedule` trigger to `e2e.yml`, scoped to the
  public-page smoke so it runs without the authed secrets. The authed editor and
  LLM specs already self-skip when their secrets are absent.

---

## 9. Scan the full git history for secrets, and turn on push protection

`[ ]`

**Verified.** The repo is public: the GitHub API reports `"private": false`,
`"visibility": "public"` for `nexez-ai/nexez`, created 2026-06-01.

A bounded scan found nothing. No `.env` file was ever added across 777 commits.
Pickaxe over `sk_live_`, `whsec_`, `SUPABASE_SERVICE_ROLE_KEY=`, `sk-ant-`,
`xai-`, `ghp_` and the standard JWT header returned only placeholders, prefix
checks, `whsec_test` stubs, and negative assertions such as
`expect(...).not.toContain('sk_live_')`.

That is seven prefixes, not a credential sweep. Treat it as encouraging, not as
clearance.

**Do:**

- `gitleaks detect --log-opts="--all"` or
  `trufflehog git file://. --since-commit ""` over the full history, all refs.
- Enable GitHub secret scanning and push protection. Both are free on public
  repos and make this continuous instead of manual.
- Rotate anything either tool surfaces, regardless of commit age. The history is
  world-readable now, so "it was only briefly committed" is not a mitigation.

---

## Verified elsewhere, not in this plan

Findings that checked out but did not make the cut, recorded so they are not
rediscovered from scratch:

- **Eligibility predicates are fragmented.** At least five definitions of
  "eligible": `private.nz_page_visit_allowed` (telemetry),
  `private.nz_page_is_published` (negotiation insert),
  `private.published_page_allows_negotiation`, `app/api/checkout/route.ts:57`
  (base `pages`, `is_published` only), and `getOwnerBillingState(...).isPaused`
  in `resolveSettlementContext`. Separately,
  `lib/public-page-visibility.ts` checks `marketplace_discoverable` but not
  `serving`, while the two cron routes check both.

  Currently harmless, because the `serving` gate is enforced by RLS on
  `pages_public` (`using (is_published = true and serving = true)`) for every
  anon read, and because of the next item.

- **`private.nz_owner_is_paused` is `select false;`** verbatim, IMMUTABLE. So
  `serving` can never be false, and production confirms it: two rows, both
  `serving = true`. Either implement it or delete the concept along with the
  pause clause in the RLS policy. Pair this with the eligibility work, since one
  makes the other observable.

- **Telemetry forgery is harder than it looks.** `agent_visits` and
  `checkout_events` do grant insert to anon, gated on
  `nz_page_visit_allowed(page_id, slug, owner_id)`. But `owner_id` is not in
  `PUBLIC_PAGE_COLUMNS`, is absent from the projection, and anon has no select on
  base `pages`, so an outsider cannot assemble a valid triple. The real exposure
  is a **merchant inflating their own numbers**, which matters only once agent
  activity feeds rankings, trust or payouts. Design for that threat, not for
  anonymous vandalism.

- **Supabase advisors, current state.** Seven `rls_enabled_no_policy` tables, all
  INFO: `checkout_sessions`, `shopify_installs`, `page_freshness_nudges`,
  `scan_results`, `study_control`, `study_seed_queue`, `study_targets`. Two
  `function_search_path_mutable` warnings: `claim_study_targets` and
  `study_drive`. Both are SECURITY INVOKER, not definer, and both are already
  revoked from anon and authenticated, so this is lint rather than exposure.

- **Function EXECUTE grants.** Exactly 12 functions across `public` and `private`
  are anon-executable. Nine are trigger functions (invoker-rights, not
  RPC-callable through PostgREST). The other three are the intentional RLS
  helpers. The cleanup is nine revokes with no behavior change.

- **`private.zz_growth_fn_backup_20260816`** exists, 32 kB, no primary key. Drop
  it once the rollback window closes, or give backup tables a naming convention
  with an expiry.

- **Unverified.** Node 24 in production, the 192-page build, the TypeScript pass,
  and the Sentry incident counts (370 marketplace-curation failures on Aug 10, 14
  Shopify catalog-sync failures on Aug 14) were not independently confirmed. No
  `node` and no `gh` on PATH in the session that produced this document.
