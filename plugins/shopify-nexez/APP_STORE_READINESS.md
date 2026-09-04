# Shopify App Store readiness

Last reviewed against Shopify's public requirements: 2026-09-03.

## Paused-submission recovery: 2026-09-03

Shopify paused review under requirements 4.5.3 and 2.1.4. The reviewer could
not find the named `Shopify Review Catalog 2` fixture. The existing
`Shopify Review Catalog` was actively linked to another test store. After the
reviewer linked a different listing, Shopify did not show the expected Nexez
publishing destination and every catalog reconciliation failed.

Production evidence at the time of review showed no successful sync for the
reviewer's shop and five failed attempts ending in `Shopify rejected the catalog
query.` The previous July and August validation evidence below is historical and
must not be reused as proof for this resubmission.

- [x] Remove the deprecated app-level current-publication lookup from installed-app sync.
- [x] Scope installed-app product queries to the exact confirmed channel handle.
- [x] Verify stored channel IDs against Shopify and repair a stale listing/account mapping.
- [x] Stop showing `Connected` when channel verification or the first sync is incomplete.
- [x] Preserve bounded Shopify GraphQL diagnostics in server logs without exposing them to reviewers.
- [x] Replace ambiguous fallback instructions with one exact prepared listing.
- [x] Rewrite the screencast plan to show installation, OAuth, listing connection, publication, sync, update, unpublish, and endpoint verification.
- [ ] Deploy the matching server release and Shopify app version.
- [ ] Create and publish `Shopify Review Catalog 2` under the reviewer account.
- [ ] Confirm `Shopify Review Catalog 2` has no active Shopify binding at submission time.
- [ ] Rehearse the full flow on a separate clean listing and fresh development store.
- [ ] Record the new continuous English screencast and verify its captions.
- [ ] Replace stale screenshots that show the old review catalog or sync state.
- [ ] Update the Partner Dashboard testing instructions and screencast URL.
- [ ] Resubmit only after the production review flow passes twice from a clean install.

## Code-backed requirements

- [x] Embedded app home is configured with `embedded = true`.
- [x] Latest App Bridge CDN script is the first script in the embedded document.
- [x] Embedded backend calls use Shopify ID tokens instead of third-party cookies.
- [x] ID tokens verify HS256 signature, audience, expiry, not-before time, issuer,
  destination, Shopify shop domain, user, and session.
- [x] Session-token exchange establishes rotating offline Admin API credentials.
- [x] Existing rotating credentials refresh before expiry, with token rotation
  persisted atomically.
- [x] Reinstalls clear old owner/listing links and require an explicit relink.
- [x] Account linking crosses the iframe boundary with a ten-minute, single-use,
  hashed credential.
- [x] `app/uninstalled` immediately clears credentials and the active listing
  connection, then removes that shop's imported offers. Service-role cleanup
  pointers remain only until Shopify sends `shop/redact`.
- [x] `customers/data_request`, `customers/redact`, and `shop/redact` are declared,
  HMAC verified, and handled. Nexez stores no Shopify customer data.
- [x] Contextual full and incremental product-feed webhooks queue bounded background reconciliation.
- [x] A channel config extension declares the sales channel and its US English specification.
- [x] OAuth requests `read_product_listings`, and installed-app imports use the exact Nexez channel handle to keep only products published to that connection.
- [x] Account linking creates a channel connection and triggers a Shopify full product-feed sync.
- [x] Catalog reads use the versioned GraphQL Admin API, not the legacy REST Admin API.
- [x] Requested scopes are limited to `read_products,read_product_listings,write_app_proxy`.
- [x] Synced Shopify offers retain Shopify storefront URLs as their purchase path.
- [x] One active Shopify store can feed a listing at a time, enforced in both the
  link route and the database.
- [x] Moving or uninstalling a store removes only that store's imported catalog;
  manual offers and another explicitly scoped store are preserved.
- [x] Embedded CSP permits Shopify admin framing without opening the page to arbitrary origins.
- [x] Theme editor deep link is available after linking.
- [x] Privacy and support destinations are visible from the embedded app.
- [x] Account linking uses a user-initiated top-level navigation supported by the
  current Shopify App Bridge Navigation API, with no popup dependency.
- [x] An authenticated Shopify admin can change the linked Nexez listing without
  uninstalling the app. Nexez authentication and listing edit access are checked
  again before the move, and only the old Shopify-imported catalog is removed.

## Rejection remediation

### 1. Sales Channel classification

- [x] Nexez is implemented as a Shopify Sales Channel.
- [x] The channel specification identifies Shopify merchants as merchant of
  record and requires Online Store parity.
- [x] Merchants can control publication to Nexez through Shopify's channel model.
- [x] Products return to the merchant's Shopify storefront for checkout.

### 2. Shopify billing

- [x] Shopify-linked accounts cannot start or manage a Stripe app subscription.
- [x] Embedded pricing and billing actions open Shopify App Pricing.
- [x] Partner API subscription state maps Shopify plan handles to Nexez entitlements.
- [x] Create the Free, Launch, Pro, and Scale plans in Shopify App Pricing.
- [x] Add the Partner API billing variables to the production deployment.
- [ ] Verify each Shopify plan on a development store.

### 3. Live artifact reliability

- [x] `Open endpoint` returns the allowlisted artifact body with HTTP 200.
- [x] Upstream artifact failures return a controlled 502 instead of redirecting
  the reviewer to an error page.

### 4. Checkout boundary

The current importer keeps each Shopify product's storefront URL as its preferred
purchase action. Preserve this invariant. A regular Shopify app must not route a
Shopify-origin purchase around Shopify checkout.

## Partner Dashboard and listing work

Historical validation evidence from 2026-07-13, not valid for the current resubmission:

- Shopify CLI `app build` passed the production config and theme-extension checks.
- The full suite passed after the relink work: 254 test files, 1,971 tests. Lint,
  palette guard, TypeScript, and the production build also passed.
- The live embedded app authenticated, moved from the negotiation gauntlet to the
  dedicated `Shopify Review Catalog`, and completed a manual sync with 13 active
  products imported. The gauntlet retained its 64 non-Shopify offers.
- The theme editor showed `Agent-ready discovery` enabled with `/apps/nexez` as
  the storefront proxy path.
- The review catalog is published. Its public page, `agent.json`, and `llms.txt`
  return 200; the agent artifact contains all 13 products; and a checkout dry run
  resolves to the original Shopify product URL.
- Four final 1600 x 900 desktop captures are under `app-store-media/final/`. The
  final icon is under `app-store-media/`.
- Public distribution is selected in Partner Dashboard. Shopify now requires the
  App Store registration declarations and one-time $19 payment before the listing
  editor and submission checklist are available.

- [x] Implement the Sales Channel extension, connection, publication filtering,
  contextual feed subscriptions, and full-sync trigger.
- [x] Route Shopify app subscriptions through Shopify App Pricing.
- [x] Complete Shopify App Store registration with truthful business/account
  declarations and the one-time registration payment.
- [x] Mark the Online Store sales channel as required because the theme app embed
  and app proxy depend on a storefront.
- [ ] Add an emergency developer contact.
- [x] Verify current privacy-policy, terms, and support URLs resolve publicly.
- [ ] Enter the verified legal, support, and data-use URLs in Partner Dashboard.
- [x] Prepare truthful listing copy without rankings, guarantees, or statistics
  in `APP_STORE_LISTING.md`.
- [x] Capture final desktop screenshots.
- [ ] Capture the required mobile-admin screenshot set.
- [x] Prepare the English onboarding screencast script and complete reviewer flow
  in `REVIEWER_GUIDE.md`.
- [ ] Record the onboarding screencast: install, select a Shopify plan, connect
  account, choose listing, publish products, sync catalog, enable app embed, and
  inspect the HTTP 200 agent endpoint.
- [ ] Provide durable review credentials with access to the complete feature set.
- [ ] Create the exact unbound `Shopify Review Catalog 2` fixture named in the private instructions.
- [ ] Run the Partner Dashboard automated quality checks and mandatory-webhook test.
- [ ] Test fresh install, uninstall, reinstall, token refresh, link expiry, webhook
  sync, product deletion, and mobile admin. Manual sync and theme activation are
  verified.
- [ ] Move the review store to an unlock-eligible Shopify state, disable password
  protection, and confirm `/apps/nexez/agent.json` resolves to structured data
  without a storefront-password redirect. Shopify currently disables the
  password toggle because the store is in development.

## Release commands

```bash
cd plugins/shopify-nexez
npx @shopify/cli app deploy
```

Release the generated version only after the matching Nexez server deployment is
READY and migration `20260828210659_shopify_sales_channel_billing.sql` is applied.
