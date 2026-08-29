# Nexez Agent-Ready: reviewer guide

This document is the source for the private testing instructions and screencast
submitted to Shopify. Replace every angle-bracket placeholder before submission.

## Do not submit until

- The current Nexez server release and Shopify app version are both live.
- The sales-channel and billing migration is applied.
- Shopify App Pricing plans and Partner API billing verification are live.
- The review store is unlocked and its storefront agent endpoint is public.
- Partner Dashboard automated checks and mandatory-webhook tests pass.
- A fresh install, uninstall, and reinstall pass on a development store.
- Reviewer credentials below are tested in a private browser window.
- The emergency developer contact email and phone are active.

## Reviewer credentials

- Nexez email: `<REVIEW_EMAIL>`
- Nexez password: `<REVIEW_PASSWORD>`
- Prepared listing: `Shopify Review Catalog`
- Backup prepared listing: `Shopify Review Catalog 2`

The review account must have a confirmed email and full access to both prepared
listings. Keep both listings free of personal information and unrelated products.
The review account should use the Shopify Free plan unless a paid-plan test is
requested. All plan selection and app charges occur through Shopify.

## Store prerequisites

- An Online Store sales channel with an active theme
- Storefront password protection disabled so the app-proxy artifact is publicly
  crawlable during review
- At least two active, published products
- One product with multiple variants if possible
- No real customer or order data is required

The app supports a fresh review store. It does not require the shop to be
pre-provisioned in Nexez before installation.

## Paste-ready testing instructions

1. Install `Nexez Agent-Ready` on a review store and open it from Shopify admin.
2. Confirm the embedded home loads and shows `Account link needed` without a web error.
3. Click `Continue to Nexez`. This user-initiated top-level handoff opens the secure account-link flow.
4. Sign in with the Nexez reviewer credentials above.
5. Select `Shopify Review Catalog`. If it is already connected to another review store, select the backup listing.
6. Click `Connect this listing`. Confirm Nexez appears as a Shopify sales channel and the connection succeeds.
7. In Shopify, publish at least two active products to the Nexez sales channel.
8. Reopen the app and click `Sync now`. Confirm only products published to Nexez are imported.
9. Click `Enable agent discovery in theme`. In the theme editor, enable `Agent-ready discovery` and click `Save`.
10. Reopen the app from Shopify admin. Confirm the embedded home shows `Connected`, the listing name, sales-channel status, and the last catalog sync.
11. Click `Open endpoint`. Confirm `/apps/nexez/agent.json` responds with HTTP 200 and structured listing data.
12. Confirm imported product names, variants, prices, currency, availability, and storefront links match the review store.
13. Open one imported product action and confirm it returns to the product page on the Shopify storefront for checkout.
14. Open `Manage plan in Shopify`. Confirm plan selection and any app charge remain inside Shopify.
15. Unpublish one test product from Nexez, run `Sync now`, and confirm it is removed from the agent endpoint.

Expected result: the app reads only active published products, keeps discovery
artifacts available from the storefront domain, and leaves every product purchase
on the merchant's Shopify storefront.

## Important behavior for reviewers

- Requested scopes: `read_products`, `read_product_listings`, `write_app_proxy`
- Admin catalog API: versioned GraphQL Admin API
- Customer data: not requested or stored
- Order data: not requested or stored
- Billing: Shopify App Pricing only
- Catalog cap: up to 250 active published products per sync
- Store relationship: one active Shopify store per Nexez listing
- Product updates: contextual product-feed events queue a bounded refresh
- Uninstall: tokens are revoked and that shop's imported offers are removed
- Final redaction: the remaining installation record is deleted

## Error-path checks

1. Open the embedded app with an invalid or expired session token: the server returns an authentication error and no shop data.
2. Try linking a listing already connected to another active store: the app returns a clear conflict and does not relink either store.
3. Remove or expire the installation credential: manual sync asks the merchant to reconnect and does not expose the token.
4. Trigger a transient catalog error: the app preserves the existing catalog and reports an attention state.
5. Uninstall and reinstall: the old listing link is not silently restored; the merchant must explicitly link again.

## Review screencast script

Record one clear English screencast with no cuts that hide setup steps:

1. Start in Shopify admin and install/open Nexez Agent-Ready.
2. Show the embedded account-link state.
3. Continue to Nexez, sign in, select the prepared listing, and connect it.
4. Show the initial product import result.
5. Enable and save the theme app embed.
6. Reopen the embedded app and run Sync now.
7. Open the storefront agent endpoint and identify one imported product.
8. Follow that product's action back to the Shopify storefront.
9. Open Shopify App Pricing and show that plan management remains in Shopify.
10. End by stating that Nexez imports only channel-published products and keeps checkout on Shopify.

Use the private review screencast field for this walkthrough. Public feature
media should be promotional and follow Shopify's separate media guidance.

## Support and legal links

- Support: https://nexez.ai/support
- Privacy: https://nexez.ai/privacy
- Terms: https://nexez.ai/terms
- Developer website: https://nexez.ai

## Final Partner Dashboard actions

1. Submit in the Sales Channel category and set `Merchant must have online store`.
2. Configure Shopify App Pricing with Free, Launch, Pro, and Scale plans.
3. Opt out of protected customer data because the app requests none.
4. Upload the icon, feature media, screenshots, and alt text from `APP_STORE_LISTING.md`.
5. Paste these testing instructions and valid credentials into the private review section.
6. Add the screencast URL.
7. Add the emergency developer contact email and phone number.
8. Run every automated check and mandatory-webhook test.
9. Submit only after every critical requirement is green.
