# Nexez security and privacy foundation

Status: internal baseline, not an assertion of certification<br>
Owner: Security Owner<br>
Executive approver: Founder/CEO<br>
Review cadence: at least annually and after material incidents or architecture changes

## Purpose

This program establishes the minimum security and privacy practices for Nexez. It is
designed to protect buyers, sellers, employees, agents, and partners while producing
the operating evidence needed for a future SOC 2 readiness assessment.

This documentation does not claim that Nexez is SOC 2 compliant, PCI DSS compliant,
or certified under any other framework. Public claims require legal review and, where
applicable, an independent assessment.

## Scope

The initial scope includes:

- the Nexez production application, APIs, databases, storage, and deployment pipeline;
- Supabase, Stripe, Vercel, source control, monitoring, email, and other production vendors;
- buyer, seller, employee, support, transaction, authentication, and agent-action data;
- personnel and contractors with production data or infrastructure access;
- development, staging, production, backups, logs, and support workflows.

Payment-card data should remain in Stripe-hosted or Stripe-tokenized systems. Nexez
must not intentionally log or persist PAN, CVC, or sensitive authentication data.
PCI scope must be confirmed separately with the payment provider or a qualified advisor.

## Roles

One person may hold several roles while the company is small, but every role must have
a named assignee in the private company operations system.

| Role | Accountability |
| --- | --- |
| Executive approver | Accepts material risk and approves policies |
| Security Owner | Runs the control program, incidents, reviews, and evidence collection |
| Privacy Owner | Owns data inventory, requests, retention, notices, and DPAs |
| System Owner | Approves access and changes for a particular system |
| Incident Commander | Coordinates an active incident and maintains the timeline |
| All personnel | Follow policy, report suspicious activity, and complete training |

## Policy requirements

### Access control

- Grant access by named account, least privilege, and business need.
- Require MFA for source control, cloud hosting, database, payment, email, and other
  systems that support it. Production and payment access must use MFA.
- Do not share accounts or production credentials.
- System Owners approve privileged access before it is granted.
- Review privileged access quarterly and all in-scope access at least semiannually.
- Revoke access immediately for involuntary departures and within one business day for
  other departures. Adjust access promptly when responsibilities change.
- Use service identities for workloads. Store secrets in approved secret managers or
  environment-variable systems, never in source control or tickets.
- Record access reviews and access changes in an auditable system.

### Encryption and secret handling

- Use TLS for data in transit and provider-managed encryption for production data at rest.
- Store passwords only through the approved authentication provider using modern,
  salted password hashing.
- Treat API keys, signing keys, session secrets, webhook secrets, and database service
  credentials as Restricted data.
- Rotate a secret immediately when exposure is suspected and according to provider or
  risk-based rotation requirements otherwise.
- Never place live secrets or real customer data in tests, fixtures, screenshots, or logs.

### Secure development and change management

- Require peer review and passing automated checks before production changes, except
  documented emergency changes.
- Protect the production branch and limit deployment authority.
- Separate test and production payment objects and credentials.
- Validate authorization server-side. Use database row-level security and explicit grants
  as defense in depth, not as a substitute for application authorization.
- Preserve idempotency and explicit approval for consequential agent actions as described
  in `docs/agent-action-safety.md`.
- Record emergency changes, the reason for bypassing normal review, approver, validation,
  and follow-up review.

### Logging and monitoring

- Log authentication events, privileged changes, deployment activity, authorization
  failures, payment lifecycle events, agent mutations, and material administrative actions.
- Logs must identify time, actor or service, action, target, environment, and result where
  practical. Never log passwords, bearer tokens, CVC, full card numbers, or raw secret values.
- Restrict log access and preserve integrity through the logging provider's access controls.
- Define alerts for unusual authentication, repeated authorization failures, production
  errors, webhook failures, and abnormal payment or agent-action behavior.
- Review critical alerts promptly. Document investigation and disposition.
- Set log retention from legal, operational, and privacy needs in the data register; do not
  retain logs indefinitely by default.

### Vulnerability and dependency management

- Run dependency and static checks in CI where practical.
- Triage reported vulnerabilities and provider advisories using severity and exploitability.
- Target remediation: Critical within 7 days, High within 30 days, Medium within 90 days,
  and Low through normal maintenance. Document accepted exceptions with owner and expiry.
- Perform an external penetration test before material enterprise launch and at least
  annually once enterprise customers rely on Nexez.
- Maintain a public security reporting channel and a coordinated disclosure process.

### Backups, availability, and recovery

- Identify production systems that require backups and confirm the provider configuration.
- Encrypt backups and limit restore/deletion permissions.
- Define recovery time and recovery point objectives per critical system.
- Test restoration at least annually and after material backup architecture changes.
- Record restoration scope, result, elapsed time, defects, and follow-up owner.
- Do not describe a provider capability as a Nexez control until its configuration and a
  restore path have been verified.

### Personnel security

- Complete confidentiality and acceptable-use commitments before granting access.
- Verify identity and conduct lawful, role-appropriate screening where justified.
- Give security and privacy training at onboarding and annually thereafter.
- Use the access termination requirements above for departures and retain completion evidence.
- Personnel must report suspected phishing, credential loss, data exposure, or policy
  violations immediately through the documented incident channel.

### Vendor risk management

- Inventory every vendor that accesses production systems or processes company/customer data.
- Before use, assess data, access, criticality, location, security documentation, breach
  terms, deletion terms, and subprocessors proportionate to risk.
- Execute a DPA or equivalent privacy terms when the vendor processes personal data for Nexez.
- Review critical vendors annually and material vendor changes before adoption.
- Track vendor exit procedures and verify data return/deletion when the relationship ends.

### Privacy and data lifecycle

- Collect personal data for documented purposes and minimize fields and retention.
- Record data categories, subjects, purpose, lawful/contractual basis where applicable,
  systems, recipients, locations, retention, deletion method, and owner.
- Provide accurate notices at or before collection and honor applicable access, correction,
  deletion, portability, restriction, and opt-out rights.
- Do not use production personal data to train models unless the use is explicitly assessed,
  disclosed, contractually permitted, and approved.
- Evaluate new high-risk processing, automated decisions, new data sharing, and new regions
  through a privacy impact assessment before launch.
- Apply legal holds narrowly and document them; an active legal hold overrides routine deletion.

## Data classification

| Class | Examples | Minimum handling |
| --- | --- | --- |
| Public | Published listings, public documentation | Integrity controls; approved publication |
| Internal | Internal plans, non-sensitive procedures | Authenticated company access |
| Confidential | Customer profiles, contracts, internal analytics | Least privilege, encrypted transit/at rest, controlled sharing |
| Restricted | Secrets, auth tokens, government IDs, payout data, security evidence | Strict need-to-know, no logs, approved systems only, rapid incident escalation |

## Operating cadence

| Frequency | Activity | Evidence |
| --- | --- | --- |
| Continuous | Change review, alert triage, incident intake | PRs, CI results, alert cases, incident records |
| Monthly | Vulnerability/dependency triage; overdue control review | Triage record and remediation tickets |
| Quarterly | Privileged-access review; critical vendor/change review | Signed review and exceptions |
| Semiannual | All in-scope access review; retention/deletion sample | Review export and deletion evidence |
| Annual | Policy approval, training, vendor reviews, restore test, tabletop exercise | Dated approvals and test reports |
| Event-driven | Joiner/mover/leaver, new vendor, major feature, incident | Completed checklist or assessment |

## Evidence rules

Evidence must show who performed the control, what was reviewed, when it occurred, the
result, and how exceptions were resolved. Store evidence in an access-controlled company
system, not in this public repository. Avoid copying customer data, tokens, or vulnerability
details into policy documents.

Use `control-register.md` as the control catalog, `data-register.md` for the data lifecycle,
`vendor-register.md` for processors and critical services, and `incident-response.md` during
security or privacy events. Follow `rollout.md` to assign ownership, establish the private
evidence system, verify production configuration, and start the operating cadence.

## First 30 days

- Assign the named roles and approve this baseline.
- Populate the data and vendor registers using real production configurations and contracts.
- Enforce MFA and inventory privileged access across every in-scope provider.
- Verify branch protection, deployment permissions, secret storage, backups, and alert routing.
- Establish private evidence, incident, privacy-request, and vendor-review locations.
- Run the first access review and incident tabletop; record and remediate findings.
- Publish accurate customer-facing privacy and security contact information after legal review.
