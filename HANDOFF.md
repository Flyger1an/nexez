# Nexez — Session Handoff

_Last updated: 2026-06-04 · HEAD `a19562a` (verify with `git rev-parse --short main`)_

## Project
**Nexez** helps businesses create dedicated, highly structured pages optimized for **AI agents** to discover, understand, and purchase from. Dual philosophy: **premium glassmorphism human dashboard** vs **brutally clean/semantic HTML for agents** on public `[slug]` pages. A core objective is **deploying agent-optimized pages to custom domains**, managed from the Nexez backend.

## Stack & critical conventions
- **Next.js 16.2.7 (App Router, Turbopack)** — ⚠️ `AGENTS.md` warns this is a modified Next with breaking changes vs training data; **read `node_modules/next/dist/docs/` before using framework APIs**. Middleware lives in **`proxy.ts`** at the repo root (exports `proxy`), NOT `middleware.ts`.
- **Supabase** (Postgres + RLS + Auth). Clients:
  - `utils/supabase/server.ts` → `createClient(cookieStore)` (server components / route handlers)
  - `utils/supabase/client.ts` → `createClient()` (browser)
  - `utils/supabase/admin.ts` → `createAdminClient()` / `hasSupabaseAdminEnv()` (service-role, gated)
- **Deploy:** Vercel auto-deploys on push to `main`. Prod domain `nexez.vercel.app` (preview/branch URLs are SSO-gated; production is public). Vercel project `prj_uREcprpInoeHVhgV7aWc14TRsnLi`, team `team_rwkVXglmM5D0MPXjGTqOPVKO`. Supabase project `pvsotrzgnjpqrsndhgmu`.
- **Verify EVERY change:** `npm run lint -- --quiet` · `npx tsc --noEmit --incremental false` · `npm test` · `npm run build`.
- Commit messages end with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Push to `main` directly (the user's workflow).
- **The user commits to `main` in parallel** (UI shell, homepage, `/support`). Always `git fetch` + check `git rev-list --left-right --count origin/main...main` before/after edits. Keep risky changes in lib/API/test/DB; coordinate before large UI-shell rewrites.
- DB migrations: apply via the **Supabase MCP `apply_migration`** and also write the `.sql` into `supabase/migrations/`. **Do NOT `supabase db push`** — tracking-table versions differ from repo filenames (all migrations are idempotent).

## Current state (verified this session)
- `origin/main` == local @ **`a19562a`**, clean tree. Vercel auto-deploys on push; prod verified live.
- **193 tests passing** (33 files); lint (`--quiet`) / tsc / build all clean.
- **75 routes**, **24 migrations** (all applied to prod). 1 new migration this session: `20260613003000_add_ab_impression_event.sql` (applied + verified).
- Supabase **security advisors clean** EXCEPT the **Auth "leaked password protection"** toggle → enable in the Supabase dashboard (config, not code).

## This window's work (2026-06-04, commits `4fee86f`→`a19562a`)
Big feature/polish/refactor session. Highlights, newest first:
- **`a19562a` Gated email** (`lib/email.ts`, Resend-compatible, dormant w/o `RESEND_API_KEY`): `/api/negotiations` emails the page's contact on a new request (offer/budget/timeline/agent/msg + inbox link) via `after()`. +4 tests.
- **`ccc7e0d` Dedicated Pages section** (the big new UX): `/dashboard/pages` = `components/PagesManager.tsx` (status tabs All/Published/Drafts via `?status=`, **bulk actions** publish/unpublish/delete, select-all). Nav `components/PlatformShell.tsx` gained a **"Pages"** item with nested All/Published/Drafts sub-items. Extracted shared `components/dashboard/PageCard.tsx` (used by Overview + manager) and pure `lib/duplicate-page.ts` `buildDuplicatePayload` (deterministic collision-free slug — **no `Math.random`**, satisfies React-compiler purity lint).
- **`8c49bdc` / `e28d1fd` Duplicate page**: per-card action on dashboard/Pages + a **Duplicate** button in the editor action bar (`app/dashboard/[id]/page.tsx`) — clones content into a new unpublished draft (no domain/verification). Also polished the Tools "Connect more tools" box.
- **`ab3be32` / `91ccf65` Tools page de-monolith**: `app/dashboard/tools/page.tsx` 1017→~350 lines. Extracted `components/tools/Importers.tsx` (Stripe/Shopify/Acuity), `components/tools/CalendlyTool.tsx`, `components/tools/ImportResult.tsx`. Relocation-only (import logic unchanged). Verified the Stripe + Calendly flows end-to-end logged in (live API error paths).
- **`12cf7fc` / `56eef9f` Cleanup**: removed dev-shorthand/"stub"/"(Demo)"/"Phase 3" copy from tools + integrations + marketplace + dashboard; extracted `getReadinessInsight` to `lib/analytics.ts` (tested).
- **`0e4c3cb` Platform-wide light/dark/system theme** (dark default): `components/ThemeToggle.tsx` + `lib/theme.ts` (no-flash `<head>` script in `app/layout.tsx`). globals.css **remaps the finite set of hardcoded neutral utilities** (`text-white`, `bg-black`, `text-zinc-*`, `bg-white/x`, `bg-black/x`, `border-white/x`, `bg-[#hex]`, **plus `hover:`/`active:`/`group-hover:` variants**) to theme tokens that flip by mode. Unlayered rules win the cascade. **Public agent pages locked to dark.** Accent tints darkened on light. Verified light+dark across homepage/login/dashboard/analytics/tools/integrations/marketplace.
- **`1bb9166`→`b79a416` Homepage redesign** (category-defining): animated aurora backdrop, analytics command-center mock, bento grid (count-up gauge, typewriter agent.json, copy button), logo marquee, dual-philosophy "humans vs agents" split with toggle, KPI count-ups, hero parallax, premium footer, "Deploy your first AI agent–optimized page in seconds" copy. **Renamed demo brand Acme→Axle (axlestrategy.com)** everywhere user-facing (legal).
- **`24ac527` Real A/B variant serving**: `OfferItem.ab_test`/`ab_label`, sticky `nx_ab` bucket cookie set in `proxy.ts`, `lib/ab-testing.ts` (grouping/served-index/rollup), public page serves ONE variant/visitor (real indices preserved), `logCheckoutEvent` auto-attributes, `ab_impression` events, analytics "A/B Tests" panel, builder groups variants.

⚠️ **`.claude/launch.json`** is untracked (local preview config for the Claude Preview MCP) — intentionally not committed.

## What's built (Phases 1–8 + G21, all live)
Importer (+gated LLM fallback), Visual Builder (availability signals, A/B duplicate-variant, LLM Enhance), analytics (Recharts, demand insights + unserved-query gap analysis, conversion funnel), 6 integrations (Calendly/Stripe/Shopify/Square/Acuity/GCal), per-offer controls/embeds/versioning, **custom-domain hosting** (host→serve via `proxy.ts`, Vercel SSL provisioning, connection wizard, brand-root `agent.json`/`mcp.json`/`llms.txt`, multi-page domains, white-label branding + inheritance, draft→preview→publish staging, deployments/rollback), simulator, AI Co-Pilot, **real MCP JSON-RPC endpoint** `/[slug]/mcp`, negotiations end-to-end + receipts, trust/badges (`/[slug]/badge.svg` + `/[slug]/badge.json`), marketplace, **leaderboard**, programmatic **API + keys** (`/api/v1/*`), account export/delete, team invites + collaborator RLS, in-app notifications, rate limiting, observability hook, freshness-monitor cron.

## Architecture notes for common edits
- **Core types/helpers:** `lib/agent-page.ts` — `OfferItem`, `AgentPage`, `PUBLIC_PAGE_SELECT`/`OWNER_PAGE_SELECT`/`BASIC_OWNER_PAGE_SELECT`, `getReadinessScore`, `getTrustScore`, `getCheckoutOffers`, `getBaseUrl`, availability helpers.
- **Agent artifacts:** `lib/agent-manifest.ts` (`buildAgentPagePayload`), `lib/mcp-server.ts` (JSON-RPC), `app/[slug]/{agent.json,mcp.json,mcp,llms.txt,badge.svg,badge.json}`.
- **Custom domains:** `lib/custom-domain.ts` (pure helpers: host detection, path→slug, artifact hrefs), `proxy.ts` (host resolution + rewrite + auth gate via `updateSession`), `lib/vercel-domains.ts` (gated), `app/api/custom-domain`.
- **Dashboard:** `app/dashboard/page.tsx` = **server component** (auth + parallel data fetch) → `app/dashboard/DashboardClient.tsx` = client island seeded from `initial` props (co-located so relative imports are unchanged). Sidebar/nav is provided by `components/PlatformShell.tsx`, not the dashboard page.
- **App shell:** root `app/layout.tsx` → `components/PlatformFrame.tsx` (thin gate: `usePathname` + `next/dynamic`) → `components/PlatformShell.tsx` (heavy nav/search/supabase, loaded only on platform routes, auth-aware: hides dashboard nav from anonymous).
- **Auth gating:** `utils/supabase/middleware.ts` (`updateSession`) redirects unauthenticated `/dashboard/*` → `/login?next=…`. `/create` is public; Publish without auth saves draft to `sessionStorage` (`nexez_pending_page`) + shows a "create account to publish" modal; draft restored on return.

## Gated features (coded, dormant until env set)
| Env var(s) | Unlocks | Status |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | `/api/v1/*`, account deletion | ✅ **set in prod** |
| `VERCEL_API_TOKEN` + `VERCEL_PROJECT_ID` (+`VERCEL_TEAM_ID`) | auto domain attach + SSL (else manual mode) | not set |
| `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` | negotiation escrow | not set |
| `AGENT_VISIT_HASH_SALT` | privacy-safe IP hashing | not set (default fallback) |
| `CRON_SECRET` | protects `/api/cron/freshness` (cron in `vercel.json`) | not set |
| `LLM_API_KEY` (+`LLM_BASE_URL`/`LLM_MODEL`, OpenAI-compatible) | real LLM-assist (builder Enhance via `/api/ai/enhance`, importer fallback) | not set (deterministic) |
| `OBSERVABILITY_WEBHOOK_URL` | `captureError` ships errors (else console) | not set |
| `RESEND_API_KEY` (+`EMAIL_FROM`) | transactional email (`lib/email.ts`) — emails the business on a new negotiation request | not set (no-op) |

## Roadmap
`ROADMAP.md` is the running source of truth — append an `IMPLEMENTED`/burst entry after each change (this has been the cadence). It's very long; grep recent dated sections rather than reading the whole file.

## Suggested next steps (pending)
- **Editor de-monolith**: `app/dashboard/[id]/page.tsx` is still ~1640 lines, `'use client'`, ~30 useState. Deeply client-coupled (localStorage integration status, sessionStorage reanalysis/restore handoffs, URL-param flows) — a server-component+island split is high-effort/high-risk on the most critical workflow. Tackle carefully, verify edit→save→publish→reanalyze→versions with the test login.
- **Email reach**: extend `lib/email.ts` beyond negotiations → emails on **bookings** (Calendly/Stripe webhooks in `app/api/webhooks/*`), and/or a per-user notification-preferences toggle. Currently emails `page.contact_email`; consider the account email via service-role lookup.
- **Test the middleware auth gate** (`utils/supabase/middleware.ts` `updateSession` redirect) — still untested.
- **Bulk "Duplicate"** in the Pages manager bulk bar (single duplicate exists; bulk publish/unpublish/delete exist).
- Remove now-unused deps `clsx` / `tailwind-merge` / `class-variance-authority` (shadcn scaffold removed).
- Enable Supabase Auth **leaked-password protection** (dashboard toggle, config not code).
- Optional light-mode long-tail: the neutral-utility remap covers the enumerated set; a rare hardcoded class on a deep screen could look slightly off in **light** mode (dark default is unaffected). Patch by class if reported.

## Dev / verification workflow notes (learned this window)
- **Test login**: the user can provide a login to verify authed screens (their own account — **ask them in chat**, don't store it; this repo is public). It has **3 real pages** — never leave test artifacts; clean up any duplicates/drafts you create.
- **Claude Preview MCP** (`mcp__Claude_Preview__*`) drives a local dev server (`.claude/launch.json` → `npm run dev`). Quirks hit repeatedly:
  - **`useSearchParams`/canonical host**: dev redirects `localhost`→`127.0.0.1`; `next.config.ts` has `allowedDevOrigins: ['127.0.0.1']` so client components hydrate in the preview. Without it, nothing is interactive.
  - **Login form is controlled** — `preview_fill` alone didn't update React state; set values via native setter + dispatch `input`/`change`, then `form.requestSubmit()`. After submit there's a **post-login navigation race** (often lands back on `/login` or strays to `/`); log in, wait ~5s, *then* `window.location.href` to the target.
  - **The headless browser intercepts `window.confirm()`/`alert()` natively** (auto-cancels) and eval runs in an **isolated world**, so overriding `window.confirm` from eval doesn't reach page JS → you **cannot trigger UI deletes** (they bail on `if(!confirm())`). Workaround that worked: pull the supabase session JWT from the `sb-…-auth-token` cookies in the browser, then `fetch` the Supabase **REST API** (`/rest/v1/pages?...`) with `apikey: <anon>` + `Authorization: Bearer <jwt>` to DELETE (RLS allows owner). Anon key is `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `.env.local`.
  - The **Supabase MCP `execute_sql`** was flaky (`net::ERR_FAILED`) for parts of the session — retry, or use the REST-API approach above.
- **DB migrations**: Supabase MCP `apply_migration` (project `pvsotrzgnjpqrsndhgmu`) + write the `.sql` into `supabase/migrations/`. Idempotent. Never `supabase db push`.

## Quick verification commands
```bash
git fetch origin -q && git rev-list --left-right --count origin/main...main   # 0  0 == in sync
npm run lint -- --quiet && npx tsc --noEmit --incremental false && npm test && npm run build
```
