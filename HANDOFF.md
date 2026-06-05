# Nexez — Session Handoff

_Last updated: 2026-06-03 · HEAD `a557feb` (verify with `git rev-parse --short main`)_

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
- `origin/main` == local @ **`a557feb`**, clean tree.
- **173 tests passing**; lint/tsc/build all clean.
- **75 routes**, ~40 lib modules, **24 migrations** (all applied to prod + verified).
- Supabase **security advisors clean** EXCEPT the **Auth "leaked password protection"** toggle → enable in the Supabase dashboard (config, not code). Perf advisors are only no-traffic `unused_index` INFOs + acceptable multiple-permissive-policies on `pages`.

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

## Suggested next steps
- Apply the server-component + island pattern to the heavy `/dashboard/[id]` editor (still a large client component).
- Add a test for the middleware auth gate.
- A/B **variant serving** (random assignment + attribution) — only duplicate-variant + analytics exist today.
- Email notification delivery (needs a provider).
- Remove now-unused deps `clsx` / `tailwind-merge` / `class-variance-authority` (shadcn scaffold was removed).
- Enable Supabase Auth leaked-password protection (dashboard toggle).

## Quick verification commands
```bash
git fetch origin -q && git rev-list --left-right --count origin/main...main   # 0  0 == in sync
npm run lint -- --quiet && npx tsc --noEmit --incremental false && npm test && npm run build
```
