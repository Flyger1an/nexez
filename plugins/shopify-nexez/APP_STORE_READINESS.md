# Shopify App Store readiness

Last reviewed against Shopify's public requirements: 2026-08-28.

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
- [x] OAuth requests `read_product_listings`, and installed-app imports keep only products published to Nexez.
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

Validation evidence from 2026-07-13:

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
READY and migration `20260828210519_shopify_sales_channel_billing.sql` is applied.
