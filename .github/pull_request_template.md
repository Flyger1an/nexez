## Summary

Describe the change and its user impact.

## Verification

- [ ] Relevant automated tests pass.
- [ ] Manual verification is documented, or not required.

## Seller mobile reconciliation

Check the contract areas changed by this PR:

- [ ] Platform API paths used by seller mobile
- [ ] Public-name validation or reserved names
- [ ] Seller notification events or payload types
- [ ] Integration providers, authentication, or capabilities
- [ ] Entitlement schema version, plans, limits, or features
- [ ] Negotiation statuses, rules, or transitions
- [ ] None of these contracts changed

If any contract area changed:

- [ ] The seller-mobile snapshot, behavior, and tests were reconciled.
- [ ] `npm run check:mobile-platform-contracts` passes from the repository root.
