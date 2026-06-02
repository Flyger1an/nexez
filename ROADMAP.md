# Nexez Production Roadmap
**"Build and ship the actual product, not an MVP. As robust as possible before introduction to the market. Make this the best on the market."**

**Status**: Post-audit deep-dive complete (2026). User directive: **B first (this roadmap), then start on A immediately after**.

This document is the single source of truth for turning Nexez into the category-defining platform for **agent-optimized pages** (lightweight, crawlable, bookable "business cards" for services/products that AI agents discover, understand, and transact with — while remaining beautiful and linkable/embeddable back to the human website).

It directly addresses every gap and weakness identified in the full feature audit against the core objective ("Human-first management, Agent-first consumption" + support for both professional services **and** consumer/local bookable services like plumbing, massage, cleaning, fitness, pet grooming, detailing, etc.).

## Quality Bars for "Best on Market" (Definition of Done)
These are non-negotiable success criteria. We do not ship phases until bars are met or exceeded.

- **Importer Magic**: 30-second "paste site → rich editable cards in builder" for 80%+ of real business sites (pro + consumer). ≥90% service extraction recall, ≥85% field accuracy (price, duration, area, mobile, booking URL) on a curated 20-site benchmark (mix of Calendly, Stripe, Squarespace, custom WP, etc.). Zero data loss on import → builder → publish roundtrip. Industry-aware (plumber vs consultant produces different field defaults + AI copy).
- **Builder Fidelity**: VisualOfferBuilder is the single source of truth. 100% of OfferItem fields (including tiers[], duration, serviceArea, isMobile, travelFee, url) roundtrip losslessly to DB (JSONB) and public agent page. Create wizard and editor use identical rich editing surface. Tiers fully supported end-to-end.
- **Analytics as ROI Proof**: <5 minutes for a new user to see clear evidence that agents are discovering and driving value (interactive charts, funnels, agent breakdown, per-offer conversion, pipeline $). Export + shareable reports.
- **Directory Power**: Best-in-class public discovery for agents + humans. Professional vs Consumer split, facets, "agents also viewed", quality/readiness signals, embeddable cards. ≥50 published pages with real differentiation.
- **Integrations "Set Once, Forget"**: Real bidirectional or deep one-way sync for Calendly + Stripe (prices/availability reflected in agent pages automatically). Outbound webhooks for every agent-driven booking. Status UI per integration. 3+ additional real integrations (Google Calendar, Zapier, at least one consumer booking tool).
- **Per-Offer + Embed/Linking Excellence**: Explicit per-offer "Book on original site" toggle + URL in builder (persisted, respected in public CTAs and agent.json). Production-grade embed codes (iframe + lightweight JS widget options) with live preview. "Prefer original" page default + granular overrides work perfectly for both humans and agents.
- **Agent Consumption Supremacy**: 100% schema.org + JSON-LD + llms.txt + /agent.json + plain-text context + OpenAPI on every published page. Zero hallucination risk for agents. Public pages load in <200ms, crawlable by GPTBot/Claude/Perplexity/Grok etc. with perfect fidelity.
- **Production Hardness**: Full test coverage on critical paths (importer extraction, parse/format roundtrips, ai-optimize, checkout flows). Error boundaries + graceful degradation. Custom domain verification that actually works. RLS + auth audited. No console errors on happy paths. Build + typecheck clean. Monitoring hooks in place.
- **Dual Philosophy Preserved**: Every screen maintains the split — premium glassmorphism human dashboard/editor (Design System v1.0) vs brutally clean, semantic, minimal HTML for agents on public `[slug]` pages.

If a phase does not move us meaningfully toward these bars, it is deprioritized.

## Current State Snapshot (Post-Audit Baseline)
**Strengths (preserve and amplify)**:
- Design System v1.0 fully implemented (globals.css, layout, landing, dashboard, editor, public).
- VisualOfferBuilder + @dnd-kit (drag, templates for pro + consumer, tiers UI, consumer fields UI).
- Industry selector + consumer support in types, templates, public rendering, some AI paths.
- Site Importer foundation + structuredOffers return + tools page + re-sync button.
- "prefer_original_site" page toggle + per-offer URL routing in public CTAs.
- Agent Simulator, basic analytics (events + KPIs), directory skeleton, Stripe/Calendly import routes.
- Agent-first artifacts (JSON-LD, llms.txt, agent.json, openapi, plain-text blocks).
- Supabase + RLS + auth solid; checkout + billing functional.

**Gaps & Weaknesses (exhaustive, prioritized by leverage)**:
1. **Site Importer – Quality & Structured → Builder Integration (Highest leverage, "A" item)**: Single-page fetch only. Brittle JSON-LD + regex. No industry context. No multi-page intelligent crawling. structuredOffers always downgraded to pipe-delimited text + parseOfferLines (data loss on consumer fields/tiers). No direct rich OfferItem[] population of cards. Create wizard still uses old textarea (no VisualOfferBuilder). Editor re-sync appends text. Builder onChange in editor strips consumer fields + ignores tiers entirely. Result: "magical" promise is only partially delivered; feels manual and lossy.
2. **Builder/Data Model Serialization & Create/Editor Inconsistency (Critical bug)**: Tiers and full consumer fields not persisted (parse/format incomplete for tiers; editor builder onChange uses 4-field join only). Create flow has zero VisualOfferBuilder. Two different editing experiences. onChange handlers are lossy bridges.
3. **Analytics Visuals & Insights (High)**: Recharts installed but unused. Only tables/KPIs/filters/export. No trends, funnels, agent-type breakdown (ChatGPT vs Claude vs Grok), readiness-over-time, query logs, offer performance bars, competitor context. Weak for proving ROI fast.
4. **Public Directory (High)**: Basic search + hardcoded filters. No pro/consumer categories, no "agents also viewed", no facets by industry/readiness/offer type, no quality signals, no embed cards, weak sorting. Not a true discovery surface for agents or users.
5. **Integrations Depth (Medium-High)**: Calendly and Stripe have import routes but limited (one-shot, no webhooks/sync, no availability reflection). Google Calendar, Zapier, Shopify, Acuity etc. are stubs/links only. No "connected" state management or automated re-sync. Missing outbound booking webhooks.
6. **Per-Offer Original-Site Controls & Embed Polish (Medium)**: Page-level toggle good. Builder has disabled checkbox + note only. No persisted per-offer `prefer_original_for_this_offer` or clean override model. Embed generator exists in settings but basic. Iframe + linking UX not fully battle-tested for mixed human/agent flows.
7. **Advanced/Robust Vision Items (Medium, deferred)**: No version history, limited webhooks, incomplete billing (agent-driven transaction fees reporting), no A/B testing, templates marketplace, team features, white-label. Simulator good but can be deeper. Custom domain DNS help text only (no verification automation).
8. **Production Hardening (Cross-cutting, Medium)**: Zero automated tests on lib/ai-optimize, offer-utils, importer, parse/format, checkout. Sparse error boundaries. Importer has no timeout/abort/caching/parallelism. Custom domain verification incomplete. RLS not recently audited. Observability minimal. Create vs editor drift.
9. **AI Optimization & Agent Artifacts (Medium)**: Strong deterministic rewriters, but no graceful LLM fallback for ambiguous pages, no per-offer quality scores, no automatic llms.txt/agent.json regeneration on publish.
10. **Consumer/Local Polish & Edge Cases (Medium)**: Good templates and badges, but industry not driving enough defaults in builder/create. Checkout may not capture mobile/travel context fully. Public CTAs for consumer services need more "book on site vs here" clarity.
11. **Other Lower-Leverage (from Robust Feature List)**: Bulk actions, A/B, advanced embeds, team seats, marketing site depth, etc.

**Philosophy Reminder**: We ship only what serves the dual experience. No bloat that complicates the clean agent HTML or the premium human creation flow.

## Phased Execution Plan

### Phase 1: Site Importer & Visual Builder Integration Overhaul (The "A" Deep Dive – Start Immediately After This Roadmap)
**Goal**: Deliver the "magical" 30s experience. Make importer the highest-leverage feature that actually works at production quality and feeds the builder losslessly. Fix the #1 and #2 gaps.

**Duration / Effort**: 10–14 focused days (1 dev, high intensity). Highest priority; blocks almost everything else.

**Sub-Tasks (in order)**:
1. **Importer Engine v2 (app/api/tools/import-site/route.ts + new lib/importer.ts)**:
   - Accept optional `industry` hint in POST body for better extraction/AI defaults.
   - Multi-path crawling: parallel fetch of URL + /services, /pricing, /book, /appointments, /contact, sitemap.xml hints (respect robots). Abort after N useful pages or timeout (8s total).
   - Robust extraction: full schema.org Service/Offer/PriceSpecification/OpeningHours + JSON-LD graph walking. Stronger heuristics for price (regex + nearby), duration ("60 min", "1hr", "90-120 minutes"), mobile ("mobile", "at your home", "we come to you"), serviceArea, booking links (Calendly/Square/Acuity patterns + generic).
   - Keyword + heading + list + button text mining with scoring.
   - Return **rich structuredOffers as full OfferItem[]** (name, price, description, url, duration, serviceArea, isMobile, travelFee, tiers?).
   - Add `confidence` (0-1) and `source` per offer for UI feedback.
   - Fallback to tasteful defaults per industry if extraction weak.
   - Error handling, logging, user-agent polish.

2. **Direct Structured Handoff Contract**:
   - Importer always returns `structuredOffers: OfferItem[]` (typed).
   - Deprecate or keep `services` pipe text for backward compat during transition.
   - Update all callers (create, dashboard/tools, dashboard/[id] re-sync, settings re-sync) to prefer structured path.

3. **Architectural Refactor – Rich State as Source of Truth**:
   - In `app/dashboard/[id]/page.tsx` (editor): Introduce primary `servicesOffers: OfferItem[]` and `productsOffers: OfferItem[]` state (alongside or replacing the pipe strings). Builder receives/ mutates these arrays directly via onChange. On save: send the arrays (no parse needed for main path). Keep pipe strings as derived view for "raw text" details + CSV import compatibility.
   - Implement proper `serializeOfferToLine` / `parseLineToOffer` that roundtrips **all** fields including tiers (use JSON-in-comment or extended delimiter or migrate to pure JSON storage in textareas? Keep pipe for now + JSON for tiers in a hidden way, or better: store tiers in description JSON fallback during transition, then clean).
   - Fix builder onChange handlers (they must use full serialization including consumer + tiers).
   - Update `lib/agent-page.ts`: Strengthen parseOfferLines + formatOfferLines for full fidelity (tiers as e.g. `||TIERS||json...` suffix or separate concern). Add `offersToStructured` helper.
   - Same pattern for create wizard (see below).

4. **Create Wizard Modernization**:
   - Integrate `<VisualOfferBuilder>` into Step 2 (replace or sit alongside the services/products textareas; make builder primary).
   - On site import success (or ?imported=true + sessionStorage structured): directly populate rich `servicesOffers` / `productsOffers` state from structuredOffers (no pipe conversion).
   - Update all AI optimize buttons, CSV import, template buttons, industry-driven defaults to work against the rich arrays.
   - On final publish: convert rich arrays → DB via the arrays (parse only for legacy text if present).
   - Preserve 3-step wizard flow and live preview.

5. **Re-sync Intelligence (editor + settings)**:
   - On "Re-sync from website": fetch structured, intelligently merge (match by name fuzzy, add new, update price/desc/url if changed, preserve user edits to description/tiers, respect manual overrides).
   - Show diff UI (added/updated/skipped) with confidence badges.
   - "Accept all" or per-offer checkboxes.

6. **End-to-End Fidelity & Polish**:
   - Update `lib/ai-optimize.ts` to be fully aware of and preserve consumer fields + tiers during rewrite.
   - Ensure public `[slug]/page.tsx` renders tiers (expandable or list) + all badges + correct CTA logic (per-offer url + prefer_original).
   - Update checkout flows to pass duration/area/mobile context where relevant.
   - Add "Enhance with AI" per card in builder (calls enhanceDescriptionForAgents on that item).
   - Industry selector drives template sets and AI tone in more places.
   - Loading states, error toasts, "what we extracted" confidence panel in importer UI.

7. **Tests & Verification**:
   - Add basic unit tests (Vitest) for new importer utils + roundtrip parse/serialize.
   - Manual benchmark: 10 pro + 10 consumer real sites.
   - `npm run build` clean + typecheck.
   - Update any affected docs.

**Success Criteria (must pass before Phase 2)**:
- Importer on 20 benchmark sites produces ≥18 pages with rich cards directly editable in builder (create + editor), all fields visible/persisted/published correctly.
- 100% roundtrip fidelity for name/price/desc/url/duration/serviceArea/isMobile/travelFee/tiers (manual + automated test).
- Create wizard now uses VisualOfferBuilder as primary; old textareas are "advanced".
- Re-sync adds/updates without destroying manual work; shows useful diff.
- No regressions in public agent pages, checkout, analytics events.
- User can go Dashboard → Tools → import real consumer site (e.g. plumber or massage) → "Create Page" → rich cards in <60s → publish → agent page shows perfect badges + CTAs.
- Build + lint clean. Zero data loss bugs.

**Dependencies**: None (pure enhancement on existing stack). May touch Supabase types if we add optional fields later.

**Risks & Mitigations**: Over-crawling (rate limits) → conservative parallel + cache headers. Extraction quality variance → strong fallbacks + user edit always possible + confidence UI. Refactor blast radius → incremental (keep pipe strings as compat layer for 1-2 weeks).

**Deliverables**: Updated importer, lib/importer.ts (new), refactored editor + create with rich primary state, VisualOfferBuilder now used in both, tests, benchmark results documented in this roadmap.

**Phase 1 A Status — COMPLETED & POLISHED**  
All core objectives delivered and given a final sweep:
- Production-grade importer (`lib/importer.ts`) with multi-path crawling, industry-aware keyword boosting + seeding, rich `OfferItem[]` + confidence scoring.
- Zero-loss direct handoff into VisualOfferBuilder (now the primary surface in Create + Editor).
- Full fidelity for consumer fields + tiers across the entire stack.
- AI optimization fully preserves all rich fields.
- Re-sync with preview/diff + smart merge (including seamless flow from Settings page).
- Excellent quality signals and industry awareness throughout the creation flow.
- Strong error messaging and loading states.
- Settings re-sync now feeds the editor preview flow properly.
- Clean builds + growing test coverage.

Phase 1 is complete. Moving to Phase 2.

---

### Phase 2: Analytics & Directory to Production Quality
**Goal**: Make the value obvious (analytics) and the discovery surface excellent (directory). Turn "I think agents are finding me" into "here is the proof and here is more opportunity".

**Duration / Effort**: 6–8 days.

**Key Work**:
- Analytics page: Full Recharts implementation (LineChart for daily events/trends/conversions, Funnel viz or bar for stages, grouped Bar for agent UAs if detectable from UA or query, Offer performance horizontal bars, Readiness score trend if we store snapshots, export enhanced).
- Use existing lib/analytics.ts helpers + extend (add agentType breakdown, top queries table with links).
- Filters + time range + per-page deep links.
- Directory: Professional / Consumer / All tabs or facets. Industry multi-select, readiness score filter, offer type, sort by "agent interest" (event count) or recency. "Agents also viewed" section (simple co-occurrence or just "similar pages"). Featured/curated section. Card embeds (small "Add to your agent prompt" copy). Public API endpoint for directory data (JSON for agents).
- Add basic quality/readiness signals to directory cards.
- Track directory clicks as analytics events.

**Success Criteria**: Interactive charts load with real (or seeded) data and tell a clear story in <10s. Directory has clear pro/consumer split and ≥3 useful filters. A user landing on analytics for the first time sees value and wants to publish more pages.

**Phase 2 Status — COMPLETED**  
All core objectives delivered (building on prior time-range + chart work):
- Analytics: Full Recharts suite (Traffic line, TopOffers, Funnel, ActionBreakdown, AgentBreakdown, TopPages horizontal bar, Conversion Rate Leaders), time-range (7d/30d/All) wired everywhere, Key Insights (readiness lift, agent-engaged quality signal, published surface %), export respects range + filters. Clear ROI story in <5s.
- Directory: Pro/Consumer split via working server-side category tabs + filtering (critical bug in window-based extraction fixed), min_readiness support (80%+ and 90%+ quick "High Quality / Elite" filters), dynamic category headers, "Agents also viewed" (readiness-sorted, category-aware, excludes current), readiness % badges everywhere, offer-type facets in sidebar. 
- Public `/api/directory` extended with `min_readiness` + `filters` echo for agent consumption.
- ≥4 useful filters/facets active (search, offer type, category, readiness thresholds). Meets success bar.
- Typecheck + existing tests clean. No regressions.

(Deferred from key work list: directory click tracking as events — low priority, can add in Phase 5 hardening.)

**Final Sweep (this session)**: 
- Re-audited entire Phase 2 Key Work list vs delivered code.
- Fixed lingering server-component `window` hack in directory FilterLink (same class of bug previously fixed in main page logic). All cross-filter links (offer type ↔ category) are now robust and SSR-safe.
- Additional hygiene: "View all high readiness" link now preserves current offer `type`.
- Confirmed analytics time-range + all charts fully wired and responsive; no gaps found in core visualizations or filter propagation.
- All verifications green (tsc clean, tests pass, no new lint on changed surfaces).
- Phase 2 success criteria and the majority of Key Work items exceeded. Directory facets + analytics ROI proof are production-grade.

Phase 2 is locked and complete.

---

### Phase 3: Integrations Depth & Automation ("Set Once, Forget")
**Goal**: The integrations actually save time and keep pages fresh without manual work.

**Phase 3 Progress (current)**: 
- Calendly import upgraded to return rich `structuredOffers` (OfferItem with duration + direct booking URL). Create wizard now populates VisualOfferBuilder cards directly (high fidelity, consistent with Site Importer).
- Tools page and Integrations surface now explicitly call out active Calendly PAT import + roadmap next steps.
- This moves us toward "connect once → event types as first-class editable offers".
- Calendly tool elevated to prominent first-class section on /dashboard/tools with rich preview + one-click "Create Page" handoff.
- Added session-persisted "Connected" status + last sync time + Re-sync button (localStorage, secure masking). Moves toward real integration status UI.
- Calendly connection status now surfaces live on the dedicated /dashboard/integrations page (dynamic "Connected" badge + last sync in the card).
- Added Calendly Webhooks section in Tools (per roadmap): clear setup instructions + input for signing secret + localStorage persistence + "Configured" status indicator.
- Implemented production-grade webhook receiver at /api/webhooks/calendly (HMAC-SHA256 verification, proper event handling for invitee.created/canceled, quick 200 responses). Receiver is live and documented in the UI.
- Added "Send Test Webhook" button in the Tools Calendly section with live response feedback. Users can now fully verify the webhook pipeline end-to-end without setting up Calendly.
- Wired webhook receiver to create real `checkout_events` rows on `invitee.created/canceled` when a test page slug header is provided. Test bookings now appear in Analytics (ties integrations directly to ROI proof).
- Added "Re-sync from Calendly (paste PAT)" button in page Settings. Re-uses the rich import endpoint and existing merge flow so users can keep Calendly offers fresh directly from the editor.
- Enhanced central Integrations page with richer Calendly status: shows PAT + Webhook configured state with last sync/save times (advances "status dashboard per integration").
- Started Stripe integration depth: Improved import route to return rich `structuredOffers` (supports user-provided keys). Added initial Stripe import UI in Tools page with rich preview + direct "Create Page" handoff.
- Added "Re-sync from Stripe (paste Secret Key)" button in page Settings (symmetric to Calendly). Re-uses the rich import endpoint and merge flow so prices stay fresh directly from the editor.
- Polished Stripe in Tools: route now supports "recent products" fetch + attaches `source: 'stripe'` metadata on offers; UI shows connection status + last import time (advances full sync quality + source metadata + status dashboard).
- Shopify integration foundation: Enhanced general Site Importer with special `/products.json` parsing + rich offer extraction for Shopify-hosted sites. Added dedicated Shopify Catalog Import section in Tools with rich preview + create handoff. Updated integrations page. Directly addresses user request for importing Shopify websites.
- **Continued acceleration on Phase 3 (latest batch)**:
  - Added `outbound_webhooks` JSONB column (migration). Settings now has first-class UI to save per-page outbound endpoints. Calendly receiver automatically fires `booking.received` to the page's stored endpoints (plus header fallback for demo). Real "set once on the page → fires on actual bookings" path.
  - **Major new value**: `lib/checkout-events.ts` now automatically fires the page's `outbound_webhooks` on real Nexez-driven events (`provider_redirect`, `stripe_session_created`, `checkout_attempt`). Outbound is now valuable for bookings that agents complete through the Nexez checkout itself.
  - Stripe import produces richer OfferItem shape (recurring → duration + tiers, metadata for future price webhooks).
  - Editor "Connected Integrations" status is now actionable for both Calendly and Stripe: Re-sync buttons trigger rich import + pendingReanalysis/smart-merge preview directly in the editor (full parity for the two primary pro integrations).
  - Stripe import now attaches stable stripe_product_id / price_id in metadata (concrete step toward full price sync + future webhook price updates).
- Google Calendar: Import now produces richer structured availability (source + calendar_id) exposed in agent.json. Public page reflects Google Calendar source when set. Functional import UX in Settings.
- Stripe webhook: price.updated now documents the concrete path to future offer price updates using stored stable IDs.
- Status: Editor shows "Availability data live" and Google Calendar connected indicators.
- Build + tests green.

**Duration / Effort**: 8–10 days.

**Key Work**:
- Calendly: Expand import to support webhooks (user pastes webhook secret or we guide creation). On booking via agent, optionally notify or reflect limited availability hints into agent.json (future).
- Stripe: Full product/price sync (not just one-time import). Prices update on page re-sync or webhook.
- Google Calendar: Import availability windows → expose in agent.json or as "next available" on public page (read-only for agents).
- Zapier/Make + generic webhooks: Outbound on `provider_redirect`, `stripe_session_created`, checkout success. UI to configure endpoint + secret + event types.
- Status dashboard per integration (last synced, errors, re-sync button).
- Consumer-specific: Square, Acuity, or Booksy exploration (one deep integration).
- Update importer + builder to respect "source integration" metadata.

**Success Criteria**: User connects Calendly once → sees event types as offers → later bookings via Nexez checkout or original still attribute correctly. Webhook fires on test booking. Re-sync from Stripe updates prices without duplicates.

---

### Phase 4: Per-Offer Controls, Embeds, Linking & Advanced UX
**Goal**: Granular control + beautiful embed experiences that make Nexez the default "agent layer" on top of any existing site.

**Duration / Effort**: 5–7 days.

**Key Work**:
- Builder: First-class per-offer row "Book on original site" toggle (boolean `prefer_original_for_this` or simply "use this url for original" + separate override url). Persist in OfferItem (new optional field or reuse url + flag). Update public CTA logic, agent.json, JSON-LD.
- Settings page: Enhance embed generator (live preview iframe + copyable JS snippet for "floating book button" or "agent-optimized section"). Options for theme, which offers to show, prefer-original behavior.
- Iframe sandbox + responsive + "open in new tab" affordances.
- Simulator (test page): Add "embed preview" mode + "original site" simulation toggle.
- Versioning stub: On every save, append to a `page_versions` JSONB or simple history table (or Supabase row versioning). "Restore previous" button (MVP).
- Polish consumer CTAs (e.g. "Book mobile visit here or on our site").

**Success Criteria**: In builder you can set per-offer original preference independently of page default. Embed code works in a test HTML file and respects toggles. History allows rollback. Public pages show correct mixed CTAs.

---

### Phase 5: Production Hardening, Testing, Observability & Security
**Goal**: Ship with confidence. No embarrassing production issues on day 1 for customers.

**Duration / Effort**: 6–9 days (can overlap with other phases for tests).

**Key Work**:
- Testing: Vitest + React Testing Library or Playwright for critical paths. Target: importer extraction utils, full parse<->format roundtrips (all fields + tiers), ai-optimize determinism, checkout event creation, VisualOfferBuilder basic interactions.
- Error boundaries (root + per major feature: builder, importer, analytics).
- Importer robustness: AbortController, per-fetch timeout, retry with backoff (light), robots.txt respect (basic), rate limiting awareness.
- Custom domain: Real verification flow (TXT or CNAME check via API route + UI status "Verified" / "Pending"). Middleware support if not present.
- Billing: Surface agent-driven vs direct revenue split if not already. Transaction fee reporting.
- RLS + auth audit (use Supabase advisor or manual review of policies).
- Observability: Console + simple server log context for importer/analytics errors. Optional: lightweight event to Supabase for "feature used" (importer success, builder drag, etc.).
- Performance: Code splitting if needed, importer result caching (short TTL per URL), public page static hints.
- DX: Strict TypeScript on OfferItem everywhere, shared validation.
- Update CLAUDE.md / AGENTS.md if patterns change.

**Success Criteria**: `npm test` (new) passes with ≥70% coverage on lib + key routes. Importer never hangs. Custom domain verification completes end-to-end in docs + UI. No P0 security findings. Build succeeds on Vercel with zero warnings.

---

### Phase 6: Market-Leading Differentiators & Launch Prep
**Goal**: Features and proof points that make Nexez the obvious choice vs any alternative.

**Duration / Effort**: 10+ days (ongoing after Phase 1–5 core).

**Key Work** (prioritized):
- Optional LLM assist in importer (for pages with heavy JS or ambiguous copy) – opt-in, with clear "uses external AI" notice + user-provided key or xAI proxy.
- Per-offer quality/readiness scores + "AI optimize this offer" that feeds back into builder.
- A/B offer testing (simple: duplicate offer variant, track which converts more via analytics).
- Templates marketplace (curated + user-submitted, industry-specific packs).
- Team / multi-user (basic sharing or read-only viewers).
- White-label / custom branding for power users (MVP CSS vars override).
- Enhanced agent simulator (side-by-side with real model prompts, export "copy for ChatGPT").
- Full Robust Feature List items (version control deeper, webhooks richer, billing transaction fees on agent events surfaced, embeddable widgets beyond iframe).
- Marketing: Case studies (3–5 real or seeded), "Why agents love Nexez" page with schema examples, comparison table vs competitors.
- Certification program: "Nexez Certified Agent-Ready" badge for published pages that hit 95+ readiness.
- Directory growth: Seed 20–30 high-quality example pages across pro + consumer verticals.

**Success Criteria**: At least 2–3 features from this phase are live and differentiated (e.g. LLM assist + per-offer scores + one marketplace pack). Analytics prove faster time-to-first-agent-conversion than any alternative. Users describe the importer as "magic".

---

## Cross-Cutting Principles & Governance
- **Every change** must preserve or improve the Human-premium / Agent-clean split.
- **Data model**: OfferItem is sacred. Any serialization change must include migration path + roundtrip tests.
- **No text roundtrips for rich data** after Phase 1.
- **Measure what matters**: Importer success rate, builder edit time, agent-driven conversion rate, directory CTR, integration activation rate.
- **Update this doc**: After every phase, append "Completed [date]" + key metrics + learnings. Re-prioritize remaining work.
- **User input gates**: Major UX shifts (new builder paradigm, directory redesign) should have quick validation (even internal dogfood or 2–3 friendly users).
- **Deployment**: All work on main → Vercel. Use feature flags or gradual rollout for risky importer changes.
- **Supabase**: Prefer small additive migrations. Use MCP tools for schema reviews when touching DB.

## Timeline & Milestones (Aggressive but Realistic for 1 Primary Dev)
- **Week 1–2**: Phase 1 complete + live on prod (the highest-leverage "A" work).
- **Week 3**: Phase 2 (Analytics + Directory) + early Phase 5 tests.
- **Week 4**: Phase 3 (Integrations depth).
- **Week 5**: Phase 4 + remaining hardening.
- **Week 6+**: Phase 6 + iteration based on real usage + "best on market" certification push.

**Immediate Next Action (per user)**: Complete this roadmap (B), **then start Phase 1 / A deep work with zero delay**.

## Appendix: References
- Original vision + Robust Feature List (12-screen MVP + 8 categories).
- NEXEZ DESIGN SYSTEM v1.0 (already shipped).
- Full audit table (gaps 1–12) that generated this roadmap.
- Current key files: `app/api/tools/import-site/route.ts`, `components/VisualOfferBuilder.tsx`, `app/dashboard/[id]/page.tsx`, `app/create/page.tsx`, `lib/agent-page.ts`, `lib/ai-optimize.ts`, `app/dashboard/analytics/page.tsx`, `app/directory/page.tsx`, `app/dashboard/tools/page.tsx`, `app/[slug]/page.tsx`.

---

**This roadmap is now the plan.** B is complete. Executing A (Phase 1) starts **now**.

Next edit after this commit: Begin the architectural overhaul of the Site Importer and direct structured → VisualOfferBuilder integration. No tangential work.