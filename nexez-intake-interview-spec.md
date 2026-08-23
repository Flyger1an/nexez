# Nexez - Seller Intake Interview (Platform Capability)

**Claude Code implementation prompt · v1 · 2026-07-06**

---

## 0. Read first

- `ROADMAP.md` (governance section is binding), `HANDOFF.md`, `AGENTS.md`
- `lib/importer.ts` - especially `ImportGuidance`, `ImportClarifyingQuestion`, `ImportClarifyingAnswer`, `llmExtractOffers`
- `lib/llm-engine/` - adapter pattern, `prompt-safety.ts`, `LLMClientFactory`
- `app/api/agents/nexie/` - threads / stream / approvals pattern (this spec mirrors it on the seller side)
- `lib/agent-page.ts` - `OfferItem`, `getReadinessScore`, `formatOfferLines`
- `lib/draft.ts` - `PageDraft`, `applyDraftOverlay`
- `lib/onboarding.ts` - activation checklist (will gain one step)
- `components/nexie-chat.tsx` - chat UI patterns to factor and reuse
- `apps/seller-mobile/app/onboarding.tsx` - the mobile consumer of this API

## 1. What we are building and why

Today, page creation is `/create`: a 3-step form wizard with importer assist. It works, but it is
data entry. We are building the **intake interview**: a conversational seller-side agent that
ingests what already exists (website, socials, integrations), extracts offers with the existing
importer, identifies what's missing or ambiguous, and **interviews the owner only about the
gaps** - then materializes a page draft the owner reviews in the existing builder and publishes.

The feeling to hit: the AI is genuinely interested in understanding the business so the business
succeeds on the platform. Twenty minutes of conversation, not forty form fields.

**Architecture principle (binding):** the nexez platform is the base layer. The interview is a
platform capability - a `lib/` service + API routes - consumed by every surface: web `/create`,
`apps/seller-mobile`, and any future surface. No interview logic lives in components. The web
chat panel and the mobile onboarding screen are thin clients of the same threads API, exactly as
Nexie already is for the buyer side.

## 2. Non-negotiables (inherited governance)

1. **Never invent.** The interview inherits the importer's core rule: if a fact isn't sourced
   from ingestion or stated by the owner, ask - don't fabricate. Every field on the final draft
   carries provenance: `imported` | `stated` | `suggested_confirmed`.
2. **`OfferItem` is the sacred data model.** The interview's output is `OfferItem[]` + page
   fields. Serialization goes through existing `formatOfferLines` (pipe format) for now - do not
   invent a parallel format. Internally, the interview state holds **native objects** so that
   when the JSONB migration lands, only the final write path changes. (See §9.)
3. **Human approval gates publish.** The agent proposes; the owner approves. Reuse the Nexie
   approval-card pattern: the interview may *request* commit/publish, never execute it silently.
4. **Dual philosophy preserved.** No changes to public agent HTML/manifests in this batch.
5. **All migrations additive + idempotent**, applied via Supabase MCP `apply_migration` +
   committed `.sql`. Never `supabase db push`.
6. **Verify:** `npm run lint -- --quiet` · `npx tsc --noEmit --incremental false` · `npm test` ·
   `npm run build` before commit.

## 3. The state machine (`lib/intake/`)

Pure, unit-tested, no I/O in the reducer - same discipline as `lib/editor-merge.ts`.

```
INGEST → EXTRACT → GAP_ANALYSIS → INTERVIEW ⇄ SYNTHESIS → REVIEW_HANDOFF → (builder/publish, outside the machine)
```

- **INGEST.** Collect sources: a URL (→ existing `/api/tools/import-site` path), an integration
  (→ existing Calendly/Stripe/Shopify/Square/Acuity importers), pasted text, or *nothing* ("I'm
  starting from scratch"). Multiple sources allowed; sources append to `IntakeSession.sources[]`.
- **EXTRACT.** Run existing `llmExtractOffers` / integration importers. Store the rich result
  (offers with confidence + source, faqs, page fields, importer's own `clarifyingQuestions`).
- **GAP_ANALYSIS.** Deterministic, pure function: `analyzeGaps(state): Gap[]`. Inputs:
  - importer `clarifyingQuestions` (already typed with `field` + `why`)
  - readiness rubric - which `getReadinessScore` components are unmet
  - `OfferItem` field coverage per offer (price? duration? serviceArea? offerType/rules?)
  - industry expectations from `lib/industry-catalog.ts` (e.g. a caterer should be asked about
    minimums, service radius, dietary options; a photographer about turnaround and licensing)
  - commerce posture: fixed vs negotiable, and if negotiable → the Smart Rules minimums
    (`lib/offer-rules.ts`: floor price, notice period, blackout, weekly cap)
  Output: prioritized `Gap[]` with `{ id, field, offerKey?, question, why, priority, kind }`.
  `kind: 'blocking' | 'quality' | 'opportunity'` - blocking gaps prevent a publishable draft;
  quality gaps raise readiness; opportunity gaps are upsells ("do you also do X?").
- **INTERVIEW.** The conversational loop. The LLM turns gaps into natural conversation -
  **batched 1–3 related questions per turn, never a laundry list**, acknowledging what it
  already learned ("Your site lists three wedding packages - do those prices still hold, and is
  travel included inside Austin?"). Owner answers free-form; the LLM maps answers back to
  structured `GapAnswer[]` (reusing `ImportClarifyingAnswer` where the gap came from the
  importer). Owner can say "skip", "I'll fill that later", or "just take me to the form" at any
  point - every exit lands in the builder with everything captured so far.
- **SYNTHESIS.** After each answered batch, fold answers into the working draft (native
  `OfferItem[]` + page fields + provenance). Re-run `analyzeGaps`; when no `blocking` gaps
  remain, the agent summarizes the draft and offers REVIEW_HANDOFF (plus optionally continues on
  `quality`/`opportunity` gaps if the owner is game).
- **REVIEW_HANDOFF.** Materialize via existing paths: create page (or `PageDraft` overlay on an
  existing page), serialize offers with `formatOfferLines`, route the owner to
  `/dashboard/[id]` (web) or the mobile review screen. The builder remains the single source of
  truth for editing - the interview never becomes a second editor.

## 4. Persistence

New migration: `intake_sessions`
```sql
create table if not exists intake_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  page_id uuid references pages(id),          -- set at REVIEW_HANDOFF (or when re-interviewing an existing page)
  status text not null default 'active',      -- active | handed_off | abandoned
  phase text not null default 'INGEST',
  state jsonb not null default '{}'::jsonb,   -- IntakeSession: sources, extraction, gaps, answers, working draft, provenance
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```
RLS: owner-only (`(select auth.uid()) = owner_id` init-plan form, per existing convention).
Sessions are resumable - the mobile app can start an interview on the couch and the owner can
finish on desktop. Messages ride inside `state.messages[]` (JSONB) for v1; promote to a table
only if volume demands it.

## 5. API surface (mirrors Nexie)

```
POST /api/agents/intake/threads            -- create session { source_url?, page_id? }
GET  /api/agents/intake/threads/[id]       -- resume: full state for any client
POST /api/agents/intake/threads/[id]/messages  -- owner turn in → agent turn out (cards + text)
POST /api/agents/intake/threads/[id]/commit    -- REVIEW_HANDOFF: materialize draft, return page id
POST /api/agents/intake/threads/[id]/ingest    -- add a source mid-conversation (url | integration | text)
```
SSE streaming variant mirrors `app/api/agents/nexie/stream` if present; otherwise
request/response is fine for v1 (interview turns are short).

**Agent tool schema** (function-calling, via `LLMClientFactory` adapters - provider-agnostic):
`ingest_url`, `ingest_integration`, `propose_offers`, `ask_gaps(gapIds, phrasing)`,
`record_answers(GapAnswer[])`, `set_page_field`, `request_handoff`. The reducer validates every
tool call against the state machine - the LLM cannot skip phases, invent offers
(`propose_offers` only accepts items derived from extraction or `stated` answers), or commit.
All prompts route through `prompt-safety.ts`. Rate-limit via existing `lib/rate-limit.ts`.

**Auth note:** unauthenticated visitors may run INGEST/EXTRACT/GAP_ANALYSIS/first questions as a
taste (same spirit as the current public importer teaser), but the session persists and commits
only for an authenticated owner - reuse the `/create?next=` post-signup return path.

## 6. Web client

- New entry: `/create` becomes a fork - **"Talk it through" (default, hero position)** vs
  **"Build with the form"** (the current wizard, fully preserved as the fallback and power path).
- Factor the chat shell out of `nexie-chat.tsx` into a shared `components/agent-chat/` primitive
  (message list, cards, approval card, streaming states, mic affordance) parameterized by
  endpoint + card renderers. Nexie migrates to the primitive; intake consumes it. One chat
  system, two agents - buyer and seller - which is also the brand story.
- Card types for intake: `source_ingested` (what was found, offer count, confidence),
  `gap_batch` (the questions, tappable quick answers where enumerable), `draft_summary`
  (offers + readiness ring, per-field provenance chips), `handoff` (approval card → builder).
- Design system: existing tokens/rules apply (teal = agent-ready state, periwinkle =
  interactive, amber = attention on blocking gaps; prism confined to hairlines/rings; respect
  the gloss budget). Readiness ring in `draft_summary` is the one place the prism ring earns
  its keep.

## 7. Mobile client

`apps/seller-mobile/app/onboarding.tsx` replaces its current flow with the same threads API.
Mobile is where the conversational form-factor pays most (voice input, couch context). Keep the
client thin: no gap logic on device - render agent turns and cards, post owner turns.

## 8. Activation + telemetry

- `lib/onboarding.ts`: the `create` step description gains the interview path; add
  `interview_completed` to the checklist derivation when a session reaches `handed_off`.
- Track per-session: sources used, gaps asked/answered/skipped, time-to-handoff, publish rate
  vs. the form path, per-gap abandonment. This is the dataset that tunes `analyzeGaps`
  priorities later. Route through existing `lib/analytics.ts` / `observability.ts` hooks.

## 9. Relationship to the JSONB `OfferItem` migration (prerequisite-lite)

The interview holds native `OfferItem` objects internally and only serializes at the final
write. This is deliberate: when the `offers jsonb` + `offer_schema_version` migration lands (the
separately-specced fix for the pipe-marker format), the interview needs a one-line change at
`commit`. Do **not** deepen the pipe format: no new `[[MARKER]]`s for interview provenance.
Provenance lives in `intake_sessions.state`, not in the offer serialization.

## 10. Test plan (per governance)

- **Unit** (`lib/intake/__tests__`): reducer transitions (every phase, every exit path);
  `analyzeGaps` fixtures per industry (caterer, photographer, plumber, consultant - assert
  blocking vs quality classification); answer-folding idempotence; provenance integrity
  (no field flips to `stated` without a `GapAnswer`).
- **Route tests** (vitest + `test/supabase-mock.ts`): auth/tenancy on all five routes; the LLM
  adapter mocked - assert tool-call validation rejects phase-skips and invented offers; commit
  materializes a page owned by the caller and serializes offers losslessly (roundtrip through
  `parseOfferLines`).
- **Component**: agent-chat primitive render states; gap_batch quick answers; Nexie regression
  after the factor-out.
- **E2E** (Playwright): interview smoke - start from a seeded URL fixture → answer two gap
  batches → handoff → assert builder shows the offers → publish → public page + `agent.json`
  reflect interview-stated fields.

## 11. Sequencing (each step ships green)

1. `lib/intake/` state machine + `analyzeGaps` + full unit suite (no UI, no API - pure).
2. Migration + threads API + route tests (LLM mocked).
3. Agent-chat primitive factor-out + Nexie regression green.
4. Web `/create` fork + intake client + E2E smoke.
5. Mobile onboarding consumes the API.
6. Telemetry + onboarding checklist wiring; docs (`ROADMAP.md` Shipped entry, `HANDOFF.md`).

## 12. Explicitly out of scope (v1)

Voice-first mode (mic affordance only), re-interview of stale pages (freshness cron hook -
natural v2), buyer-side changes, any public manifest changes, the JSONB migration itself,
POS-driven live sync.
