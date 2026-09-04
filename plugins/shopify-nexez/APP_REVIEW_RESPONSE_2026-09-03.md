# Shopify App Review response: September 3, 2026

Use this only after every release check below passes. Replace every angle-bracket
placeholder before pasting it into the Partner Dashboard.

## Feedback being addressed

- Requirement 4.5.3: the submitted screencast omitted configuration steps and
  did not demonstrate the complete flow from installation through listing setup.
- Requirement 2.1.4: the named review listing was unavailable, the expected
  Nexez publishing destination did not appear, and catalog synchronization failed.

## Paste-ready response

Hello Shopify App Review,

Thank you for the detailed recordings. We corrected both reported issues and
retested the flow from a fresh installation.

For requirement 4.5.3, we replaced the previous video with one continuous
English walkthrough. It begins before installation and shows the Shopify OAuth
grant, the first embedded-app open, Nexez account sign-in, selection of the exact
prepared listing, creation and verification of the sales channel, product
publication, successful synchronization, a product price update, product
unpublication, theme app embed activation, the public agent endpoint, the
Shopify storefront checkout handoff, and Shopify App Pricing.

For requirement 2.1.4, installed-app catalog reads are now scoped to the exact
Shopify channel connection instead of an app-level current publication. The app
also verifies the saved channel against Shopify on open and repairs stale
listing/account metadata before synchronization. The embedded home does not show
Connected unless Shopify confirms the channel and a catalog sync has completed.

The exact prepared listing is `Shopify Review Catalog 2`. It is visible to the
provided reviewer account and has no active Shopify store binding at the time of
submission. Please do not use `Shopify Review Catalog` or `nexez strategy`.

Updated screencast: <PRIVATE_SCREENCAST_URL>

Reviewer email: <REVIEW_EMAIL>

Reviewer password: <REVIEW_PASSWORD>

Production release: <DEPLOYMENT_URL_OR_COMMIT>

Please follow the updated private testing instructions. After publishing two
active products to `Nexez AI discovery`, `Sync now` imports those products. A
saved price change is reflected after the next sync, and removing a product from
that Shopify destination removes only that product from the Nexez endpoint.

Thank you for reviewing the updated submission.

## Evidence to collect before sending

| Check | Required proof |
| --- | --- |
| Server release | Production deployment URL and commit SHA |
| Shopify version | Generated app version identifier and deployed extension version |
| Review fixture | Screenshot showing `Shopify Review Catalog 2` in the reviewer account |
| Unbound fixture | Database check showing no active Shopify install for that listing |
| Channel | Shopify admin screenshot showing `Nexez AI discovery` under publishing controls |
| First sync | Embedded app screenshot with imported count and current sync time |
| Field accuracy | Before and after price values in Shopify and the Nexez endpoint |
| Unpublish accuracy | Endpoint before and after removing one product from the channel |
| Endpoint | HTTP 200 response from `/apps/nexez/agent.json` |
| Screencast | Private URL, English audio, and English captions |

## Final release checks

- [ ] Production server contains the channel-scoped query and live channel verification.
- [ ] The Shopify channel config extension is deployed in the submitted app version.
- [ ] `Shopify Review Catalog 2` exists and the credentials can access it.
- [ ] `Shopify Review Catalog 2` is published and unbound.
- [ ] A separate rehearsal listing passes install, publish, sync, update, unpublish, and uninstall.
- [ ] The final screencast matches `app-store-media/review/storyboard.md`.
- [ ] Every placeholder in this response and the private instructions is replaced.
- [ ] The two reviewer-recording scenarios no longer reproduce in production.
