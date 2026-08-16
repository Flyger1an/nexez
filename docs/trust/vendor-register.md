# Vendor and subprocessor register

The completed register is both a security inventory and the source for an accurate public
subprocessor list. Contract terms and non-public findings belong in the private evidence system.

| Vendor | Service | Data/access | Criticality | Processing region | DPA/terms | Assurance reviewed | Breach notice | Deletion/exit verified | Owner | Last review | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Supabase | Database/auth/storage (verify actual use) | Populate | Critical | Populate | Pending | Pending | Pending | Pending | System Owner | Pending | Review required |
| Stripe | Payments, Connect, billing | Populate; raw card data should remain at Stripe | Critical | Populate | Pending | Pending | Pending | Pending | Payments Owner | Pending | Review required |
| Vercel | Application hosting/deployment (verify actual use) | Populate | Critical | Populate | Pending | Pending | Pending | Pending | System Owner | Pending | Review required |
| Source-control provider | Code, CI, change evidence | Populate | Critical | Populate | Pending | Pending | Pending | Pending | Engineering Owner | Pending | Review required |
| Monitoring provider | Errors, logs, telemetry | Populate | High | Populate | Pending | Pending | Pending | Pending | Security Owner | Pending | Review required |
| Email provider | Transactional/support email | Populate | High | Populate | Pending | Pending | Pending | Pending | Product Owner | Pending | Review required |

## New-vendor gate

Before approval, document business need, alternatives, data minimization, privileged access,
security documentation, incident terms, privacy/DPA terms, subprocessors, international
transfers, availability/recovery, deletion/export, lock-in, cost, and approving owner.

Critical vendors require annual reassessment and an exit plan. Material scope, ownership,
security, region, or subprocessor changes trigger an out-of-cycle review.
