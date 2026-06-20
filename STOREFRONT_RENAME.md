# Storefront / Listing — rename + multi-storefront foundation (plan)

_Status: PLAN (nothing shipped yet). Author: gauntlet/architecture session. Supersedes the ad-hoc "rename pages → storefront" idea._

**Decision:** adopt the marketplace vocabulary **Storefront → Listing → Offer**, where today's account is the storefront and today's `pages` row is a listing. Implement as a UI/brand layer first (no schema change), then add a public storefront landing, then — if/when wanted — a foundation that lets one account own **multiple** storefronts.

The whole rename stays **above the agent-contract line**: external agents consume `page`-named artifacts as a public API; those identifiers never change.

---

## 1. The model

| Tier | = today | Public/human noun | Schema change for the rename? |
|---|---|---|---|
| **Storefront** | the account (`auth.users` / `owner_id`) | new account-level brand | none for the rename; one table for the landing (§5) and for multi (§7) |
| **Listing** | a published `pages` row | replaces "page" everywhere a human sees it | none |
| **Offer** | a service/product on a listing | unchanged | none |

Default is `1 account = 1 storefront`. Multi-storefront is a **foundation** (§7) that makes "many" a data operation, not a re-architecture.

---

## 2. The contract line — STAYS named `page` (do NOT rename)

These are a public API external AI agents fetch + parse. Renaming = a breaking change for zero agent benefit. Leave every one of them exactly as-is:

- The `/[slug]` URL structure + per-listing artifacts: `agent.json`, `llms.txt`, `mcp.json`, `mcp`, `badge.svg/json`
- Bulk index `agent-pages.json` (`schema_version: nexez.agent-index.v1`) and the manifest `schema_version: nexez.agent-page.v1` (`lib/agent-manifest.ts`)
- `pages_public` view + `PUBLIC_PAGE_SELECT` (`lib/agent-page.ts`); the `pages` base table + columns
- `/api/v1/pages` + `/api/v1/pages/[id]`; `/openapi.json`; `/.well-known/nexez.json` (`lib/agent-capabilities.ts`)
- Limit internals (DB identifiers only — the *copy* changes): `trg_enforce_published_page_limit`, `published_page_grandfather`, `plan_published_page_limit()`

Rule of thumb: **humans never see `pages_public`; agents never see "Listings."** Keep the two vocabularies on their own sides.

---

## 3. Rename surface: `page` → `listing` (human copy only, ~85 strings)

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

### Marketing (~60 spots, mostly `lib/marketing-content.ts`)
- `app/page.tsx`: "Pages agents can discover now", "No published pages yet".
- `app/discovery/page.tsx`: "Pages" directory stat, "search published Nexez agent pages", "Public page" button, "View all high readiness pages".
- `app/leaderboard/page.tsx`: "No published pages yet".
- `lib/marketing-content.ts` — the product-noun "agent page" throughout: how-it-works, examples ("Can I create multiple pages?"), security, integrations, agent-readiness, developers, compare, enterprise.
- **Judgment:** replace the **product noun** "page" → "listing". Keep generic "page" where it literally means a web document (the survey flagged the ambiguous ones). Optionally keep "agent page" as a marketing *hero* term — see §8 decision 2.

### Route decision
`/dashboard/pages` → recommend **rename to `/dashboard/listings` + a redirect** from the old path (it's a bookmark, not a contract surface). Alternative: labels-only, keep the URL. (§8 decision 1.)

---

## 4. "Storefront" — the new account-level noun

- **Account settings** `app/dashboard/settings/page.tsx`: "Your agent surface." → **"Your storefront."**; this page becomes **Storefront settings** (handle, brand, description, discovery endpoints).
- **Dashboard welcome** header + **billing identity** ("Your storefront's plan").
- **Plan-limit copy**: "Published page limit reached for your plan" → **"Your storefront can publish N listings on the {plan} plan."**
- The public **storefront landing** (§5).

---

## 5. Storefront landing page — spec (the first net-new build)

The model promises "your account *is* a storefront," so a storefront must **exist as a place**. Today nothing aggregates a seller's listings (confirmed: discovery + leaderboard are global/flat, no per-owner view, no `/store|/seller` route).

**Prerequisite — a `storefronts` table** (1 row per account in 1:1 mode; see §7 for many):
`id, owner_id (unique in 1:1 mode), handle (public slug, unique), display_name, description, logo_url, accent_color, created_at, updated_at`. RLS: owner-scoped writes; public read of storefronts that have ≥1 published listing.

**Public routes (agent runtime, `nexez.app`):**
- `GET /store/<handle>` — HTML landing: brand header (name/logo/accent), description, aggregate trust/certification + preferred contact, and a **grid of the storefront's published listings** (each → its `/[slug]`). Data = `pages_public` filtered by storefront (owner_id in 1:1 mode, `storefront_id` in multi).
- `GET /store/<handle>/agent.json` — **storefront manifest**: brand + an array of the listings' `agent.json` URLs (a per-seller mini-`agent-pages.json`). **Additive** to the contract — an agent discovers a whole seller at once. `/store/` prefix avoids collision with listing `/[slug]`.

**Wire-ups:** each listing `/[slug]` gets a "part of **{Storefront}**" backlink; discovery can later group by storefront; a custom-domain root can map to the storefront landing.

---

## 6. Phasing

- **Phase 1 — rename (cheap, reversible, no schema):** the §3 copy sweep + §4 "Storefront" on account surfaces + limit copy. ~9 app files + `lib/marketing-content.ts`. Pure UI, above the contract line. Most of the perceived value.
- **Phase 2 — the landing:** `storefronts` table + `/store/<handle>` HTML + `/store/<handle>/agent.json` + Storefront-settings editor + listing→storefront backlinks.
- **Phase 3 — optional polish:** storefront-level discovery/trust aggregate; custom-domain root = storefront landing.
- **Phase 4 — multi-storefront foundation (§7):** make one account able to own many storefronts.

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

### Agent contract (additive — never rename `page`)
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

## 8. Decisions to lock before Phase 1

1. **`/dashboard/pages` route** — rename to `/dashboard/listings` (+redirect), or labels-only?
2. **Marketing tone** — go all-in "listing", or keep "agent page" as the marketing hero term and use "listing" only in product/dashboard?
3. **`1 account = 1 storefront` for v1** (Phase 1–3), with the Phase 4 foundation shaped for many — confirm.
4. **Billing/payout scope** for Phase 4 — account-pooled with nullable per-storefront seams (recommended), confirm.

---

_Cross-refs: agent contract in `AGENTS.md` / `HANDOFF.md`; design tokens in `DESIGN_SYSTEM.md`; the publish-limit + grandfather machinery in `supabase/migrations/20260621000000_enforce_published_page_limit.sql`._
