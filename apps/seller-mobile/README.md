# Nexez Seller Hub

Expo + React Native mobile seller app for Nexez.

## Run

```bash
cd apps/seller-mobile
npm install
npm run ios
# or
npm run android
# or
npm run web
```

## Environment

`apps/seller-mobile/.env.local` is already present (gitignored) and pre-filled with the
project's **public** Supabase URL + publishable key and a `https://nexez.app` API base, so
the app connects out of the box. Override the API base to your local web server when running
the Next app alongside it:

```bash
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY
EXPO_PUBLIC_NEXEZ_API_URL=http://localhost:3000        # simulator + web handoffs
EXPO_PUBLIC_AGENT_RUNTIME_URL=http://localhost:3000    # public page previews
```

Only `EXPO_PUBLIC_*` values belong here, and only public ones. Never add
`SUPABASE_SERVICE_ROLE_KEY`, Stripe secret keys, webhook secrets, or other private server
secrets to the mobile app.

## Design system

Built to `design_handoff_seller_hub/` — the **persimmon glass** language (matches the web brand):
`#ff6a33` accent, glass **ring** buttons (not fills), Space Grotesk numerals / Manrope body /
JetBrains Mono slugs, SVG conic readiness rings, gradient avatar, and a center **Create FAB**
tab bar. Tokens live in `src/theme/colors.ts`; reusable primitives in `src/components/ui.tsx`
(`Screen`, `StackHeader`, `GlassCard`, ring `AppButton`, `ReadinessRing`, `TrafficSplit`,
`MetricCard`, `Badge`, `GroupCard/GroupRow`). Every drill-down screen uses `StackHeader` for a
consistent back affordance.

## Live In Phase 1

- Supabase email/password sign in, sign up, reset email, and encrypted session persistence.
- Bottom tabs: Overview · Listings · **Create (FAB)** · Inbox · Settings (Analytics opens from Overview).
- Every screen rebuilt to the handoff: Overview, Listings, Listing Detail, Readiness, Analytics, Inbox (+ detail), Settings, Simulator, Billing, Integrations, Offers, Create/Edit, Importer, Support.
- Overview metrics from RLS-safe seller reads: pages, agent visits, checkout events, negotiations, orders, reviews.
- Listings list, detail, readiness, publish toggle, preview handoff, create, and edit.
- Analytics cards/lists for agent traffic, top agent types, top pages, conversions, and recent events.
- Inbox tabs for negotiations, direct orders, reviews, and buyer requests (refund requests +
  problem reports, with an open-count badge) — all from RLS-safe reads.
- Pull-to-refresh on Overview, Listings, Analytics, Inbox, and the detail screens (silent
  background reload, content stays mounted).
- Negotiation and order detail screens are read-only in app and hand off to the web dashboard
  (`/dashboard/negotiations/:id`, `/dashboard/finance`) for accept/counter/decline and refunds.
- Billing summary reads `billing_subscriptions`, pages, and checkout events.
- Expo Notifications registration foundation writes to `user_push_tokens` (keyed by `user_id`) through RLS.
- Foreground and cold-start notification taps route to allowlisted seller screens after auth is ready. Paid-order and negotiation pushes open their exact records when the server includes a durable ID; older payloads fall back to the relevant inbox list.

## Scaffolded / Web Handoff

- Google OAuth is not active in the current web auth flow; mobile is prepared for email/password first.
- Stripe customer portal, Connect onboarding, refunds, review moderation, API keys, custom domains, and account export/delete hand off to existing secure web routes.
- Complex importers and integration OAuth flows hand off to the web dashboard.
- In-app deal actions (negotiation detail + order detail): Accept / Counter / Decline / Approve / Capture / Cancel and full/partial Refunds, each behind a confirm. These call `/api/negotiations/transition`, `/api/negotiations/escrow`, and `/api/orders/refund`, which now accept either the web cookie session or an `Authorization: Bearer <token>` (via `lib/server/request-auth.ts`) — all Stripe/ownership/ledger logic is unchanged server-side. **Requires the web app to be deployed** for the bearer routes to be live; until then the kept "View on web" link is the working path.

## Build & release (EAS)

The app is build-ready: `eas.json` defines `development` / `preview` / `production` profiles, and
`app.json` carries the `app.nexez.sellerhub` bundle identifier + Android package.

**One-time owner setup** (needs an Expo account; iOS store/TestFlight also needs an Apple Developer account):

```bash
cd apps/seller-mobile
npm i -g eas-cli            # or use `npx eas-cli@latest …`
eas login
eas init                   # links the project + writes extra.eas.projectId into app.json

# Build-time env. EXPO_PUBLIC_* are inlined into the bundle; the Supabase publishable
# values are NOT committed (they live only in gitignored .env.local), so register them
# with EAS so cloud builds can see them:
eas env:create --name EXPO_PUBLIC_SUPABASE_URL --value "https://<project>.supabase.co" --visibility plaintext --environment preview --environment production
eas env:create --name EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY --value "<publishable key>" --visibility plaintext --environment preview --environment production
```

**Builds**

```bash
eas build --profile development --platform ios     # dev client for the simulator (no Apple acct; needs expo-dev-client)
eas build --profile preview --platform android     # installable APK (no Apple acct) — fastest device test
eas build --profile preview --platform ios          # internal iOS (registers ad-hoc devices)
eas build --profile production --platform all       # store builds
eas submit --profile production --platform ios       # → TestFlight / App Store
```

The `preview` Android profile (`buildType: apk`) is the quickest way onto a real device — it needs
no Apple account and is the right target for the physical-device **push** test (the simulator can't
get a remote push token). The API base is pinned to `https://app.nexez.ai` in the build env, so the
in-app deal actions + pushes work against prod once the **web app is deployed**.

## Verification

```bash
npm run typecheck
npm test
npm run lint
npm run check:expo-deps
```

The paths-filtered `Nexie Mobile` workflow runs typecheck, the mobile-owned Vitest suite, Expo lint,
and the SDK compatibility check on every mobile PR. The route suite covers custom-scheme and Nexez
web links, notification payload fallbacks, foreign hosts, malformed inputs, traversal attempts, and
unsafe record IDs.

## Notes

The root Next app is intentionally not converted into a workspace yet. This app has its own `package.json`, `package-lock.json`, and `tsconfig.json`. The root `tsconfig.json` and ESLint config exclude `apps/seller-mobile` so the existing web app keeps its current toolchain.
