# Data inventory and retention register

Populate this document from verified production behavior. Do not guess. If publishing the
repository would reveal sensitive architecture, keep the completed register in the private
evidence system and retain only this template here.

| Processing activity | Data subjects | Data categories/class | Purpose | System/vendor | Nexez role | Recipients/subprocessors | Region/transfer | Retention trigger and period | Deletion method | Owner | Verified date |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Account and authentication | Buyers, sellers, personnel | Populate | Populate | Populate | Controller | Populate | Populate | Populate | Populate | Privacy Owner | Pending |
| Seller onboarding | Sellers | Populate | Populate | Populate | Controller | Populate | Populate | Populate | Populate | Privacy Owner | Pending |
| Listings and storefront | Sellers | Populate | Populate | Populate | Controller | Populate | Populate | Populate | Populate | Product Owner | Pending |
| Checkout and orders | Buyers, sellers | Populate | Fulfil transactions | Nexez, Stripe | Determine | Stripe and others | Populate | Populate | Populate | Payments Owner | Pending |
| Negotiation and agent actions | Buyers, sellers, agent operators | Populate | Execute authorized commerce workflows | Populate | Determine | Populate | Populate | Populate | Populate | Product Owner | Pending |
| Support and communications | Users | Populate | Support and service messages | Populate | Controller | Populate | Populate | Populate | Populate | Support Owner | Pending |
| Product analytics | Users | Populate | Operate/improve product | Populate | Determine | Populate | Populate | Populate | Populate | Product Owner | Pending |
| Security and audit logs | Users, personnel, systems | Confidential/Restricted identifiers and events | Security, fraud prevention, audit | Populate | Controller | Populate | Populate | Populate | Populate | Security Owner | Pending |
| Billing and accounting | Customers, sellers | Populate | Billing, tax, accounting | Populate | Controller | Populate | Populate | Legal requirement plus approved period | Populate | Finance Owner | Pending |

## Required validation

For every row, confirm collection source, exact fields, API/log copies, backups, analytics,
support exports, legal basis where applicable, contract terms, user notice, deletion behavior,
and whether an automated system makes or materially supports a consequential decision.

Retention must be expressed as an event plus a period, for example, “account deletion + 30 days”.
not “as long as necessary.” Backup expiry and vendor deletion must be included.
