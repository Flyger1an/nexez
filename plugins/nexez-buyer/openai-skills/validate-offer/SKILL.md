---
name: validate-offer
description: >
  Dry-run check one exact Nexez offer for current price, currency,
  requirements, readiness, or proposed-term rule evaluation without taking an
  action.
metadata:
  version: "0.1.0"
---

# Validate a Nexez offer

Evaluate one exact offer without charging, ordering, booking, reserving, contacting a seller, submitting terms, or returning a route for any of those actions.

## Workflow

1. Resolve the user's choice to one exact listing slug and offer key.
2. Call `nexez_get_page` and confirm that the offer exists. Use only the returned published facts.
3. Never guess an offer key or required configuration value. Ask only for non-contact information required by the dry run.
4. Use `nexez_validate_checkout` to check fixed-price, configured, or readiness facts. Use `nexez_validate_negotiation` to evaluate a buyer-provided budget, timeline, or requested terms against published rules.
5. Send only the fields declared by the selected tool. Never send an email address, phone number, contact route, approval token, action URL, or live-action flag.
6. Report the exact result, including relevant price, currency, requirements, rule evaluation, warnings, and errors.
7. End with: `This was a dry run. Nothing was charged, ordered, booked, reserved, submitted, or sent to a seller.`

## Boundaries

- Validation is not consent and does not create a follow-up action.
- Do not describe a successful check as a purchase, order, booking, reservation, payment, accepted proposal, or seller response.
- Do not output, infer, reconstruct, or retrieve a checkout link, provider handoff, contact detail, approval credential, or executable request.
- Do not reproduce a write request through a browser, shell, generic HTTP client, messaging tool, or another plugin.
- If the user asks to complete a purchase or contact a seller, explain that this ChatGPT plugin cannot perform or facilitate it.
