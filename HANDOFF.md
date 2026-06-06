# Nexez — Session Handoff

_Last updated: 2026-06-05 (CI verified green) · HEAD `6052372` (verify with `git rev-parse --short main`)_

## Project
**Nexez** helps businesses create dedicated, highly structured pages optimized for **AI agents** to discover, understand, and purchase from. Dual philosophy: **premium glassmorphism human dashboard** vs **brutally clean/semantic HTML for agents** on public `[slug]` pages. A core objective is **deploying agent-optimized pages to custom domains**, managed from the Nexez backend.

## Stack & critical conventions
- **Next.js 16.2.7 (App Router, Turbopack)** — ⚠️ `AGENTS.md` warns this is a modified Next with breaking changes vs training data; **read `node_modules/next/dist/docs/` before using framework APIs**. Middleware lives in **`proxy.ts`** at the repo root (exports `proxy`), NOT `middleware.ts`.
- **Supabase** (Postgres + RLS + Auth + Storage). Clients:
  - `utils/supabase/server.ts` → `createClient(cookieStore)` (server components / route handlers)
  - `utils/supabase/client.ts` → `createClient()` (browser)
  - `utils/supabase/admin.ts` → `createAdminClient()` / `hasSupabaseAdminEnv()` (service-role, gated)
- **Deploy:** Vercel auto-deploys on push to `main`. Prod domain `nexez.vercel.app` (preview/branch URLs are SSO-gated; production is public). Vercel project `prj_uREcprpInoeHVhgV7aWc14TRsnLi`, team `team_rwkVXglmM5D0MPXjGTqOPVKO`. Supabase project `pvsotrzgnjpqrsndhgmu`.
- **Verify EVERY change:** `npm run lint -- --quiet` · `npx tsc --noEmit --incremental false` · `npm test` · `npm run build`. **E2E (opt-in):** `npm run test:e2e` (Playwright; public smoke always runs, the authed editor smoke runs only when `E2E_EMAIL`/`E2E_PASSWORD` are exported, else skips). Vitest config (`vitest.config.ts`) excludes `e2e/**` + mirrors the `@/` tsconfig alias; route tests mock Supabase via `test/supabase-mock.ts`; **component tests** declare `// @vitest-environment jsdom` and import from `test/dom.ts` (jest-dom matchers + cleanup + matchMedia/ResizeObserver polyfills).
- Commit messages end with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Push to `main` directly (the user's workflow).
- **The user commits to `main` in parallel** (UI shell, homepage, settings, lib helpers). Always `git fetch` + check `git rev-list --left-right --count origin/main...main` before/after edits. This window merged a large batch of the user's parallel work alongside mine — coordinate before large UI-shell rewrites.
- DB migrations: apply via the **Supabase MCP `apply_migration`** and also write the `.sql` into `supabase/migrations/`. **Do NOT `supabase db push`** — tracking-table versions differ from repo filenames (all migrations are idempotent).

## Credentials / account (do NOT store secrets in this repo — it's public)
- Test account email **`realestglad@gmail.com`**, owner_id **`5320a9ef-9e9f-4e8b-ac78-13b9270c571b`**. The **password is NOT recorded here on purpose** — the user pastes it in chat when authed verification is needed. Clean up any test artifacts (drafts/duplicates) you create.

## Current state (verified this session)
- `origin/main` == local @ **`7f2677b`**, clean tree. Vercel auto-deploys on push; prod verified live (`/icon.png` + `/nexez-logo.png` → 200; tab title "Nexez — Pages built for AI agents", favicon `/icon.png`). The editor route `/dashboard/[id]` is now a **server component** (was a `'use client'` monolith).
- **311 tests passing** — `lib/` units + **API route-handler tests** (auth/tenancy/gating, `app/api/**/route.test.ts`) + **component tests** (jsdom: ThemeToggle, ErrorBoundary, VisualOfferBuilder, PageCard, ReadinessAside, EditorToolbar); lint (`--quiet`) / tsc / build all clean. Playwright E2E present (`e2e/`).
- **CI live & verified green** — `.github/workflows/ci.yml` runs lint/tsc/test/build on push+PR (Node 22; reads `NEXT_PUBLIC_SUPABASE_*` from secrets, placeholder fallback for fork PRs). `e2e.yml` is a manual (workflow_dispatch) Playwright run. **All 4 repo secrets are configured** (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `E2E_EMAIL`, `E2E_PASSWORD`); a dispatched E2E run passed (authed editor smoke green on Actions), and CI is green on the latest commits. _(The push token now has the `workflow` scope.)_
- ~48 API routes, **29 migrations — all applied to prod.** The settings-page logo upload (`storage.from('logos')`) works (logos bucket + RLS live).
- ~48 API routes, **29 migrations — all applied to prod.** The settings-page logo upload (`storage.from('logos')`) works (logos bucket + RLS live).
- **Supabase security advisors are clean except one** — the `logos` listing + `nz_page_is_published` RPC-exposure findings were fixed (`20260613020000_security_harden_advisors.sql`). The only remaining advisor is **Auth "leaked password protection"** (still off) → enable in the dashboard (config, not code; the one item I can't fix via SQL/MCP).

## Latest session (2026-06-05 late, commits `932d478`→`70012fe`)
- **Long-tail tests + CI** (`70012fe`) — +14 tests (311 total): routes `dashboard/api-keys` (owner-bound key, hash-only storage, raw once), `webhooks/calendly` (service-role/slug/page gating), `[slug]/badge.json`, `[slug]/mcp.json` (mcp_enabled gating); components `ReadinessAside`, `EditorToolbar`. **Added `.github/workflows/ci.yml` + `e2e.yml`** (`7f2677b`) — CI gate (lint/tsc/test/build) on push/PR + a manual Playwright workflow. _(Initially blocked by a missing `workflow` token scope; landed once granted.)_
- **Component + broad route tests** (`a132ce1`) — added the jsdom + Testing Library layer (`test/dom.ts`; per-file `// @vitest-environment jsdom`) and **4 component tests** (ThemeToggle theme/localStorage/DOM, ErrorBoundary fallback, VisualOfferBuilder add/remove/edit→onChange, PageCard render/toggle/select). Broadened route coverage: `public-simulate`, `v1/pages/[id]` (id+owner tenancy), `billing/checkout` gating, `[slug]/agent.json` + `[slug]/llms.txt` artifacts. **297 tests / 57 files.** Added the `@/` alias to `vitest.config.ts`.
- **Route + E2E test coverage** (`ca212e9`) — closed the audit's top hardness gap. Added vitest infra (`vitest.config.ts` node env + `vitest.setup.ts` stubbing `server-only` + a chainable `test/supabase-mock.ts` covering all three Supabase entry points) and **+33 route-handler tests (272 total), security/tenancy first**: `authenticateApiKey` (503/401 gates, hashed-token lookup), `/api/v1/pages` (owner-scoped tenancy, forced `owner_id`, default-draft), `/api/negotiations` (400/404/dryRun/insert-without-select/escrow/RLS-412), `account/{delete,export}` gating, `verify-custom-domain` (mocked DNS), `webhooks/stripe` (signature). Plus **Playwright E2E** (`@playwright/test` + chromium): `e2e/public-page.spec.ts` (always) + `e2e/editor.spec.ts` (authed, **non-destructive**, self-logs-in from `E2E_EMAIL`/`E2E_PASSWORD`, skips without). Verified the authed E2E green locally with the test account. ⚠️ Gotcha: Playwright `test.skip(cond, reason)` is only reliable **inside the test body**, not at describe top-level.
- **Platform-wide layout sweep** (`2154633`, `aca8e75`) — fixed mobile horizontal overflow (the `min-width:auto` family) across page-settings (the agent.json `<pre>` blew out the grid column), account-settings (grid cols + a `truncate` URL card), analytics (Recharts `Panel`), leaderboard (inline `truncate <a>` → `block`), and the homepage nav (`.btn-secondary`/`ThemeToggle` set their own `display`, overriding Tailwind `hidden` → wrapped in `div.hidden sm:flex`). Verified **0 horizontal overflow at 375px across all ~20 routes**. Fix pattern: `min-w-0` on grid/flex columns; `block` for inline `truncate`.
- **Platform audit + security/RLS hardening** (`e46d65e`) — full audit vs ROADMAP (completion ~85/100; no hard breakage, 0 error-level DB advisors). Cleared the actionable advisors via `20260613020000_security_harden_advisors.sql`: dropped the broad `logos` read policy (anon can no longer list; public URLs unaffected), moved `nz_page_is_published` to a `private` schema (no longer an RPC; negotiation INSERT verified intact — anon keeps schema USAGE + EXECUTE), indexed `support_tickets.page_id`. Logged the previously-unrecorded shipped features (Stripe billing, support desk, hosted checkout) in ROADMAP. Remaining: leaked-password toggle (dashboard). Audit also flagged the main gap = no API/route/component/E2E automated tests (coverage is `lib/` only).
- **Cleanup trio** (`68024a0`, `1f19f75`, `78539f9`) — (1) removed unused deps `clsx`/`tailwind-merge`/`class-variance-authority` (shadcn scaffold, zero usages); (2) **tested the middleware auth gate** — extracted the pure decision to `utils/supabase/auth-gate.ts` (`isProtectedPath` + `resolveAuthGate`), middleware consumes it (behavior identical), +7 tests; (3) **hardened the negotiations inbox load** — `withTimeout` (12s, `lib/async-timeout.ts`) around getUser + query, a `finally` that always clears loading, and a distinct retryable error state (genuine table-missing → migration guidance via `isMissingTableError`), +6 tests. 239 tests total. Inbox smoke-tested on the preview (loads 7 negotiations, no stuck spinner, Refresh clean).
- **Editor de-monolith** (`57a76a2`) — `app/dashboard/[id]/page.tsx` went from a single ~1650-line `'use client'` file to: a **server component** `page.tsx` (99 lines — `await params`, auth, fetch `OWNER_PAGE_SELECT` + activity in one parallel wave, server-side access redirects) → `EditorClient.tsx` island → `components/editor/usePageEditor.ts` hook + **9 presentational panels** + shared `Field.tsx`. Pure logic (smart merge, save payload, version trim, stripe diff) extracted to **`lib/editor-merge.ts`** with **+12 unit tests** (the two inline merges collapsed onto one proven-superset `smartMergeOffers`; the 5 integration re-sync closures collapsed onto one `resyncIntegration(provider)`). Behavior preserved (no DB/API/select changes). Added `app/dashboard/[id]/loading.tsx` skeleton. Verified end-to-end on the local preview against the test account (server hydration / no loading flash → Save→snapshot → Save-as-draft→Publish → Re-analyze→Apply → Duplicate); zero console/server errors; throwaway duplicate deleted. ⚠️ One latent quirk **deliberately preserved**: the post-merge Stripe-price-change count in `applyPendingReanalysis` is always 0 (merge already applied fresh prices) → that message branch is dead; flagged in a code comment, not "fixed" inside the refactor.
- **Applied the `logos` storage-bucket migration** — Supabase MCP recovered; ran `20260605190000_create_logos_storage_bucket.sql` (`{"success":true}`) and verified in prod (bucket `public=true`, 4 RLS policies). Settings logo upload unblocked. _(Was the prior handoff's top-priority pending item.)_
- **Fixed missing logout on tablet/mobile** (`components/PlatformShell.tsx`, `7c22948`) — the sign-out/sign-in control lived only in the desktop header (`hidden … xl:flex`), so below the `xl` breakpoint (1280px — all tablets/phones) there was no way to sign out. Added the same auth control to the mobile/tablet header bar (`xl:hidden`): icon sign-out button when authed, "Sign in" link otherwise, POSTing to the existing `/auth/signout` route. lint / tsc / 214 tests / build all green. _(No new tests — pure responsive-chrome fix.)_

## This window's work (2026-06-05, commits `fa327ca`→`fcb0481`)
Newest first. This was a copy/branding/feature session; ~20 files of the user's parallel work were merged in alongside mine at the user's request.
- **Brand logo platform-wide** — `components/NexezLogo.tsx` renders the real mark via **CSS mask + `currentColor`** (`backgroundColor: currentColor` + `WebkitMask/mask: url(/nexez-logo.png) center/contain no-repeat`), so it inherits surrounding text color and flips with the theme with no stylesheet rule. Assets: **`public/nexez-logo.png`** (52KB, trimmed 1408²→432×643) and **`app/icon.png`** (256² favicon: white rounded square + mark); removed `app/favicon.ico`. **To swap the logo, just replace `public/nexez-logo.png`.** (A Tailwind-v4 `globals.css` `.nexez-mark` rule did NOT compile → inline style is the working approach.)
- **SEO metadata** (`app/layout.tsx`) — `title.default` + `template: "%s · Nexez"`, description/keywords, OpenGraph + Twitter cards, `metadataBase`. Removed the `icons` field so `app/icon.png` drives the favicon. Stripped `| Nexez` from 8 pages' string titles to avoid double-branding (`… · Nexez · Nexez`).
- **Homepage rewrite** (`app/page.tsx`) — user's new copy folded into existing renderings; sections reordered to DUAL (Problem|Solution) → BENTO (What You Get) → ANALYTICS (Proof) → KEY FEATURES (6-up grid, `keyFeatures` array) → WORKFLOW (How It Works) → SIMULATOR → PUBLIC EXAMPLES → Final CTA. Surfaced the **custom-domain example** (`offers.axlestrategy.com`). **All dashes (-) eliminated from homepage body copy.** Logo chip uses `<NexezLogo className="size-5" />`.
- **Query-aware agent simulator** (`lib/agent-simulator.ts`) — added `detectIntent()` + `interpretPublicQuery(page, query)`: classifies intent, ranks offers / picks `bestMatch`, returns a tailored answer + agent-action list with confidence (0.97/0.86) instead of one canned reply. DEMO_PAGE renamed Aether→**Axle Strategy** (axlestrategy.com, 100% readiness, high-confidence seed data). The simulator section now inherits theme tokens (was greyed out). +5 tests.
- **Negotiations RLS fix** (`app/api/negotiations/route.ts`) — root cause of the 412 "violates RLS": the insert used `.insert(negotiation).select('id…').single()`, but **anon has no SELECT policy** on `agent_negotiations`, so the RETURNING read failed. Fixed by dropping `.select()` (reply built from `negotiation.status`/`escrowMode`) + a SECURITY DEFINER `nz_page_is_published()` policy. Migrations: `20260613004000_fix_negotiation_insert_rls_security_definer.sql` (mine) + the user's `20260605181840…` / `20260605182538…`.
- **Part 1 A–D platform builds:**
  - `lib/integrations.ts` (NEW) — `mapSquareCatalogToOffers`, `mapAcuityTypesToOffers`, `deriveAvailabilityWindows`; the `app/api/integrations/{square,acuity,google-calendar}` routes now call **live vendor APIs** with a sample fallback (`connected` flag). +9 tests.
  - `lib/analytics.ts` — `analyticsRangeBounds()` + `parseYmd()` (1d/7d/30d/all/custom from–to), used by the analytics page + export route. +6 tests.
  - `app/api/negotiations/escrow/route.ts` (NEW) — real **Stripe manual-capture** hold/capture/cancel, gated on `STRIPE_SECRET_KEY` (→ 412 when unset). Stripe webhook handles `checkout.session.completed` for escrow.
  - `lib/email.ts` — `buildBookingEmail`; the Calendly webhook now emails on a booking (gated on `RESEND_API_KEY`).
- **Robustness at scale** (33-page account): `components/PagesManager.tsx` paginates (12/page, Prev/Next) + bulk **Duplicate**; `app/dashboard/DashboardClient.tsx` Overview caps at `OVERVIEW_PAGE_LIMIT = 9` + "Manage all N pages" link; `components/PlatformShell.tsx` nav responsive fix (lg→md sidebar, scrollable phone bar with all 15 items).
- **Agent artifacts** — `lib/agent-manifest.ts` adds `voice_summary` (`rewriteForVoice`) + `certification: getCertification(page)` to `agent.json`; `lib/agent-page.ts` adds `getCertification()` (published + ≥95% readiness → "Nexez Certified Agent-Ready").

### Merged user parallel work (don't re-do — already in tree)
- **One-click logo branding** in `app/dashboard/[id]/settings/page.tsx` (+107 lines): upload to `storage.from('logos')`, one-click detect, paste-URL. `lib/importer.ts` `extractLogo()` → `logo_url`.
- **Custom-domain base-URL threading**: `getRequestBaseUrl(input)` in `lib/agent-page.ts` (reads `x-forwarded-host`/`host`), threaded through `lib/agent-manifest.ts`.
- **Page-search UX** in `components/PlatformShell.tsx` (Enter/Escape, result limit 25→100, hint text).

### 33 demo pages + negotiations (test account)
- Created **33 `qa33-*` demo pages** (8 published / 25 drafts) to stress-test how account robustness affects the platform. **XSS verified fully escaped** on public pages (qa33-31 `<script>` payload escaped in title/meta/og/body/JSON-LD via `safeJsonScript`).
- **7 negotiations** simulated across offers; **`qa33-33` is at `agreement_proposed`** (left mid-flow — optional to continue).

⚠️ **`.claude/launch.json`** is untracked (local preview config for the Claude Preview MCP) — intentionally not committed.

## What's built (Phases 1–8 + G21, all live)
Importer (+gated LLM fallback), Visual Builder (availability signals, A/B duplicate-variant, LLM Enhance), analytics (Recharts, demand insights + unserved-query gap analysis, conversion funnel, date-range filter), 6 integrations (Calendly/Stripe/Shopify/Square/Acuity/GCal — Square/Acuity/GCal now live-API-backed), per-offer controls/embeds/versioning, **custom-domain hosting** (host→serve via `proxy.ts`, Vercel SSL provisioning, connection wizard, brand-root `agent.json`/`mcp.json`/`llms.txt`, multi-page domains, white-label branding + inheritance, draft→preview→publish staging, deployments/rollback), query-aware simulator, AI Co-Pilot, **real MCP JSON-RPC endpoint** `/[slug]/mcp`, negotiations end-to-end + receipts + Stripe escrow, trust/badges (`/[slug]/badge.svg` + `/[slug]/badge.json`), agent certification, marketplace, **leaderboard**, programmatic **API + keys** (`/api/v1/*`), account export/delete, team invites + collaborator RLS, in-app notifications, rate limiting, observability hook, freshness-monitor cron, platform-wide light/dark/system theme.

## Architecture notes for common edits
- **Core types/helpers:** `lib/agent-page.ts` — `OfferItem`, `AgentPage`, `PUBLIC_PAGE_SELECT`/`OWNER_PAGE_SELECT`/`BASIC_OWNER_PAGE_SELECT`, `getReadinessScore`, `getTrustScore`, `getCheckoutOffers`, `getBaseUrl`, `getRequestBaseUrl`, `getCertification`, availability helpers.
- **Agent artifacts:** `lib/agent-manifest.ts` (`buildAgentPagePayload`), `lib/mcp-server.ts` (JSON-RPC), `app/[slug]/{agent.json,mcp.json,mcp,llms.txt,badge.svg,badge.json}`.
- **Theme:** `globals.css` remaps the finite set of hardcoded neutral utilities (`text-white`, `bg-white/x`, `bg-black/x`, `text-zinc-*`, `border-white/x`, +`hover:`/`active:`/`group-hover:` variants) to `var(--inverse-bg/--inverse-fg/--fg)` tokens that flip by `html.light`. Brand accents untouched. **Public agent pages locked dark.** No-flash script in `app/layout.tsx`, toggle `components/ThemeToggle.tsx` + `lib/theme.ts`.
- **Custom domains:** `lib/custom-domain.ts` (pure helpers), `proxy.ts` (host resolution + rewrite + auth gate via `updateSession`), `lib/vercel-domains.ts` (gated), `app/api/custom-domain`.
- **Dashboard:** `app/dashboard/page.tsx` = **server component** (auth + parallel fetch) → `app/dashboard/DashboardClient.tsx` = client island seeded from `initial` props. Sidebar/nav is `components/PlatformShell.tsx`.
- **App shell:** root `app/layout.tsx` → `components/PlatformFrame.tsx` (thin gate: `usePathname` + `next/dynamic`) → `components/PlatformShell.tsx` (heavy nav/search/supabase, platform routes only, auth-aware).
- **Auth gating:** `utils/supabase/middleware.ts` (`updateSession`) redirects unauthenticated `/dashboard/*` → `/login?next=…`. `/create` is public; Publish without auth saves draft to `sessionStorage` (`nexez_pending_page`) + shows a "create account to publish" modal.

## Gated features (coded, dormant until env set)
> **Where to set:** prod values go in **Vercel → project `nexez` → Settings → Environment Variables** (tick **Production**), then redeploy. CI/E2E secrets live in GitHub Actions; dev in `.env.local`. (Full sweep verified 2026-06-05.)

| Env var(s) | Unlocks | Status |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | the app runs at all (required) | ✅ set |
| `SUPABASE_SERVICE_ROLE_KEY` | `/api/v1/*`, account export/delete, webhook + cron DB writes | ✅ **set in prod** (verified via `/api/v1/health`) |
| `STRIPE_SECRET_KEY` **+** ≥1 of `STRIPE_PRICE_LAUNCH` / `STRIPE_PRICE_PRO` / `STRIPE_PRICE_SCALE` | subscription billing (`/dashboard/billing`) — needs the secret **and** a plan price ID | not set |
| `STRIPE_SECRET_KEY` | Nexez-hosted checkout (`/checkout/[slug]`) + negotiation escrow (`/api/negotiations/escrow`) | not set |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook — escrow capture + `price.updated` sync | not set |
| `LLM_API_KEY` (+`LLM_BASE_URL`/`LLM_MODEL`, OpenAI-compatible) | real LLM assist (Co-Pilot, analyzer, importer fallback, voice) | not set (deterministic) |
| `RESEND_API_KEY` (+`EMAIL_FROM`) | transactional email (`lib/email.ts`) — negotiation requests + bookings | not set (no-op) |
| `VERCEL_API_TOKEN` + `VERCEL_PROJECT_ID` (+`VERCEL_TEAM_ID`) | auto custom-domain attach + SSL (else manual mode) | not set |
| `OBSERVABILITY_WEBHOOK_URL` | `captureError` ships errors (else console) | not set |
| `CRON_SECRET` | protects `/api/cron/freshness` — **route is open if unset** | not set |
| `AGENT_VISIT_HASH_SALT` | dedicated salt for privacy-safe IP hashing | not set (falls back to SUPABASE_URL, then a default) |
| `NEXT_PUBLIC_SITE_URL` | canonical base URL in agent artifacts | falls back to `https://nexez.vercel.app` |

**NOT env vars** (correction): Square (`accessToken`), Acuity (`userId`+`apiKey`), Google Calendar (`accessToken`), Calendly (PAT), Shopify (shop+token), and the Stripe *import* are **user-supplied per request** — pasted in the UI / sent in the request body, with a sample fallback when absent. The Calendly **webhook receiver** uses a per-page secret stored in the `page_secrets` table, not env.

## Roadmap
`ROADMAP.md` was debloated this session (1929→45 lines): concise vision / quality bars / shipped / pending / governance. It's now short enough to read whole.

## Suggested next steps (pending)
- **Optional:** continue the `qa33-33` negotiation from `agreement_proposed` through to completion.
- Enable Supabase Auth **leaked-password protection** (dashboard toggle, config not code).
- **Email reach**: extend booking emails to the Stripe webhook + per-user notification preferences (Calendly booking emails already ship).
- Larger roadmap items: real LLM assist (gated on `LLM_API_KEY`), deeper bidirectional integrations, launch-prep differentiators (templates marketplace, seed directory pages). See `ROADMAP.md`.

## Dev / verification workflow notes (learned across sessions)
- **Test login**: the user pastes their account login in chat when authed verification is needed — **don't store it**; this repo is public. Clean up any test artifacts.
- **Claude Preview MCP** (`mcp__Claude_Preview__*`) drives a local dev server (`.claude/launch.json` → `npm run dev`, 127.0.0.1:3000, server `nexez-dev`). Quirks hit repeatedly:
  - **`useSearchParams`/canonical host**: dev redirects `localhost`→`127.0.0.1`; `next.config.ts` has `allowedDevOrigins: ['127.0.0.1']` so client components hydrate in the preview. Without it, nothing is interactive.
  - **Login form is controlled** — `preview_fill` alone didn't update React state; set values via native setter + dispatch `input`/`change`, then `form.requestSubmit()`. After submit there's a **post-login navigation race**; log in, wait ~5s, *then* `window.location.href` to the target.
  - **The headless browser intercepts `window.confirm()`/`alert()` natively** (auto-cancels) and eval runs in an **isolated world** → you cannot trigger UI deletes (they bail on `if(!confirm())`). Workaround: pull the supabase session JWT from the (chunked) `sb-…-auth-token` cookies, then `fetch` the Supabase **REST API** (`/rest/v1/pages?…`) with `apikey:<anon>` + `Authorization: Bearer <jwt>` (RLS allows owner). Anon key is `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `.env.local` (new `sb_publishable_…` format).
  - **Supabase + Vercel MCPs were both down (`net::ERR_FAILED`) for parts of this session** — git push / curl over HTTPS work fine; retry the MCPs, or use the REST-API approach above.
- **DB migrations**: Supabase MCP `apply_migration` (project `pvsotrzgnjpqrsndhgmu`) + write the `.sql` into `supabase/migrations/`. Idempotent. Never `supabase db push`.

## Quick verification commands
```bash
git fetch origin -q && git rev-list --left-right --count origin/main...main   # 0  0 == in sync
npm run lint -- --quiet && npx tsc --noEmit --incremental false && npm test && npm run build
```
