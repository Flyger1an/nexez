# Nexez Agent-Ready Shopify review screencast

Target duration: 05:30 to 06:30

Record one continuous English walkthrough. Do not begin from a preconnected app,
skip the OAuth grant, or cut around an error. Keep the Shopify store domain,
product names, and exact prepared Nexez listing visible. Hide only the password
while it is entered.

| Time | Scene | Required visual proof | On-screen label |
| --- | --- | --- | --- |
| 00:00-00:30 | Installation | Nexez Agent-Ready install screen, requested scopes, and Install action | Install from Shopify admin |
| 00:30-00:55 | First open | Newly installed embedded app showing `Account link needed` | Fresh installation |
| 00:55-01:35 | Nexez account link | `Continue to Nexez`, sign-in, exact `Shopify Review Catalog 2` selection, and confirmation | Connect the prepared listing |
| 01:35-02:00 | Channel verification | Embedded Sales channel card naming the prepared listing | Shopify-confirmed channel |
| 02:00-02:40 | Product publication | Shopify Products, `Manage publishing`, and two products published to `Nexez AI discovery` | Merchant controls publication |
| 02:40-03:05 | First reconciliation | `Sync now`, successful import count, and latest sync time | Channel products imported |
| 03:05-03:35 | Data comparison | Same product name, variant, price, availability, and URL in Shopify and the agent endpoint | Shopify and Nexez agree |
| 03:35-04:15 | Update proof | Change one Shopify product price, save, sync, and show the changed endpoint value | Product changes synchronize |
| 04:15-04:50 | Unpublish proof | Remove one product from `Nexez AI discovery`, sync, and show only that product removed | Publication controls removal |
| 04:50-05:20 | Theme integration | Enable `Agent-ready discovery` in the theme editor and save | Publish discovery links |
| 05:20-05:45 | Checkout boundary | Follow an imported product action to its original Shopify storefront page | Checkout stays on Shopify |
| 05:45-06:05 | Billing | Open Shopify App Pricing from the embedded app | Plan management stays in Shopify |
| 06:05-06:20 | Final state | Embedded home showing verified channel and successful sync time | Review flow complete |

## Recording acceptance checks

- Installation, OAuth, external account link, and listing selection are visible.
- The listing name is exactly `Shopify Review Catalog 2`.
- The Shopify destination is visibly named `Nexez AI discovery`.
- The first sync succeeds after products are published to that destination.
- At least one field update is shown in both Shopify and Nexez.
- Unpublishing one product removes only that product from Nexez.
- The agent endpoint returns HTTP 200.
- The imported product action returns to Shopify for checkout.
- Spoken narration is English and matches `narration.txt`.
- The final video has English captions from `captions-full.srt`.
