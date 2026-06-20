# Agent Storefront / Agent Listing — labeling + multi-storefront foundation

_Status: SHIPPED THROUGH PHASE 3b (all deploy-verified on prod). The human-facing rename is platform-wide — dashboard, create/onboard/billing, the marketing site, the route (`/dashboard/listings` + 308 redirect), and the long tail (editor, settings, analytics, components, transactional emails) via a multi-agent sweep. The storefront exists end-to-end: `storefronts` table + one-per-account backfill, the public `/store/<handle>` landing + `/store/<handle>/agent.json` manifest, the Storefront-settings editor, listing→storefront backlinks, storefront-level aggregate signals, and storefront browsing in `/discovery`. **Deferred:** Phase 3c (custom-domain root → storefront). **Remaining:** Phase 4 (multi-storefront foundation). This doc is now the labeling guide + the Phase 4 roadmap; §6 has the authoritative per-phase status + commits._

**Decision:** adopt Nexez-native vocabulary **Agent Storefront → Agent Listing → Offer**:

- **Agent Storefront**: the seller/account-level AI-readable commerce identity.
- **Agent Listing**: the individual crawlable offer page formerly called an agent page in the human UI.
- **Offer**: a product, service, package, booking, retainer, or negotiation target inside a listing.

This is not meant to position Nexez as a generic website/storefront builder. A Nexez storefront is the structured identity layer that groups AI-ready listings for agents and buyer workflows. The main website can stay human-first; Nexez remains the clean buying surface for agents.

The whole rename stays **above the agent-contract line**: external agents consume `page`-named artifacts as a public API; those identifiers never change.

---

## 1. The model

| Tier | = today | Public/human noun | Platform meaning |
|---|---|---|---|
| **Agent Storefront** | the account-level seller identity (`storefronts.owner_id`) | storefront | seller/brand hub that groups agent listings |
| **Agent Listing** | a published `pages` row | listing | crawlable AI-ready buying page |
| **Offer** | a service/product on a listing | offer | actionable thing an agent can compare, book, buy, or negotiate |

Default is `1 account = 1 storefront`. Multi-storefront is a **foundation** (§7) that makes "many" a data operation, not a re-architecture.

---

## 2. The contract line — STAYS named `page` (do NOT rename)

These are a public API external AI agents fetch + parse. Renaming = a breaking change for zero agent benefit. Leave every one of them exactly as-is:

- The `/[slug]` URL structure + per-listing artifacts: `agent.json`, `llms.txt`, `mcp.json`, `mcp`, `badge.svg/json`
- Bulk index `agent-pages.json` (`schema_version: nexez.agent-index.v1`) and the manifest `schema_version: nexez.agent-page.v1` (`lib/agent-manifest.ts`)
- `pages_public` view + `PUBLIC_PAGE_SELECT` (`lib/agent-page.ts`); the `pages` base table + columns
- `/api/v1/pages` + `/api/v1/pages/[id]`; `/openapi.json`; `/.well-known/nexez.json` (`lib/agent-capabilities.ts`)
- Limit internals (DB identifiers only — the *copy* changes): `trg_enforce_published_page_limit`, `published_page_grandfather`, `plan_published_page_limit()`

Rule of thumb: **humans see storefronts and listings; individual agent contracts keep `page` naming.** Agents may see a storefront-level `listings` array in `/store/<handle>/agent.json`, but per-listing artifacts stay `nexez.agent-page.v1`.

---

## 3. Rename surface: `page` → `listing` (human copy only)

### App (~27 spots, ~9 files)
- **Nav / shell** — `components/PlatformShell.tsx`: "Pages" → **Listings**; "Create Page" → **New Listing**; "All pages / Published / Drafts" submenu; "Search pages…" → "Search listings…"; "No matching pages."
- **Overview** — `app/dashboard/DashboardClient.tsx`: "New Agent Page", "Today on your agent pages", the "Pages" section header + "Manage all N pages", "No pages yet", "Shared with me … pages".
- **Manager** — `components/PagesManager.tsx` (optionally rename component → `ListingsManager`): H1 "Pages", "New page", "{n} of {limit} published", search placeholder, all empty states, "Create a page".
- **Listing card** — `components/dashboard/PageCard.tsx`: 8 `aria-label`s ("Edit page" → "Edit listing", … "Delete page").
- **Create** — `app/create/page.tsx`: "Build your Nexez Agent Page", "Publish agent page", "Agent page is live", "Publishing your Nexez page…".
- **Onboard** — `app/onboard/page.tsx`: "volume of agent pages", "Create your first agent-optimized page", "Create your first page".
- **Settings** — `app/dashboard/settings/page.tsx` (account-level → §4): "Published pages" stat, "Create a page first"; `app/dashboard/[id]/settings/page.tsx`: "Page name" field, "Edit Page" / "Public Page" buttons.
- **Billing** — `app/dashboard/billing/page.tsx` + `components/billing/BillingDashboardClient.tsx`: "Published Pages" usage label, "Agents buy through your pages".
- **Empty/celebrate** — `components/editor/PublishCelebration.tsx` ("🎉 Your page is live" → "Your listing is live"); `components/ReadinessChecklist.tsx` publish copy.

### Marketing
- `app/page.tsx`: "Pages agents can discover now", "No published pages yet".
- `app/discovery/page.tsx`: "Pages" directory stat, "search published Nexez agent pages", "Public page" button, "View all high readiness pages".
- `app/leaderboard/page.tsx`: "No published pages yet".
- `lib/marketing-content.ts` — the product noun should mostly be **agent listing**. Keep generic "page" only when it literally means a web document or when explaining the historical agent-page contract.
- **Positioning rule:** "Agent listing" is the product/dashboard noun. "Agent page" can appear only as explanatory bridge copy, API/contract copy, or legacy SEO phrasing. Do not let "storefront" make the platform sound like a generic e-commerce storefront builder.

### Route decision
`/dashboard/pages` → recommend **rename to `/dashboard/listings` + a redirect** from the old path (it's a bookmark, not a contract surface). Alternative: labels-only, keep the URL. (§8 decision 1.)

---

## 4. "Agent storefront" — the account-level noun

- **Account settings** `app/dashboard/settings/page.tsx`: **"Your storefront."**; this page is Storefront settings (handle, brand, description, discovery endpoints).
- **Dashboard welcome** header + **billing identity** ("Your storefront's plan").
- **Plan-limit copy**: "Published page limit reached for your plan" → **"Your storefront can publish N listings on the {plan} plan."**
- The public **storefront landing** (§5).

---

## 5. Storefront landing page — shipped foundation

The model promises "your account *is* a storefront," so a storefront must **exist as a place**. The first version now exists as `/store/<handle>` plus `/store/<handle>/agent.json`.

**Prerequisite — a `storefronts` table** (1 row per account in 1:1 mode; see §7 for many):
`id, owner_id (unique in 1:1 mode), handle (public slug, unique), display_name, description, logo_url, accent_color, created_at, updated_at`. RLS: owner-scoped writes; public read of storefronts that have ≥1 published listing.

**Public routes (agent runtime, `nexez.app`):**
- `GET /store/<handle>` — HTML landing: brand header (name/logo/accent), description, aggregate trust/certification + preferred contact, and a **grid of the storefront's published listings** (each → its `/[slug]`). Data = `pages_public` filtered by storefront (owner_id in 1:1 mode, `storefront_id` in multi).
- `GET /store/<handle>/agent.json` — **storefront manifest**: brand + an array of the listings' `agent.json` URLs (a per-seller mini-`agent-pages.json`). **Additive** to the contract — an agent discovers a whole seller at once. `/store/` prefix avoids collision with listing `/[slug]`.

**Shipped wire-ups:** each listing `/[slug]` has a "Browse the full storefront →" backlink (`a696fb0`) — resolved via a service-role `slug → owner → handle` lookup, because the launch-hardening migration stripped `owner_id` from `pages_public`, so the view can't be filtered by owner; `/discovery` surfaces storefronts in the sidebar (`471f549`); and storefront-level aggregates (offers / avg readiness / "Nexez Certified") show on the landing + manifest (`acb7cac`). **Deferred — custom-domain root → storefront (Phase 3c):** blocked by that same `owner_id` strip — the `proxy.ts` middleware can't resolve host→storefront without re-exposing `owner_id` (undoes the security fix) or a service-role read on the edge hot path, and it would change the existing custom-domain agent contract. Poor risk/reward; see §6.

---

## 6. Phasing

- **Phase 1 — rename ✅ COMPLETE** (all above the contract line, human copy only):
  - 1.1 dashboard (nav · Listings manager · card · overview · account "Storefront") — `aa379c9`
  - 1.2 create · onboarding · billing · publish celebration — `af1944b`
  - 1.3a live marketing (homepage · discovery · leaderboard) — `92ba3e5`
  - 1.3b marketing route prose (`marketing-content.ts`, 8 pages + use-cases) — `9cedfe6`
  - 1.4 route `/dashboard/pages` → `/dashboard/listings` + 308 redirect — `9da9fa5`
  - 1.5 long tail via a multi-agent sweep (editor · settings · analytics · ~12 components · public routes · transactional emails; ~142 renames, false-positives filtered) — `e340440`
- **Phase 2 — storefront ✅ COMPLETE:**
  - 2.1 `storefronts` table + RLS + backfill + `normalizeHandle` — `b0577e6`
  - 2.2 public `/store/<handle>` landing + storefront `agent.json` + host routing — `9b2c852` (+ fix `9a5af09`: read listings from base `pages`, since `pages_public` dropped `owner_id`)
  - 2.3 Storefront-settings editor (`/api/storefront` + UI) — `5b9f7b0`
  - 2.4 listing → storefront backlink — `a696fb0`
- **Phase 3 — polish:**
  - 3a storefront-level aggregate (offers / avg readiness / Certified, landing + manifest) — ✅ `acb7cac`
  - 3b browse storefronts in `/discovery` — ✅ `471f549`
  - 3c custom-domain root = storefront — ⏸ **DEFERRED.** Blocked by the launch-hardening `owner_id` strip from `pages_public`: the `proxy.ts` middleware can't resolve host→storefront without re-exposing `owner_id` (a security regression) or a service-role read on the edge hot path, and it changes the existing custom-domain agent contract for live domains. Niche reward (~few custom domains); revisit only with a dedicated host→storefront mapping mechanism.
- **Phase 4 — multi-storefront foundation (§7):** the only remaining item — make one account able to own many storefronts. Optional; a real schema + money-path effort.

---

## 7. Phase 4 — multi-storefront foundation (1 account → N storefronts)

The hard part isn't the entity; it's deciding **what re-keys from account → storefront** (especially money). Build the seams now so "many" is a data op, not a re-architecture.

### Core move
Insert the storefront as the entity between account and listing, and **backfill exactly one storefront per existing account** so today's data is just "1 storefront so far" — non-breaking. "Multiple" then = `INSERT another storefronts row`.

```
auth.users (account)  →  storefronts (1..N)  →  pages/listings (1..N)  →  offers
```

### Schema
```
storefronts (
  id uuid pk,
  owner_id uuid not null references auth.users,   -- account anchor (KEEP)
  handle text unique,
  display_name, description, logo_url, accent_color,
  stripe_connect_account_id text null,            -- SEAM: null → fall back to account
  plan_id text null,                              -- SEAM: null → account plan
  created_at, updated_at
)
pages.storefront_id uuid references storefronts(id)  -- backfilled; KEEP pages.owner_id
```
Keep `pages.owner_id` denormalized (= `storefronts.owner_id`) so existing `owner_id = auth.uid()` RLS is untouched. Enforce the invariant with a trigger (mirror `nz_pages_pin_owner`): on insert/update, pin `owner_id` from the chosen storefront. One table + one FK + one trigger + a backfill.

### The pivotal decision: billing & payout scope

| | **Account-pooled (recommended v1)** | **Per-storefront merchant** |
|---|---|---|
| Plan / limit | one plan; published-listing limit pooled across storefronts | each storefront its own plan + limit |
| Stripe Connect | one payout account for all storefronts | each storefront = own legal/bank entity, own Connect acct + commission |
| Fits | "I run 3 brands, one business" | "agency / holding co. with separate merchants" |
| Cost | trivial (billing + money path stay `owner_id`-keyed) | significant (money path resolves by `storefront_id`) |

**Recommendation: build the seam, default to account-pooled.** `storefronts.stripe_connect_account_id` and `plan_id` are **nullable**; every resolver is `storefront.X ?? account.X`. v1 leaves them null → zero behavior change. The day you want true per-storefront merchants, you populate those columns instead of re-migrating.

### What re-keys vs stays (v1)
- **Re-key to storefront (do now, high value):** public identity + landing, listing grouping, finance/analytics *reporting* (per-storefront P&L), and **team invites become per-storefront** — `team_invites.storefront_id nullable` (null = whole account, set = one storefront). The accept-flow (`/api/team/accept`, `resolvePageAccess`) extends naturally.
- **Stay account-keyed (behind the seam):** `billing_subscriptions`, the publish-limit trigger (pooled), Connect/commission resolution — unchanged until a storefront opts into its own plan/payout.
- **Money-path threading (the one forward-looking plumbing worth doing now):** pass `storefront_id` from page → checkout/pay/webhook and resolve `connect = storefront.connect ?? account.connect`, `commission = storefront.plan ?? account.plan`. That single indirection is the difference between "easy later" and "re-migrate later."

### Agent contract (additive — never rename individual `page` artifacts)
- `/store/<handle>` + `/store/<handle>/agent.json` per storefront.
- `agent-pages.json` gains an optional `storefront_handle` per entry so the global catalog can group by seller.
- Each listing's `agent.json` can include a `storefront` ref. All additive.

### Non-breaking rollout
1. Ship `storefronts` + `pages.storefront_id` + invariant trigger; **backfill one storefront per account** (handle from the account's primary listing/brand). RLS unchanged.
2. Resolvers become storefront-aware with account fallback (no behavior change while everyone has one storefront).
3. Build `/store/<handle>` (§5) reading `pages_public` by `storefront_id`.
4. Expose "**New storefront**" → an account can now hold several; team invites + finance scope to the picked storefront.
5. *Only if/when needed:* populate a storefront's own Connect acct + plan → true multi-merchant.

---

## 8. Labeling decisions now locked

1. **Marketing tone:** use **agent listing** as the primary product noun. Keep "agent page" only for legacy/contract/API explanation.
2. **Storefront tone:** say **agent storefront** in strategic copy when needed; say **storefront** in dashboard labels where brevity matters.
3. **`1 account = 1 storefront` for v1** (Phases 1–3) — ✅ CONFIRMED. Enforced by `storefronts.owner_id UNIQUE`; Phase 4 drops that constraint.
4. **Billing/payout scope** for Phase 4 — ✅ CONFIRMED: account-pooled, with nullable per-storefront `stripe_connect_account_id`/`plan_id` seams + `storefront ?? account` resolver fallback (re-key only when a storefront opts into its own payout/plan).
5. **Route rename** `/dashboard/pages` → `/dashboard/listings` (+308 redirect) — ✅ DONE (1.4, `9da9fa5`).

---

_Cross-refs: agent contract in `AGENTS.md` / `HANDOFF.md`; design tokens in `DESIGN_SYSTEM.md`; the publish-limit + grandfather machinery in `supabase/migrations/20260621000000_enforce_published_page_limit.sql`._
