# Nexez Seller Hub — Roadmap

Status of the iOS/Android seller app (`apps/seller-mobile`). Last updated 2026-06-23.

Design source of truth: `design_handoff_seller_hub/` (Ink & Ember + Liquid Glass v2).
Architecture: Expo Router + RN + TS; direct RLS Supabase reads (`owner_id`); privileged/money
actions call the existing Next API routes with the seller's `Authorization: Bearer <token>`.

---

## ✅ Shipped & device-verified

**Foundation & design (v2 "Ink & Ember + Liquid Glass")**
- Ember `#E45F38` + steel `#7C93C4` palette, cool blue-ink surfaces; real `expo-blur` glass material with specular rim; Space Grotesk / Manrope / JetBrains Mono.
- Floating pill nav (4 icon tabs) + detached ember Create circle; content scrolls under.
- Money-first Overview (bell + avatar, money hero w/ pipeline + payouts + sparkline, "Needs you" queue, compact stats, loading skeletons).

**Screens (all 20 from the handoff)**
- Auth (email/pw + reset, AES-encrypted SecureStore session), Onboarding (first-run, AsyncStorage-gated).
- Listings (search/filter, status pills, mono slugs, stat row, Manage/Edit/Publish), full guided Create/Edit editor, Offers.
- Listing detail (readiness ring + agent-traffic + endpoint chips + offers + 6-action grid), Readiness (structured signals + one-tap Fix), Simulator (live `/api/simulate-llm`).
- Analytics (range chips, pipeline/conversions hero, stacked visits chart, top agents/listings/queries).
- Inbox (deal cards) + Negotiation detail (their-offer vs floor, conversation thread, auto-counter banner, status-aware actions) + Order detail (timeline, refund, Approve/Deny).
- Notifications center + settings, Auto-rules, Competitor (own-listing ranking), Trust score, Billing, Integrations (with error/Retry demo), Importer, Support, Settings.
- Global Toast on every mutation.

**Money / state actions (code-complete; go live on web deploy)**
- In-app accept / counter / decline / approve / capture / cancel; full & partial refunds; order refund Approve/Deny.
- Web side: `lib/server/request-auth.ts` dual cookie/Bearer resolver swapped into `/api/negotiations/transition`, `/api/negotiations/escrow`, `/api/orders/refund` (money logic untouched).
- Auto-rules persist `offerType` + `rules.minPrice` + `autoAccept` per offer (honored by `evaluateProposal`).

**Push notifications**
- Token registration → `user_push_tokens` (RLS). Seller pushes wired at 3 server events (new negotiation, escrow funded, order paid) alongside the existing emails (`lib/push.ts` `sendPushToUser`).
- Per-event toggles + read/clear persist on-device (AsyncStorage).

---

## 🚀 Next up — release / deploy (owner actions)

1. ~~**Deploy the web app**~~ — ✅ **Shipped 2026-07-06** (deploy of `c0a5e4c`, Vercel prod Ready in 56s). The Bearer-auth deal-action routes (`/api/negotiations/transition` + `/escrow`, `/api/orders/refund`) + seller push sends are now **live on prod** (no longer 401 / no-op). Not yet exercised e2e against a real mobile token + live deal.
2. **EAS build + TestFlight** — ✅ pipeline configured (`eas.json` profiles dev/preview/production + `app.nexez.sellerhub` bundle id/package; build steps in README). RUN is an owner action: `eas login && eas init`, register the Supabase publishable env vars (`eas env:create`), then `eas build`. Fastest device test = `eas build -p android --profile preview` (APK, no Apple account).
3. **Physical-device push test** — Expo push tokens can't be issued on the simulator.

## 🔧 Backend-gated features (need server work)

4. **Competitor cross-market data** — the screen currently ranks the seller's *own* listings (real). True "businesses agents weigh against you" needs a backend competitor/category dataset + an authed read route.
5. **Server-enforced per-event push** — mobile toggles persist on-device only; `lib/push.ts` honors a single master opt-out. Proper per-event delivery needs a seller-scoped prefs store (new column/table — do **not** reuse the buyer `user_agents` row) + each push call-site checking the event kind.
6. **Auto-rules fine-grained bands** — only the toggle + floor persist today. "Auto-accept at/above" + "auto-decline below" + default terms need mapping to per-offer `rules` (autoAcceptWithinPercent / maxDiscountPercent) using each offer's listed price.

## 📱 Coverage / polish

7. **Android** — never run/verified (iOS sim only). Confirm an emulator, smoke-test layout (floating nav insets, BlurView intensity, Switch styling).
8. **Google OAuth** — blocked on the web auth flow not exposing it; email/password only today.
9. **App icon → Ink & Ember** — splash/adaptive-icon backgrounds updated to `#0a0e16`; the icon/splash *artwork* is still the create-expo-app default — needs a branded asset.
10. **Negotiation thread content** — `seller_llm` messages fall back to "Message" when their jsonb shape has no `message`/`reasoning`/`query`/`text`; map the real LLM-decision shape.
11. **EAS Update (OTA)** channel for shipping JS fixes without a store round-trip; offline/error-resilience polish.

---

## Build / run notes

- **Local `expo run:ios` is blocked in this environment** by an Xcode SDK↔runtime mismatch: Xcode ships the **iOS 26.5** build SDK but the only installed simulator runtime is **iOS 27.0**, so xcodebuild finds *no eligible destination* ("iOS 26.5 is not installed"). `pod install` + prebuild succeed and the build *plans with 0 errors* (app/native config are sound) — the block is purely the toolchain. Fix: Xcode → Settings → Components → install a matching iOS platform/simulator, **or** just use the **EAS cloud build** (matched toolchain, no local Xcode gap). Prebuild rewrites the `ios`/`android` npm scripts to `expo run:*` and generates `/ios` — both reverted/removed after the attempt to keep the Expo Go workflow.

- `node` is via **fnm** — not on the non-interactive PATH. Prefix: `export PATH="$HOME/.local/share/fnm/node-versions/v24.16.0/installation/bin:$PATH"`, then `node_modules/.bin/tsc --noEmit`.
- Run Metro in your own terminal (`npm run ios`) so the sim doesn't go stale between sessions.
- Root `tsconfig.json` + `eslint.config.mjs` exclude `apps/seller-mobile` — keep it that way so the web toolchain ignores it.
- `.env.local` is gitignored + holds PUBLIC publishable values only.
